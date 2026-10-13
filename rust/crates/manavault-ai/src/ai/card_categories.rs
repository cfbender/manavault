//! Deck card categories: the AI deck analysis names deck-specific card
//! categories, and the Jev decision model (`OpenRouter`'s Decisions API)
//! assigns each non-commander card one of them, with the commanders as
//! context.
//!
//! Assignments are stored per deck and card with a digest of the categories
//! and commanders, so they are reused until a new analysis or a commander
//! change, and only new cards are sent to Jev.

use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;
use std::time::{Duration, Instant};

use lotus::Zone;
use serde::Serialize;
use serde::ser::{SerializeMap, Serializer};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use super::deck_analysis::CardCategory;
use super::decks::{self, DeckCardInput};
use super::{AiError, Configured, Provider};
use manavault_catalog::catalog::oracle_tags::is_type_theme;
use manavault_core::settings::ai::openrouter::response_error;
use manavault_core::state::AppState;
use manavault_core::timestamp::Timestamp;

/// The decision model; pinned so assignments do not shift between releases.
pub const MODEL: &str = "typesafe/jev-1.13";
/// Changes whenever the request changes, so earlier assignments are redone.
const REQUEST_VERSION: &str = "3";
/// Always offered last, so a card that fits nothing has somewhere to go.
pub const OTHER: &str = "Other";
const OTHER_DESCRIPTION: &str = "Does not fit any of the roles above.";
const CONCURRENCY: usize = 8;
const TIMEOUT: Duration = Duration::from_secs(20);
const DECISION_ERROR: &str = "OpenRouter could not categorize this card.";

/// A deck's categories and the category of each assigned card.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Assignments {
    /// The analysis categories followed by [`OTHER`]; empty when the deck's
    /// analysis has none.
    pub categories: Vec<CardCategory>,
    /// `(oracle_id, category)` for each assigned card, by oracle id.
    pub cards: Vec<(String, String)>,
}

/// The categories saved with the deck's analysis, without [`OTHER`].
async fn saved_categories(pool: &SqlitePool, deck_id: i64) -> Result<Vec<CardCategory>, AiError> {
    let json = sqlx::query_scalar!(
        "SELECT ai_card_categories FROM decks WHERE id = ?1",
        deck_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(json
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default())
}

/// Identifies the inputs an assignment was made from: the offered
/// categories and the sorted commander oracle ids.
fn digest(categories: &[CardCategory], commanders: &BTreeSet<&str>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{MODEL}\n{REQUEST_VERSION}\n"));
    hasher.update(serde_json::to_vec(categories).unwrap_or_default());
    for commander in commanders {
        hasher.update(b"\n");
        hasher.update(commander.as_bytes());
    }
    hex::encode(hasher.finalize())
}

/// The card as Jev sees it. Its catalog role themes keep Jev from reading
/// words literally, such as filing exile-based removal under exile payoffs.
fn card_state(card: &DeckCardInput) -> Value {
    let themes: Vec<String> = serde_json::from_str::<Vec<String>>(&card.card.deck_themes)
        .unwrap_or_default()
        .into_iter()
        .filter(|theme| !is_type_theme(theme))
        .map(|theme| theme.replace('_', " "))
        .collect();
    json!({
        "name": card.card.name,
        "type_line": card.card.type_line,
        "oracle_text": card.card.oracle_text,
        "themes": themes,
    })
}

/// The categories as Choice criteria, in analysis order. Jev weighs the
/// options in the order given, and the analysis lists the deck's own engines
/// before generic roles; a sorted `serde_json::Map` measurably worsened
/// choices (exile-based removal landed under exile payoffs).
struct Criteria<'a>(&'a [CardCategory]);

impl Serialize for Criteria<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for category in self.0 {
            let description = Some(category.description.as_str()).filter(|d| !d.is_empty());
            map.serialize_entry(&category.name, &description)?;
        }
        map.end()
    }
}

#[derive(Serialize)]
struct ChoiceQuestion<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    instructions: &'static str,
    criteria: Criteria<'a>,
}

#[derive(Serialize)]
struct Questions<'a> {
    role: ChoiceQuestion<'a>,
}

