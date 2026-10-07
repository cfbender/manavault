//! Decks: decklists, tags, legality, sharing, the deck picker, swaps,
//! decklist import/export, and Moxfield/Archidekt links
//! (`Manavault.Catalog.Decks` and its modules, and the deck parts of
//! `ManavaultWeb.Schema.Catalog`).
//!
//! Allocation workflows (allocate, buylists, disassembly, bulk allocation)
//! live in `manavault_allocation`; deck edits here keep allocations
//! consistent with its functions that run in the caller's transaction
//! (clearing, trimming, and switching to a new preferred printing).

pub mod cards;
pub mod commander;
pub mod contents;
pub mod decklist;
pub mod external;
pub mod legality;
pub mod model;
pub mod picker;
pub mod records;
pub mod schema;
pub mod share_token;
pub mod swap;
pub mod tags;
pub mod validation;

#[cfg(test)]
pub(crate) mod tests;

pub use contents::{DeckContents, DeckSummary, LoadedDeckCard, deck_summaries};
pub use model::{DeckCardId, DeckCardRow, DeckId, DeckRow};
pub use schema::types::{Deck, DeckCard, DeckCardAllocationStatus};
pub use schema::{DeckMutations, DeckQueries};

use crate::decks::model::DeckStatus;
use crate::decks::validation::ValidationError;

/// Why a deck operation was refused. The codes are the stable error codes
/// of earlier releases; resolvers turn them into user-facing messages.
#[derive(Debug, thiserror::Error)]
pub enum DeckError {
    /// The deck does not exist.
    #[error("deck not found")]
    DeckNotFound,
    /// `:not_found` (a deck card, usually).
    #[error("not_found")]
    NotFound,
    /// `:deck_archived`.
    #[error("deck_archived")]
    DeckArchived,
    /// `:deck_linked`: the remote deck owns the decklist.
    #[error("deck_linked")]
    DeckLinked,
    /// `:card_not_found`.
    #[error("card_not_found")]
    CardNotFound,
    /// Another error atom, rendered with `Atom.to_string/1` when the
    /// resolver has no message for it.
    #[error("{0}")]
    Code(&'static str),
    /// A ready-made error message.
    #[error("{0}")]
    Message(String),
    /// Changeset errors.
    #[error(transparent)]
    Invalid(ValidationError),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl DeckError {
    /// The stable error code, when there is one.
    #[must_use]
    pub fn code(&self) -> Option<&'static str> {
        match self {
            Self::NotFound => Some("not_found"),
            Self::DeckArchived => Some("deck_archived"),
            Self::DeckLinked => Some("deck_linked"),
            Self::CardNotFound => Some("card_not_found"),
            Self::Code(code) => Some(code),
            Self::DeckNotFound | Self::Message(_) | Self::Invalid(_) | Self::Db(_) => None,
        }
    }
}

impl From<manavault_allocation::AllocationError> for DeckError {
    /// Allocation failures inside a deck edit keep their error code.
    fn from(error: manavault_allocation::AllocationError) -> Self {
        use manavault_allocation::AllocationError;
        match error {
            AllocationError::Database(error) => Self::Db(error),
            AllocationError::DeckNotFound => Self::DeckNotFound,
            AllocationError::DeckCardNotFound => Self::NotFound,
            AllocationError::DeckArchived => Self::DeckArchived,
            AllocationError::DeckLinked => Self::DeckLinked,
            other => Self::Code(other.code()),
        }
    }
}

impl From<ValidationError> for DeckError {
    fn from(errors: ValidationError) -> Self {
        Self::Invalid(errors)
    }
}

/// `EditGuard.ensure_deck_editable/1`: archived decks are frozen.
pub fn ensure_deck_editable(deck: &DeckRow) -> Result<(), DeckError> {
    match deck.status {
        DeckStatus::Archived => Err(DeckError::DeckArchived),
        DeckStatus::Brewing | DeckStatus::Active => Ok(()),
    }
}

/// `EditGuard.ensure_decklist_editable/1`: additionally refuses decks linked
/// to an external source, whose card list only changes through sync.
pub fn ensure_decklist_editable(deck: &DeckRow) -> Result<(), DeckError> {
    ensure_deck_editable(deck)?;
    if deck.is_linked() {
        Err(DeckError::DeckLinked)
    } else {
        Ok(())
    }
}
