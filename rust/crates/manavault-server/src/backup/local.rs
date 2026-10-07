//! Creating and restoring backup zips (`Manavault.Backup.Create` and
//! `Backup.Restore`).
//!
//! A backup holds `manavault.db` (a pruned snapshot) and `manifest.json`.
//! A restore copies the database aside into `backups/pre-restore-<time>`
//! and puts the backup's database in place; it must run while nothing has
//! the database open (the CLI with the server stopped, or at boot before
//! the pool opens).

use std::path::{Path, PathBuf};

use serde_json::json;
use sqlx::SqlitePool;
use time::OffsetDateTime;
use time::macros::format_description;

use super::{archive, snapshot};
use crate::config::Config;

const DB_NAME: &str = "manavault.db";
const MANIFEST_NAME: &str = "manifest.json";

/// Where the database, data directory, and local backups live.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Paths {
    pub database_path: PathBuf,
    pub data_dir: PathBuf,
    pub backups_dir: PathBuf,
}

impl Paths {
    #[must_use]
    pub fn from_config(config: &Config) -> Self {
        Self {
            database_path: config.database_path.clone(),
            data_dir: config.data_dir.clone(),
            backups_dir: config.backups_dir.clone(),
        }
    }

    /// `DATA_DIR/restores`, where staged cloud restores wait for a restart.
    #[must_use]
    pub fn restores_dir(&self) -> PathBuf {
        self.data_dir.join("restores")
    }
}

/// Why a backup is made; part of the file name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    Manual,
    Cloud,
    PreMigration,
}

impl Reason {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Cloud => "cloud",
            Self::PreMigration => "pre_migration",
        }
    }
}

/// A backup or restore failure, with the message the status line shows.
#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct BackupError(pub String);

impl From<archive::ArchiveError> for BackupError {
    fn from(error: archive::ArchiveError) -> Self {
        Self(error.to_string())
    }
}

impl From<snapshot::SnapshotError> for BackupError {
    fn from(error: snapshot::SnapshotError) -> Self {
        Self(error.to_string())
    }
}

fn io(context: &str) -> impl Fn(std::io::Error) -> BackupError + '_ {
    move |error| BackupError(format!("{context}: {error}"))
}

/// `%Y%m%dT%H%M%SZ`.
#[must_use]
pub fn timestamp(at: OffsetDateTime) -> String {
    at.format(format_description!(
        "[year][month][day]T[hour][minute][second]Z"
    ))
    .unwrap_or_default()
}

/// `DateTime.to_iso8601(DateTime.utc_now())`, with microseconds.
#[must_use]
pub fn iso8601_now() -> String {
    crate::timefmt::now_micros()
}

/// A fresh temporary directory path.
fn temp_dir(prefix: &str, timestamp: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "{prefix}-{timestamp}-{}",
        hex::encode(crate::crypto::random_bytes::<6>())
    ))
}

/// Writes a backup zip and returns its path (`Backup.create!/1`).
pub async fn create(
    pool: &SqlitePool,
    paths: &Paths,
    reason: Reason,
) -> Result<PathBuf, BackupError> {
    if !paths.database_path.exists() {
        return Err(BackupError(format!(
            "cannot create backup because SQLite database does not exist at {}",
            paths.database_path.display()
        )));
    }
    std::fs::create_dir_all(&paths.backups_dir)
        .map_err(io("could not create the backups directory"))?;
    let stamp = timestamp(OffsetDateTime::now_utc());
    let artifact = paths
        .backups_dir
        .join(format!("manavault-{}-{stamp}.zip", reason.as_str()));
    let stage = temp_dir("manavault-backup", &stamp);
    std::fs::create_dir_all(&stage).map_err(io("could not create the staging directory"))?;
    let result = async {
        snapshot::create(pool, &stage.join(DB_NAME)).await?;
        let manifest = json!({
            "app": "manavault",
            "version": env!("CARGO_PKG_VERSION"),
            "created_at": iso8601_now(),
            "reason": reason.as_str(),
            "data_dir": paths.data_dir.display().to_string(),
            "database_path": paths.database_path.display().to_string(),
            "includes": [DB_NAME],
        });
        let pretty = serde_json::to_string_pretty(&manifest).unwrap_or_default();
        std::fs::write(stage.join(MANIFEST_NAME), pretty)
            .map_err(io("could not write the manifest"))?;
        archive::create(&stage, &artifact)?;
        Ok::<_, BackupError>(())
    }
    .await;
    let _ = std::fs::remove_dir_all(&stage);
    result.map(|()| artifact)
}

