/// Why an allocation change was refused.
///
/// Each domain variant's [`code`](AllocationError::code) matches the error
/// atom the Elixir implementation returns, so GraphQL clients see the same
/// error codes from either backend.
#[derive(Debug, thiserror::Error)]
pub enum AllocationError {
    #[error("deck card not found")]
    DeckCardNotFound,
    #[error("collection item not found")]
    CollectionItemNotFound,
    #[error("allocation not found")]
    AllocationNotFound,
    #[error("the deck is archived")]
    DeckArchived,
    #[error("considering cards cannot hold collection copies")]
    ConsideringNotAllocatable,
    #[error("collection items in list locations cannot be allocated")]
    ListLocation,
    #[error("the collection item is a different card")]
    CardMismatch,
    #[error("not enough unallocated copies are available")]
    NotEnoughAvailable,
    #[error("the deck card already has every copy it needs")]
    AlreadyAllocated,
    #[error("the allocation does not match the collection item's quantity")]
    QuantityMismatch,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

impl AllocationError {
    /// Stable error code, matching the Elixir error atom.
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::DeckCardNotFound => "deck_card_not_found",
            Self::CollectionItemNotFound => "collection_item_not_found",
            Self::AllocationNotFound => "allocation_not_found",
            Self::DeckArchived => "deck_archived",
            Self::ConsideringNotAllocatable => "considering_not_allocatable",
            Self::ListLocation => "allocation_list_location",
            Self::CardMismatch => "allocation_card_mismatch",
            Self::NotEnoughAvailable => "not_enough_available",
            Self::AlreadyAllocated => "deck_card_already_allocated",
            Self::QuantityMismatch => "allocation_quantity_mismatch",
            Self::Database(_) => "database_error",
        }
    }
}
