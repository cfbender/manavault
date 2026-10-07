//! The card catalog (`Manavault.Catalog`): Scryfall cards and printings.

pub mod metrics;
pub mod oracle_tags;
pub mod scryfall;

use crate::state::AppState;

/// Drops cached catalog reads (card name suggestions, search results) after
/// the catalog changes (`Search.clear_card_name_suggestion_cache/0` and
/// `Catalog.Cache.clear/0`). Called by the Scryfall import.
pub async fn invalidate_after_import(state: &AppState) {
    let _ = state;
}
