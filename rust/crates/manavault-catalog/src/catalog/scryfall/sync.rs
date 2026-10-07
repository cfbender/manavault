//! The daily Scryfall catalog sync (`Manavault.Catalog.Scryfall.Sync`,
//! `Manavault.Catalog.Sync` for the `scryfall_syncs` rows).
//!
//! A sync downloads the `default_cards` bulk file to disk, validates it,
//! fetches the optional extras (oracle tags, MTGJSON saltiness, EDHREC
//! commander ranks), imports the paper printings, and then refreshes the
//! metrics. An extra that cannot be fetched is skipped and its stored values
//! preserved; a failure of the bulk file itself fails the sync before any
//! catalog row is written.

use std::path::{Path, PathBuf};
use std::time::Duration;

use lotus::scryfall::{ScryfallClient, ScryfallError};
use sqlx::SqlitePool;
use tokio_stream::wrappers::ReceiverStream;

use crate::catalog::metrics::{commander_ranks, saltiness};
use crate::catalog::scryfall::bulk::{self, BulkMetadata};
use crate::catalog::scryfall::import::{self, ImportOptions, OracleTags};
use manavault_core::state::AppState;
use manavault_core::timefmt;

/// `default_cards` bulk metadata.
pub const BULK_METADATA_URL: &str = "https://api.scryfall.com/bulk-data/default-cards";
/// `oracle_tags` bulk metadata.
pub const ORACLE_TAGS_BULK_METADATA_URL: &str = "https://api.scryfall.com/bulk-data/oracle-tags";

/// Identifier for the current importer's output, recorded on each sync.
/// Bump when the importer starts writing data older syncs lack (v2:
/// paper-only printings; v3: token printings and card -> token links; v4:
/// emblems; v5: bare "Card" helper tokens such as The Monarch and On an
/// Adventure). A succeeded sync with an older bulk type is treated as stale
/// so the next scheduled run re-imports instead of waiting out the daily
/// interval.
pub const BULK_TYPE: &str = "default_cards_paper_v5";

/// Where a sync fetches from. `None` skips that extra.
#[derive(Debug, Clone)]
pub struct SyncOptions {
    pub bulk_url: String,
    pub oracle_tags_bulk_url: Option<String>,
    pub saltiness_url: Option<String>,
    pub commander_ranks_url: Option<String>,
    /// Base for EDHREC's relative continuation paths.
    pub commander_ranks_pages_base_url: String,
    pub commander_ranks_page_delay: Duration,
}

impl Default for SyncOptions {
    fn default() -> Self {
        Self {
            bulk_url: BULK_METADATA_URL.to_owned(),
            oracle_tags_bulk_url: Some(ORACLE_TAGS_BULK_METADATA_URL.to_owned()),
            saltiness_url: Some(saltiness::SALTINESS_URL.to_owned()),
            commander_ranks_url: Some(commander_ranks::COMMANDER_RANKS_URL.to_owned()),
            commander_ranks_pages_base_url: commander_ranks::PAGES_BASE_URL.to_owned(),
            commander_ranks_page_delay: Duration::from_millis(200),
        }
    }
}

/// The status of a sync row.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum SyncStatus {
    Running,
    Succeeded,
    Failed,
}

/// A `scryfall_syncs` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncRecord {
    pub id: i64,
    pub status: SyncStatus,
    pub bulk_type: String,
    pub bulk_uri: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub cards_count: i64,
    pub printings_count: i64,
    pub error: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    /// The sync failed and was recorded as failed.
    #[error("{}", .0.error.as_deref().unwrap_or("Scryfall catalog sync failed"))]
    Failed(Box<SyncRecord>),
    /// The sync row itself could not be written.
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// The most recently started sync.
pub async fn latest(pool: &SqlitePool) -> Result<Option<SyncRecord>, sqlx::Error> {
    sqlx::query_as!(
        SyncRecord,
        r#"SELECT id AS "id!", status AS "status: SyncStatus", bulk_type, bulk_uri, started_at, completed_at,
                  cards_count, printings_count, error
           FROM scryfall_syncs ORDER BY started_at DESC, id DESC LIMIT 1"#
    )
    .fetch_optional(pool)
    .await
}

async fn get(pool: &SqlitePool, id: i64) -> Result<SyncRecord, sqlx::Error> {
    sqlx::query_as!(
        SyncRecord,
        r#"SELECT id AS "id!", status AS "status: SyncStatus", bulk_type, bulk_uri, started_at, completed_at,
                  cards_count, printings_count, error
           FROM scryfall_syncs WHERE id = ?1"#,
        id
    )
    .fetch_one(pool)
    .await
}

/// A Scryfall client for the app's HTTP client. The API base is unused:
/// every request names a full URL.
#[must_use]
pub fn client(state: &AppState) -> ScryfallClient {
    ScryfallClient::with_client(state.http.clone(), "https://api.scryfall.com")
}

