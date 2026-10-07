//! ManaVault's card catalog: Scryfall sync and search, tokens, card image assets, and prices.

use std::sync::Arc;

use manavault_core::jobs::DynWorker;

pub mod catalog;
pub mod pricing;
pub mod scryfall_assets;
pub mod tokens;

#[doc(hidden)]
pub mod testing;

#[cfg(test)]
mod test_app;

/// This crate's background workers.
#[must_use]
pub fn workers() -> Vec<Arc<dyn DynWorker>> {
    vec![
        Arc::new(catalog::scryfall::worker::ScryfallCatalogWorker),
        Arc::new(scryfall_assets::worker::ScryfallAssetsWorker),
        Arc::new(pricing::worker::VendorSyncWorker),
    ]
}
