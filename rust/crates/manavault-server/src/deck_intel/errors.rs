//! Resolver error messages (`ManavaultWeb.Schema.Catalog.Errors`).

use manavault_allocation::AllocationError;

use crate::graphql::{internal_error, user_error};

/// `Errors.deck_allocation_error/1`. A missing deck card or deck, which the
/// Elixir resolvers raised on, reads as "… was not found.".
#[must_use]
pub fn deck_allocation_message(error: &AllocationError) -> Option<&'static str> {
    Some(match error {
        AllocationError::DeckArchived => "Unarchive this deck before changing allocations.",
        AllocationError::DeckLinked => {
            "This deck is linked to an external deck; edit it there and sync."
        }
        AllocationError::ListLocation => "List items cannot be allocated to decks.",
        AllocationError::ConsideringNotAllocatable => "Considering cards cannot be allocated.",
        AllocationError::CardMismatch => "Collection item does not match that deck card.",
        AllocationError::FinishMismatch => "Collection item finish does not match that deck card.",
        AllocationError::NotEnoughAvailable => {
            "No available copies remain for that collection item."
        }
        AllocationError::AlreadyAllocated => "That deck card already has enough allocated copies.",
        AllocationError::ProxyAllocationNotFound => "Proxy allocation not found.",
        AllocationError::InvalidQuantity => "Allocation quantity is invalid.",
        AllocationError::AllocationNotFound => "Allocation not found.",
        AllocationError::DeckCardNotFound => "Deck card was not found.",
        AllocationError::DeckNotFound => "Deck was not found.",
        // The deck card changeset's message for the quantity limit.
        AllocationError::QuantityTooLarge => "quantity must be less than 10000",
        AllocationError::CollectionItemNotFound
        | AllocationError::QuantityMismatch
        | AllocationError::InvalidPullListEntry
        | AllocationError::InvalidAllocationMode => "Could not add collection item to deck.",
        AllocationError::Database(_) => return None,
    })
}

/// The GraphQL error for an allocation failure; database failures log and
/// read "Something went wrong.".
pub fn deck_allocation_error(error: AllocationError) -> async_graphql::Error {
    match deck_allocation_message(&error) {
        Some(message) => user_error(message),
        None => internal_error(error),
    }
}

/// Disassembly errors: the Elixir resolver printed the error atom
/// (`deck_disassembly_result/1`).
pub fn disassembly_error(error: AllocationError) -> async_graphql::Error {
    match error {
        AllocationError::Database(error) => internal_error(error),
        AllocationError::DeckNotFound => user_error("Deck was not found."),
        other => user_error(other.code()),
    }
}

/// Reads that only fail on a missing deck or the database.
pub fn deck_read_error(error: AllocationError) -> async_graphql::Error {
    match error {
        AllocationError::DeckNotFound => user_error("Deck was not found."),
        other => internal_error(other),
    }
}
