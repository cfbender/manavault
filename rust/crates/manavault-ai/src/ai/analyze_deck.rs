//! Analyzing saved decks in the background (`AI.AnalyzeDeck`).

use serde_json::json;
use sqlx::SqlitePool;

use super::deck_analysis::{self, Analysis, Payload, PayloadDeck};
use super::decks::{self, DeckInfo, SaveError, SavedAnalysis};
use super::workers::DECK_ANALYSIS_WORKER;
use super::{AiError, Configured, Provider, openrouter};
use crate::state::AppState;
use crate::timefmt;

/// What the frontend sees of an analysis job.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobStatus {
    Pending,
    Completed,
    Failed,
}

impl JobStatus {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    /// Completed jobs are completed, discarded and cancelled ones failed,
    /// and every other state (queued, running, retrying) pending.
    fn from_state(state: &str) -> Self {
        match state {
            "completed" => Self::Completed,
            "discarded" | "cancelled" => Self::Failed,
            _ => Self::Pending,
        }
    }
}

/// An analysis job's progress.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JobProgress {
    pub id: i64,
    pub deck_id: i64,
    pub status: JobStatus,
}

async fn job_progress(pool: &SqlitePool, id: i64) -> Result<Option<JobProgress>, sqlx::Error> {
    let row = sqlx::query!(
        r#"SELECT id AS "id!", state, json_extract(args, '$.deck_id') AS "deck_id: i64"
           FROM oban_jobs WHERE id = ?1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| JobProgress {
        id: row.id,
        deck_id: row.deck_id.unwrap_or_default(),
        status: JobStatus::from_state(&row.state),
    }))
}

/// `enqueue/1`: queues an analysis, reusing the deck's incomplete job.
pub async fn enqueue(state: &AppState, deck_id: i64) -> Result<JobProgress, AiError> {
    Configured::load(state).await?;
    let id = state
        .jobs
        .enqueue(DECK_ANALYSIS_WORKER, json!({"deck_id": deck_id}))
        .await?;
    job_progress(&state.db, id)
        .await?
        .ok_or_else(|| AiError::Internal("queued analysis job vanished".to_owned()))
}

/// `latest_job/1`: the newest analysis job of the deck, in whichever
/// backend queued it.
pub async fn latest_job(
    pool: &SqlitePool,
    deck_id: i64,
) -> Result<Option<JobProgress>, sqlx::Error> {
    let id = sqlx::query_scalar!(
        r#"SELECT id AS "id!" FROM oban_jobs
           WHERE worker = ?1 AND json_extract(args, '$.deck_id') = ?2
           ORDER BY id DESC LIMIT 1"#,
        DECK_ANALYSIS_WORKER,
        deck_id
    )
    .fetch_optional(pool)
    .await?;
    match id {
        Some(id) => job_progress(pool, id).await,
        None => Ok(None),
    }
}

/// `refresh_all/0`: queues an analysis for every deck in one transaction,
/// with the same per-deck deduplication as a single refresh. Returns the
/// number of decks.
pub async fn refresh_all(state: &AppState) -> Result<usize, AiError> {
    Configured::load(state).await?;
    let mut tx = crate::db::begin_write(&state.db).await?;
    let ids = sqlx::query_scalar!(r#"SELECT id AS "id!" FROM decks ORDER BY name ASC, id ASC"#)
        .fetch_all(&mut *tx)
        .await?;
    for id in &ids {
        state
            .jobs
            .enqueue_in(&mut tx, DECK_ANALYSIS_WORKER, json!({"deck_id": id}))
            .await?;
    }
    tx.commit().await?;
    state.jobs.wake();
    Ok(ids.len())
}

/// `analyze_payload/2`: asks the provider and normalizes the result.
pub async fn analyze_payload(
    state: &AppState,
    settings: &Configured,
    payload: &Payload,
) -> Result<Analysis, AiError> {
    let raw = match settings.provider()? {
        Provider::OpenRouter => openrouter::analyze_deck(state, settings, &payload.value).await,
    }
    .map_err(AiError::User)?;
    deck_analysis::normalize_result(
        &raw,
        &payload.format,
        payload.game_changer_count,
        settings.deck_analysis_instructions.as_deref(),
    )
    .map_err(AiError::User)
}

/// Why an analysis run failed.
#[derive(Debug, thiserror::Error)]
pub enum RunError {
    #[error(transparent)]
    Ai(#[from] AiError),
    /// The rendered analysis failed the deck's changeset.
    #[error("Could not save the AI deck analysis.")]
    Invalid,
}

impl From<sqlx::Error> for RunError {
    fn from(error: sqlx::Error) -> Self {
        Self::Ai(AiError::Db(error))
    }
}

/// `run/1`: analyzes the deck now and saves the Markdown and brackets.
pub async fn run(state: &AppState, deck: &DeckInfo) -> Result<SavedAnalysis, RunError> {
    let settings = Configured::load(state).await?;
    let cards = decks::deck_cards(&state.db, deck.id).await?;
    let payload = deck_analysis::payload(
        &PayloadDeck {
            name: &deck.name,
            format: &deck.format,
            primer: deck.primer.as_deref(),
        },
        &cards,
    );
    let analysis = analyze_payload(state, &settings, &payload).await?;
    let saved = SavedAnalysis {
        ai_analysis: deck_analysis::render_markdown(&analysis),
        ai_analysis_model: settings.model.clone(),
        ai_analyzed_at: timefmt::now(),
        commander_bracket: analysis.official_bracket,
        commander_bracket_estimate: analysis.play_bracket,
        commander_bracket_rating: analysis.bracket_rating.clone(),
    };
    match decks::save_analysis(&state.db, deck.id, &saved).await {
        Ok(()) => Ok(saved),
        Err(SaveError::Invalid) => Err(RunError::Invalid),
        Err(SaveError::Db(error)) => Err(error.into()),
    }
}
