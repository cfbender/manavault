//! Rebuilding `collection_items.acquisition_market_price_cents` from MTGJSON's
//! price history.
//!
//! Items record the market price of one copy on the day they entered the
//! collection. Items that predate that snapshot took the price of the day
//! the column was added, so [`run`] replaces the price of every item added
//! inside the history window (about 90 days) with the selected price
//! source's price on the item's day. Items added before the window, and
//! items whose card has no history, keep their snapshot. Each run is one
//! `acquisition_price_rebuilds` row; the newest is what the settings page
//! shows.

use std::time::Duration;

use serde_json::{Value, json};
use sqlx::SqlitePool;
use time::Date;
use time::macros::format_description;

use manavault_catalog::pricing::history::{self, HistoryUrls, PriceHistory};
use manavault_catalog::pricing::{self, PriceSource};
use manavault_core::db;
use manavault_core::jobs::{Job, JobError, Outcome, Unique, Worker};
use manavault_core::state::AppState;
use manavault_core::timestamp::Timestamp;

pub const NAME: &str = "acquisition_price_rebuild";

/// Items added before this many days ago cannot be inside MTGJSON's window,
/// so their history is never requested.
const LOOKBACK: time::Duration = time::Duration::days(100);

/// The status of a rebuild row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum RebuildStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
}

impl RebuildStatus {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
        }
    }

    #[must_use]
    pub fn is_pending(self) -> bool {
        matches!(self, Self::Queued | Self::Running)
    }
}

/// An `acquisition_price_rebuilds` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuildRecord {
    pub id: i64,
    pub status: RebuildStatus,
    /// The price source the run used.
    pub source: Option<String>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    /// The first and last day of the fetched history, as `YYYY-MM-DD`.
    pub history_from: Option<String>,
    pub history_to: Option<String>,
    pub items_in_window: i64,
    pub items_updated: i64,
    pub items_without_history: i64,
    pub error: Option<String>,
}

/// The newest rebuild row.
pub async fn latest(pool: &SqlitePool) -> Result<Option<RebuildRecord>, sqlx::Error> {
    sqlx::query_as!(
        RebuildRecord,
        r#"SELECT id AS "id!", status AS "status: RebuildStatus", source,
                  started_at AS "started_at: Timestamp", completed_at AS "completed_at: Timestamp",
                  history_from, history_to, items_in_window, items_updated, items_without_history, error
           FROM acquisition_price_rebuilds ORDER BY id DESC LIMIT 1"#
    )
    .fetch_optional(pool)
    .await
}

async fn get(pool: &SqlitePool, id: i64) -> Result<RebuildRecord, sqlx::Error> {
    sqlx::query_as!(
        RebuildRecord,
        r#"SELECT id AS "id!", status AS "status: RebuildStatus", source,
                  started_at AS "started_at: Timestamp", completed_at AS "completed_at: Timestamp",
                  history_from, history_to, items_in_window, items_updated, items_without_history, error
           FROM acquisition_price_rebuilds WHERE id = ?1"#,
        id
    )
    .fetch_one(pool)
    .await
}

async fn insert_queued(conn: &mut sqlx::SqliteConnection) -> Result<i64, sqlx::Error> {
    let now = Timestamp::now();
    sqlx::query_scalar!(
        r#"INSERT INTO acquisition_price_rebuilds (status, inserted_at, updated_at)
           VALUES ('queued', ?1, ?1) RETURNING id AS "id!""#,
        now
    )
    .fetch_one(conn)
    .await
}

#[derive(Debug, thiserror::Error)]
pub enum EnqueueError {
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    #[error(transparent)]
    Job(#[from] JobError),
}

/// Queues a rebuild and returns its row, or the row of the rebuild already
/// queued or running.
pub async fn enqueue(state: &AppState) -> Result<RebuildRecord, EnqueueError> {
    let mut tx = db::begin_write(&state.db).await?;
    let pending = sqlx::query_scalar!(
        r#"SELECT id AS "id!" FROM acquisition_price_rebuilds
           WHERE status IN ('queued', 'running') ORDER BY id DESC LIMIT 1"#
    )
    .fetch_optional(&mut *tx)
    .await?;
    let id = if let Some(id) = pending {
        id
    } else {
        let id = insert_queued(&mut tx).await?;
        state
            .jobs
            .enqueue_in(&mut tx, NAME, json!({"rebuild_id": id}))
            .await?;
        id
    };
    tx.commit().await?;
    state.jobs.wake();
    Ok(get(&state.db, id).await?)
}

/// An item whose price the run may replace.
struct Item {
    id: i64,
    scryfall_id: String,
    finish: String,
    added_on: Date,
    price_cents: Option<i64>,
}

async fn items_since(pool: &SqlitePool, cutoff: Timestamp) -> Result<Vec<Item>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT id AS "id!", scryfall_id, finish, inserted_at AS "inserted_at: Timestamp",
                  acquisition_market_price_cents
           FROM collection_items ORDER BY id"#
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .filter(|row| row.inserted_at >= cutoff)
        .map(|row| Item {
            id: row.id,
            scryfall_id: row.scryfall_id,
            finish: row.finish,
            added_on: row.inserted_at.as_datetime().date(),
            price_cents: row.acquisition_market_price_cents,
        })
        .collect())
}

/// What a run found and changed.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Summary {
    range: Option<(Date, Date)>,
    in_window: i64,
    updated: i64,
    without_history: i64,
}