/// A Decisions request.
#[derive(Serialize)]
pub struct Request<'a> {
    model: &'static str,
    state: Value,
    questions: Questions<'a>,
}

/// The Decisions request that asks which category `card` fills.
#[must_use]
pub fn request<'a>(
    categories: &'a [CardCategory],
    commanders: &[Value],
    card: &Value,
) -> Request<'a> {
    let (state, instructions) = if commanders.is_empty() {
        (
            json!({"card": card}),
            "Which role does this card fill in this deck?",
        )
    } else {
        (
            json!({"commanders": commanders, "card": card}),
            "Which role does this card fill in a deck led by these commanders?",
        )
    };
    Request {
        model: MODEL,
        state,
        questions: Questions {
            role: ChoiceQuestion {
                kind: "choice",
                instructions,
                criteria: Criteria(categories),
            },
        },
    }
}

/// A decision: the chosen category and Jev's confidence in it.
#[derive(Debug, Clone, PartialEq)]
pub struct Decision {
    pub category: String,
    pub confidence: Option<f64>,
    /// The request's cost in USD, when `OpenRouter` reports it.
    pub cost: Option<f64>,
}

/// Reads the `role` answer, which must name one of `categories`.
pub fn decode(categories: &[CardCategory], body: &Value) -> Result<Decision, String> {
    let answer = body.pointer("/answers/role");
    let category = answer
        .and_then(|answer| answer.get("choice"))
        .and_then(Value::as_str)
        .filter(|choice| categories.iter().any(|category| category.name == *choice))
        .ok_or_else(|| "OpenRouter returned an unknown card category.".to_owned())?;
    Ok(Decision {
        category: category.to_owned(),
        confidence: answer
            .and_then(|answer| answer.get("confidence"))
            .and_then(Value::as_f64),
        cost: body.pointer("/usage/cost").and_then(Value::as_f64),
    })
}

async fn decide(state: &AppState, api_key: &str, request: &str) -> Result<Value, String> {
    let response = state
        .http
        .post(&state.config.platform_urls.openrouter_decisions)
        .bearer_auth(api_key)
        .header("accept", "application/json")
        .header("http-referer", "https://github.com/cfbender/manavault")
        .header("x-openrouter-title", "ManaVault")
        .timeout(TIMEOUT)
        .header("content-type", "application/json")
        .body(request.to_owned())
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|error| error.to_string())?;
    if !(200..300).contains(&status) {
        return Err(response_error(status, &text, DECISION_ERROR));
    }
    serde_json::from_str(&text).map_err(|_| DECISION_ERROR.to_owned())
}

/// Assigns categories to the deck's cards that lack a current assignment
/// (only when `settings` is given) and returns every current assignment.
/// A card Jev fails on stays unassigned and is retried next time.
pub async fn assign(
    state: &AppState,
    settings: Option<&Configured>,
    deck_id: i64,
) -> Result<Assignments, AiError> {
    let mut categories = saved_categories(&state.db, deck_id).await?;
    if categories.is_empty() {
        return Ok(Assignments::default());
    }
    categories.push(CardCategory {
        name: OTHER.to_owned(),
        description: OTHER_DESCRIPTION.to_owned(),
    });
    let cards = decks::deck_cards(&state.db, deck_id).await?;
    let (commanders, others): (Vec<&DeckCardInput>, Vec<&DeckCardInput>) =
        cards.iter().partition(|card| card.zone == Zone::Commander);
    let commander_ids: BTreeSet<&str> = commanders
        .iter()
        .map(|card| card.card.oracle_id.as_str())
        .collect();
    let digest = digest(&categories, &commander_ids);
    let mut assigned = current(&state.db, deck_id, &digest).await?;

    if let Some(settings) =
        settings.filter(|s| s.provider().is_ok_and(|p| p == Provider::OpenRouter))
    {
        let mut missing: Vec<&DeckCardInput> = Vec::new();
        for card in &others {
            let id = card.card.oracle_id.as_str();
            if !assigned.contains_key(id)
                && !missing.iter().any(|m| m.card.oracle_id.as_str() == id)
            {
                missing.push(card);
            }
        }
        if !missing.is_empty() {
            let commander_state: Vec<Value> = commanders.iter().map(|c| card_state(c)).collect();
            let decided =
                run_decisions(state, settings, &categories, &commander_state, &missing).await;
            save(&state.db, deck_id, &digest, &decided).await?;
            assigned.extend(
                decided
                    .into_iter()
                    .map(|(id, decision)| (id, decision.category)),
            );
        }
    }

    let in_deck: BTreeSet<&str> = others
        .iter()
        .map(|card| card.card.oracle_id.as_str())
        .collect();
    let mut cards: Vec<(String, String)> = assigned
        .into_iter()
        .filter(|(id, _)| in_deck.contains(id.as_str()))
        .collect();
    cards.sort();
    Ok(Assignments { categories, cards })
}

