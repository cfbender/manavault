//! ManaVault's AI deck analysis and deck questions.

use std::sync::Arc;

use manavault_core::jobs::DynWorker;

pub mod ai;

#[cfg(test)]
mod test_app;

/// This crate's background workers.
#[must_use]
pub fn workers() -> Vec<Arc<dyn DynWorker>> {
    vec![
        Arc::new(ai::workers::DeckAnalysisWorker),
        Arc::new(ai::workers::DeckQuestionWorker),
    ]
}
