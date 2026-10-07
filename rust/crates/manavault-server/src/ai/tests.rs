//! Ports of `test/manavault/ai_test.exs`, `test/manavault/ai/analyze_deck_test.exs`,
//! and `test/manavault_web/schema/ai_test.exs` (settings parts are in
//! `settings::ai`), with wiremock standing in for `OpenRouter`.

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::{Value, json};
use sqlx::SqlitePool;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

use super::answer_deck_question::{self, AskOptions};
use super::question_answers::{self, NewQuestionAnswer, Status};
use super::workers::{DECK_ANALYSIS_WORKER, DECK_QUESTION_WORKER, DeckQuestionWorker};
use super::{AiError, analyze_deck, decks};
use crate::graphql::{NodeKind, global_id};
use crate::jobs::{Job, Outcome, Worker};
use crate::test_support::{TestApp, fixtures};

// ---------------------------------------------------------------------------
// Fixtures shared with the tool tests.

/// `CatalogTestSupport.legality_card/3`.
pub fn legality_card(name: &str, colors: &[&str], legalities: &Value) -> Value {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    fixtures::merge(
        fixtures::time_walk(),
        json!({
            "id": format!("scryfall-printing-{slug}"),
            "oracle_id": format!("oracle-{slug}"),
            "name": name,
            "type_line": "Instant",
            "colors": colors,
            "color_identity": colors,
            "legalities": legalities,
            "set": "tst",
            "set_name": "Test Set",
            "collector_number": slug,
            "lang": "en",
            "finishes": ["nonfoil"],
            "prices": {},
            "released_at": "2026-01-01"
        }),
    )
}

/// `CatalogTestSupport.legal_plains/0`.
pub fn legal_plains() -> Value {
    fixtures::merge(
        fixtures::plains(),
        json!({"legalities": {"commander": "legal"}}),
    )
}

pub async fn insert_deck_with_status(
    pool: &SqlitePool,
    name: &str,
    format: &str,
    status: &str,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO decks (name, format, status, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z') RETURNING id",
    )
    .bind(name)
    .bind(format)
    .bind(status)
    .fetch_one(pool)
    .await
    .unwrap()
}

pub async fn insert_deck(pool: &SqlitePool, name: &str, format: &str) -> i64 {
    insert_deck_with_status(pool, name, format, "brewing").await
}

pub async fn add_deck_card(
    pool: &SqlitePool,
    deck_id: i64,
    oracle_id: &str,
    quantity: i64,
    zone: &str,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO deck_cards (deck_id, oracle_id, quantity, zone, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'now', 'now') RETURNING id",
    )
    .bind(deck_id)
    .bind(oracle_id)
    .bind(quantity)
    .bind(zone)
    .fetch_one(pool)
    .await
    .unwrap()
}

pub async fn collection_item(
    pool: &SqlitePool,
    scryfall_id: &str,
    quantity: i64,
    location: Option<i64>,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO collection_items (scryfall_id, quantity, location_id, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, 'now', 'now') RETURNING id",
    )
    .bind(scryfall_id)
    .bind(quantity)
    .bind(location)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Adds the card to the deck and allocates `quantity` of the item to it.
pub async fn allocate(
    pool: &SqlitePool,
    deck_id: i64,
    oracle_id: &str,
    item_id: i64,
    quantity: i64,
) {
    let deck_card = add_deck_card(pool, deck_id, oracle_id, quantity, "mainboard").await;
    sqlx::query(
        "INSERT INTO deck_allocations (deck_card_id, collection_item_id, quantity, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, 'now', 'now')",
    )
    .bind(deck_card)
    .bind(item_id)
    .bind(quantity)
    .execute(pool)
    .await
    .unwrap();
}

async fn insert_settings(app: &TestApp, model: &str, instructions: Option<&str>) {
    let key = app.state.encrypt_secret("test-openrouter-key").unwrap();
    sqlx::query(
        "INSERT INTO ai_settings (id, provider, api_key, model, deck_analysis_instructions, inserted_at, updated_at)
         VALUES (1, 'openrouter', ?1, ?2, ?3, 'now', 'now')
         ON CONFLICT(id) DO UPDATE SET provider = 'openrouter', api_key = ?1, model = ?2,
           deck_analysis_instructions = ?3",
    )
    .bind(key)
    .bind(model)
    .bind(instructions)
    .execute(app.db())
    .await
    .unwrap();
}

async fn app_with(server: &MockServer) -> TestApp {
    let base = format!("{}/api/v1", server.uri());
    TestApp::with_config(|config| config.platform_urls.openrouter_api = base).await
}

fn content_response(content: &Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(json!({
        "choices": [{"message": {"content": content.to_string()}}]
    }))
}

fn answer_response(answer: &str, cuts: &[&str], additions: &[&str]) -> ResponseTemplate {
    content_response(&json!({
        "answer": answer,
        "recommended_cuts": cuts,
        "recommended_additions": additions
    }))
}

/// Mounts a completion responder called with the 1-based attempt number
/// and the decoded request.
async fn stub_completions(
    server: &MockServer,
    respond: impl Fn(usize, &Value) -> ResponseTemplate + Send + Sync + 'static,
) -> Arc<AtomicUsize> {
    let attempts = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&attempts);
    Mock::given(method("POST"))
        .and(path("/api/v1/chat/completions"))
        .respond_with(move |request: &Request| {
            let attempt = counter.fetch_add(1, Ordering::SeqCst) + 1;
            let body: Value = serde_json::from_slice(&request.body).unwrap_or(Value::Null);
            respond(attempt, &body)
        })
        .mount(server)
        .await;
    attempts
}

/// Every completion request the server received, decoded.
async fn completion_requests(server: &MockServer) -> Vec<Value> {
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|request| request.url.path() == "/api/v1/chat/completions")
        .map(|request| serde_json::from_slice(&request.body).unwrap())
        .collect()
}

