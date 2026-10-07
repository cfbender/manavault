//! A consistent database copy for a backup (`Manavault.Backup.Snapshot`):
//! `VACUUM INTO` a new file, then empty the replaceable Scryfall catalog
//! tables, which a sync regenerates.

use std::path::Path;
use std::str::FromStr as _;

use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::{ConnectOptions as _, Connection as _, SqlitePool};

const CATALOG_TABLES: [&str; 3] = ["scryfall_syncs", "scryfall_printings", "scryfall_cards"];

/// Why a snapshot failed.
#[derive(Debug, thiserror::Error)]
#[error("failed to prune backup snapshot {path}: {message}: {source}")]
pub struct SnapshotError {
    path: String,
    message: &'static str,
    source: sqlx::Error,
}

/// Writes a pruned copy of the database behind `pool` to `snapshot_path`.
pub async fn create(pool: &SqlitePool, snapshot_path: &Path) -> Result<(), SnapshotError> {
    let path = snapshot_path.display().to_string();
    let error = |message: &'static str| {
        let path = path.clone();
        move |source| SnapshotError {
            path,
            message,
            source,
        }
    };
    sqlx::query("VACUUM main INTO ?1")
        .bind(&path)
        .execute(pool)
        .await
        .map_err(error("could not copy the database"))?;

    let options = SqliteConnectOptions::from_str(&format!("sqlite://{path}"))
        .map_err(error("could not open snapshot database"))?
        .foreign_keys(false);
    let mut conn: SqliteConnection = options
        .connect()
        .await
        .map_err(error("could not open snapshot database"))?;
    let existing: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('scryfall_syncs', 'scryfall_printings', 'scryfall_cards')",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(error("could not query catalog tables"))?;
    for table in CATALOG_TABLES {
        if !existing.iter().any(|name| name == table) {
            continue;
        }
        let statement = match table {
            "scryfall_syncs" => "DELETE FROM scryfall_syncs",
            "scryfall_printings" => "DELETE FROM scryfall_printings",
            _ => "DELETE FROM scryfall_cards",
        };
        sqlx::query(statement)
            .execute(&mut conn)
            .await
            .map_err(error("could not delete catalog rows"))?;
    }
    sqlx::query("VACUUM")
        .execute(&mut conn)
        .await
        .map_err(error("could not vacuum pruned snapshot"))?;
    conn.close()
        .await
        .map_err(error("could not close snapshot database"))?;
    Ok(())
}
