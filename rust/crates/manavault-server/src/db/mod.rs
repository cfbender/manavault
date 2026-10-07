//! The SQLite connection pool and schema bootstrap.
//!
//! The schema is defined by the SQL migrations in `rust/migrations`, applied
//! on boot by [`migrate::run`] and recorded in `schema_migrations` with the
//! same versions the Ecto migrations used, so databases created by any
//! earlier release (Elixir or Rust) upgrade in place.

pub mod migrate;

use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous,
};
use sqlx::{Sqlite, Transaction};

/// Busy timeout shared with the Elixir repo config (`busy_timeout: 10_000`).
const BUSY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migrate(#[from] migrate::MigrateError),
}

fn connect_options(path: &Path) -> Result<SqliteConnectOptions, sqlx::Error> {
    Ok(
        SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .foreign_keys(true)
            .busy_timeout(BUSY_TIMEOUT)
            .pragma("temp_store", "memory")
            .pragma("cache_size", "-64000"),
    )
}

/// Opens a pool on the database file, creating it if needed.
pub async fn connect(path: &Path, pool_size: u32) -> Result<SqlitePool, sqlx::Error> {
    SqlitePoolOptions::new()
        .max_connections(pool_size.max(1))
        .acquire_timeout(Duration::from_secs(15))
        .connect_with(connect_options(path)?)
        .await
}

/// Applies pending migrations. Versions recorded in the database that this
/// build does not know (a database from a newer release) are ignored with a
/// warning, as `Ecto.Migrator` ignores them.
pub async fn prepare(pool: &SqlitePool) -> Result<migrate::Outcome, DbError> {
    let outcome = migrate::run(pool).await?;
    if !outcome.applied.is_empty() {
        tracing::info!(count = outcome.applied.len(), "applied database migrations");
    }
    if !outcome.unknown.is_empty() {
        tracing::warn!(
            unknown = ?outcome.unknown,
            "database has migrations this build does not know; it may be newer than the backend"
        );
    }
    Ok(outcome)
}

/// Starts a write transaction that takes SQLite's write lock up front
/// (`default_transaction_mode: :immediate` in the Elixir repo), so concurrent
/// writers queue on `busy_timeout` instead of failing on lock upgrade.
pub async fn begin_write(pool: &SqlitePool) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
    pool.begin_with("BEGIN IMMEDIATE").await
}

/// A fresh database file with the current schema, for tests. The migrations
/// run once per process into a template file that each test copies.
pub async fn test_pool(dir: &Path) -> Result<SqlitePool, DbError> {
    static TEMPLATE: tokio::sync::OnceCell<std::path::PathBuf> = tokio::sync::OnceCell::const_new();
    let template = TEMPLATE
        .get_or_try_init(|| async {
            let path = std::env::temp_dir().join(format!(
                "manavault-test-template-{}-{}.db",
                std::process::id(),
                hex::encode(crate::crypto::random_bytes::<4>())
            ));
            let pool = connect(&path, 1).await?;
            prepare(&pool).await?;
            // Closing the last connection checkpoints the WAL into the file.
            pool.close().await;
            Ok::<_, DbError>(path)
        })
        .await?;
    let path = dir.join("test.db");
    std::fs::copy(template, &path).map_err(|error| DbError::Sqlx(sqlx::Error::Io(error)))?;
    let pool = connect(&path, 4).await?;
    prepare(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests;