fn message_content(request: &Value, index: usize) -> String {
    request["messages"][index]["content"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

fn last_content(request: &Value) -> String {
    request["messages"].as_array().unwrap().last().unwrap()["content"]
        .as_str()
        .unwrap()
        .to_owned()
}

/// Log lines published while `action` ran that contain `marker`.
async fn capture_logs<F: std::future::Future<Output = ()>>(marker: &str, action: F) -> String {
    let mut events = crate::test_support::log_hub().subscribe();
    action.await;
    let mut log = String::new();
    loop {
        match events.try_recv() {
            Ok(event) if event.message.contains(marker) => {
                log.push_str(&event.message);
                log.push('\n');
            }
            Ok(_) | Err(tokio::sync::broadcast::error::TryRecvError::Lagged(_)) => {}
            Err(_) => break,
        }
    }
    log
}

async fn ask(
    app: &TestApp,
    deck_id: i64,
    question: &str,
    options: AskOptions,
) -> question_answers::QuestionAnswer {
    answer_deck_question::enqueue(&app.state, deck_id, question, &options)
        .await
        .unwrap()
}

async fn ask_default(
    app: &TestApp,
    deck_id: i64,
    question: &str,
) -> question_answers::QuestionAnswer {
    ask(app, deck_id, question, AskOptions::default()).await
}

async fn saved(app: &TestApp, id: i64) -> question_answers::QuestionAnswer {
    question_answers::get(app.db(), id).await.unwrap().unwrap()
}

fn user_message(result: Result<(), AiError>) -> String {
    match result {
        Err(AiError::User(message)) => message,
        other => format!("{other:?}"),
    }
}

async fn create_answer(app: &TestApp, deck_id: i64, attrs: NewQuestionAnswer) -> i64 {
    let mut conn = app.db().acquire().await.unwrap();
    question_answers::insert(&mut conn, deck_id, &attrs)
        .await
        .unwrap()
        .id
}

async fn ai_analysis(app: &TestApp, deck_id: i64) -> Option<String> {
    sqlx::query_scalar("SELECT ai_analysis FROM decks WHERE id = ?1")
        .bind(deck_id)
        .fetch_one(app.db())
        .await
        .unwrap()
}

fn analysis_json(rating: &str, custom_sections: &Value) -> Value {
    json!({
        "summary": "A slow commander value deck.",
        "themes": ["Value"],
        "game_plan": "Develop resources and win late.",
        "opponent_experience": "Its value turns are measured and offer clear interaction windows.",
        "strengths": ["Resilient commander"],
        "weaknesses": ["Slow clock"],
        "official_bracket": 2,
        "play_bracket": 2,
        "bracket_rating": rating,
        "bracket_rationale": "One Game Changer raises the guideline bracket, but the list is slow.",
        "power_up": ["Add efficient interaction"],
        "power_down": ["Replace the Game Changer"],
        "consistency": ["Improve the mana curve"],
        "mulligan_guide": ["Keep early mana and a value engine"],
        "custom_sections": custom_sections
    })
}

fn game_changer_commander() -> Value {
    fixtures::merge(
        fixtures::legal_commander_card(),
        json!({"game_changer": true}),
    )
}

// ---------------------------------------------------------------------------
// Deck analysis.

#[tokio::test]
async fn analyzes_and_persists_distinct_guideline_and_practical_brackets() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(
        &app,
        "anthropic/claude-sonnet-4",
        Some("Never suggest infinite combos. Add a Budget upgrades section."),
    )
    .await;
    app.import_cards(&[game_changer_commander()]).await;
    let deck_id = insert_deck(app.db(), "Guideline Gap", "commander").await;
    sqlx::query("UPDATE decks SET primer = 'Slow value' WHERE id = ?1")
        .bind(deck_id)
        .execute(app.db())
        .await
        .unwrap();
    add_deck_card(app.db(), deck_id, "oracle-test-commander", 1, "commander").await;
    stub_completions(&server, |_, _| {
        content_response(&analysis_json(
            "3-",
            &json!([{"title": "Budget upgrades", "content": "- Add [[Swords to Plowshares]] before premium interaction."}]),
        ))
    })
    .await;

    let deck = decks::get(app.db(), deck_id).await.unwrap().unwrap();
    let saved = analyze_deck::run(&app.state, &deck).await.unwrap();
    assert_eq!(saved.commander_bracket, Some(3));
    assert_eq!(saved.commander_bracket_estimate, Some(2));
    assert_eq!(saved.commander_bracket_rating.as_deref(), Some("3-"));
    for expected in [
        "**Bracket 3-**",
        "## Ways to power it up",
        "## What it's like to play against it",
        "## Mulligan guide",
        "## Budget upgrades",
        "[[Swords to Plowshares]]",
        "require at least Bracket 3 because the deck contains 1 Game Changer",
    ] {
        assert!(saved.ai_analysis.contains(expected), "{expected}");
    }
    let row: (String, String, String, i64, i64, String) = sqlx::query_as(
        "SELECT ai_analysis, ai_analysis_model, ai_analyzed_at, commander_bracket,
           commander_bracket_estimate, commander_bracket_rating FROM decks WHERE id = ?1",
    )
    .bind(deck_id)
    .fetch_one(app.db())
    .await
    .unwrap();
    assert_eq!(row.0, saved.ai_analysis);
    assert_eq!(row.1, "anthropic/claude-sonnet-4");
    assert!(crate::timefmt::parse(&row.2).is_some());
    assert_eq!((row.3, row.4, row.5.as_str()), (3, 2, "3-"));

    let requests = completion_requests(&server).await;
    let [request] = requests.as_slice() else {
        unreachable!("expected one request, got {requests:?}")
    };
    let headers = &server.received_requests().await.unwrap()[0].headers;
    assert_eq!(headers["authorization"], "Bearer test-openrouter-key");
    assert_eq!(headers["x-openrouter-title"], "ManaVault");
    assert_eq!(request["model"], "anthropic/claude-sonnet-4");
    assert_eq!(request["response_format"]["type"], "json_schema");
    assert_eq!(
        request["response_format"]["json_schema"]["name"],
        "manavault_deck_analysis"
    );
    assert_eq!(request["max_tokens"], 20_000);
    assert!(request.get("temperature").is_none());
    assert!(request.get("max_completion_tokens").is_none());
    assert!(request.get("plugins").is_none());
    let system = message_content(request, 0);
    assert!(system.contains("Use deeper reasoning"));
    assert!(system.contains("rather than making the final response longer"));
    assert!(system.contains("Never suggest infinite combos."));
    assert!(system.contains("Add a Budget upgrades section."));
    let user = message_content(request, 1);
    assert!(user.contains("Test Commander"));
    assert!(user.contains(r#""land_count":0"#));
    assert!(user.contains(r#""nonland_count":1"#));
    assert!(user.contains(r#""primer":"Slow value""#));
    assert!(user.contains(r#""game_changer_count":1"#));
}

#[tokio::test]
async fn analysis_http_errors_include_the_provider_rejection_without_dumping_raw_metadata() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-opus-5.5-rejection", None).await;
    let deck_id = insert_deck(app.db(), "Private deck name", "commander").await;
    let deck = decks::get(app.db(), deck_id).await.unwrap().unwrap();
    let rejection = "output_config.format.schema: unsupported constraint";
    let raws = Arc::new(vec![
        json!({"error": {"message": rejection}, "request": "private request data"}),
        json!(
            json!({"error": {"message": rejection}, "request": "private request data"}).to_string()
        ),
    ]);
    let raws_for_stub = Arc::clone(&raws);
    let attempts = stub_completions(&server, move |attempt, _| {
        ResponseTemplate::new(400).set_body_json(json!({
            "error": {
                "code": 400,
                "message": "Provider returned error",
                "metadata": {
                    "provider_name": "Anthropic",
                    "error_type": "invalid_request",
                    "provider_code": "invalid_request_error",
                    "raw": raws_for_stub[attempt - 1],
                    "flagged_input": "private flagged content"
                }
            }
        }))
    })
    .await;
    let expected = format!("OpenRouter: Provider returned error: {rejection}");
    for _ in 0..2 {
        let log = capture_logs("anthropic/claude-opus-5.5-rejection", async {
            match analyze_deck::run(&app.state, &deck).await {
                Err(analyze_deck::RunError::Ai(AiError::User(message))) => {
                    assert_eq!(message, expected);
                }
                other => unreachable!("unexpected {other:?}"),
            }
        })
        .await;
        for fragment in [
            "operation=deck_analysis",
            "status=400",
            "result=http_error",
            expected.as_str(),
            r#"error_provider="Anthropic""#,
            r#"error_type="invalid_request""#,
            r#"provider_error_code="invalid_request_error""#,
        ] {
            assert!(log.contains(fragment), "missing {fragment:?} in {log}");
        }
        for secret in [
            "private request data",
            "private flagged content",
            "Private deck name",
            "test-openrouter-key",
        ] {
            assert!(!log.contains(secret), "{secret} leaked in {log}");
        }
    }
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert_eq!(ai_analysis(&app, deck_id).await, None);
}

#[tokio::test]
async fn analysis_http_errors_handle_missing_or_non_json_provider_details() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-opus-5.5-fallback", None).await;
    let deck_id = insert_deck(app.db(), "Error fallback", "commander").await;
    let deck = decks::get(app.db(), deck_id).await.unwrap().unwrap();
    let cases = Arc::new(vec![
        (
            json!({"error": {"message": "Invalid parameter"}}),
            "OpenRouter: Invalid parameter",
        ),
        (
            json!({"error": {"message": "Invalid parameter", "metadata": {"raw": "private unstructured response"}}}),
            "OpenRouter: Invalid parameter",
        ),
        (
            json!({"error": null}),
            "OpenRouter could not analyze this deck. (HTTP 400)",
        ),
        (
            json!("private unstructured response"),
            "OpenRouter could not analyze this deck. (HTTP 400)",
        ),
    ]);
    let bodies = Arc::clone(&cases);
    stub_completions(&server, move |attempt, _| {
        ResponseTemplate::new(400).set_body_json(bodies[attempt - 1].0.clone())
    })
    .await;
    for (_, expected) in cases.iter() {
        let log = capture_logs("anthropic/claude-opus-5.5-fallback", async {
            match analyze_deck::run(&app.state, &deck).await {
                Err(analyze_deck::RunError::Ai(AiError::User(message))) => {
                    assert_eq!(&message, expected);
                }
                other => unreachable!("unexpected {other:?}"),
            }
        })
        .await;
        assert!(log.contains("result=http_error"), "{log}");
        assert!(!log.contains("private unstructured response"), "{log}");
    }
}

// ---------------------------------------------------------------------------
// Deck questions.

#[tokio::test]
async fn saves_successful_deck_questions_newest_first_without_changing_the_analysis() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(
        &app,
        "anthropic/claude-sonnet-4",
        Some("Never suggest infinite combos."),
    )
    .await;
    app.import_cards(&[fixtures::legal_commander_card()]).await;
    let deck_id = insert_deck(app.db(), "Counter Deck", "commander").await;
    add_deck_card(app.db(), deck_id, "oracle-test-commander", 1, "commander").await;
    stub_completions(&server, |_, request| {
        if last_content(request).contains("Return an empty answer") {
            answer_response("   ", &[], &[])
        } else {
            answer_response(
                "**Probably not yet.** Consider cutting [[Test Commander]] only if the strategy changes.",
                &["test commander"],
                &[],
            )
        }
    })
    .await;

    let first = ask_default(&app, deck_id, "  Would Doubling Season be a good fit?  ").await;
    assert_eq!(first.question, "Would Doubling Season be a good fit?");
    assert_eq!(first.status, Status::Pending);
    assert_eq!(first.answer, "");
    let job: (String, String, String, i64) = sqlx::query_as(
        "SELECT worker, queue, args, max_attempts FROM oban_jobs ORDER BY id DESC LIMIT 1",
    )
    .fetch_one(app.db())
    .await
    .unwrap();
    assert_eq!(job.0, DECK_QUESTION_WORKER);
    assert_eq!(job.1, "ai");
    assert_eq!(
        serde_json::from_str::<Value>(&job.2).unwrap(),
        json!({"question_answer_id": first.id})
    );
    assert_eq!(job.3, 3);

    answer_deck_question::run(&app.state, first.id)
        .await
        .unwrap();
    let first = saved(&app, first.id).await;
    assert_eq!(first.status, Status::Completed);
    assert_eq!(first.model.as_deref(), Some("anthropic/claude-sonnet-4"));
    assert_eq!(
        first.answer,
        "**Probably not yet.** Consider cutting [[Test Commander]] only if the strategy changes."
    );
    assert_eq!(
        first.recommendation_names("cuts"),
        vec!["Test Commander".to_owned()]
    );
    assert_eq!(
        first.recommendation_names("additions"),
        Vec::<String>::new()
    );
    assert_eq!(
        serde_json::from_str::<Value>(first.recommendations.as_deref().unwrap()).unwrap(),
        json!({"cuts": ["Test Commander"], "additions": []})
    );
    assert!(crate::timefmt::parse(&first.inserted_at).is_some());
    // Answering again is a no-op once completed.
    answer_deck_question::run(&app.state, first.id)
        .await
        .unwrap();

    let second = ask_default(&app, deck_id, "How should I protect it?").await;
    answer_deck_question::run(&app.state, second.id)
        .await
        .unwrap();
    let ids: Vec<i64> = question_answers::list_for_deck(app.db(), deck_id)
        .await
        .unwrap()
        .iter()
        .map(|answer| answer.id)
        .collect();
    assert_eq!(ids, vec![second.id, first.id]);

    let failed = ask_default(&app, deck_id, "Return an empty answer").await;
    let job = |attempt| Job {
        id: 0,
        worker: DECK_QUESTION_WORKER.into(),
        args: json!({"question_answer_id": failed.id}),
        attempt,
        max_attempts: 3,
    };
    let empty = "The AI provider returned an empty answer.";
    assert!(
        matches!(DeckQuestionWorker.perform(&app.state, &job(1)).await, Outcome::Retry(ref reason) if reason == empty)
    );
    assert_eq!(saved(&app, failed.id).await.status, Status::Pending);
    assert!(
        matches!(DeckQuestionWorker.perform(&app.state, &job(3)).await, Outcome::Retry(ref reason) if reason == empty)
    );
    let failed = saved(&app, failed.id).await;
    assert_eq!(failed.status, Status::Failed);
    assert_eq!(failed.error.as_deref(), Some(empty));
    assert_eq!(
        question_answers::list_for_deck(app.db(), deck_id)
            .await
            .unwrap()
            .len(),
        3
    );
    assert_eq!(ai_analysis(&app, deck_id).await, None);

    let requests = completion_requests(&server).await;
    let request = &requests[0];
    assert_eq!(request["response_format"]["type"], "json_schema");
    assert_eq!(request["plugins"], json!([{"id": "response-healing"}]));
    assert_eq!(request["max_tokens"], 20_000);
    for absent in [
        "temperature",
        "max_completion_tokens",
        "reasoning",
        "tool_choice",
    ] {
        assert!(request.get(absent).is_none(), "{absent}");
    }
    assert!(!message_content(request, 0).contains("Never suggest infinite combos."));
    assert_eq!(
        request["response_format"]["json_schema"]["schema"]["required"],
        json!(["answer", "recommended_cuts", "recommended_additions"])
    );
    let user = last_content(request);
    assert!(user.contains("Test Commander"));
    assert!(user.contains(r#""commander_color_identity":["W"]"#));
    assert!(user.contains(r#""color_identity":["W"]"#));
    assert!(!user.contains(r#""format_legality":"legal""#));
    assert!(user.contains(r#""land_count":0"#));
    assert!(user.contains(r#""nonland_count":1"#));
}

#[tokio::test]
async fn question_validation_and_settings_errors_save_nothing() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    let deck_id = insert_deck(app.db(), "Validation", "casual").await;
    let enqueue = |question: &'static str, options: AskOptions| {
        let state = app.state.clone();
        async move {
            match answer_deck_question::enqueue(&state, deck_id, question, &options).await {
                Err(AiError::User(message)) => message,
                other => format!("{other:?}"),
            }
        }
    };
    assert_eq!(
        enqueue("  ", AskOptions::default()).await,
        "Enter a question about this deck."
    );
    assert_eq!(
        enqueue("Fine?", AskOptions::default()).await,
        "Configure an AI provider, API key, and model in Settings first."
    );
    insert_settings(&app, "m", None).await;
    assert_eq!(
        enqueue(
            "Fine?",
            AskOptions {
                thread_id: Some(" ".into()),
                ..AskOptions::default()
            }
        )
        .await,
        "The chat thread id is invalid."
    );
    assert_eq!(
        enqueue(
            "Fine?",
            AskOptions {
                conversation_id: Some("x".repeat(65)),
                ..AskOptions::default()
            }
        )
        .await,
        "The chat thread id is invalid."
    );
    assert_eq!(
        enqueue(
            "Fine?",
            AskOptions {
                swap_context: Some((vec!["x".repeat(201)], vec![])),
                ..AskOptions::default()
            }
        )
        .await,
        "The staged swap is invalid."
    );
    sqlx::query("UPDATE ai_settings SET provider = 'other'")
        .execute(app.db())
        .await
        .unwrap();
    assert_eq!(
        enqueue("Fine?", AskOptions::default()).await,
        "The selected AI provider is not supported."
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM deck_question_answers")
        .fetch_one(app.db())
        .await
        .unwrap();
    let jobs: i64 = sqlx::query_scalar("SELECT count(*) FROM oban_jobs")
        .fetch_one(app.db())
        .await
        .unwrap();
    assert_eq!((count, jobs), (0, 0));
}

#[tokio::test]
async fn uses_generic_question_options_and_logs_safe_diagnostics_when_output_is_truncated() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "google/gemini-3.7-flash", None).await;
    let deck_id = insert_deck(app.db(), "Diagnostics Deck", "commander").await;
    stub_completions(&server, |_, _| {
        ResponseTemplate::new(200).set_body_json(json!({
            "provider": "Google",
            "choices": [{
                "finish_reason": "length",
                "native_finish_reason": "MAX_TOKENS",
                "message": {"content": "{\"answer\":\"unfinished"}
            }],
            "usage": {
                "prompt_tokens": 12_345,
                "completion_tokens": 20_000,
                "completion_tokens_details": {"reasoning_tokens": 7_950}
            }
        }))
    })
    .await;
    let log = capture_logs("google/gemini-3.7-flash", async {
        let question = ask_default(&app, deck_id, "Do not include this question in logs.").await;
        assert_eq!(
            user_message(answer_deck_question::run(&app.state, question.id).await),
            "OpenRouter ran out of output tokens before finishing the answer."
        );
    })
    .await;
    for fragment in [
        "OpenRouter completion operation=deck_question",
        r#"model="google/gemini-3.7-flash""#,
        r#"provider="Google""#,
        r#"finish_reason="length""#,
        r#"native_finish_reason="MAX_TOKENS""#,
        "prompt_tokens=12345",
        "completion_tokens=20000",
        "reasoning_tokens=7950",
        "result=output_token_limit",
    ] {
        assert!(log.contains(fragment), "missing {fragment:?} in {log}");
    }
    assert!(!log.contains("Do not include this question in logs."));
    assert!(!log.contains("unfinished"));
    let request = &completion_requests(&server).await[0];
    assert!(request.get("reasoning").is_none());
    assert_eq!(request["max_tokens"], 20_000);
}

#[tokio::test]
async fn logs_reasoning_only_responses_without_model_specific_request_options() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "minimax/minimax-m3", None).await;
    let deck_id = insert_deck(app.db(), "MiniMax Deck", "commander").await;
    stub_completions(&server, |_, _| {
        ResponseTemplate::new(200).set_body_json(json!({
            "provider": "Parasail",
            "choices": [{
                "finish_reason": "stop",
                "native_finish_reason": "stop",
                "message": {"content": null, "reasoning": "Sensitive reasoning content"}
            }],
            "usage": {
                "prompt_tokens": 10_646,
                "completion_tokens": 768,
                "completion_tokens_details": {"reasoning_tokens": 749}
            }
        }))
    })
    .await;
    let log = capture_logs("minimax/minimax-m3", async {
        let question = ask_default(
            &app,
            deck_id,
            "Do not include this MiniMax question in logs.",
        )
        .await;
        assert_eq!(
            user_message(answer_deck_question::run(&app.state, question.id).await),
            "OpenRouter returned an incomplete answer."
        );
    })
    .await;
    for fragment in [
        r#"model="minimax/minimax-m3""#,
        r#"provider="Parasail""#,
        r#"finish_reason="stop""#,
        "prompt_tokens=10646",
        "completion_tokens=768",
        "reasoning_tokens=749",
        "content_bytes=nil",
        "reasoning_bytes=27",
        "result=incomplete_response",
    ] {
        assert!(log.contains(fragment), "missing {fragment:?} in {log}");
    }
    assert!(!log.contains("Do not include this MiniMax question in logs."));
    assert!(!log.contains("Sensitive reasoning content"));
}

#[tokio::test]
async fn retries_catalog_invalid_recommendations_and_only_saves_the_corrected_answer() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-sonnet-4", None).await;
    app.import_cards(&[fixtures::legal_commander_card(), fixtures::time_walk()])
        .await;
    let deck_id = insert_deck(app.db(), "Mono-White Deck", "commander").await;
    add_deck_card(app.db(), deck_id, "oracle-test-commander", 1, "commander").await;
    let attempts = stub_completions(&server, |attempt, _| {
        if attempt == 1 {
            answer_response(
                "Add [[Time Walk]] for efficiency.",
                &["Missing Card"],
                &["Time Walk"],
            )
        } else {
            answer_response(
                "Keep [[Test Commander]] and add more legal white interaction.",
                &[],
                &[],
            )
        }
    })
    .await;
    let question = ask_default(&app, deck_id, "Make this deck stronger.").await;
    answer_deck_question::run(&app.state, question.id)
        .await
        .unwrap();
    let question = saved(&app, question.id).await;
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert!(question.answer.contains("legal white interaction"));
    assert!(!question.answer.contains("Time Walk"));
    let list = question_answers::list_for_deck(app.db(), deck_id)
        .await
        .unwrap();
    assert_eq!(
        list.iter().map(|answer| answer.id).collect::<Vec<_>>(),
        vec![question.id]
    );

    let requests = completion_requests(&server).await;
    let correction = message_content(&requests[1], 1);
    assert!(correction.starts_with("Question:\nMake this deck stronger.\n\nThe previous draft failed ManaVault's catalog checks:\n"));
    assert!(correction.contains("Time Walk is not legal in commander"));
    assert!(correction.contains("outside the commander's color identity"));
    assert!(correction.contains("Missing Card is not in the current deck"));
}

#[tokio::test]
async fn gives_up_after_one_correction() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-sonnet-4", None).await;
    let deck_id = insert_deck(app.db(), "Stubborn", "casual").await;
    let attempts = stub_completions(&server, |_, _| {
        answer_response("Add [[Nope]].", &[], &["Nope"])
    })
    .await;
    let question = ask_default(&app, deck_id, "Anything?").await;
    assert_eq!(
        user_message(answer_deck_question::run(&app.state, question.id).await),
        "The AI provider could not produce a legal recommendation. Try asking again."
    );
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert!(
        last_content(&completion_requests(&server).await[1])
            .contains("Nope was not found in the current card catalog.")
    );
    assert_eq!(saved(&app, question.id).await.status, Status::Pending);
}

#[tokio::test]
async fn answers_card_lookup_tool_calls_from_the_catalog_before_accepting_the_final_answer() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-sonnet-4", None).await;
    app.import_cards(&[
        fixtures::legal_commander_card(),
        legality_card("Brand New Card", &["W"], &json!({"commander": "legal"})),
    ])
    .await;
    let deck_id = insert_deck(app.db(), "Tool Deck", "commander").await;
    add_deck_card(app.db(), deck_id, "oracle-test-commander", 1, "commander").await;
    let attempts = stub_completions(&server, |attempt, _| {
        if attempt == 1 {
            ResponseTemplate::new(200).set_body_json(json!({
                "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": null,
                        "tool_calls": [{
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "lookup_cards", "arguments": "{\"names\":[\"brand new card\",\"Fake Card\"]}"}
                        }]
                    }
                }]
            }))
        } else {
            answer_response("Add [[Brand New Card]].", &[], &["Brand New Card"])
        }
    })
    .await;
    let question = ask_default(&app, deck_id, "What new card fits?").await;
    answer_deck_question::run(&app.state, question.id)
        .await
        .unwrap();
    let question = saved(&app, question.id).await;
    assert_eq!(question.answer, "Add [[Brand New Card]].");
    assert_eq!(
        question.recommendation_names("additions"),
        vec!["Brand New Card".to_owned()]
    );
    assert_eq!(attempts.load(Ordering::SeqCst), 2);

    let requests = completion_requests(&server).await;
    for request in &requests {
        let tools: Vec<&Value> = request["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| &tool["function"]["name"])
            .collect();
        assert_eq!(tools, vec!["lookup_cards", "check_collection"]);
        assert_eq!(request["response_format"]["type"], "json_schema");
        assert!(request.get("tool_choice").is_none());
    }
    assert_eq!(requests[0]["messages"].as_array().unwrap().len(), 2);
    let messages = requests[1]["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 4);
    assert_eq!(messages[2]["role"], "assistant");
    assert_eq!(messages[2]["tool_calls"][0]["id"], "call_1");
    assert_eq!(messages[3]["role"], "tool");
    assert_eq!(messages[3]["tool_call_id"], "call_1");
    assert_eq!(messages[3]["name"], "lookup_cards");
    let content: Value = serde_json::from_str(messages[3]["content"].as_str().unwrap()).unwrap();
    assert_eq!(content["not_found"], json!(["Fake Card"]));
    assert_eq!(content["cards"][0]["name"], "Brand New Card");
    assert_eq!(content["cards"][0]["color_identity"], json!(["W"]));
    assert_eq!(content["cards"][0]["legal_in"], json!(["commander"]));
}

#[tokio::test]
async fn forbids_further_tool_calls_after_the_round_limit() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-sonnet-4", None).await;
    let deck_id = insert_deck(app.db(), "Looping Deck", "commander").await;
    let attempts = stub_completions(&server, |attempt, _| {
        if attempt <= 4 {
            ResponseTemplate::new(200).set_body_json(json!({
                "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": null,
                        "tool_calls": [{
                            "id": format!("call_{attempt}"),
                            "type": "function",
                            "function": {"name": "lookup_cards", "arguments": "not json"}
                        }]
                    }
                }]
            }))
        } else {
            answer_response("Done looking things up.", &[], &[])
        }
    })
    .await;
    let question = ask_default(&app, deck_id, "Keep searching.").await;
    answer_deck_question::run(&app.state, question.id)
        .await
        .unwrap();
    assert_eq!(attempts.load(Ordering::SeqCst), 5);
    assert_eq!(
        saved(&app, question.id).await.answer,
        "Done looking things up."
    );
    let requests = completion_requests(&server).await;
    for request in &requests[..4] {
        assert!(request.get("tool_choice").is_none());
    }
    assert_eq!(requests[4]["tool_choice"], "none");
    assert_eq!(requests[4]["messages"].as_array().unwrap().len(), 2 + 4 * 2);
    let tool_reply: Value =
        serde_json::from_str(requests[1]["messages"][3]["content"].as_str().unwrap()).unwrap();
    assert_eq!(
        tool_reply,
        json!({"error": "Provide a names array of exact card names."})
    );
}

#[tokio::test]
async fn retries_without_tools_when_the_model_has_no_tool_capable_endpoints() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "some/model-without-tools", None).await;
    let deck_id = insert_deck(app.db(), "No Tools Deck", "commander").await;
    let attempts = stub_completions(&server, |attempt, _| {
        if attempt == 1 {
            ResponseTemplate::new(404).set_body_json(json!({
                "error": {
                    "message": "No endpoints found that support tool use. To learn more about provider routing, visit: https://openrouter.ai/docs/provider-routing",
                    "code": 404
                }
            }))
        } else {
            answer_response("Answered without tools.", &[], &[])
        }
    })
    .await;
    let log = capture_logs("some/model-without-tools", async {
        let question = ask_default(&app, deck_id, "Anything?").await;
        answer_deck_question::run(&app.state, question.id)
            .await
            .unwrap();
        assert_eq!(
            saved(&app, question.id).await.answer,
            "Answered without tools."
        );
    })
    .await;
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert!(log.contains("does not support tool use"), "{log}");
    let requests = completion_requests(&server).await;
    assert!(requests[0].get("tools").is_some());
    assert!(requests[1].get("tools").is_none());
    assert_eq!(requests[1]["response_format"]["type"], "json_schema");
}

