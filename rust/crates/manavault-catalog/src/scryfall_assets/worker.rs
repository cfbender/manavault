//! The symbol and set icon sync job.

use std::time::Duration;

use time::OffsetDateTime;

use crate::catalog::scryfall::worker::forced;
use crate::jobs::{Job, Outcome, Unique, Worker};
use crate::state::AppState;

pub const NAME: &str = "scryfall_assets";

const SYNC_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// Whether the assets need another sync: never synced, or over a day ago.
#[must_use]
pub fn stale(completed_at: Option<OffsetDateTime>, now: OffsetDateTime) -> bool {
    completed_at.is_none_or(|at| now - at >= SYNC_INTERVAL)
}

pub struct ScryfallAssetsWorker;

impl Worker for ScryfallAssetsWorker {
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
        Duration::from_secs(10 * 60)
    }

    async fn perform(&self, state: &AppState, job: &Job) -> Outcome {
        let root = &state.config.scryfall_assets_dir;
        if !forced(&job.args)
            && !stale(
                super::latest_sync_completed_at(root),
                OffsetDateTime::now_utc(),
            )
        {
            return Outcome::Done;
        }
        match super::sync(&state.http, root, &super::AssetUrls::default()).await {
            Ok(counts) => {
                tracing::info!(
                    "Scryfall asset sync completed: {} symbols, {} set icons",
                    counts.symbols_count,
                    counts.sets_count
                );
                Outcome::Done
            }
            Err(error) => {
                tracing::warn!("Scryfall asset sync failed: {error:?}");
                Outcome::Retry(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::test_support::TestApp;

    #[tokio::test]
    async fn periodic_jobs_skip_fresh_manifests() {
        let app = TestApp::new().await;
        let root = app.state.config.scryfall_assets_dir.clone();
        std::fs::create_dir_all(root.join("symbols")).unwrap();
        std::fs::create_dir_all(root.join("sets")).unwrap();
        std::fs::write(root.join("symbols/symbology.json"), "[]").unwrap();
        std::fs::write(root.join("sets/sets.json"), "[]").unwrap();
        let job = Job {
            id: 1,
            worker: NAME.to_owned(),
            args: json!({}),
            attempt: 1,
            max_attempts: 3,
        };
        assert!(matches!(
            ScryfallAssetsWorker.perform(&app.state, &job).await,
            Outcome::Done
        ));
    }

    #[test]
    fn staleness() {
        let now = OffsetDateTime::now_utc();
        assert!(stale(None, now));
        assert!(stale(Some(now - SYNC_INTERVAL), now));
        assert!(!stale(
            Some(now - SYNC_INTERVAL + Duration::from_secs(60)),
            now
        ));
    }
}
