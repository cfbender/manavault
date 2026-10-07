//! Saved deck questions (`Catalog.DeckQuestionAnswer` and
//! `Catalog.Decks.QuestionAnswers`): Ask AI conversations and Swap cards
//! chat turns.

use serde_json::Value;
use sqlx::SqlitePool;

use super::deck_question::SwapContext;
use crate::settings::changeset::{BLANK, Errors, too_long};
use crate::timefmt;

/// `deck_question_answers.status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(rename_all = "lowercase")]
pub enum Status {
    Pending,
    Completed,
    Failed,
}

impl Status {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }
}

/// A `deck_question_answers` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuestionAnswer {
    pub id: i64,
    pub deck_id: i64,
    pub question: String,
    pub answer: String,
    /// `%{"cuts" => [...], "additions" => [...]}` as JSON text.
    pub recommendations: Option<String>,
    pub status: Status,
    pub error: Option<String>,
    pub model: Option<String>,
    /// `None` is the original Ask AI conversation.
    pub conversation_id: Option<String>,
    /// Swap cards chat turns share a client-generated thread id.
    pub thread_id: Option<String>,
    /// The names staged when a Swap cards question was asked, as JSON text.
    pub swap_context: Option<String>,
    pub inserted_at: String,
}

impl QuestionAnswer {
    /// The decoded staged swap.
    #[must_use]
    pub fn swap_context(&self) -> Option<SwapContext> {
        let value: Value = serde_json::from_str(self.swap_context.as_deref()?).ok()?;
        value.is_object().then(|| SwapContext::from_json(&value))
    }

    /// Recommended names under `"cuts"` or `"additions"`; empty when the
    /// answer has no recommendation metadata.
    #[must_use]
    pub fn recommendation_names(&self, key: &str) -> Vec<String> {
        self.recommendations
            .as_deref()
            .and_then(|text| serde_json::from_str::<Value>(text).ok())
            .and_then(|value| value.get(key).and_then(Value::as_array).cloned())
            .map(|names| {
                names
                    .into_iter()
                    .filter_map(|name| name.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default()
    }
}

macro_rules! select_answers {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            QuestionAnswer,
            r#"SELECT id AS "id!", deck_id, question, answer, recommendations,
                 status AS "status: Status", error, model, conversation_id, thread_id,
                 swap_context, inserted_at
               FROM deck_question_answers "# + $tail
            $(, $arg)*
        )
    };
}

/// New row attributes (`change_deck_question_answer/2`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewQuestionAnswer {
    pub question: String,
    pub answer: String,
    pub status: Status,
    pub error: Option<String>,
    pub model: Option<String>,
    pub conversation_id: Option<String>,
    pub thread_id: Option<String>,
    pub swap_context: Option<SwapContext>,
    pub recommendations: Option<Value>,
}

impl NewQuestionAnswer {
    /// A completed answer (the schema defaults).
    #[must_use]
    pub fn completed(question: &str, answer: &str) -> Self {
        Self {
            question: question.to_owned(),
            answer: answer.to_owned(),
            status: Status::Completed,
            error: None,
            model: None,
            conversation_id: None,
            thread_id: None,
            swap_context: None,
            recommendations: None,
        }
    }
}

fn check_length(errors: &mut Errors, field: &'static str, value: Option<&str>, max: usize) {
    if value.is_some_and(|value| value.chars().count() > max) {
        errors.add(field, too_long(max));
    }
}

fn blank(value: Option<&str>) -> bool {
    value.is_none_or(|value| value.trim().is_empty())
}

/// Deck question answer validations, checked field by field in a fixed order.
fn validate(
    question: &str,
    answer: &str,
    status: Status,
    error: Option<&str>,
    model: Option<&str>,
    conversation_id: Option<&str>,
    thread_id: Option<&str>,
) -> Result<(), Errors> {
    let mut errors = Errors::new();
    if question.trim().is_empty() {
        errors.add("question", BLANK);
    }
    check_length(&mut errors, "question", Some(question), 1_000);
    check_length(&mut errors, "answer", Some(answer), 100_000);
    check_length(&mut errors, "error", error, 2_000);
    check_length(&mut errors, "model", model, 200);
    check_length(&mut errors, "conversation_id", conversation_id, 64);
    check_length(&mut errors, "thread_id", thread_id, 64);
    match status {
        Status::Completed if blank(Some(answer)) => errors.add("answer", BLANK),
        Status::Failed if blank(error) => errors.add("error", BLANK),
        _ => {}
    }
    errors.into_result()
}

