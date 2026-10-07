//! Deck insight and deck-wide allocation over GraphQL: buylists, EDHREC
//! recommendations and commander pages, Recommander, Commander Spellbook
//! combos, disassembly, and bulk/pull-list allocation.
//!
//! The allocation rules live in the `manavault-allocation` crate; this
//! module adds the catalog (prices, printings, card lookup), the third-party
//! clients, and the GraphQL types of `ManavaultWeb.Schema.Catalog.DeckTypes`.

pub mod allocations;
pub mod buylist;
pub mod edhrec;
pub mod errors;
pub mod recommander;
pub mod schema;
pub mod spellbook;
mod suggest;

#[cfg(test)]
mod allocation_tests;
#[cfg(test)]
mod tests;

use std::collections::HashMap;

use lotus::ScryfallId;
use manavault_allocation::{AllocationError, DeckId, NamedDeckCard};
use sqlx::SqlitePool;

use manavault_catalog::catalog::printing::Printing;

pub use allocations::AllocationMutations;
pub use schema::{DeckIntelMutations, DeckIntelQueries};

pub use manavault_core::config::DeckIntelUrls;

/// A deck with its cards (zone, name, id order) and their preferred
/// printings (`Repo.preload(deck, Preloads.deck_preloads())`).
pub(crate) struct DeckContext {
    pub cards: Vec<NamedDeckCard>,
    pub printings: HashMap<ScryfallId, Printing>,
}

impl DeckContext {
    pub async fn load(pool: &SqlitePool, deck_id: DeckId) -> Result<Self, AllocationError> {
        manavault_allocation::deck(pool, deck_id)
            .await?
            .ok_or(AllocationError::DeckNotFound)?;
        let cards = manavault_allocation::deck_cards(pool, deck_id).await?;
        let mut ids: Vec<ScryfallId> = cards
            .iter()
            .filter_map(|named| named.card.preferred_printing_id.clone())
            .collect();
        ids.sort();
        ids.dedup();
        let printings = Printing::load_many(pool, &ids).await?;
        Ok(Self { cards, printings })
    }

    /// A deck card's preferred printing, when it has one.
    pub fn preferred_printing(&self, card: &NamedDeckCard) -> Option<&Printing> {
        card.card
            .preferred_printing_id
            .as_ref()
            .and_then(|id| self.printings.get(id))
    }
}