#[tokio::test]
async fn surfaces_other_404_errors_without_retrying() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "some/missing-model", None).await;
    let deck_id = insert_deck(app.db(), "Missing Model Deck", "commander").await;
    let attempts = stub_completions(&server, |_, _| {
        ResponseTemplate::new(404).set_body_json(json!({
            "error": {"message": "No endpoints found for some/missing-model.", "code": 404}
        }))
    })
    .await;
    let question = ask_default(&app, deck_id, "Anything?").await;
    assert_eq!(
        user_message(answer_deck_question::run(&app.state, question.id).await),
        "OpenRouter: No endpoints found for some/missing-model."
    );
    assert_eq!(attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn unreachable_openrouter_reports_a_request_error() {
    let app = TestApp::new().await;
    insert_settings(&app, "unreachable/model", None).await;
    let deck_id = insert_deck(app.db(), "Offline", "commander").await;
    let question = ask_default(&app, deck_id, "Anything?").await;
    let log = capture_logs("unreachable/model", async {
        assert_eq!(
            user_message(answer_deck_question::run(&app.state, question.id).await),
            "Could not reach OpenRouter to answer this question."
        );
    })
    .await;
    assert!(log.contains("result=request_error"), "{log}");
}

#[tokio::test]
async fn threads_swap_cards_chat_turns_and_keeps_them_out_of_ask_ai_history() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-sonnet-4", None).await;
    app.import_cards(&[
        fixtures::legal_commander_card(),
        legality_card("Silver Bolt", &["W"], &json!({"commander": "legal"})),
        legality_card("White Ward", &["W"], &json!({"commander": "legal"})),
    ])
    .await;
    let deck_id = insert_deck(app.db(), "Swap Chat", "commander").await;
    add_deck_card(app.db(), deck_id, "oracle-test-commander", 1, "commander").await;
    add_deck_card(app.db(), deck_id, "oracle-silver-bolt", 1, "mainboard").await;
    stub_completions(&server, |_, _| {
        answer_response("Swap in [[White Ward]].", &[], &["White Ward"])
    })
    .await;

    let one_off = ask_default(&app, deck_id, "Is this deck fast?").await;
    let first = ask(
        &app,
        deck_id,
        "What replaces Silver Bolt?",
        AskOptions {
            thread_id: Some("swap-thread".into()),
            swap_context: Some((vec!["Silver Bolt".into()], vec![])),
            ..AskOptions::default()
        },
    )
    .await;
    assert_eq!(
        serde_json::from_str::<Value>(first.swap_context.as_deref().unwrap()).unwrap(),
        json!({"cuts": ["Silver Bolt"], "adds": []})
    );
    answer_deck_question::run(&app.state, first.id)
        .await
        .unwrap();
    let second = ask(
        &app,
        deck_id,
        "Anything cheaper?",
        AskOptions {
            thread_id: Some("swap-thread".into()),
            ..AskOptions::default()
        },
    )
    .await;
    answer_deck_question::run(&app.state, second.id)
        .await
        .unwrap();

    let requests = completion_requests(&server).await;
    let first_messages = requests[0]["messages"].as_array().unwrap();
    assert_eq!(first_messages.len(), 2);
    assert!(
        first_messages[0]["content"]
            .as_str()
            .unwrap()
            .contains("Swap cards workbench")
    );
    assert!(
        first_messages[1]["content"]
            .as_str()
            .unwrap()
            .contains(r#""staged_swap":{"cuts":["Silver Bolt"],"adds":[]}"#)
    );
    let second_messages = requests[1]["messages"].as_array().unwrap();
    assert_eq!(second_messages.len(), 4);
    assert_eq!(
        second_messages[1],
        json!({"role": "user", "content": "What replaces Silver Bolt?"})
    );
    assert_eq!(
        second_messages[2],
        json!({"role": "assistant", "content": "Swap in [[White Ward]]."})
    );
    let latest = second_messages[3]["content"].as_str().unwrap();
    assert!(latest.contains("Anything cheaper?"));
    assert!(!latest.contains("staged_swap"));

    let history: Vec<i64> = question_answers::list_for_deck(app.db(), deck_id)
        .await
        .unwrap()
        .iter()
        .map(|a| a.id)
        .collect();
    assert_eq!(history, vec![one_off.id]);
    let thread: Vec<i64> = question_answers::list_thread(app.db(), deck_id, "swap-thread")
        .await
        .unwrap()
        .iter()
        .map(|a| a.id)
        .collect();
    assert_eq!(thread, vec![first.id, second.id]);
    let second = saved(&app, second.id).await;
    assert_eq!(second.recommendation_names("cuts"), Vec::<String>::new());
    assert_eq!(
        second.recommendation_names("additions"),
        vec!["White Ward".to_owned()]
    );
}

#[tokio::test]
async fn ask_ai_follow_ups_use_the_last_six_completed_deck_answers_without_swap_context() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-sonnet-4", None).await;
    let deck_id = insert_deck(app.db(), "Deck Chat", "casual").await;
    let other_deck = insert_deck(app.db(), "Other Deck", "casual").await;
    for number in 1..=8 {
        create_answer(
            &app,
            deck_id,
            NewQuestionAnswer::completed(
                &format!("Question {number}"),
                &format!("Answer {number}"),
            ),
        )
        .await;
    }
    let unrelated = NewQuestionAnswer::completed("Unrelated question", "Unrelated answer");
    create_answer(
        &app,
        deck_id,
        NewQuestionAnswer {
            thread_id: Some("swap-thread".into()),
            ..unrelated.clone()
        },
    )
    .await;
    create_answer(
        &app,
        deck_id,
        NewQuestionAnswer {
            conversation_id: Some("another-chat".into()),
            ..unrelated.clone()
        },
    )
    .await;
    create_answer(&app, other_deck, unrelated.clone()).await;
    create_answer(
        &app,
        deck_id,
        NewQuestionAnswer {
            status: Status::Failed,
            error: Some("Provider failed".into()),
            ..unrelated.clone()
        },
    )
    .await;
    create_answer(
        &app,
        deck_id,
        NewQuestionAnswer {
            status: Status::Pending,
            ..unrelated.clone()
        },
    )
    .await;
    let follow_up = ask_default(&app, deck_id, "Why that choice?").await;
    create_answer(
        &app,
        deck_id,
        NewQuestionAnswer::completed("Future question", "Future answer"),
    )
    .await;
    stub_completions(&server, |_, _| {
        answer_response("It supports the game plan.", &[], &[])
    })
    .await;

    answer_deck_question::run(&app.state, follow_up.id)
        .await
        .unwrap();
    assert_eq!(
        saved(&app, follow_up.id).await.answer,
        "It supports the game plan."
    );
    let request = &completion_requests(&server).await[0];
    let messages = request["messages"].as_array().unwrap();
    assert!(
        !messages[0]["content"]
            .as_str()
            .unwrap()
            .contains("Swap cards workbench")
    );
    let expected: Vec<Value> = (3..=8)
        .flat_map(|number| {
            [
                json!({"role": "user", "content": format!("Question {number}")}),
                json!({"role": "assistant", "content": format!("Answer {number}")}),
            ]
        })
        .collect();
    assert_eq!(&messages[1..messages.len() - 1], expected.as_slice());
    let latest = last_content(request);
    assert!(latest.contains("Why that choice?"));
    assert!(!latest.contains("staged_swap"));
}