fn sidecars(database_path: &Path) -> [(PathBuf, String); 2] {
    ["-wal", "-shm"].map(|suffix| {
        (
            PathBuf::from(format!("{}{suffix}", database_path.display())),
            format!("{DB_NAME}{suffix}"),
        )
    })
}

/// Copies the current database aside before it is replaced.
fn backup_existing_data(paths: &Paths, stamp: &str) -> Result<(), BackupError> {
    if !paths.database_path.exists() {
        return Ok(());
    }
    let destination = paths.backups_dir.join(format!("pre-restore-{stamp}"));
    std::fs::create_dir_all(&destination).map_err(io("could not create the pre-restore copy"))?;
    std::fs::copy(&paths.database_path, destination.join(DB_NAME))
        .map_err(io("could not copy the current database"))?;
    for (sidecar, name) in sidecars(&paths.database_path) {
        if sidecar.exists() {
            std::fs::copy(&sidecar, destination.join(name))
                .map_err(io("could not copy the current database"))?;
        }
    }
    tracing::info!("saved pre-restore copy at {}", destination.display());
    Ok(())
}

/// Restores a backup zip over the database (`Backup.restore!/2`). Nothing
/// may have the database open.
///
/// The old database's `-wal`/`-shm` files are removed after the copy: left
/// in place, SQLite would replay the old write-ahead log onto the restored
/// file. (The Elixir restore leaves them, which corrupts a restore over a
/// database that was not checkpointed.)
pub fn restore(artifact: &Path, paths: &Paths) -> Result<PathBuf, BackupError> {
    if !artifact.exists() {
        return Err(BackupError(format!(
            "backup artifact does not exist at {}",
            artifact.display()
        )));
    }
    let stamp = timestamp(OffsetDateTime::now_utc());
    let extract_dir = temp_dir("manavault-restore", &stamp);
    std::fs::create_dir_all(&extract_dir).map_err(io("could not create the extract directory"))?;
    let result = (|| {
        archive::extract(artifact, &extract_dir)?;
        let extracted = extract_dir.join(DB_NAME);
        if !extracted.exists() {
            return Err(BackupError(format!(
                "backup artifact {} does not contain {DB_NAME}",
                artifact.display()
            )));
        }
        backup_existing_data(paths, &stamp)?;
        if let Some(parent) = paths.database_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(io("could not create the database directory"))?;
        }
        std::fs::copy(&extracted, &paths.database_path)
            .map_err(io("could not restore the database"))?;
        for (sidecar, _) in sidecars(&paths.database_path) {
            if sidecar.exists() {
                std::fs::remove_file(&sidecar).map_err(io("could not remove a stale WAL file"))?;
            }
        }
        Ok(paths.database_path.clone())
    })();
    let _ = std::fs::remove_dir_all(&extract_dir);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;
    use std::io::Write as _;

    async fn source_database(path: &Path) -> SqlitePool {
        let pool = crate::db::connect(path, 1).await.unwrap();
        sqlx::raw_sql(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE scryfall_cards (oracle_id TEXT PRIMARY KEY, name TEXT NOT NULL);
             CREATE TABLE scryfall_printings (scryfall_id TEXT PRIMARY KEY,
               oracle_id TEXT NOT NULL REFERENCES scryfall_cards(oracle_id) ON DELETE CASCADE,
               set_code TEXT NOT NULL, collector_number TEXT NOT NULL);
             CREATE TABLE scryfall_syncs (id INTEGER PRIMARY KEY, status TEXT NOT NULL, bulk_type TEXT NOT NULL);
             CREATE TABLE collection_items (id INTEGER PRIMARY KEY,
               scryfall_id TEXT NOT NULL REFERENCES scryfall_printings(scryfall_id) ON DELETE CASCADE,
               quantity INTEGER NOT NULL);
             INSERT INTO scryfall_cards VALUES ('oracle-1', 'Black Lotus');
             INSERT INTO scryfall_printings VALUES ('printing-1', 'oracle-1', 'lea', '232');
             INSERT INTO scryfall_syncs (status, bulk_type) VALUES ('completed', 'default_cards');
             INSERT INTO collection_items (scryfall_id, quantity) VALUES ('printing-1', 1);",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    async fn count(path: &Path, table: &str) -> i64 {
        let pool = crate::db::connect(path, 1).await.unwrap();
        let count =
            sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
                .fetch_one(&pool)
                .await
                .unwrap();
        pool.close().await;
        count
    }

    #[tokio::test]
    async fn backups_omit_catalog_rows_without_changing_the_source() {
        let dir = TempDir::new();
        let source = dir.path().join("source.db");
        let pool = source_database(&source).await;
        let paths = Paths {
            database_path: source.clone(),
            data_dir: dir.path().to_path_buf(),
            backups_dir: dir.path().join("backups"),
        };
        let artifact = create(&pool, &paths, Reason::Manual).await.unwrap();
        let name = artifact.file_name().unwrap().to_string_lossy().into_owned();
        assert!(
            name.starts_with("manavault-manual-") && name.ends_with("Z.zip"),
            "{name}"
        );
        let out = dir.path().join("extracted");
        std::fs::create_dir_all(&out).unwrap();
        archive::extract(&artifact, &out).unwrap();
        let manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(out.join("manifest.json")).unwrap()).unwrap();
        assert_eq!(manifest["app"], "manavault");
        assert_eq!(manifest["reason"], "manual");
        assert_eq!(manifest["includes"], json!(["manavault.db"]));
        let backup_db = out.join("manavault.db");
        for table in ["scryfall_syncs", "scryfall_printings", "scryfall_cards"] {
            assert_eq!(count(&backup_db, table).await, 0, "{table}");
            assert_eq!(count(&source, table).await, 1, "{table}");
        }
        assert_eq!(count(&backup_db, "collection_items").await, 1);
        assert_eq!(count(&source, "collection_items").await, 1);
    }

    #[tokio::test]
    async fn restore_replaces_the_database_and_keeps_a_pre_restore_copy() {
        let dir = TempDir::new();
        let source = dir.path().join("source.db");
        let pool = source_database(&source).await;
        let source_paths = Paths {
            database_path: source.clone(),
            data_dir: dir.path().to_path_buf(),
            backups_dir: dir.path().join("backups"),
        };
        let artifact = create(&pool, &source_paths, Reason::Manual).await.unwrap();
        pool.close().await;

        let data = dir.path().join("data");
        std::fs::create_dir_all(&data).unwrap();
        let target = data.join("manavault.db");
        std::fs::write(&target, b"old database").unwrap();
        std::fs::write(data.join("manavault.db-wal"), b"stale wal").unwrap();
        let paths = Paths {
            database_path: target.clone(),
            data_dir: data.clone(),
            backups_dir: data.join("backups"),
        };
        assert_eq!(restore(&artifact, &paths).unwrap(), target);
        assert!(!data.join("manavault.db-wal").exists());
        assert_eq!(count(&target, "collection_items").await, 1);
        let copies: Vec<_> = std::fs::read_dir(data.join("backups"))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(copies.len(), 1);
        let copy = copies[0].path();
        assert!(
            copy.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("pre-restore-")
        );
        assert_eq!(
            std::fs::read(copy.join("manavault.db")).unwrap(),
            b"old database"
        );
        assert_eq!(
            std::fs::read(copy.join("manavault.db-wal")).unwrap(),
            b"stale wal"
        );
    }

    #[test]
    fn restore_refuses_zip_slip_archives() {
        let dir = TempDir::new();
        let artifact = dir.path().join("malicious.zip");
        let mut writer = zip::ZipWriter::new(std::fs::File::create(&artifact).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        writer.start_file("manavault.db", options).unwrap();
        writer.write_all(b"not-a-real-db").unwrap();
        writer.start_file("../escaped.txt", options).unwrap();
        writer.write_all(b"pwned").unwrap();
        writer.finish().unwrap();
        let data = dir.path().join("data");
        let paths = Paths {
            database_path: data.join("manavault.db"),
            data_dir: data.clone(),
            backups_dir: data.join("backups"),
        };
        let error = restore(&artifact, &paths).unwrap_err();
        assert!(error.to_string().contains("escapes"));
        assert!(!paths.database_path.exists());
    }
}
