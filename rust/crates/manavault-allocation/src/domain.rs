//! Identifiers, enumerations, and quantities stored in ManaVault's tables.
//!
//! Every text column with a fixed set of values decodes into an enum, so an
//! unexpected value fails at the database boundary instead of flowing through
//! the allocation rules as a string.

pub use lotus::quantity::InvalidQuantity;
pub use lotus::{Quantity, Zone};

macro_rules! row_id {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, sqlx::Type)]
        #[sqlx(transparent)]
        pub struct $name(pub i64);
    };
}

row_id!(
    /// Primary key of `decks`.
    DeckId
);
row_id!(
    /// Primary key of `deck_cards`.
    DeckCardId
);
row_id!(
    /// Primary key of `collection_items`.
    CollectionItemId
);
row_id!(
    /// Primary key of `locations`.
    LocationId
);
row_id!(
    /// Primary key of `deck_allocations`.
    AllocationId
);

/// Deck lifecycle. Archived decks are frozen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum DeckStatus {
    Brewing,
    Active,
    Archived,
}

/// A user-applied marker on a deck card.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum DeckCardTag {
    Getting,
    ConsiderCutting,
}

/// Kind of storage location. List locations hold wanted cards, not owned ones.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum LocationKind {
    Box,
    Binder,
    DeckBox,
    List,
    Folder,
    Other,
}

/// How bulk allocation picks collection copies for a deck card.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AllocationMode {
    /// Only copies of the deck card's preferred printing.
    ExactPrintings,
    /// Copies of any printing of the card, preferred printing first.
    MatchingPrintings,
}

impl AllocationMode {
    /// Parses the GraphQL `mode` argument.
    pub fn parse(value: &str) -> Result<Self, crate::AllocationError> {
        match value {
            "exact_printings" => Ok(Self::ExactPrintings),
            "matching_printings" => Ok(Self::MatchingPrintings),
            _ => Err(crate::AllocationError::InvalidAllocationMode),
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ExactPrintings => "exact_printings",
            Self::MatchingPrintings => "matching_printings",
        }
    }
}