#[tokio::test]
async fn new_chats_isolate_context_older_chats_resume_and_follow_ups_see_deck_edits() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    insert_settings(&app, "anthropic/claude-sonnet-4", None).await;
    app.import_cards(&[legal_plains()]).await;
    let deck_id = insert_deck(app.db(), "Before edits", "casual").await;
    let plains = add_deck_card(app.db(), deck_id, "oracle-plains", 2, "mainboard").await;
    let legacy = create_answer(
        &app,
        deck_id,
        NewQuestionAnswer::completed("Original chat", "Original advice"),
    )
    .await;
    let archived = create_answer(
        &app,
        deck_id,
        NewQuestionAnswer {
            conversation_id: Some("chat-old".into()),
            ..NewQuestionAnswer::completed("Earlier plan", "Earlier advice")
        },
    )
    .await;
    let other_deck = insert_deck(app.db(), "Other", "casual").await;
    create_answer(
        &app,
        other_deck,
        NewQuestionAnswer {
            conversation_id: Some("chat-new".into()),
            ..NewQuestionAnswer::completed("Unrelated deck", "Unrelated advice")
        },
    )
    .await;
    stub_completions(&server, |_, _| answer_response("Saved reply.", &[], &[])).await;
    let chat = |id: &str| AskOptions {
        conversation_id: Some(id.into()),
        ..AskOptions::default()
    };

    let first = ask(&app, deck_id, "Start fresh", chat("chat-new")).await;
    assert_eq!(first.conversation_id.as_deref(), Some("chat-new"));
    answer_deck_question::run(&app.state, first.id)
        .await
        .unwrap();
    let follow_up = ask(&app, deck_id, "Does the change help?", chat("chat-new")).await;
    // Edit after queueing: the worker loads the deck at processing time.
    sqlx::query("UPDATE decks SET name = 'After edits' WHERE id = ?1")
        .bind(deck_id)
        .execute(app.db())
        .await
        .unwrap();
    sqlx::query("UPDATE deck_cards SET quantity = 5 WHERE id = ?1")
        .bind(plains)
        .execute(app.db())
        .await
        .unwrap();
    answer_deck_question::run(&app.state, follow_up.id)
        .await
        .unwrap();
    let resumed = ask(&app, deck_id, "Resume earlier plan", chat("chat-old")).await;
    answer_deck_question::run(&app.state, resumed.id)
        .await
        .unwrap();

    let requests = completion_requests(&server).await;
    let messages = |index: usize| requests[index]["messages"].as_array().unwrap().clone();
    let first_messages = messages(0);
    assert_eq!(first_messages.len(), 2);
    assert!(
        !first_messages[0]["content"]
            .as_str()
            .unwrap()
            .contains("Swap cards workbench")
    );
    assert!(
        first_messages[1]["content"]
            .as_str()
            .unwrap()
            .contains("Before edits")
    );
    assert!(
        first_messages[1]["content"]
            .as_str()
            .unwrap()
            .contains(r#""land_count":2"#)
    );
    let follow_messages = messages(1);
    assert_eq!(follow_messages.len(), 4);
    assert_eq!(
        follow_messages[1],
        json!({"role": "user", "content": "Start fresh"})
    );
    assert_eq!(
        follow_messages[2],
        json!({"role": "assistant", "content": "Saved reply."})
    );
    let latest = follow_messages[3]["content"].as_str().unwrap();
    assert!(latest.contains("After edits"));
    assert!(latest.contains(r#""land_count":5"#));
    assert!(!latest.contains("Before edits"));
    let resumed_messages = messages(2);
    assert_eq!(resumed_messages.len(), 4);
    assert_eq!(resumed_messages[1]["content"], "Earlier plan");
    assert_eq!(resumed_messages[2]["content"], "Earlier advice");
    assert_eq!(saved(&app, archived).await.answer, "Earlier advice");
    assert_eq!(saved(&app, legacy).await.answer, "Original advice");
    assert_eq!(saved(&app, first.id).await.answer, "Saved reply.");
}

// ---------------------------------------------------------------------------
// Background analysis jobs (`analyze_deck_test.exs`).

async fn job_count(app: &TestApp) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM oban_jobs")
        .fetch_one(app.db())
        .await
        .unwrap()
}

async fn set_job_state(app: &TestApp, id: i64, state: &str) {
    sqlx::query("UPDATE oban_jobs SET state = ?1 WHERE id = ?2")
        .bind(state)
        .bind(id)
        .execute(app.db())
        .await
        .unwrap();
}

async fn background_app(server: &MockServer) -> (TestApp, i64) {
    let app = app_with(server).await;
    insert_settings(&app, "anthropic/claude-opus-5.5", None).await;
    let deck_id = insert_deck(app.db(), "Background analysis", "commander").await;
    (app, deck_id)
}

#[tokio::test]
async fn individual_and_bulk_refreshes_reuse_active_jobs_without_clearing_saved_analysis() {
    let server = MockServer::start().await;
    let (app, deck_id) = background_app(&server).await;
    sqlx::query("UPDATE decks SET ai_analysis = 'Previous analysis' WHERE id = ?1")
        .bind(deck_id)
        .execute(app.db())
        .await
        .unwrap();
    let other = insert_deck(app.db(), "Other deck", "commander").await;
    assert_eq!(
        analyze_deck::latest_job(app.db(), deck_id).await.unwrap(),
        None
    );
    let first = analyze_deck::enqueue(&app.state, deck_id).await.unwrap();
    assert_eq!(first.status, analyze_deck::JobStatus::Pending);
    assert_eq!(first.deck_id, deck_id);
    assert_eq!(
        analyze_deck::enqueue(&app.state, deck_id).await.unwrap(),
        first
    );
    assert_eq!(analyze_deck::refresh_all(&app.state).await.unwrap(), 2);
    assert_eq!(analyze_deck::refresh_all(&app.state).await.unwrap(), 2);
    assert_eq!(
        analyze_deck::latest_job(app.db(), deck_id).await.unwrap(),
        Some(first)
    );
    let other_job = analyze_deck::latest_job(app.db(), other)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        (other_job.status, other_job.deck_id),
        (analyze_deck::JobStatus::Pending, other)
    );
    assert_eq!(job_count(&app).await, 2);
    assert_eq!(
        ai_analysis(&app, deck_id).await.as_deref(),
        Some("Previous analysis")
    );
    let row: (String, String, i64) =
        sqlx::query_as("SELECT worker, queue, max_attempts FROM oban_jobs WHERE id = ?1")
            .bind(first.id)
            .fetch_one(app.db())
            .await
            .unwrap();
    assert_eq!(row, (DECK_ANALYSIS_WORKER.to_owned(), "ai".to_owned(), 3));
}

