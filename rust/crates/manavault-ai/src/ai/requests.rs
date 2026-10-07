//! Saved analyses of pasted or linked decklists (`AI.DeckAnalysisRequest`
//! and `AI.ListDeckAnalysisRequests`).

use sqlx::SqlitePool;

use super::deck_analysis::result::valid_rating;
use manavault_core::timefmt;
use manavault_core::validation::{BLANK, INVALID, ValidationError, too_long};

const DEFAULT_LIMIT: i64 = 50;
const MAXIMUM_LIMIT: i64 = 100;

/// `Deck.formats/0`.
pub const FORMATS: [&str; 9] = [
    "commander",
    "standard",
    "pioneer",
    "modern",
    "legacy",
    "vintage",
    "pauper",
    "limited",
    "casual",
];

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

/// A `deck_analysis_requests` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckAnalysisRequest {
    pub id: i64,
    pub source_type: String,
    pub source: String,
    pub source_name: String,
    pub format: String,
    pub analysis: String,
    pub model: String,
    pub commander_bracket: Option<i64>,
    pub commander_bracket_estimate: Option<i64>,
    pub commander_bracket_rating: Option<String>,
    pub inserted_at: String,
}

/// A request to save.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewRequest {
    pub source_type: SourceType,
    pub source: String,
    pub source_name: String,
    pub format: String,
    pub analysis: String,
    pub model: String,
    pub commander_bracket: Option<i64>,
    pub commander_bracket_estimate: Option<i64>,
    pub commander_bracket_rating: Option<String>,
}

fn validate(request: &NewRequest) -> Result<(), ValidationError> {
    let mut errors = ValidationError::new();
    for (field, value) in [
        ("source", &request.source),
        ("source_name", &request.source_name),
        ("format", &request.format),
        ("analysis", &request.analysis),
        ("model", &request.model),
    ] {
        if value.trim().is_empty() {
            errors.add(field, BLANK);
        }
    }
    if !FORMATS.contains(&request.format.as_str()) {
        errors.add("format", INVALID);
    }
    for (field, value, max) in [
        ("source", &request.source, 200_000),
        ("source_name", &request.source_name, 200),
        ("analysis", &request.analysis, 100_000),
        ("model", &request.model, 200),
    ] {
        if value.chars().count() > max {
            errors.add(field, too_long(max));
        }
    }
    if request
        .commander_bracket_rating
        .as_deref()
        .is_some_and(|rating| !valid_rating(rating))
    {
        errors.add("commander_bracket_rating", "has invalid format");
    }
    for (field, value) in [
        ("commander_bracket", request.commander_bracket),
        (
            "commander_bracket_estimate",
            request.commander_bracket_estimate,
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
pub enum InsertError {
    #[error(transparent)]
    Invalid(ValidationError),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Validates and inserts a request.
pub async fn insert(
    pool: &SqlitePool,
    request: &NewRequest,
) -> Result<DeckAnalysisRequest, InsertError> {
    validate(request).map_err(InsertError::Invalid)?;
    let now = timefmt::now();
    let source_type = request.source_type.as_str();
    Ok(sqlx::query_as!(
        DeckAnalysisRequest,
        r#"INSERT INTO deck_analysis_requests
             (source_type, source, source_name, format, analysis, model, commander_bracket,
              commander_bracket_estimate, commander_bracket_rating, inserted_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
           RETURNING id AS "id!", source_type, source, source_name, format, analysis, model,
             commander_bracket, commander_bracket_estimate, commander_bracket_rating, inserted_at"#,
        source_type,
        request.source,
        request.source_name,
        request.format,
        request.analysis,
        request.model,
        request.commander_bracket,
        request.commander_bracket_estimate,
        request.commander_bracket_rating,
        now
    )
    .fetch_one(pool)
    .await?)
}

/// Newest first, at most `limit` (default 50, clamped to 1..=100).
pub async fn list(
    pool: &SqlitePool,
    limit: Option<i64>,
) -> Result<Vec<DeckAnalysisRequest>, sqlx::Error> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAXIMUM_LIMIT);
    sqlx::query_as!(
        DeckAnalysisRequest,
        r#"SELECT id AS "id!", source_type, source, source_name, format, analysis, model,
             commander_bracket, commander_bracket_estimate, commander_bracket_rating, inserted_at
           FROM deck_analysis_requests ORDER BY inserted_at DESC, id DESC LIMIT ?1"#,
        limit
    )
    .fetch_all(pool)
    .await
}
