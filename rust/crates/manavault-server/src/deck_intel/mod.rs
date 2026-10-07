//! Deck insight and deck-wide allocation over GraphQL: buylists, EDHREC
//! recommendations and commander pages, Recommander, Commander Spellbook
//! combos, disassembly, and bulk/pull-list allocation.
//!
//! The allocation rules live in the `manavault-allocation` crate; this
//! module adds the catalog (prices, printings, card lookup), the third-party
//! clients, and the GraphQL types of `ManavaultWeb.Schema.Catalog.DeckTypes`.

pub mod buylist;
pub mod edhrec;
pub mod errors;
pub mod recommander;
pub mod schema;
pub mod spellbook;
pub mod status;
mod suggest;

#[cfg(test)]
mod tests;

use std::collections::HashMap;

use lotus::ScryfallId;
use manavault_allocation::{AllocationError, DeckId, NamedDeckCard};
use sqlx::SqlitePool;

use crate::catalog::printing::Printing;

pub use schema::{DeckIntelMutations, DeckIntelQueries};

/// Third-party endpoints for deck features (overridden in tests). EDHREC
/// commander pages use `Config::edhrec_json_base_url`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckIntelUrls {
    /// EDHREC's deck recommendation endpoint (`EDHRec.Client` `@recs_url`).
    pub edhrec_recs: String,
    /// Recommander's top-recommendations endpoint.
    pub recommander: String,
    /// Commander Spellbook's find-my-combos endpoint, with its query string.
    pub commander_spellbook: String,
}

impl Default for DeckIntelUrls {
    fn default() -> Self {
        Self {
            edhrec_recs: "https://edhrec.com/api/recs".to_owned(),
            recommander: "https://api.recommander.cards/public-release/api/decks/recommend/top"
                .to_owned(),
            commander_spellbook:
                "https://backend.commanderspellbook.com/find-my-combos/?limit=1000".to_owned(),
        }
    }
}

impl DeckIntelUrls {
    /// URLs on a closed local port, so a test that forgets to point a client
    /// at a mock server fails instead of reaching the real service.
    #[must_use]
    pub fn unreachable() -> Self {
        let base = "http://127.0.0.1:9";
        Self {
            edhrec_recs: format!("{base}/edhrec/recs"),
            recommander: format!("{base}/recommander"),
            commander_spellbook: format!("{base}/spellbook"),
        }
    }
}

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
