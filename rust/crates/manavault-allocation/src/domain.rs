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