#[tokio::test]
async fn status_tracks_retries_and_terminal_outcomes_and_selects_only_this_decks_latest_analysis() {
    let server = MockServer::start().await;
    let (app, deck_id) = background_app(&server).await;
    let id = analyze_deck::enqueue(&app.state, deck_id).await.unwrap().id;
    for state in ["available", "executing", "scheduled", "retryable"] {
        set_job_state(&app, id, state).await;
        let job = analyze_deck::latest_job(app.db(), deck_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (job.id, job.status),
            (id, analyze_deck::JobStatus::Pending),
            "{state}"
        );
        assert_eq!(
            analyze_deck::enqueue(&app.state, deck_id).await.unwrap().id,
            id
        );
    }
    for (state, expected) in [
        ("discarded", analyze_deck::JobStatus::Failed),
        ("cancelled", analyze_deck::JobStatus::Failed),
        ("completed", analyze_deck::JobStatus::Completed),
    ] {
        set_job_state(&app, id, state).await;
        let job = analyze_deck::latest_job(app.db(), deck_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!((job.id, job.status), (id, expected), "{state}");
    }
    let new_id = analyze_deck::enqueue(&app.state, deck_id).await.unwrap().id;
    assert_ne!(new_id, id);
    // An Elixir-queued job of another worker with the same args is ignored.
    sqlx::query(
        "INSERT INTO oban_jobs (worker, queue, args) VALUES (?1, 'ai', json_object('deck_id', ?2))",
    )
    .bind(DECK_QUESTION_WORKER)
    .bind(deck_id)
    .execute(app.db())
    .await
    .unwrap();
    let job = analyze_deck::latest_job(app.db(), deck_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        (job.id, job.status),
        (new_id, analyze_deck::JobStatus::Pending)
    );
}

#[tokio::test]
async fn queueing_rejects_missing_settings_without_creating_work() {
    let server = MockServer::start().await;
    let (app, deck_id) = background_app(&server).await;
    sqlx::query("DELETE FROM ai_settings")
        .execute(app.db())
        .await
        .unwrap();
    match analyze_deck::enqueue(&app.state, deck_id).await {
        Err(AiError::User(message)) => assert_eq!(
            message,
            "Configure an AI provider, API key, and model in Settings first."
        ),
        other => unreachable!("unexpected {other:?}"),
    }
    assert!(matches!(
        analyze_deck::refresh_all(&app.state).await,
        Err(AiError::User(_))
    ));
    assert_eq!(job_count(&app).await, 0);
}

#[tokio::test]
async fn failed_worker_retries_become_terminal_without_replacing_the_old_analysis() {
    let server = MockServer::start().await;
    let (app, deck_id) = background_app(&server).await;
    stub_completions(&server, |_, _| {
        ResponseTemplate::new(400)
            .set_body_json(json!({"error": {"message": "Provider rejected the schema"}}))
    })
    .await;
    sqlx::query("UPDATE decks SET ai_analysis = 'Previous analysis' WHERE id = ?1")
        .bind(deck_id)
        .execute(app.db())
        .await
        .unwrap();
    let id = analyze_deck::enqueue(&app.state, deck_id).await.unwrap().id;
    for attempt in 1..=3 {
        let drained = app.state.jobs.drain_queue(&app.state, "ai", true).await;
        assert_eq!(drained.success, 0);
        assert_eq!(drained.failure + drained.discard, 1);
        let expected = if attempt == 3 {
            analyze_deck::JobStatus::Failed
        } else {
            analyze_deck::JobStatus::Pending
        };
        let job = analyze_deck::latest_job(app.db(), deck_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!((job.id, job.status), (id, expected));
    }
    assert_eq!(
        ai_analysis(&app, deck_id).await.as_deref(),
        Some("Previous analysis")
    );
    let (attempt, errors): (i64, String) =
        sqlx::query_as("SELECT attempt, errors FROM oban_jobs WHERE id = ?1")
            .bind(id)
            .fetch_one(app.db())
            .await
            .unwrap();
    assert_eq!(attempt, 3);
    assert!(errors.contains("OpenRouter: Provider rejected the schema"));
}

#[tokio::test]
async fn retry_backoff_is_fifteen_seconds_per_attempt() {
    use super::workers::DeckAnalysisWorker;
    assert_eq!(DeckAnalysisWorker.backoff(1), 15);
    assert_eq!(DeckAnalysisWorker.backoff(2), 30);
    assert_eq!(DeckQuestionWorker.backoff(3), 45);
    let app = TestApp::new().await;
    let deck_id = insert_deck(app.db(), "Gone", "commander").await;
    sqlx::query("DELETE FROM decks WHERE id = ?1")
        .bind(deck_id)
        .execute(app.db())
        .await
        .unwrap();
    let job = Job {
        id: 0,
        worker: DECK_ANALYSIS_WORKER.into(),
        args: json!({"deck_id": deck_id}),
        attempt: 1,
        max_attempts: 3,
    };
    assert!(matches!(
        DeckAnalysisWorker.perform(&app.state, &job).await,
        Outcome::Done
    ));
}

// ---------------------------------------------------------------------------
// GraphQL (`schema/ai_test.exs`).

/// The `OpenRouter` stub of the schema test: settings validation plus
/// analysis and question completions.
async fn graphql_openrouter(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path("/api/v1/key"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"data": {"label": "ManaVault"}})),
        )
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v1/models"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"data": [{"id": "anthropic/claude-sonnet-4"}]})),
        )
        .mount(server)
        .await;
    stub_completions(server, |_, request| {
        match request["response_format"]["json_schema"]["name"].as_str() {
            Some("manavault_deck_analysis") => content_response(&json!({
                "summary": "A slow value deck.",
                "themes": ["Value"],
                "game_plan": "Build resources and win late.",
                "opponent_experience": "Its turns are measured and interactive.",
                "strengths": ["Resilient plan"],
                "weaknesses": ["Slow start"],
                "official_bracket": 2,
                "play_bracket": 2,
                "bracket_rating": "3-",
                "bracket_rationale": "Its single Game Changer raises the guideline bracket.",
                "power_up": ["Add interaction"],
                "power_down": ["Replace the Game Changer"],
                "consistency": ["Improve the curve"],
                "mulligan_guide": ["Keep early mana and card advantage"],
                "custom_sections": [{"title": "Budget upgrades", "content": "- Start with efficient removal."}]
            })),
            _ => answer_response("Cut [[Test Commander]] for [[Plains]].", &["Test Commander"], &["Plains"]),
        }
    })
    .await;
}