/// Replaces the prices of items added inside the history window.
async fn apply(
    pool: &SqlitePool,
    items: &[Item],
    history: &PriceHistory,
    source: PriceSource,
) -> Result<Summary, sqlx::Error> {
    let mut summary = Summary {
        range: history.range(),
        ..Summary::default()
    };
    let Some((from, to)) = summary.range else {
        return Ok(summary);
    };
    let mut tx = db::begin_write(pool).await?;
    for item in items
        .iter()
        .filter(|item| (from..=to).contains(&item.added_on))
    {
        summary.in_window += 1;
        let Some(cents) =
            history.price_cents(&item.scryfall_id, source, Some(&item.finish), item.added_on)
        else {
            summary.without_history += 1;
            continue;
        };
        if item.price_cents == Some(cents) {
            continue;
        }
        sqlx::query!(
            "UPDATE collection_items SET acquisition_market_price_cents = ?1 WHERE id = ?2",
            cents,
            item.id
        )
        .execute(&mut *tx)
        .await?;
        summary.updated += 1;
    }
    tx.commit().await?;
    Ok(summary)
}

async fn mark_running(pool: &SqlitePool, id: i64, source: &str) -> Result<(), sqlx::Error> {
    let now = Timestamp::now();
    sqlx::query!(
        "UPDATE acquisition_price_rebuilds SET status = 'running', source = ?1, started_at = ?2, updated_at = ?2 WHERE id = ?3",
        source,
        now,
        id
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn finish(
    pool: &SqlitePool,
    id: i64,
    result: &Result<Summary, String>,
) -> Result<(), sqlx::Error> {
    let now = Timestamp::now();
    match result {
        Ok(summary) => {
            let format = format_description!("[year]-[month]-[day]");
            let from = summary
                .range
                .and_then(|(from, _)| from.format(&format).ok());
            let to = summary.range.and_then(|(_, to)| to.format(&format).ok());
            sqlx::query!(
                "UPDATE acquisition_price_rebuilds
                 SET status = 'succeeded', completed_at = ?1, updated_at = ?1, history_from = ?2, history_to = ?3,
                     items_in_window = ?4, items_updated = ?5, items_without_history = ?6, error = NULL
                 WHERE id = ?7",
                now,
                from,
                to,
                summary.in_window,
                summary.updated,
                summary.without_history,
                id
            )
            .execute(pool)
            .await?;
        }
        Err(error) => {
            sqlx::query!(
                "UPDATE acquisition_price_rebuilds SET status = 'failed', completed_at = ?1, updated_at = ?1, error = ?2 WHERE id = ?3",
                now,
                error,
                id
            )
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}

/// Runs the rebuild recorded by row `rebuild_id` (a new row when `None`).
pub async fn run(
    state: &AppState,
    urls: &HistoryUrls,
    rebuild_id: Option<i64>,
) -> Result<RebuildRecord, sqlx::Error> {
    let pool = &state.db;
    let id = if let Some(id) = rebuild_id {
        id
    } else {
        let mut conn = pool.acquire().await?;
        insert_queued(&mut conn).await?
    };
    let source_name = pricing::source(pool).await?;
    mark_running(pool, id, &source_name).await?;
    let source = PriceSource::parse(&source_name).unwrap_or(PriceSource::Scryfall);
    let cutoff = Timestamp::from(Timestamp::now().as_datetime() - LOOKBACK);
    let items = items_since(pool, cutoff).await?;
    let mut scryfall_ids: Vec<String> = items.iter().map(|item| item.scryfall_id.clone()).collect();
    scryfall_ids.sort();
    scryfall_ids.dedup();
    let result = match history::fetch(state, urls, &scryfall_ids).await {
        Ok(history) => Ok(apply(pool, &items, &history, source).await?),
        Err(error) => Err(error),
    };
    finish(pool, id, &result).await?;
    match &result {
        Ok(summary) => tracing::info!(
            "Acquisition price rebuild finished rebuild_id={id} source={source_name} in_window={} updated={} without_history={}",
            summary.in_window,
            summary.updated,
            summary.without_history
        ),
        Err(error) => {
            tracing::warn!("Acquisition price rebuild failed rebuild_id={id} error={error}");
        }
    }
    get(pool, id).await
}

/// The job's `rebuild_id` arg, when present.
fn rebuild_id(args: &Value) -> Option<i64> {
    args.get("rebuild_id").and_then(Value::as_i64)
}

pub struct AcquisitionPriceRebuildWorker;

impl Worker for AcquisitionPriceRebuildWorker {
    fn name(&self) -> &'static str {
        NAME
    }

    fn queue(&self) -> &'static str {
        "pricing"
    }

    fn max_attempts(&self) -> i64 {
        1
    }

    fn unique(&self) -> Option<Unique> {
        Some(Unique::Worker)
    }

    fn timeout(&self) -> Duration {
        Duration::from_secs(30 * 60)
    }

    async fn perform(&self, state: &AppState, job: &Job) -> Outcome {
        match run(state, &HistoryUrls::default(), rebuild_id(&job.args)).await {
            Ok(record) if record.status == RebuildStatus::Failed => {
                Outcome::Cancel(record.error.unwrap_or_default())
            }
            Ok(_) => Outcome::Done,
            Err(error) => Outcome::Retry(error.to_string()),
        }
    }
}
