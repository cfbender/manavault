//! ManaVault's deck insights: allocation status, buylists, EDHREC recommendations, and collection checks.

pub mod deck_intel;

pub use manavault_catalog::{
    card_query, catalog, pricing, printing_query, scryfall_assets, tokens,
};
pub use manavault_collection::{
    collection, collection_item_query, deck_card_row_query, deck_row_query, decks, location_query,
};
pub use manavault_core::{
    api_keys, auth, config, connection_types, crypto, db, graphql, http_errors, jobs, logs,
    settings, state, timefmt, web,
};

#[cfg(test)]
pub use manavault_server::test_support;