#[tokio::test]
async fn graphql_settings_analysis_lists_and_questions_use_ai_without_exposing_the_api_key() {
    let server = MockServer::start().await;
    graphql_openrouter(&server).await;
    let app = app_with(&server).await;
    let settings = app
        .gql_data(
            r"mutation UpdateAISettings($input: AiSettingsInput!) {
                 updateAiSettings(input: $input) { aiSettings { provider model deckAnalysisInstructions hasApiKey } }
               }",
            json!({"input": {
                "provider": "openrouter",
                "apiKey": "graphql-openrouter-key",
                "model": "anthropic/claude-sonnet-4",
                "deckAnalysisInstructions": "Never suggest infinite combos. Add a Budget upgrades section."
            }}),
        )
        .await;
    assert_eq!(
        settings["updateAiSettings"]["aiSettings"]["hasApiKey"],
        true
    );
    app.import_cards(&[game_changer_commander(), legal_plains()])
        .await;
    let deck_id = insert_deck(app.db(), "GraphQL Analysis", "commander").await;
    add_deck_card(app.db(), deck_id, "oracle-test-commander", 1, "mainboard").await;
    let deck_global_id = global_id(NodeKind::Deck, deck_id);

    let analyzed = app
        .gql_data(
            "mutation AnalyzeDeck($id: ID!) { analyzeDeck(id: $id) { job { id status } } }",
            json!({"id": deck_global_id}),
        )
        .await;
    let job_id = analyzed["analyzeDeck"]["job"]["id"].clone();
    assert_eq!(analyzed["analyzeDeck"]["job"]["status"], "pending");
    assert_eq!(completion_requests(&server).await, Vec::<Value>::new());
    let job_row: (String, String) =
        sqlx::query_as("SELECT worker, args FROM oban_jobs WHERE id = ?1")
            .bind(job_id.as_str().unwrap().parse::<i64>().unwrap())
            .fetch_one(app.db())
            .await
            .unwrap();
    assert_eq!(job_row.0, DECK_ANALYSIS_WORKER);
    assert_eq!(
        serde_json::from_str::<Value>(&job_row.1).unwrap(),
        json!({"deck_id": deck_id})
    );
    let drained = app.state.jobs.drain_queue(&app.state, "ai", false).await;
    assert_eq!((drained.success, drained.failure), (1, 0));
    let requests = completion_requests(&server).await;
    assert_eq!(requests.len(), 1);
    assert!(message_content(&requests[0], 0).contains("Never suggest infinite combos."));
    let received = server.received_requests().await.unwrap();
    assert_eq!(
        received.last().unwrap().headers["authorization"],
        "Bearer graphql-openrouter-key"
    );

    let progress = app
        .gql_data(
            "query DeckAnalysisJob($id: ID!) { deckAnalysisJob(deckId: $id) { id status } }",
            json!({"id": deck_global_id}),
        )
        .await;
    assert_eq!(
        progress["deckAnalysisJob"],
        json!({"id": job_id, "status": "completed"})
    );
    let deck: (String, String, i64, i64, String) = sqlx::query_as(
        "SELECT ai_analysis, ai_analysis_model, commander_bracket, commander_bracket_estimate, commander_bracket_rating FROM decks WHERE id = ?1",
    )
    .bind(deck_id)
    .fetch_one(app.db())
    .await
    .unwrap();
    assert!(deck.0.contains("**Bracket 3-**"));
    assert_eq!(
        (deck.1.as_str(), deck.2, deck.3, deck.4.as_str()),
        ("anthropic/claude-sonnet-4", 3, 2, "3-")
    );

    let decklist = "Commander\n1 Test Commander\n\nMainboard\n2 Plains";
    let listed = app
        .gql_data(
            r"mutation AnalyzeDeckList($text: String!, $format: String!) {
                 analyzeDeckList(text: $text, format: $format) {
                   deckAnalysisRequest {
                     id sourceType source sourceName format analysis model
                     commanderBracket commanderBracketEstimate commanderBracketRating insertedAt
                   }
                 }
               }",
            json!({"text": decklist, "format": "commander"}),
        )
        .await;
    let request = &listed["analyzeDeckList"]["deckAnalysisRequest"];
    let request_id = request["id"].clone();
    assert_eq!(request["sourceType"], "text");
    assert_eq!(request["source"], decklist);
    assert_eq!(request["sourceName"], "Pasted decklist");
    assert_eq!(request["format"], "commander");
    assert_eq!(request["model"], "anthropic/claude-sonnet-4");
    assert_eq!(
        (
            request["commanderBracket"].clone(),
            request["commanderBracketEstimate"].clone()
        ),
        (json!(3), json!(2))
    );
    assert_eq!(request["commanderBracketRating"], "3-");
    let list_analysis = request["analysis"].clone();
    assert!(list_analysis.as_str().unwrap().contains("## Overview"));
    assert!(crate::timefmt::parse(request["insertedAt"].as_str().unwrap()).is_some());
    assert!(request["insertedAt"].as_str().unwrap().ends_with('Z'));
    let list_prompt = message_content(completion_requests(&server).await.last().unwrap(), 1);
    assert!(list_prompt.contains(r#""land_count":2"#));
    assert!(list_prompt.contains(r#""name":"Pasted decklist""#));

    sqlx::query("UPDATE decks SET share_token = 'tokentokentokentokentoke' WHERE id = ?1")
        .bind(deck_id)
        .execute(app.db())
        .await
        .unwrap();
    let deck_url = "/share/decks/tokentokentokentokentoke";
    let linked = app
        .gql_data(
            r"mutation AnalyzeDeckList($url: String!, $format: String!) {
                 analyzeDeckList(url: $url, format: $format) { deckAnalysisRequest { id sourceType source sourceName } }
               }",
            json!({"url": deck_url, "format": "commander"}),
        )
        .await;
    let linked = &linked["analyzeDeckList"]["deckAnalysisRequest"];
    let link_request_id = linked["id"].clone();
    assert_eq!(linked["sourceType"], "url");
    assert_eq!(linked["source"], deck_url);
    assert_eq!(linked["sourceName"], "GraphQL Analysis");

    let history = app
        .gql_data(
            "query DeckAnalysisRequests { deckAnalysisRequests { id sourceName analysis } }",
            json!({}),
        )
        .await;
    assert_eq!(
        history["deckAnalysisRequests"],
        json!([
            {"id": link_request_id, "sourceName": "GraphQL Analysis", "analysis": history["deckAnalysisRequests"][0]["analysis"]},
            {"id": request_id, "sourceName": "Pasted decklist", "analysis": list_analysis}
        ])
    );
    let bounded = app
        .gql_data(
            "query DeckAnalysisRequests($limit: Int) { deckAnalysisRequests(limit: $limit) { id } }",
            json!({"limit": 1}),
        )
        .await;
    assert_eq!(
        bounded["deckAnalysisRequests"],
        json!([{"id": link_request_id}])
    );

    let fields = "id conversationId question answer status error model recommendedCuts recommendedAdditions insertedAt";
    let asked = app
        .gql_data(
            &format!(
                r#"mutation AskDeckQuestion($id: ID!, $question: String!) {{
                     askDeckQuestion(id: $id, question: $question, conversationId: "chat-graphql") {{
                       answer questionAnswer {{ {fields} }}
                     }}
                   }}"#
            ),
            json!({"id": deck_global_id, "question": "What should I cut for Doubling Season?"}),
        )
        .await;
    let question = &asked["askDeckQuestion"]["questionAnswer"];
    let question_id = question["id"].clone();
    assert_eq!(asked["askDeckQuestion"]["answer"], "");
    assert_eq!(question["conversationId"], "chat-graphql");
    assert_eq!(
        question["question"],
        "What should I cut for Doubling Season?"
    );
    assert_eq!(question["answer"], "");
    assert_eq!(question["status"], "pending");
    assert_eq!(question["error"], Value::Null);
    assert_eq!(question["model"], Value::Null);
    assert_eq!(question["recommendedCuts"], json!([]));
    assert_eq!(question["recommendedAdditions"], json!([]));
    assert!(crate::timefmt::parse(question["insertedAt"].as_str().unwrap()).is_some());
    let question_db_id: i64 = question_id.as_str().unwrap().parse().unwrap();
    let job_args: String = sqlx::query_scalar("SELECT args FROM oban_jobs WHERE worker = ?1")
        .bind(DECK_QUESTION_WORKER)
        .fetch_one(app.db())
        .await
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&job_args).unwrap(),
        json!({"question_answer_id": question_db_id})
    );
    // `perform_job` with the GraphQL (string) id.
    let job = Job {
        id: 0,
        worker: DECK_QUESTION_WORKER.into(),
        args: json!({"question_answer_id": question_id}),
        attempt: 1,
        max_attempts: 3,
    };
    assert!(matches!(
        DeckQuestionWorker.perform(&app.state, &job).await,
        Outcome::Done
    ));
    let question_request = completion_requests(&server).await.last().unwrap().clone();
    assert!(!message_content(&question_request, 0).contains("Never suggest infinite combos."));
    assert!(
        message_content(&question_request, 1).contains("What should I cut for Doubling Season?")
    );

    let answers = app
        .gql_data(
            &format!("query DeckQuestionAnswers($deckId: ID!) {{ deckQuestionAnswers(deckId: $deckId) {{ {fields} }} }}"),
            json!({"deckId": deck_global_id}),
        )
        .await;
    let answers = answers["deckQuestionAnswers"].as_array().unwrap();
    assert_eq!(answers.len(), 1);
    let answer = &answers[0];
    assert_eq!(answer["id"], question_id);
    assert_eq!(answer["conversationId"], "chat-graphql");
    assert_eq!(answer["answer"], "Cut [[Test Commander]] for [[Plains]].");
    assert_eq!(answer["status"], "completed");
    assert_eq!(answer["error"], Value::Null);
    assert_eq!(answer["model"], "anthropic/claude-sonnet-4");
    assert_eq!(answer["recommendedCuts"], json!(["Test Commander"]));
    assert_eq!(answer["recommendedAdditions"], json!(["Plains"]));

    let deleted = app
        .gql_data(
            "mutation DeleteDeckQuestionAnswer($id: ID!) { deleteDeckQuestionAnswer(id: $id) { questionAnswerId } }",
            json!({"id": question_id}),
        )
        .await;
    assert_eq!(
        deleted["deleteDeckQuestionAnswer"]["questionAnswerId"],
        question_id
    );
    assert_eq!(
        question_answers::list_for_deck(app.db(), deck_id)
            .await
            .unwrap(),
        vec![]
    );
}

