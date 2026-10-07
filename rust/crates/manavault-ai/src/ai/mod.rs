//! AI deck analysis and saved deck questions (`Manavault.AI`).
//!
//! Provider settings live in [`crate::settings::ai`]. Analyses of saved
//! decks and deck questions run in Oban-compatible background jobs on the
//! `ai` queue ([`workers`]); pasted or linked decklists are analyzed inline
//! and saved as [`requests`]. The only provider is `OpenRouter`.

pub mod analyze_deck;
pub mod analyze_deck_list;
pub mod answer_deck_question;
pub mod deck_analysis;
pub mod deck_question;
pub mod decks;
pub mod openrouter;
mod prompt_text;
pub mod question_answers;
pub mod requests;
pub mod schema;
pub mod tools;
pub mod workers;

#[cfg(test)]
pub(crate) mod tests;

use crate::settings::ai::AiSettings;

pub use deck_analysis::bracket_label;
pub use schema::{AiMutations, AiQueries};

const NOT_CONFIGURED: &str = "Configure an AI provider, API key, and model in Settings first.";
const UNSUPPORTED_PROVIDER: &str = "The selected AI provider is not supported.";

/// A failure with a user-facing message or an internal cause.
#[derive(Debug, thiserror::Error)]
pub enum AiError {
    /// Shown to the user as is.
    #[error("{0}")]
    User(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    #[error("{0}")]
    Internal(String),
}

impl From<crate::jobs::JobError> for AiError {
    fn from(error: crate::jobs::JobError) -> Self {
        match error {
            crate::jobs::JobError::Db(error) => Self::Db(error),
            other @ crate::jobs::JobError::UnknownWorker(_) => Self::Internal(other.to_string()),
        }
    }
}

impl AiError {
    /// The GraphQL error: the message, or "Something went wrong." for
    /// internal failures.
    #[must_use]
    pub fn into_graphql(self) -> async_graphql::Error {
        match self {
            Self::User(message) => crate::graphql::user_error(message),
            other => crate::graphql::internal_error(other),
        }
    }
}

/// The AI providers (`Provider.module/1`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    OpenRouter,
}

/// Settings with a key and model (`UpdateSettings.configured/1` passed).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Configured {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub deck_analysis_instructions: Option<String>,
}

impl Configured {
    /// `UpdateSettings.configured/1`.
    pub fn from_settings(settings: AiSettings) -> Result<Self, AiError> {
        let has_key = settings.has_api_key();
        match (settings.api_key, settings.model) {
            (Some(api_key), Some(model)) if has_key && !model.is_empty() => Ok(Self {
                provider: settings.provider,
                api_key,
                model,
                deck_analysis_instructions: settings.deck_analysis_instructions,
            }),
            _ => Err(AiError::User(NOT_CONFIGURED.to_owned())),
        }
    }

    /// Loads and checks the saved settings.
    pub async fn load(state: &crate::state::AppState) -> Result<Self, AiError> {
        Self::from_settings(crate::settings::ai::settings(state).await?)
    }

    /// `Provider.module/1`.
    pub fn provider(&self) -> Result<Provider, AiError> {
        match self.provider.as_str() {
            "openrouter" => Ok(Provider::OpenRouter),
            _ => Err(AiError::User(UNSUPPORTED_PROVIDER.to_owned())),
        }
    }
}
