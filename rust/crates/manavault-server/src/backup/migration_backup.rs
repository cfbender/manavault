//! A backup before schema changes (`Manavault.Backup.MigrationBackup`).
//!
//! The Elixir release backs the database up at boot when migrations are
//! pending. This backend never migrates an existing database (`db::prepare`
//! refuses one that lacks migrations), so the backup only runs in the same
//! situation, before that refusal: a production database that exists and is
//! missing known migrations, unless `MANAVAULT_SKIP_MIGRATION_BACKUP` is set.

use std::collections::BTreeSet;

use sqlx::SqlitePool;

use super::local::{self, BackupError, Paths, Reason};
use crate::config::{Config, Env};

fn skipped() -> bool {
    std::env::var("MANAVAULT_SKIP_MIGRATION_BACKUP")
        .is_ok_and(|value| matches!(value.as_str(), "1" | "true" | "TRUE"))
}

async fn pending_migrations(pool: &SqlitePool) -> bool {
    let has_table: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    if has_table.is_none() {
        return false;
    }
    let applied: BTreeSet<i64> = sqlx::query_scalar("SELECT version FROM schema_migrations")
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .collect();
    crate::db::known_migrations()
        .difference(&applied)
        .next()
        .is_some()
}

/// Creates a `pre_migration` backup when one is due.
pub async fn run(config: &Config, pool: &SqlitePool) -> Result<(), BackupError> {
    if config.env != Env::Prod || skipped() || !config.database_path.exists() {
        return Ok(());
    }
    if pending_migrations(pool).await {
        let path = local::create(pool, &Paths::from_config(config), Reason::PreMigration).await?;
        tracing::info!("created pre-migration backup at {}", path.display());
    }
    Ok(())
}