/// Error text for a failed fetch, worded as earlier releases worded it
/// (`"Scryfall request failed with HTTP 500"`; lotus appends the reason
/// phrase and words 404 differently).
#[must_use]
pub fn format_fetch_error(error: &ScryfallError) -> String {
    match error {
        ScryfallError::NotFound => "Scryfall request failed with HTTP 404".to_owned(),
        ScryfallError::Status(status) => {
            format!("Scryfall request failed with HTTP {}", status.as_u16())
        }
        other => other.to_string(),
    }
}

/// Removes the downloaded file when dropped.
struct Download(PathBuf);

impl Drop for Download {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

async fn download(
    client: &ScryfallClient,
    url: &str,
    dir: &Path,
    name: &str,
    sync_id: i64,
) -> Result<(Download, u64), String> {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|error| error.to_string())?;
    let path = dir.join(format!("{sync_id}-{name}"));
    let file = Download(path.clone());
    let bytes = client
        .download_to_file(url, &path)
        .await
        .map_err(|error| format_fetch_error(&error))?;
    Ok((file, bytes))
}

async fn metadata(client: &ScryfallClient, url: &str) -> Result<String, String> {
    let metadata: BulkMetadata = client
        .get_json(url)
        .await
        .map_err(|error| format_fetch_error(&error))?;
    metadata.download_uri().map(str::to_owned)
}

fn log_downloaded(sync_id: i64, name: &str, bytes: u64) {
    tracing::info!("Scryfall catalog sync downloaded {name} bulk sync_id={sync_id} bytes={bytes}");
}

fn log_decoded(sync_id: i64, name: &str, count: usize) {
    tracing::info!("Scryfall catalog sync decoded {name} bulk sync_id={sync_id} count={count}");
}

/// Runs a sync with the given sources.
pub async fn run(state: &AppState, options: &SyncOptions) -> Result<SyncRecord, SyncError> {
    let pool = &state.db;
    let reconcile = sqlx::query_scalar!(
        "SELECT 1 AS found FROM scryfall_syncs WHERE bulk_type = ?1 AND status = 'succeeded' LIMIT 1",
        BULK_TYPE
    )
    .fetch_optional(pool)
    .await?
    .is_none();
    let now = timefmt::now();
    let sync_id = sqlx::query_scalar!(
        r#"INSERT INTO scryfall_syncs (status, bulk_type, started_at, cards_count, printings_count, inserted_at, updated_at)
           VALUES ('running', ?1, ?2, 0, 0, ?2, ?2) RETURNING id AS "id!""#,
        BULK_TYPE,
        now
    )
    .fetch_one(pool)
    .await?;

    tracing::info!("Scryfall catalog sync started sync_id={sync_id}");
    match sync(state, options, sync_id, reconcile).await {
        Ok(outcome) => {
            let completed = timefmt::now();
            let cards = i64::try_from(outcome.cards_count).unwrap_or(i64::MAX);
            let printings = i64::try_from(outcome.printings_count).unwrap_or(i64::MAX);
            sqlx::query!(
                "UPDATE scryfall_syncs SET status = 'succeeded', bulk_uri = ?1, completed_at = ?2, cards_count = ?3,
                   printings_count = ?4, error = NULL, updated_at = ?2 WHERE id = ?5",
                outcome.bulk_uri,
                completed,
                cards,
                printings,
                sync_id
            )
            .execute(pool)
            .await?;
            let record = get(pool, sync_id).await?;
            tracing::info!(
                "Scryfall catalog sync succeeded sync_id={sync_id} cards={} printings={}",
                record.cards_count,
                record.printings_count
            );
            Ok(record)
        }
        Err(error) => {
            tracing::warn!("Scryfall catalog sync failed sync_id={sync_id} error={error}");
            let completed = timefmt::now();
            sqlx::query!(
                "UPDATE scryfall_syncs SET status = 'failed', completed_at = ?1, error = ?2, updated_at = ?1 WHERE id = ?3",
                completed,
                error,
                sync_id
            )
            .execute(pool)
            .await?;
            Err(SyncError::Failed(Box::new(get(pool, sync_id).await?)))
        }
    }
}

struct Outcome {
    bulk_uri: String,
    cards_count: usize,
    printings_count: usize,
}

