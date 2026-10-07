//! ManaVault's public shares: the public GraphQL schema, share pages, and preview images.

use std::sync::Arc;

use manavault_core::jobs::DynWorker;

pub mod share;

#[cfg(test)]
mod test_app;

/// This crate's background workers.
#[must_use]
pub fn workers() -> Vec<Arc<dyn DynWorker>> {
    vec![Arc::new(share::preview::render_worker::RenderWorker)]
}