#[tokio::test]
async fn graphql_saved_answers_without_recommendation_metadata_expose_empty_lists() {
    let app = TestApp::new().await;
    let deck_id = insert_deck(app.db(), "Legacy questions", "commander").await;
    create_answer(
        &app,
        deck_id,
        NewQuestionAnswer::completed("How does this deck look?", "It has a focused game plan."),
    )
    .await;
    let thread = create_answer(
        &app,
        deck_id,
        NewQuestionAnswer {
            thread_id: Some("t-1".into()),
            ..NewQuestionAnswer::completed("Swap?", "Yes.")
        },
    )
    .await;
    let data = app
        .gql_data(
            "query DeckQuestionAnswers($deckId: ID!) { deckQuestionAnswers(deckId: $deckId) { recommendedCuts recommendedAdditions } }",
            json!({"deckId": global_id(NodeKind::Deck, deck_id)}),
        )
        .await;
    assert_eq!(
        data["deckQuestionAnswers"],
        json!([{"recommendedCuts": [], "recommendedAdditions": []}])
    );
    let data = app
        .gql_data(
            r#"query($deckId: ID!) { deckQuestionAnswers(deckId: $deckId, threadId: "t-1") { id } }"#,
            json!({"deckId": global_id(NodeKind::Deck, deck_id)}),
        )
        .await;
    assert_eq!(
        data["deckQuestionAnswers"],
        json!([{"id": thread.to_string()}])
    );
}

