//! The card catalog (`Manavault.Catalog`): Scryfall cards and printings.
//!
//! Read side: [`Card`] and [`Printing`] (GraphQL types other domains embed),
//! the card search and its Scryfall query syntax, name suggestions, scanner
//! lookups, rulings, and EDHREC card pages. Token items live in
//! [`crate::tokens`].

pub mod cache;
pub mod card;
pub mod edhrec;
pub mod json;
pub mod loader;
pub mod price;
pub mod printing;
pub mod schema;
pub mod metrics;
pub mod oracle_tags;
pub mod scryfall;
pub mod scryfall_query;
pub mod search;
pub mod sql;

pub use card::{Card, CardConnection, CardEdge, CardRecord};
pub use printing::{Printing, PrintingConnection, PrintingEdge, PrintingRecord};
pub use schema::CardQueries;

use crate::state::AppState;

/// Drops cached catalog reads (card name suggestions, cached lookups such as
/// rulings) after the catalog changes (`Search.clear_card_name_suggestion_cache/0`
/// and `Catalog.Cache.invalidate_catalog/0`). Called by the Scryfall import.
pub async fn invalidate_after_import(state: &AppState) {
    search::suggestions::clear(state);
    cache::invalidate(state).await;
}

#[cfg(test)]
pub(crate) mod tests;
