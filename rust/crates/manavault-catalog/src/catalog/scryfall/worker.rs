//! The catalog sync job.

use std::time::Duration;

use serde_json::{Value, json};
use time::OffsetDateTime;

use crate::catalog::scryfall::sync::{
    self, BULK_TYPE, SyncError, SyncOptions, SyncRecord, SyncStatus,
};
use manavault_core::jobs::{Job, JobError, Jobs, Outcome, Unique, Worker};
use manavault_core::state::AppState;

pub const NAME: &str = "scryfall_catalog";

const SYNC_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// Whether the catalog needs another sync: none succeeded yet, the last
/// success is older than a day, or it was produced by an older importer
/// version (see [`BULK_TYPE`]).
#[must_use]
pub fn stale(sync: Option<&SyncRecord>, now: OffsetDateTime) -> bool {
    let Some(sync) = sync else {
        return true;
    };
    if sync.status != SyncStatus::Succeeded {
        return true;
    }
    let Some(completed_at) = sync
        .completed_at
        .as_deref()
        .and_then(manavault_core::timefmt::parse)
    else {
        return true;
    };
    sync.bulk_type != BULK_TYPE || now - completed_at >= SYNC_INTERVAL
}

/// Whether a job's args ask for a forced run (`args["force"]` truthy).
#[must_use]
pub fn forced(args: &Value) -> bool {
    args.get("force")
        .is_some_and(|force| !matches!(force, Value::Null | Value::Bool(false)))
}

/// Inserts a forced job for a unique worker. An already queued job takes
/// the forced args; a running one is returned unchanged.
pub async fn enqueue_forced(
    jobs: &Jobs,
    pool: &sqlx::SqlitePool,
    worker: &str,
) -> Result<i64, JobError> {
    let args = json!({"force": true});
    let id = jobs.enqueue(worker, args.clone()).await?;
    let args = args.to_string();
    sqlx::query!(
        "UPDATE jobs SET args = json(?1) WHERE id = ?2 AND state = 'queued'",
        args,
        id
    )
    .execute(pool)
    .await?;
    Ok(id)
}

pub struct ScryfallCatalogWorker;

impl Worker for ScryfallCatalogWorker {
    fn name(&self) -> &'static str {
        NAME
    }

    fn queue(&self) -> &'static str {
        "catalog"
    }

    fn max_attempts(&self) -> i64 {
        3
    }

    fn unique(&self) -> Option<Unique> {
        Some(Unique::Worker)
    }

    fn timeout(&self) -> Duration {
        Duration::from_secs(30 * 60)
    }

    async fn perform(&self, state: &AppState, job: &Job) -> Outcome {
        if !forced(&job.args) {
            match sync::latest(&state.db).await {
                Ok(latest) if !stale(latest.as_ref(), OffsetDateTime::now_utc()) => {
                    return Outcome::Done;
                }
                Ok(_) => {}
                Err(error) => return Outcome::Retry(error.to_string()),
            }
        }
        match sync::run(state, &SyncOptions::default()).await {
            Ok(record) => {
                tracing::info!(
                    "Scryfall catalog sync completed: {} printings",
                    record.printings_count
                );
                Outcome::Done
            }
            Err(SyncError::Failed(record)) => {
                let error = record.error.clone().unwrap_or_default();
                tracing::warn!("Scryfall catalog sync failed: {error}");
                Outcome::Retry(error)
            }
            Err(SyncError::Db(error)) => {
                tracing::warn!("Scryfall catalog sync failed: {error}");
                Outcome::Retry(error.to_string())
            }
        }
    }
}
