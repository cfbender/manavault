//! Queuing and answering deck questions (`AI.AnswerDeckQuestion`).

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value, json};

use super::deck_analysis::{self, Payload, PayloadDeck};
use super::deck_question::{self, Answer};
use super::decks;
use super::openrouter::{self, Turn};
use super::question_answers::{self, NewQuestionAnswer, QuestionAnswer, Status, WriteError};
use super::workers::DECK_QUESTION_WORKER;
use super::{AiError, Configured, Provider};
use manavault_catalog::catalog::search::cards_by_name;
use manavault_core::state::AppState;

/// Completed prior turns sent with each new question in either chat surface.
const THREAD_HISTORY_TURNS: i64 = 6;
const NO_LEGAL_RECOMMENDATION: &str =
    "The AI provider could not produce a legal recommendation. Try asking again.";

/// `ask_deck_question` options.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AskOptions {
    /// Isolates saved Ask AI chats; `None` is the original conversation.
    pub conversation_id: Option<String>,
    /// Groups Swap cards chat turns so later turns see earlier ones.
    pub thread_id: Option<String>,
    /// Card names staged to cut and add when the question was asked.
    pub swap_context: Option<(Vec<String>, Vec<String>)>,
}

fn write_error(error: WriteError) -> AiError {
    match error {
        WriteError::Invalid(errors) => AiError::User(errors.to_string()),
        WriteError::Db(error) => AiError::Db(error),
    }
}

/// `enqueue/3`: validates the question and saves it as pending together
/// with its `DeckQuestionWorker` job.
pub async fn enqueue(
    state: &AppState,
    deck_id: i64,
    question: &str,
    options: &AskOptions,
) -> Result<QuestionAnswer, AiError> {
    let question = deck_question::validate(question).map_err(AiError::User)?;
    let thread_id =
        deck_question::validate_thread_id(options.thread_id.as_deref()).map_err(AiError::User)?;
    let conversation_id = deck_question::validate_thread_id(options.conversation_id.as_deref())
        .map_err(AiError::User)?;
    let swap_context = deck_question::validate_swap_context(
        options
            .swap_context
            .as_ref()
            .map(|(cuts, adds)| (cuts.as_slice(), adds.as_slice())),
    )
    .map_err(AiError::User)?;
    Configured::load(state).await?.provider()?;

    let attrs = NewQuestionAnswer {
        question,
        answer: String::new(),
        status: Status::Pending,
        error: None,
        model: None,
        conversation_id,
        thread_id,
        swap_context,
        recommendations: None,
    };
    let mut tx = manavault_core::db::begin_write(&state.db).await?;
    let saved = question_answers::insert(&mut tx, deck_id, &attrs)
        .await
        .map_err(write_error)?;
    state
        .jobs
        .enqueue_in(
            &mut tx,
            DECK_QUESTION_WORKER,
            json!({"question_answer_id": saved.id}),
        )
        .await?;
    tx.commit().await?;
    state.jobs.wake();
    Ok(saved)
}

/// `run/1`: answers a pending question; anything else is left alone.
pub async fn run(state: &AppState, id: i64) -> Result<(), AiError> {
    match question_answers::get(&state.db, id).await? {
        Some(turn) if turn.status == Status::Pending => answer(state, &turn).await,
        _ => Ok(()),
    }
}

/// `fail/2`: marks a pending question failed after its last attempt. User
/// messages are kept (up to 2,000 characters); other failures get a
/// generic message.
pub async fn fail(state: &AppState, id: i64, reason: &AiError) -> Result<(), AiError> {
    let Some(turn) = question_answers::get(&state.db, id).await? else {
        return Ok(());
    };
    if turn.status != Status::Pending {
        return Ok(());
    }
    let error = match reason {
        AiError::User(message) => message.chars().take(2_000).collect(),
        _ => "The AI question could not be completed.".to_owned(),
    };
    question_answers::fail(&state.db, &turn, &error)
        .await
        .map_err(write_error)
}

