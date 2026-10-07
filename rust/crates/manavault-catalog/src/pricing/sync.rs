//! Fetches vendor price feeds and replaces each vendor's rows in
//! `vendor_prices` (`Manavault.Pricing.Sync`). Only this module writes
//! vendor prices; Scryfall catalog imports never touch the table.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use sqlx::SqlitePool;

use crate::pricing::vendors::{Vendor, VendorFeed, VendorRow};
use manavault_core::state::AppState;
use manavault_core::timestamp;

const BATCH_SIZE: usize = 200;
const BUSY_RETRY_DELAYS: [Duration; 5] = [
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(10),
    Duration::from_secs(20),
];

/// What a replacement wrote.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Replaced {
    pub upserted: usize,
    pub deleted: u64,
}

fn busy(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .is_some_and(|code| code == "5" || code == "6")
}

/// Runs `write`, retrying with increasing delays while SQLite reports the
/// database busy (`Repo.retry_when_busy/3`): bulk writers that overlap
/// another long write (such as a catalog import) wait rather than fail.
async fn retry_when_busy<T, F, Fut>(context: &str, mut write: F) -> Result<T, sqlx::Error>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, sqlx::Error>>,
{
    let mut delays = BUSY_RETRY_DELAYS.iter();
    loop {
        match write().await {
            Err(error) if busy(&error) => match delays.next() {
                Some(delay) => {
                    tracing::warn!(
                        "{context} hit a busy database; retrying in {}ms",
                        delay.as_millis()
                    );
                    tokio::time::sleep(*delay).await;
                }
                None => return Err(error),
            },
            result => return result,
        }
    }
}

/// Replaces every price row for `vendor` with `rows`. Duplicate
/// printing/finish pairs keep the cheapest price; rows no longer present are
/// deleted.
///
/// Batches are written in autocommit mode on purpose: one transaction over a
/// full feed would hold SQLite's single write lock for seconds, long enough
/// to push other writers past `busy_timeout`. Each batch instead retries
/// when it finds the database busy.
pub async fn replace_vendor_prices(
    pool: &SqlitePool,
    vendor: Vendor,
    rows: Vec<VendorRow>,
) -> Result<Replaced, sqlx::Error> {
    let now = timestamp::now_micros();
    let mut cheapest: HashMap<(String, lotus::Finish), i64> = HashMap::new();
    for row in rows {
        let entry = cheapest
            .entry((row.scryfall_id, row.finish))
            .or_insert(row.price_cents);
        *entry = (*entry).min(row.price_cents);
    }
    let context = format!("Vendor price sync vendor={vendor}");
    let deduped: Vec<((String, lotus::Finish), i64)> = cheapest.into_iter().collect();
    let vendor_name = vendor.as_str();
    for batch in deduped.chunks(BATCH_SIZE) {
        retry_when_busy(&context, || async {
            let mut builder = sqlx::QueryBuilder::new(
                "INSERT INTO vendor_prices (vendor, scryfall_id, finish, price_cents, inserted_at, updated_at) ",
            );
            builder.push_values(batch, |mut row, ((scryfall_id, finish), cents)| {
                row.push_bind(vendor_name)
                    .push_bind(scryfall_id.clone())
                    .push_bind(finish.as_str())
                    .push_bind(*cents)
                    .push_bind(now.clone())
                    .push_bind(now.clone());
            });
            builder.push(
                " ON CONFLICT (vendor, scryfall_id, finish) DO UPDATE SET price_cents = excluded.price_cents, updated_at = excluded.updated_at",
            );
            builder.build().execute(pool).await
        })
        .await?;
    }
    let deleted = retry_when_busy(&context, || async {
        sqlx::query!(
            "DELETE FROM vendor_prices WHERE vendor = ?1 AND updated_at < ?2",
            vendor_name,
            now
        )
        .execute(pool)
        .await
    })
    .await?
    .rows_affected();
    Ok(Replaced {
        upserted: deduped.len(),
        deleted,
    })
}

/// One vendor's sync result: the number of prices stored, or why not.
pub type VendorResult = (Vendor, Result<usize, String>);

/// Syncs the feeds one after another and refreshes the price store once at
/// the end. Each vendor is isolated: an error, or a panic while fetching or
/// storing one vendor, is logged and reported as that vendor's result
/// rather than failing the job, which would retry already-synced vendors
/// from the top.
pub async fn run(state: &AppState, feeds: Vec<Arc<dyn VendorFeed>>) -> Vec<VendorResult> {
    let mut results = Vec::new();
    for feed in feeds {
        let vendor = feed.vendor();
        tracing::info!("Vendor price sync started vendor={vendor}");
        let task_state = state.clone();
        let outcome =
            tokio::spawn(async move { sync_vendor(&task_state, feed.as_ref()).await }).await;
        let result = match outcome {
            Ok(result) => result,
            Err(error) => {
                let reason = panic_message(error);
                tracing::error!("Vendor price sync crashed vendor={vendor}\n{reason}");
                Err(reason)
            }
        };
        results.push((vendor, result));
    }
    if let Err(error) = state.prices.refresh(&state.db).await {
        tracing::error!("Vendor price store refresh failed: {error}");
    }
    crate::catalog::invalidate_after_import(state).await;
    results
}

fn panic_message(error: tokio::task::JoinError) -> String {
    match error.try_into_panic() {
        Ok(payload) => payload
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| {
                payload
                    .downcast_ref::<&str>()
                    .map(|text| (*text).to_owned())
            })
            .unwrap_or_else(|| "panic".to_owned()),
        Err(error) => error.to_string(),
    }
}

async fn sync_vendor(state: &AppState, feed: &dyn VendorFeed) -> Result<usize, String> {
    let vendor = feed.vendor();
    match feed.fetch(state).await {
        Ok(rows) if !rows.is_empty() => {
            let replaced = replace_vendor_prices(&state.db, vendor, rows)
                .await
                .map_err(|error| {
                    tracing::error!("Vendor price sync crashed vendor={vendor}\n{error}");
                    error.to_string()
                })?;
            tracing::info!(
                "Vendor price sync completed vendor={vendor} prices={} removed={}",
                replaced.upserted,
                replaced.deleted
            );
            Ok(replaced.upserted)
        }
        Ok(_) => {
            tracing::warn!(
                "Vendor price sync returned no rows vendor={vendor}; keeping existing prices"
            );
            Err("empty_feed".to_owned())
        }
        Err(reason) => {
            tracing::warn!("Vendor price sync failed vendor={vendor} error={reason:?}");
            Err(reason)
        }
    }
}
