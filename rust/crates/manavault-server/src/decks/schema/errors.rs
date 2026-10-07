//! Deck error messages (`ManavaultWeb.Schema.Catalog.Errors`).

use async_graphql::Error;

use crate::decks::DeckError;
use crate::graphql::{internal_error, user_error};

/// `get_deck!/1` failing: the Elixir resolvers raised `Ecto.NoResultsError`.
pub const DECK_NOT_FOUND: &str = "Deck was not found.";
/// `Errors.not_found_error(:deck_card)`.
pub const DECK_CARD_NOT_FOUND: &str = "Deck card was not found.";
/// `Errors.not_found_error(:deck_tag)`.
pub const DECK_TAG_NOT_FOUND: &str = "Deck tag was not found.";
const DECK_LINKED: &str = "This deck is linked to an external deck; edit it there and sync.";

fn common(error: DeckError, fallback: impl FnOnce(DeckError) -> Error) -> Error {
    match error {
        DeckError::Db(error) => internal_error(error),
        DeckError::DeckNotFound => user_error(DECK_NOT_FOUND),
        DeckError::Invalid(errors) => user_error(errors.message()),
        DeckError::Message(message) => user_error(message),
        other => fallback(other),
    }
}

/// `Errors.deck_edit_error/1`.
pub fn deck_edit_error(error: DeckError) -> Error {
    common(error, |error| match error {
        DeckError::NotFound => user_error(DECK_CARD_NOT_FOUND),
        DeckError::DeckArchived => user_error("Unarchive this deck before editing its decklist."),
        DeckError::DeckLinked => user_error(DECK_LINKED),
        other => user_error(other.code().unwrap_or("Could not edit decklist.")),
    })
}

/// `DeckMutations.add_deck_card/3`.
pub fn add_card_error(error: DeckError) -> Error {
    match error {
        DeckError::CardNotFound => user_error("Card was not found."),
        other => deck_edit_error(other),
    }
}

/// `Errors.commander_error/1`.
pub fn commander_error(error: DeckError) -> Error {
    let message = match &error {
        DeckError::Code("not_commander_eligible") => "card can't be your commander",
        DeckError::Code("already_commander") => "card is already in the command zone",
        DeckError::Code("no_commander") => "deck has no commander to pair with",
        DeckError::Code("command_zone_full") => "deck already has two commanders",
        DeckError::Code("invalid_commander_pair") => {
            "card can't be paired with the current commander; two commanders require a pairing ability such as Partner, Partner with, Friends forever, Doctor's companion, or Choose a Background"
        }
        _ => return deck_edit_error(error),
    };
    user_error(message)
}

/// `Errors.deck_swap_error/1`.
pub fn deck_swap_error(error: DeckError) -> Error {
    let message = match &error {
        DeckError::Code("empty_swap") => "Stage at least one cut or add before swapping.",
        DeckError::Code("invalid_swap") => "Each staged card needs a positive quantity.",
        DeckError::Code("duplicate_swap_entry") => "Each card can only be staged once per swap.",
        DeckError::Code("swap_cut_not_in_deck") => "Only cards in the deck can be cut.",
        DeckError::Code("swap_add_not_considering") => {
            "Only Considering cards can be moved into the deck."
        }
        DeckError::Code("swap_quantity_exceeds_deck_card") => {
            "A staged quantity is larger than the copies in the deck."
        }
        DeckError::CardNotFound => "One or more added cards were not found.",
        _ => return deck_edit_error(error),
    };
    user_error(message)
}

/// `Errors.deck_import_error/1`.
pub fn deck_import_error(error: DeckError) -> Error {
    common(error, |error| match error {
        DeckError::DeckArchived => user_error("Unarchive this deck before importing a decklist."),
        DeckError::DeckLinked => user_error(DECK_LINKED),
        DeckError::CardNotFound => user_error("One or more decklist cards were not found."),
        _ => user_error("Could not import decklist."),
    })
}

/// Deck lookups and record changes (`DeckMutations` sharing, play, create).
pub fn deck_error(error: DeckError) -> Error {
    common(error, |error| match error {
        DeckError::Code("archived_deck") => {
            user_error("Archived decks cannot be recorded as played.")
        }
        DeckError::Code("share_token_collision") => {
            user_error("Could not generate a unique share link.")
        }
        other => deck_edit_error(other),
    })
}

/// Tag mutations (`DeckMutations.*_deck_tag/3`).
pub fn tag_error(error: DeckError) -> Error {
    common(error, |error| match error {
        DeckError::NotFound => user_error(DECK_TAG_NOT_FOUND),
        other => deck_edit_error(other),
    })
}

/// `DeckMutations.deck_card_tag_payload/1`.
pub fn card_tag_error(error: DeckError) -> Error {
    common(error, |error| match error {
        DeckError::Code("deck_mismatch") => user_error("That tag belongs to a different deck."),
        DeckError::NotFound => user_error("Deck card or deck tag was not found."),
        other => deck_edit_error(other),
    })
}