/// The steps of a sync. Any error here fails the sync; earlier releases left
/// the row `running` when the import raised a database error, which is
/// recorded as a failure here too.
async fn sync(
    state: &AppState,
    options: &SyncOptions,
    sync_id: i64,
    reconcile: bool,
) -> Result<Outcome, String> {
    let client = client(state);
    let dir = state.config.scryfall_cache_dir.clone();

    tracing::info!("Scryfall catalog sync fetching default-cards metadata sync_id={sync_id}");
    let download_uri = metadata(&client, &options.bulk_url).await?;
    tracing::info!("Scryfall catalog sync downloading default-cards bulk sync_id={sync_id}");
    let (bulk_file, bytes) = download(
        &client,
        &download_uri,
        &dir,
        "default-cards.jsonl.gz",
        sync_id,
    )
    .await?;
    log_downloaded(sync_id, "default-cards", bytes);
    let source_count = bulk::validate(bulk_file.0.clone()).await?;
    log_decoded(sync_id, "default-cards", source_count);

    let oracle_tags = fetch_oracle_tags(&client, options, &dir, sync_id).await;
    let scores = fetch_saltiness(&client, options, &dir, sync_id).await;
    let ranks = fetch_commander_ranks(&client, options, sync_id).await;

    let (batches, skipped) = bulk::paper_card_batches(bulk_file.0.clone());
    let counts = import::run(
        &state.db,
        ReceiverStream::new(batches),
        ImportOptions {
            oracle_tags,
            log_progress: true,
            source_count: Some(source_count),
            reconcile,
            bulk_uri: Some(download_uri.clone()),
        },
    )
    .await
    .map_err(|error| error.to_string())?;
    if let Ok(skipped) = skipped.await
        && skipped > 0
    {
        tracing::warn!(
            "Scryfall catalog sync skipped undecodable records sync_id={sync_id} count={skipped}"
        );
    }
    drop(bulk_file);
    crate::catalog::invalidate_after_import(state).await;

    if let Some(scores) = scores {
        let count = saltiness::update_cards(&state.db, &scores)
            .await
            .map_err(|error| error.to_string())?;
        tracing::info!(
            "Scryfall catalog sync updated EDHREC saltiness sync_id={sync_id} count={count}"
        );
    }
    if let Some(ranks) = ranks {
        let count = commander_ranks::update_cards(&state.db, &ranks)
            .await
            .map_err(|error| error.to_string())?;
        tracing::info!(
            "Scryfall catalog sync updated EDHREC commander ranks sync_id={sync_id} count={count}"
        );
    }
    Ok(Outcome {
        bulk_uri: download_uri,
        cards_count: counts.cards_count,
        printings_count: counts.printings_count,
    })
}

async fn fetch_oracle_tags(
    client: &ScryfallClient,
    options: &SyncOptions,
    dir: &Path,
    sync_id: i64,
) -> OracleTags {
    let Some(url) = options.oracle_tags_bulk_url.as_deref() else {
        tracing::info!("Scryfall catalog sync skipping oracle-tags bulk sync_id={sync_id}");
        return OracleTags::Replace(Vec::new());
    };
    tracing::info!("Scryfall catalog sync fetching oracle-tags metadata sync_id={sync_id}");
    let result = async {
        let download_uri = metadata(client, url).await?;
        tracing::info!("Scryfall catalog sync downloading oracle-tags bulk sync_id={sync_id}");
        let (file, bytes) =
            download(client, &download_uri, dir, "oracle-tags.jsonl.gz", sync_id).await?;
        log_downloaded(sync_id, "oracle-tags", bytes);
        let tags = bulk::decode_list(file.0.clone()).await?;
        log_decoded(sync_id, "oracle-tags", tags.len());
        Ok::<_, String>(tags)
    }
    .await;
    match result {
        Ok(tags) => OracleTags::Replace(tags),
        Err(error) => {
            tracing::warn!(
                "Scryfall catalog sync preserving existing oracle tags sync_id={sync_id} error={error}"
            );
            OracleTags::Skip
        }
    }
}

async fn fetch_saltiness(
    client: &ScryfallClient,
    options: &SyncOptions,
    dir: &Path,
    sync_id: i64,
) -> Option<saltiness::Scores> {
    let Some(url) = options.saltiness_url.as_deref() else {
        tracing::info!("Scryfall catalog sync skipping MTGJSON saltiness sync_id={sync_id}");
        return None;
    };
    tracing::info!("Scryfall catalog sync fetching MTGJSON saltiness sync_id={sync_id}");
    let result = async {
        let (file, bytes) = download(client, url, dir, "AtomicCards.json.gz", sync_id).await?;
        log_downloaded(sync_id, "MTGJSON AtomicCards", bytes);
        let scores = saltiness::decode_file(file.0.clone()).await?;
        log_decoded(sync_id, "MTGJSON AtomicCards saltiness", scores.len());
        Ok::<_, String>(scores)
    }
    .await;
    match result {
        Ok(scores) => Some(scores),
        Err(error) => {
            tracing::warn!(
                "Scryfall catalog sync preserving existing EDHREC saltiness sync_id={sync_id} error={error}"
            );
            None
        }
    }
}

async fn fetch_commander_ranks(
    client: &ScryfallClient,
    options: &SyncOptions,
    sync_id: i64,
) -> Option<commander_ranks::Ranks> {
    let Some(url) = options.commander_ranks_url.as_deref() else {
        tracing::info!("Scryfall catalog sync skipping EDHREC commander ranks sync_id={sync_id}");
        return None;
    };
    tracing::info!("Scryfall catalog sync fetching EDHREC commander ranks sync_id={sync_id}");
    match commander_ranks::fetch(
        client,
        url,
        &options.commander_ranks_pages_base_url,
        options.commander_ranks_page_delay,
    )
    .await
    {
        Ok((ranks, pages)) => {
            tracing::info!(
                "Scryfall catalog sync decoded EDHREC commander ranks sync_id={sync_id} count={} pages={pages}",
                ranks.len()
            );
            Some(ranks)
        }
        Err(error) => {
            tracing::warn!(
                "Scryfall catalog sync preserving existing EDHREC commander ranks sync_id={sync_id} error={error}"
            );
            None
        }
    }
}
