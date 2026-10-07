//! ManaVault's local and cloud backups and scanner bundles.

use std::sync::Arc;

use manavault_core::jobs::DynWorker;

pub mod backup;
pub mod scanner;

#[cfg(test)]
mod test_app;

/// This crate's background workers.
#[must_use]
pub fn workers() -> Vec<Arc<dyn DynWorker>> {
    vec![
        Arc::new(scanner::update_worker::BundleUpdateWorker),
        Arc::new(backup::worker::CloudBackupWorker),
    ]
}