async fn current(
    pool: &SqlitePool,
    deck_id: i64,
    digest: &str,
) -> Result<HashMap<String, String>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT oracle_id AS "oracle_id!", category AS "category!"
           FROM deck_card_categories WHERE deck_id = ?1 AND digest = ?2"#,
        deck_id,
        digest
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.oracle_id, row.category))
        .collect())
}

/// Asks Jev about each card, [`CONCURRENCY`] at a time, and returns the
/// successful decisions by oracle id. Logs one summary line.
async fn run_decisions(
    state: &AppState,
    settings: &Configured,
    categories: &[CardCategory],
    commanders: &[Value],
    cards: &[&DeckCardInput],
) -> Vec<(String, Decision)> {
    let started = Instant::now();
    let permits = Arc::new(Semaphore::new(CONCURRENCY));
    let categories: Arc<[CardCategory]> = categories.into();
    let mut tasks = JoinSet::new();
    for card in cards {
        let id = card.card.oracle_id.as_str().to_owned();
        let body = serde_json::to_string(&request(&categories, commanders, &card_state(card)))
            .unwrap_or_default();
        let (state, api_key, categories, permits) = (
            state.clone(),
            settings.api_key.clone(),
            categories.clone(),
            permits.clone(),
        );
        tasks.spawn(async move {
            let _permit = permits.acquire_owned().await;
            let result = decide(&state, &api_key, &body)
                .await
                .and_then(|response| decode(&categories, &response));
            (id, result)
        });
    }
    let mut decided = Vec::new();
    let mut failures = Vec::new();
    while let Some(joined) = tasks.join_next().await {
        match joined {
            Ok((id, Ok(decision))) => decided.push((id, decision)),
            Ok((_, Err(reason))) => failures.push(reason),
            Err(error) => failures.push(error.to_string()),
        }
    }
    let cost: f64 = decided.iter().filter_map(|(_, d)| d.cost).sum();
    tracing::info!(
        "Jev card categories model={MODEL} cards={} assigned={} failed={} duration_ms={} cost_usd={cost:.6}{}",
        cards.len(),
        decided.len(),
        failures.len(),
        started.elapsed().as_millis(),
        failures
            .first()
            .map(|reason| format!(" first_error={reason:?}"))
            .unwrap_or_default()
    );
    decided
}

/// Stores the decisions and drops the deck's stale assignments.
async fn save(
    pool: &SqlitePool,
    deck_id: i64,
    digest: &str,
    decided: &[(String, Decision)],
) -> Result<(), sqlx::Error> {
    let now = Timestamp::now();
    let mut tx = manavault_core::db::begin_write(pool).await?;
    sqlx::query!(
        "DELETE FROM deck_card_categories WHERE deck_id = ?1 AND digest != ?2",
        deck_id,
        digest
    )
    .execute(&mut *tx)
    .await?;
    for (oracle_id, decision) in decided {
        sqlx::query!(
            r#"INSERT INTO deck_card_categories
                 (deck_id, oracle_id, category, confidence, digest, inserted_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
               ON CONFLICT (deck_id, oracle_id) DO UPDATE SET
                 category = excluded.category, confidence = excluded.confidence,
                 digest = excluded.digest, updated_at = excluded.updated_at"#,
            deck_id,
            oracle_id,
            decision.category,
            decision.confidence,
            digest,
            now
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}
