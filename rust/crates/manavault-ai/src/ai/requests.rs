//! Saved analyses of pasted or linked decklists (`AI.DeckAnalysisRequest`
//! and `AI.ListDeckAnalysisRequests`), pending until their background job
//! completes or fails them.

use sqlx::SqlitePool;

use super::deck_analysis::result::valid_rating;
pub use super::question_answers::Status;
use manavault_collection::decks::model::DeckFormat;
use manavault_core::timestamp::Timestamp;
use manavault_core::validation::{BLANK, INVALID, ValidationError, too_long};

const DEFAULT_LIMIT: i64 = 50;
const MAXIMUM_LIMIT: i64 = 100;

/// Where the decklist came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceType {
    Url,
    Text,
}

impl SourceType {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Url => "url",
            Self::Text => "text",
        }
    }
}

/// A `deck_analysis_requests` row. A pending row has no analysis yet; a
/// failed one has an error instead.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckAnalysisRequest {
    pub id: i64,
    pub source_type: String,
    pub source: String,
    pub source_name: String,
    pub format: String,
    pub status: Status,
    pub error: Option<String>,
    pub analysis: String,
    pub model: String,
    pub commander_bracket: Option<i64>,
    pub commander_bracket_estimate: Option<i64>,
    pub commander_bracket_rating: Option<String>,
    pub inserted_at: Timestamp,
}

/// A request to queue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewRequest {
    pub source_type: SourceType,
    pub source: String,
    pub source_name: String,
    pub format: String,
    pub model: String,
}

/// A finished analysis to save on a pending request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletedAnalysis {
    pub analysis: String,
    pub model: String,
    pub commander_bracket: Option<i64>,
    pub commander_bracket_estimate: Option<i64>,
    pub commander_bracket_rating: Option<String>,
}

/// Each field must be present and at most its maximum length.
fn check_text(errors: &mut ValidationError, fields: &[(&'static str, &str, usize)]) {
    for &(field, value, max) in fields {
        if value.trim().is_empty() {
            errors.add(field, BLANK);
        }
        if value.chars().count() > max {
            errors.add(field, too_long(max));
        }
    }
}

fn validate_new(request: &NewRequest) -> Result<(), ValidationError> {
    let mut errors = ValidationError::new();
    check_text(
        &mut errors,
        &[
            ("source", &request.source, 200_000),
            ("source_name", &request.source_name, 200),
            ("model", &request.model, 200),
        ],
    );
    if DeckFormat::parse(&request.format).is_none() {
        errors.add("format", INVALID);
    }
    errors.into_result()
}

fn validate_completed(analysis: &CompletedAnalysis) -> Result<(), ValidationError> {
    let mut errors = ValidationError::new();
    check_text(
        &mut errors,
        &[
            ("analysis", &analysis.analysis, 100_000),
            ("model", &analysis.model, 200),
        ],
    );
    if analysis
        .commander_bracket_rating
        .as_deref()
        .is_some_and(|rating| !valid_rating(rating))
    {
        errors.add("commander_bracket_rating", "has invalid format");
    }
    for (field, value) in [
        ("commander_bracket", analysis.commander_bracket),
        (
            "commander_bracket_estimate",
            analysis.commander_bracket_estimate,
        ),
    ] {
        match value {
            Some(value) if value < 1 => errors.add(field, "must be greater than or equal to 1"),
            Some(value) if value > 5 => errors.add(field, "must be less than or equal to 5"),
            _ => {}
        }
    }
    errors.into_result()
}

/// Why saving failed.
#[derive(Debug, thiserror::Error)]
pub enum WriteError {
    #[error(transparent)]
    Invalid(ValidationError),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

macro_rules! select_requests {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            DeckAnalysisRequest,
            r#"SELECT id AS "id!", source_type, source, source_name, format,
                 status AS "status: Status", error, analysis, model, commander_bracket,
                 commander_bracket_estimate, commander_bracket_rating,
                 inserted_at AS "inserted_at!: Timestamp"
               FROM deck_analysis_requests "# + $tail
            $(, $arg)*
        )
    };
}

/// Validates and inserts a pending request.
pub async fn insert_pending(
    conn: &mut sqlx::SqliteConnection,
    request: &NewRequest,
) -> Result<DeckAnalysisRequest, WriteError> {
    validate_new(request).map_err(WriteError::Invalid)?;
    let now = Timestamp::now();
    let source_type = request.source_type.as_str();
    let id = sqlx::query_scalar!(
        r#"INSERT INTO deck_analysis_requests
             (source_type, source, source_name, format, status, analysis, model, inserted_at)
           VALUES (?1, ?2, ?3, ?4, 'pending', '', ?5, ?6)
           RETURNING id AS "id!""#,
        source_type,
        request.source,
        request.source_name,
        request.format,
        request.model,
        now
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(select_requests!("WHERE id = ?1", id)
        .fetch_one(&mut *conn)
        .await?)
}

/// One request by id.
pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<DeckAnalysisRequest>, sqlx::Error> {
    select_requests!("WHERE id = ?1", id)
        .fetch_optional(pool)
        .await
}

/// Saves the analysis on a pending request.
pub async fn complete(
    pool: &SqlitePool,
    id: i64,
    analysis: &CompletedAnalysis,
) -> Result<(), WriteError> {
    validate_completed(analysis).map_err(WriteError::Invalid)?;
    sqlx::query!(
        "UPDATE deck_analysis_requests
           SET status = 'completed', error = NULL, analysis = ?1, model = ?2,
               commander_bracket = ?3, commander_bracket_estimate = ?4,
               commander_bracket_rating = ?5
         WHERE id = ?6 AND status = 'pending'",
        analysis.analysis,
        analysis.model,
        analysis.commander_bracket,
        analysis.commander_bracket_estimate,
        analysis.commander_bracket_rating,
        id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Marks a pending request failed with `error`.
pub async fn fail(pool: &SqlitePool, id: i64, error: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE deck_analysis_requests SET status = 'failed', error = ?1
         WHERE id = ?2 AND status = 'pending'",
        error,
        id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Newest first, at most `limit` (default 50, clamped to 1..=100).
pub async fn list(
    pool: &SqlitePool,
    limit: Option<i64>,
) -> Result<Vec<DeckAnalysisRequest>, sqlx::Error> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAXIMUM_LIMIT);
    select_requests!("ORDER BY inserted_at DESC, id DESC LIMIT ?1", limit)
        .fetch_all(pool)
        .await
}
