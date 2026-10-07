//! The vendor price sync job.

use std::time::Duration;

use time::OffsetDateTime;

use crate::catalog::scryfall::worker::forced;
use crate::pricing::vendors::{FeedUrls, Vendor, feed};
use manavault_core::jobs::{Job, Outcome, Unique, Worker};
use manavault_core::state::AppState;

pub const NAME: &str = "vendor_prices";

/// Vendors never synced, or synced longer ago than their interval.
pub async fn stale_vendors(state: &AppState) -> Result<Vec<Vendor>, sqlx::Error> {
    let now = OffsetDateTime::now_utc();
    let mut vendors = Vec::new();
    for vendor in Vendor::ALL {
        let synced = super::last_synced_at(&state.db, vendor)
            .await?
            .as_deref()
            .and_then(manavault_core::timefmt::parse);
        if synced.is_none_or(|at| now - at >= vendor.sync_interval()) {
            vendors.push(vendor);
        }
    }
    Ok(vendors)
}

pub struct VendorSyncWorker;

impl Worker for VendorSyncWorker {
    fn name(&self) -> &'static str {
        NAME
    }

    fn queue(&self) -> &'static str {
        "pricing"
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
        let vendors = if forced(&job.args) {
            Vendor::ALL.to_vec()
        } else {
            match stale_vendors(state).await {
                Ok(vendors) => vendors,
                Err(error) => return Outcome::Retry(error.to_string()),
            }
        };
        if vendors.is_empty() {
            return Outcome::Done;
        }
        let urls = FeedUrls::default();
        let feeds = vendors
            .into_iter()
            .map(|vendor| feed(vendor, &urls))
            .collect();
        let summary = super::sync::run(state, feeds)
            .await
            .into_iter()
            .map(|(vendor, result)| match result {
                Ok(count) => format!("{vendor}={count}"),
                Err(reason) => format!("{vendor}=error({reason:?})"),
            })
            .collect::<Vec<_>>()
            .join(" ");
        tracing::info!("Vendor price sync finished {summary}");
        Outcome::Done
    }
}
