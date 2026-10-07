//! The `ai` queue workers (`AI.DeckAnalysisWorker`, `AI.DeckQuestionWorker`).

use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;

use super::analyze_deck::{self, RunError};
use super::{AiError, answer_deck_question, decks};
use crate::jobs::{Job, Outcome, Unique, Worker};
use crate::state::AppState;

pub const DECK_ANALYSIS_WORKER: &str = "Manavault.AI.DeckAnalysisWorker";
pub const DECK_QUESTION_WORKER: &str = "Manavault.AI.DeckQuestionWorker";

/// An integer id argument; Oban args may carry it as a number or a string.
fn id_arg(args: &Value, key: &str) -> Option<i64> {
    match args.get(key)? {
        Value::Number(number) => number.as_i64(),
        Value::String(text) => text.parse().ok(),
        _ => None,
    }
}

fn reason(error: &AiError) -> String {
    match error {
        AiError::User(message) => message.clone(),
        other => other.to_string(),
    }
}

/// Analyzes one deck. Unique per deck while incomplete, so individual and
/// bulk refreshes share a job; a deleted deck completes without work.
pub struct DeckAnalysisWorker;

#[async_trait]
impl Worker for DeckAnalysisWorker {
    fn name(&self) -> &'static str {
        DECK_ANALYSIS_WORKER
    }
    fn queue(&self) -> &'static str {
        "ai"
    }
    fn max_attempts(&self) -> i64 {
        3
    }
    fn unique(&self) -> Option<Unique> {
        Some(Unique::WorkerArgs)
    }
    fn timeout(&self) -> Duration {
        Duration::from_secs(10 * 60)
    }
    fn backoff(&self, attempt: i64) -> u64 {
        u64::try_from(attempt).unwrap_or(1).saturating_mul(15)
    }

    async fn perform(&self, state: &AppState, job: &Job) -> Outcome {
        let Some(deck_id) = id_arg(&job.args, "deck_id") else {
            return Outcome::Cancel("missing deck_id".to_owned());
        };
        let deck = match decks::get(&state.db, deck_id).await {
            Ok(Some(deck)) => deck,
            Ok(None) => return Outcome::Done,
            Err(error) => return Outcome::Retry(error.to_string()),
        };
        match analyze_deck::run(state, &deck).await {
            Ok(_) => Outcome::Done,
            Err(RunError::Invalid) => Outcome::Retry(RunError::Invalid.to_string()),
            Err(RunError::Ai(error)) => Outcome::Retry(reason(&error)),
        }
    }
}

/// Answers one saved question. After the last attempt the question is
/// marked failed with the error.
pub struct DeckQuestionWorker;

#[async_trait]
impl Worker for DeckQuestionWorker {
    fn name(&self) -> &'static str {
        DECK_QUESTION_WORKER
    }
    fn queue(&self) -> &'static str {
        "ai"
    }
    fn max_attempts(&self) -> i64 {
        3
    }
    fn timeout(&self) -> Duration {
        Duration::from_secs(10 * 60)
    }
    fn backoff(&self, attempt: i64) -> u64 {
        u64::try_from(attempt).unwrap_or(1).saturating_mul(15)
    }

    async fn perform(&self, state: &AppState, job: &Job) -> Outcome {
        let Some(id) = id_arg(&job.args, "question_answer_id") else {
            return Outcome::Cancel("missing question_answer_id".to_owned());
        };
        match answer_deck_question::run(state, id).await {
            Ok(()) => Outcome::Done,
            Err(error) if job.attempt >= job.max_attempts => {
                match answer_deck_question::fail(state, id, &error).await {
                    Ok(()) => Outcome::Retry(reason(&error)),
                    Err(failure) => Outcome::Retry(reason(&failure)),
                }
            }
            Err(error) => Outcome::Retry(reason(&error)),
        }
    }
}
