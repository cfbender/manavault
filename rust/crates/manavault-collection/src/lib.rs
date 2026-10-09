//! ManaVault's collection, locations, imports and exports, and decks.

use std::sync::Arc;

use manavault_core::jobs::DynWorker;

pub mod collection;
pub mod decks;

#[doc(hidden)]
pub mod testing;

#[cfg(test)]
mod test_app;

/// This crate's background workers.
#[must_use]
pub fn workers() -> Vec<Arc<dyn DynWorker>> {
    vec![
        Arc::new(decks::external::ExternalDeckSyncWorker),
        Arc::new(collection::acquisition_prices::AcquisitionPriceRebuildWorker),
    ]
}
