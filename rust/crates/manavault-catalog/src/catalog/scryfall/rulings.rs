//! Card rulings from Scryfall's `rulings` bulk file, imported by the catalog
//! sync so a card's rulings never wait on a request to Scryfall.

use std::path::PathBuf;

use lotus::OracleId;
use lotus::scryfall::JsonLines;
use serde::Deserialize;
use sqlx::{QueryBuilder, SqlitePool};

use crate::catalog::card::CardRuling;
use crate::catalog::scryfall::bulk::open_gzip;

/// `rulings` bulk metadata.
pub const BULK_METADATA_URL: &str = "https://api.scryfall.com/bulk-data/rulings";

/// Rows per insert: four bound values each, well under SQLite's limit.
const INSERT_BATCH: usize = 1_000;

/// One record of the rulings bulk file.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct BulkRuling {
    pub oracle_id: String,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    pub comment: String,
}

/// Reads every ruling of a downloaded bulk file, in file order. Any record
/// that cannot be decoded fails the whole file, so a bad download never
/// replaces good rulings.
pub async fn decode_file(path: PathBuf) -> Result<Vec<BulkRuling>, String> {
    tokio::task::spawn_blocking(move || {
        let file = open_gzip(&path)?;
        JsonLines::<_, BulkRuling>::gzip(file)
            .map(|record| record.map_err(|error| error.to_string()))
            .collect()
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Replaces every stored ruling with `rulings` in one transaction.
pub async fn replace(pool: &SqlitePool, rulings: &[BulkRuling]) -> Result<usize, sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query!("DELETE FROM scryfall_rulings")
        .execute(&mut *tx)
        .await?;
    for batch in rulings.chunks(INSERT_BATCH) {
        QueryBuilder::new(
            "INSERT INTO scryfall_rulings (oracle_id, source, published_at, comment) ",
        )
        .push_values(batch, |mut row, ruling| {
            row.push_bind(&ruling.oracle_id)
                .push_bind(&ruling.source)
                .push_bind(&ruling.published_at)
                .push_bind(&ruling.comment);
        })
        .build()
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(rulings.len())
}

/// A card's rulings, newest first as Scryfall's API lists them (the bulk file
/// lists them oldest first); undated rulings come last.
pub async fn for_card(
    pool: &SqlitePool,
    oracle_id: &OracleId,
) -> Result<Vec<CardRuling>, sqlx::Error> {
    sqlx::query_as!(
        CardRuling,
        "SELECT source, published_at, comment FROM scryfall_rulings
         WHERE oracle_id = ?1 ORDER BY published_at DESC, id",
        oracle_id
    )
    .fetch_all(pool)
    .await
}
