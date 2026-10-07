//! A backup before schema changes (`Manavault.Backup.MigrationBackup`).
//!
//! The server backs the database up at boot, before
//! `db::prepare` applies migrations, when a production database exists and
//! is missing known migrations, unless `MANAVAULT_SKIP_MIGRATION_BACKUP` is
//! set. The archive is a regular local backup with reason `pre_migration`
//! (`<DATA_DIR>/backups/manavault-pre_migration-<timestamp>.zip`).

use sqlx::SqlitePool;

use super::local::{self, BackupError, Paths, Reason};
use manavault_core::config::{Config, Env};

fn skipped() -> bool {
    std::env::var("MANAVAULT_SKIP_MIGRATION_BACKUP")
        .is_ok_and(|value| matches!(value.as_str(), "1" | "true" | "TRUE"))
}

/// Whether an existing schema is missing migrations. A database without
/// `schema_migrations` is new (nothing to back up).
async fn pending_migrations(pool: &SqlitePool) -> bool {
    let Ok(mut conn) = pool.acquire().await else {
        return false;
    };
    match manavault_core::db::migrate::applied_versions(&mut conn).await {
        Ok(applied) if !applied.is_empty() => {
            manavault_core::db::migrate::versions().any(|version| !applied.contains(&version))
        }
        _ => false,
    }
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
