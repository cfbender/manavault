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
    /// The deck does not exist. The Elixir code raised `Ecto.NoResultsError`.
    #[error("deck not found")]
    DeckNotFound,
    /// The deck's card list is owned by a linked Moxfield/Archidekt deck.
    #[error("the deck is linked to an external deck")]
    DeckLinked,
    /// A requested quantity was zero or negative.
    #[error("invalid allocation quantity")]
    InvalidQuantity,
    /// Fewer proxies are recorded than were asked to be released.
    #[error("proxy allocation not found")]
    ProxyAllocationNotFound,
    /// Selected copies of one card disagree on finish, or differ from the
    /// finish of the deck card they would join.
    #[error("the collection item finish does not match the deck card")]
    FinishMismatch,
    /// A pull list entry has a non-positive id or quantity.
    #[error("invalid pull list entry")]
    InvalidPullListEntry,
    /// The bulk allocation mode is neither `exact_printings` nor
    /// `matching_printings`.
    #[error("invalid allocation mode")]
    InvalidAllocationMode,
    /// A deck card would reach 10 000 copies (the Ecto changeset's limit).
    #[error("quantity must be less than 10000")]
    QuantityTooLarge,
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
            Self::DeckNotFound => "deck_not_found",
            Self::DeckLinked => "deck_linked",
            Self::InvalidQuantity => "invalid_allocation_quantity",
            Self::ProxyAllocationNotFound => "proxy_allocation_not_found",
            Self::FinishMismatch => "allocation_finish_mismatch",
            Self::InvalidPullListEntry => "invalid_pull_list_entry",
            Self::InvalidAllocationMode => "invalid_allocation_mode",
            Self::QuantityTooLarge => "quantity_too_large",
            Self::Database(_) => "database_error",
        }
    }
}

/// A positive quantity from untrusted input (`invalid_allocation_quantity`
/// otherwise).
pub fn parse_quantity(value: i64) -> Result<crate::Quantity, AllocationError> {
    crate::Quantity::try_from(value).map_err(|_| AllocationError::InvalidQuantity)
}
