//! The SQLite connection pool and schema bootstrap.
//!
//! The Ecto migrations stay the only schema definition. `priv/repo/structure.sql`
//! (from `mix ecto.dump`) is embedded here: a new database is created from it,
//! and an existing database (created by the Elixir app or by this one) must
//! already have every migration it lists.

use std::collections::BTreeSet;
use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous,
};
use sqlx::{Sqlite, Transaction};

/// The schema dump of the latest Ecto migration.
pub const STRUCTURE_SQL: &str = include_str!("../../../../priv/repo/structure.sql");

/// Busy timeout shared with the Elixir repo config (`busy_timeout: 10_000`).
const BUSY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(
        "the database is missing migrations {0:?}; start the Elixir app once at this version, or restore a newer backup"
    )]
    MissingMigrations(Vec<i64>),
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

/// The statements of `structure.sql` that recreate the schema. SQLite's own
/// bookkeeping tables (`sqlite_sequence`, `sqlite_stat1`) are created
/// implicitly and cannot be created by hand.
fn schema_statements() -> String {
    STRUCTURE_SQL
        .lines()
        .filter(|line| !line.starts_with("CREATE TABLE sqlite_"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Migration versions recorded in `structure.sql`.
#[must_use]
pub fn known_migrations() -> BTreeSet<i64> {
    STRUCTURE_SQL
        .lines()
        .filter_map(|line| line.strip_prefix("INSERT INTO schema_migrations VALUES("))
        .filter_map(|rest| rest.split(',').next())
        .filter_map(|version| version.parse().ok())
        .collect()
}

/// Creates the schema on an empty database, or checks that an existing one
/// has every known migration.
pub async fn prepare(pool: &SqlitePool) -> Result<(), DbError> {
    let has_schema: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .fetch_optional(pool)
    .await?;

    if has_schema.is_none() {
        let mut tx = pool.begin().await?;
        sqlx::raw_sql(sqlx::AssertSqlSafe(schema_statements()))
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE schema_migrations SET inserted_at = strftime('%Y-%m-%dT%H:%M:%S', 'now') WHERE inserted_at IS NULL",
        )
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        tracing::info!("created a new database from structure.sql");
        return Ok(());
    }

    let applied: BTreeSet<i64> = sqlx::query_scalar("SELECT version FROM schema_migrations")
        .fetch_all(pool)
        .await?
        .into_iter()
        .collect();
    let missing: Vec<i64> = known_migrations().difference(&applied).copied().collect();
    if !missing.is_empty() {
        return Err(DbError::MissingMigrations(missing));
    }
    let known = known_migrations();
    let unknown: Vec<&i64> = applied.difference(&known).collect();
    if !unknown.is_empty() {
        tracing::warn!(
            ?unknown,
            "database has migrations this build does not know; it may be newer than the backend"
        );
    }
    Ok(())
}

/// Starts a write transaction that takes SQLite's write lock up front
/// (`default_transaction_mode: :immediate` in the Elixir repo), so concurrent
/// writers queue on `busy_timeout` instead of failing on lock upgrade.
pub async fn begin_write(pool: &SqlitePool) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
    pool.begin_with("BEGIN IMMEDIATE").await
}

/// A fresh database file with the current schema, for tests.
pub async fn test_pool(dir: &Path) -> Result<SqlitePool, DbError> {
    let pool = connect(&dir.join("test.db"), 4).await?;
    prepare(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn structure_lists_migrations() {
        let versions = known_migrations();
        assert!(versions.len() > 50);
        assert!(versions.contains(&20_261_006_120_000));
    }

    #[tokio::test]
    async fn creates_and_reopens_a_database() {
        let dir = crate::test_support::TempDir::new();
        let pool = test_pool(dir.path()).await.expect("schema loads");
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM schema_migrations")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(usize::try_from(count).ok(), Some(known_migrations().len()));
        prepare(&pool).await.expect("existing schema accepted");
    }
}