/// Why a write failed.
#[derive(Debug, thiserror::Error)]
pub enum WriteError {
    #[error("{}", .0.message())]
    Invalid(Errors),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Inserts a row on `conn` (`create_deck_question_answer/2`).
pub async fn insert(
    conn: &mut sqlx::SqliteConnection,
    deck_id: i64,
    attrs: &NewQuestionAnswer,
) -> Result<QuestionAnswer, WriteError> {
    validate(
        &attrs.question,
        &attrs.answer,
        attrs.status,
        attrs.error.as_deref(),
        attrs.model.as_deref(),
        attrs.conversation_id.as_deref(),
        attrs.thread_id.as_deref(),
    )
    .map_err(WriteError::Invalid)?;
    let now = timefmt::now();
    let swap_context = attrs
        .swap_context
        .as_ref()
        .map(|context| context.to_json().to_string());
    let recommendations = attrs.recommendations.as_ref().map(Value::to_string);
    let id = sqlx::query_scalar!(
        r#"INSERT INTO deck_question_answers
             (deck_id, question, answer, inserted_at, recommendations, status, error, model,
              thread_id, swap_context, conversation_id)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) RETURNING id AS "id!""#,
        deck_id,
        attrs.question,
        attrs.answer,
        now,
        recommendations,
        attrs.status,
        attrs.error,
        attrs.model,
        attrs.thread_id,
        swap_context,
        attrs.conversation_id
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(select_answers!("WHERE id = ?1", id)
        .fetch_one(&mut *conn)
        .await?)
}

/// `get_deck_question_answer/1`.
pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<QuestionAnswer>, sqlx::Error> {
    select_answers!("WHERE id = ?1", id)
        .fetch_optional(pool)
        .await
}

/// Saved Ask AI conversations, newest first; Swap cards chat turns are
/// excluded (`list_deck_question_answers/1`).
pub async fn list_for_deck(
    pool: &SqlitePool,
    deck_id: i64,
) -> Result<Vec<QuestionAnswer>, sqlx::Error> {
    select_answers!(
        "WHERE deck_id = ?1 AND thread_id IS NULL ORDER BY inserted_at DESC, id DESC",
        deck_id
    )
    .fetch_all(pool)
    .await
}

/// Turns of one Swap cards chat thread, oldest first
/// (`list_deck_question_thread/2`).
pub async fn list_thread(
    pool: &SqlitePool,
    deck_id: i64,
    thread_id: &str,
) -> Result<Vec<QuestionAnswer>, sqlx::Error> {
    select_answers!(
        "WHERE deck_id = ?1 AND thread_id = ?2 ORDER BY inserted_at ASC, id ASC",
        deck_id,
        thread_id
    )
    .fetch_all(pool)
    .await
}

/// Recent completed turns from the same chat (thread and conversation),
/// before this question, oldest first (`deck_question_history/2`).
pub async fn history(
    pool: &SqlitePool,
    turn: &QuestionAnswer,
    count: i64,
) -> Result<Vec<(String, String)>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT question, answer FROM deck_question_answers
           WHERE deck_id = ?1 AND id < ?2 AND status = 'completed'
             AND thread_id IS ?3 AND conversation_id IS ?4
           ORDER BY inserted_at DESC, id DESC
           LIMIT ?5"#,
        turn.deck_id,
        turn.id,
        turn.thread_id,
        turn.conversation_id,
        count
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .rev()
        .map(|row| (row.question, row.answer))
        .collect())
}

/// `complete_deck_question_answer/2`.
pub async fn complete(
    pool: &SqlitePool,
    turn: &QuestionAnswer,
    answer: &str,
    model: &str,
    recommendations: &Value,
) -> Result<(), WriteError> {
    validate(
        &turn.question,
        answer,
        Status::Completed,
        None,
        Some(model),
        turn.conversation_id.as_deref(),
        turn.thread_id.as_deref(),
    )
    .map_err(WriteError::Invalid)?;
    let recommendations = recommendations.to_string();
    sqlx::query!(
        "UPDATE deck_question_answers SET status = 'completed', error = NULL, answer = ?1,
           model = ?2, recommendations = ?3 WHERE id = ?4",
        answer,
        model,
        recommendations,
        turn.id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// `fail_deck_question_answer/2`.
pub async fn fail(pool: &SqlitePool, turn: &QuestionAnswer, error: &str) -> Result<(), WriteError> {
    validate(
        &turn.question,
        &turn.answer,
        Status::Failed,
        Some(error),
        turn.model.as_deref(),
        turn.conversation_id.as_deref(),
        turn.thread_id.as_deref(),
    )
    .map_err(WriteError::Invalid)?;
    sqlx::query!(
        "UPDATE deck_question_answers SET status = 'failed', error = ?1 WHERE id = ?2",
        error,
        turn.id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// `delete_deck_question_answer/1`.
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM deck_question_answers WHERE id = ?1", id)
        .execute(pool)
        .await?;
    Ok(())
}
