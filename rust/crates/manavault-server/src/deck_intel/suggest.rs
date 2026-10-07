//! Shared by EDHREC and Recommander: matching suggested cards to the deck,
//! and their collection status (`EDHRec.Response.CardLookup`'s deck match and
//! `EDHRec.Response.CollectionStatus`).

use manavault_allocation::{
    AllocationError, DeckCard, DeckCardId, NamedDeckCard, Quantity, Requirement, Zone,
};
use sqlx::SqlitePool;

use crate::catalog::card::CardRecord;
use crate::catalog::search::name_match;
use crate::deck_intel::DeckContext;
use crate::deck_intel::status::DeckCardAllocationStatus;

/// A suggested card resolved against the catalog and the deck.
#[derive(Clone, Copy)]
pub(crate) struct Suggested<'a> {
    pub local_card: Option<&'a CardRecord>,
    pub deck_card: Option<&'a NamedDeckCard>,
}

fn zone_priority(zone: Zone) -> u8 {
    match zone {
        Zone::Mainboard => 0,
        Zone::Considering => 1,
        Zone::Commander => 2,
    }
}

/// The deck card for a suggestion, by oracle id or normalized name; the
/// mainboard copy wins over considering, then commander
/// (`CardLookup.matching_deck_card/3`).
pub(crate) fn matching_deck_card<'a>(
    deck: &'a DeckContext,
    oracle_id: Option<&str>,
    name: &str,
) -> Option<&'a NamedDeckCard> {
    let key = name_match::normalize(name);
    deck.cards
        .iter()
        .filter(|named| {
            oracle_id.is_some_and(|id| named.card.oracle_id.as_str() == id)
                || name_match::normalize(&named.name) == key
        })
        .min_by_key(|named| zone_priority(named.card.zone))
}

/// Collection statuses for suggestions, in two batched status computations:
/// cards in the deck use their deck card's status (shown as allocated with
/// the zone); other local cards count every owned copy of the card against
/// one needed; unknown cards are missing.
///
/// Unlike `CollectionStatus.prefetch/1`, which only counted copies reserved
/// by active decks, every reservation counts: allocated copies have
/// physically left their location whatever the deck's status (the rule
/// `AllocationStatus` states and the deck-card path follows).
pub(crate) async fn collection_statuses(
    pool: &SqlitePool,
    suggestions: &[Suggested<'_>],
) -> Result<Vec<DeckCardAllocationStatus>, AllocationError> {
    let mut deck_cards: Vec<DeckCard> = Vec::new();
    let mut requirements: Vec<Requirement> = Vec::new();
    for suggestion in suggestions {
        match (suggestion.deck_card, suggestion.local_card) {
            (Some(named), _) => {
                if !deck_cards.iter().any(|card| card.id == named.card.id) {
                    deck_cards.push(named.card.clone());
                }
            }
            (None, Some(card)) => {
                if !requirements.iter().any(|r| r.oracle_id == card.oracle_id) {
                    requirements.push(Requirement {
                        oracle_id: card.oracle_id.clone(),
                        quantity: Quantity::new(1).ok_or(AllocationError::InvalidQuantity)?,
                        type_line: card.type_line.clone(),
                    });
                }
            }
            (None, None) => {}
        }
    }
    let in_deck = manavault_allocation::deck_card_statuses(pool, &deck_cards).await?;
    let needed = manavault_allocation::requirement_statuses(pool, &requirements).await?;

    Ok(suggestions
        .iter()
        .map(
            |suggestion| match (suggestion.deck_card, suggestion.local_card) {
                (Some(named), _) => {
                    let id: DeckCardId = named.card.id;
                    in_deck
                        .get(&id)
                        .map_or_else(DeckCardAllocationStatus::unknown_card, |status| {
                            DeckCardAllocationStatus::in_deck(status.clone(), named.card.zone)
                        })
                }
                (None, Some(card)) => needed
                    .get(&card.oracle_id)
                    .map_or_else(DeckCardAllocationStatus::unknown_card, |status| {
                        DeckCardAllocationStatus::new(status.clone())
                    }),
                (None, None) => DeckCardAllocationStatus::unknown_card(),
            },
        )
        .collect())
}