async fn answer(state: &AppState, turn: &QuestionAnswer) -> Result<(), AiError> {
    let deck = decks::get(&state.db, turn.deck_id)
        .await?
        .ok_or_else(|| AiError::Internal(format!("deck {} not found", turn.deck_id)))?;
    let settings = Configured::load(state).await?;
    let provider = settings.provider()?;
    let cards = decks::deck_cards(&state.db, deck.id).await?;
    let payload = deck_analysis::payload(
        &PayloadDeck {
            name: &deck.name,
            format: &deck.format,
            primer: deck.primer.as_deref(),
        },
        &cards,
    );
    let question_turn = Turn {
        question: turn.question.clone(),
        history: question_answers::history(&state.db, turn, THREAD_HISTORY_TURNS).await?,
        swap_context: turn.swap_context(),
        thread: turn.thread_id.is_some(),
    };
    let result = generate(state, &settings, provider, &payload, question_turn).await?;
    let recommendations = json!({
        "cuts": result.recommended_cuts,
        "additions": result.recommended_additions
    });
    question_answers::complete(
        &state.db,
        turn,
        &result.answer,
        &settings.model,
        &recommendations,
    )
    .await
    .map_err(write_error)
}

/// Asks, then checks the recommendations against the deck and catalog,
/// retrying once with the problems listed before giving up.
async fn generate(
    state: &AppState,
    settings: &Configured,
    provider: Provider,
    payload: &Payload,
    mut turn: Turn,
) -> Result<Answer, AiError> {
    let mut corrections_left = 1;
    loop {
        let raw = match provider {
            Provider::OpenRouter => {
                openrouter::ask_deck_question(state, settings, &payload.value, &turn).await
            }
        }
        .map_err(AiError::User)?;
        let result = deck_question::normalize_result(&raw).map_err(AiError::User)?;
        let cards = cards_by_name::by_names(&state.db, &result.recommended_additions).await?;
        let issues = recommendation_issues(&result, payload, &cards);
        if issues.is_empty() {
            return Ok(canonicalize(result, payload, &cards));
        }
        if corrections_left == 0 {
            return Err(AiError::User(NO_LEGAL_RECOMMENDATION.to_owned()));
        }
        corrections_left -= 1;
        turn.question = deck_question::correction_prompt(&turn.question, &issues);
    }
}

fn recommendation_issues(
    result: &Answer,
    payload: &Payload,
    cards: &HashMap<String, manavault_catalog::catalog::card::CardRecord>,
) -> Vec<String> {
    let deck_names: HashSet<String> = payload
        .card_names
        .iter()
        .map(|name| cards_by_name::key(name))
        .collect();
    let mut issues: Vec<String> = result
        .recommended_cuts
        .iter()
        .filter(|name| !deck_names.contains(&cards_by_name::key(name)))
        .map(|name| format!("{name} is not in the current deck."))
        .collect();
    for name in &result.recommended_additions {
        let Some(card) = cards.get(&cards_by_name::key(name)) else {
            issues.push(format!("{name} was not found in the current card catalog."));
            continue;
        };
        if !matches!(payload.format.as_str(), "limited" | "casual") {
            let legalities: Map<String, Value> =
                serde_json::from_str(&card.legalities).unwrap_or_default();
            let status = legalities.get(&payload.format).and_then(Value::as_str);
            if !matches!(status, Some("legal" | "restricted")) {
                issues.push(format!("{name} is not legal in {}.", payload.format));
            }
        }
        if let (true, Some(identity)) = (
            payload.format == "commander",
            &payload.commander_color_identity,
        ) {
            {
                let fits = card
                    .color_identity_list()
                    .iter()
                    .all(|color| identity.contains(color));
                if !fits {
                    issues.push(format!("{name} is outside the commander's color identity."));
                }
            }
        }
    }
    issues
}

/// Replaces recommended names with the deck's and catalog's spelling.
fn canonicalize(
    result: Answer,
    payload: &Payload,
    cards: &HashMap<String, manavault_catalog::catalog::card::CardRecord>,
) -> Answer {
    let deck_names: HashMap<String, &String> = payload
        .card_names
        .iter()
        .map(|name| (cards_by_name::key(name), name))
        .collect();
    Answer {
        recommended_cuts: result
            .recommended_cuts
            .iter()
            .map(|name| {
                deck_names
                    .get(&cards_by_name::key(name))
                    .map_or_else(|| name.clone(), |canonical| (*canonical).clone())
            })
            .collect(),
        recommended_additions: result
            .recommended_additions
            .iter()
            .map(|name| {
                cards
                    .get(&cards_by_name::key(name))
                    .map_or_else(|| name.clone(), |card| card.name.clone())
            })
            .collect(),
        answer: result.answer,
    }
}