#[tokio::test]
async fn graphql_queues_a_fresh_ai_analysis_for_every_deck() {
    let app = TestApp::new().await;
    insert_settings(&app, "anthropic/claude-sonnet-4", None).await;
    let first = insert_deck(app.db(), "First queued deck", "commander").await;
    let second = insert_deck(app.db(), "Second queued deck", "commander").await;
    let data = app
        .gql_data(
            "mutation RefreshAllDeckAnalyses { refreshAllDeckAnalyses { queuedCount } }",
            json!({}),
        )
        .await;
    assert_eq!(data, json!({"refreshAllDeckAnalyses": {"queuedCount": 2}}));
    for deck_id in [first, second] {
        assert!(
            analyze_deck::latest_job(app.db(), deck_id)
                .await
                .unwrap()
                .is_some()
        );
    }
}

#[tokio::test]
async fn graphql_errors_match_the_elixir_messages() {
    let app = TestApp::new().await;
    let deck_id = insert_deck(app.db(), "Errors", "commander").await;
    let deck_global_id = global_id(NodeKind::Deck, deck_id);
    let message = |response: Value| {
        response["errors"][0]["message"]
            .as_str()
            .unwrap_or_default()
            .to_owned()
    };
    assert_eq!(
        message(
            app.gql(
                "mutation { refreshAllDeckAnalyses { queuedCount } }",
                json!({})
            )
            .await
        ),
        "Configure an AI provider, API key, and model in Settings first."
    );
    assert_eq!(
        message(
            app.gql(
                "mutation($id: ID!) { analyzeDeck(id: $id) { job { id } } }",
                json!({"id": deck_global_id})
            )
            .await
        ),
        "Configure an AI provider, API key, and model in Settings first."
    );
    assert_eq!(
        message(app.gql(r#"mutation { analyzeDeckList(text: "1 Sol Ring", format: "brawl") { deckAnalysisRequest { id } } }"#, json!({})).await),
        "Choose a supported deck format."
    );
    assert_eq!(
        message(app.gql(r#"mutation { analyzeDeckList(format: "commander") { deckAnalysisRequest { id } } }"#, json!({})).await),
        "Paste a decklist or a supported link to analyze."
    );
    assert_eq!(
        message(
            app.gql(
                r#"mutation { deleteDeckQuestionAnswer(id: "12x") { questionAnswerId } }"#,
                json!({})
            )
            .await
        ),
        "Invalid ID: 12x"
    );
    assert_eq!(
        message(
            app.gql(
                r#"mutation { deleteDeckQuestionAnswer(id: "999") { questionAnswerId } }"#,
                json!({})
            )
            .await
        ),
        "Saved question was not found."
    );
    assert_eq!(
        message(
            app.gql(
                r#"mutation($id: ID!) { askDeckQuestion(id: $id, question: " ") { answer } }"#,
                json!({"id": deck_global_id})
            )
            .await
        ),
        "Enter a question about this deck."
    );
    assert_eq!(
        message(
            app.gql(
                r#"mutation($id: ID!) { askDeckQuestion(id: $id, question: "Q") { answer } }"#,
                json!({"id": global_id(NodeKind::Deck, 999)})
            )
            .await
        ),
        "Deck was not found."
    );
    assert_eq!(
        message(
            app.gql(
                "query($id: ID!) { deckAnalysisJob(deckId: $id) { id } }",
                json!({"id": global_id(NodeKind::Location, 1)})
            )
            .await
        ),
        "Expected deck ID, got location ID"
    );
    assert_eq!(
        app.gql_data(
            "query($id: ID!) { deckAnalysisJob(deckId: $id) { id } }",
            json!({"id": deck_global_id})
        )
        .await,
        json!({"deckAnalysisJob": null})
    );

    insert_settings(&app, "m", None).await;
    assert_eq!(
        message(app.gql(r#"mutation { analyzeDeckList(text: "1 Unknown Card\n1 Other Unknown", format: "commander") { deckAnalysisRequest { id } } }"#, json!({})).await),
        "These cards are not in the local catalog: Unknown Card, Other Unknown. Sync the catalog or correct the list and try again."
    );
    app.import_cards(&[legal_plains()]).await;
    assert_eq!(
        message(app.gql(r#"mutation { analyzeDeckList(text: "Maybeboard\n1 Plains", format: "commander") { deckAnalysisRequest { id } } }"#, json!({})).await),
        "The decklist does not contain any mainboard or commander cards."
    );
    assert_eq!(
        message(app.gql(r#"mutation { analyzeDeckList(url: "https://example.com/x", format: "commander") { deckAnalysisRequest { id } } }"#, json!({})).await),
        "Unsupported link. Paste the list text instead."
    );
    // An empty staged swap is no swap at all.
    let asked = app
        .gql_data(
            r#"mutation($id: ID!) { askDeckQuestion(id: $id, question: "Q", swapContext: {cuts: [" "], adds: []}, threadId: "t") { questionAnswer { id status } } }"#,
            json!({"id": deck_global_id}),
        )
        .await;
    assert_eq!(
        asked["askDeckQuestion"]["questionAnswer"]["status"],
        "pending"
    );
    let id: i64 = asked["askDeckQuestion"]["questionAnswer"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let stored = question_answers::get(app.db(), id).await.unwrap().unwrap();
    assert_eq!(
        (stored.thread_id.as_deref(), stored.swap_context),
        (Some("t"), None)
    );
}
