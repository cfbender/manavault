//! Identifiers, enumerations, and quantities stored in ManaVault's tables.
//!
//! Every text column with a fixed set of values decodes into an enum, so an
//! unexpected value fails at the database boundary instead of flowing through
//! the allocation rules as a string.

use std::num::NonZeroU32;

use sqlx::error::BoxDynError;
use sqlx::sqlite::{SqliteTypeInfo, SqliteValueRef};
use sqlx::{Decode, Sqlite, Type};

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

/// Where a card sits in a deck. Considering cards are ideas, not deck contents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum Zone {
    Mainboard,
    Commander,
    Considering,
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

/// A count of physical cards that is always at least one.
///
/// Decoding a stored zero or negative quantity is an error, and arithmetic
/// that would reach zero returns `None` instead of producing an empty value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Quantity(NonZeroU32);

impl Quantity {
    pub const ONE: Self = Self(NonZeroU32::MIN);

    #[must_use]
    pub fn new(value: u32) -> Option<Self> {
        NonZeroU32::new(value).map(Self)
    }

    #[must_use]
    pub fn get(self) -> u32 {
        self.0.get()
    }

    #[must_use]
    pub fn as_i64(self) -> i64 {
        i64::from(self.get())
    }

    /// `self - other`, or `None` when nothing would remain.
    #[must_use]
    pub fn checked_sub(self, other: Self) -> Option<Self> {
        self.get().checked_sub(other.get()).and_then(Self::new)
    }

    #[must_use]
    pub fn saturating_add(self, other: Self) -> Self {
        Self(self.0.saturating_add(other.get()))
    }
}

/// Raised when a stored or requested quantity is not a positive count.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("quantity must be a positive count, got {0}")]
pub struct InvalidQuantity(pub i64);

impl TryFrom<i64> for Quantity {
    type Error = InvalidQuantity;

    fn try_from(value: i64) -> Result<Self, Self::Error> {
        u32::try_from(value)
            .ok()
            .and_then(Self::new)
            .ok_or(InvalidQuantity(value))
    }
}

impl Type<Sqlite> for Quantity {
    fn type_info() -> SqliteTypeInfo {
        <i64 as Type<Sqlite>>::type_info()
    }

    fn compatible(ty: &SqliteTypeInfo) -> bool {
        <i64 as Type<Sqlite>>::compatible(ty)
    }
}

impl<'r> Decode<'r, Sqlite> for Quantity {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, BoxDynError> {
        let raw = <i64 as Decode<Sqlite>>::decode(value)?;
        Ok(Self::try_from(raw)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantity_rejects_non_positive_values() {
        assert_eq!(Quantity::try_from(0), Err(InvalidQuantity(0)));
        assert_eq!(Quantity::try_from(-3), Err(InvalidQuantity(-3)));
        assert_eq!(Quantity::try_from(i64::MAX), Err(InvalidQuantity(i64::MAX)));
        assert_eq!(Quantity::try_from(2).map(Quantity::get), Ok(2));
    }

    #[test]
    fn checked_sub_returns_none_when_nothing_remains() {
        let three = Quantity::new(3).expect("positive");
        assert_eq!(three.checked_sub(Quantity::ONE), Quantity::new(2));
        assert_eq!(three.checked_sub(three), None);
    }
}
