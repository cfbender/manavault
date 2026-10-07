//! Portable data backups (`Manavault.Backup`): local zips, scheduled cloud
//! backups to S3 or Google Drive, and cloud restores staged for the next
//! boot. Archives are interchangeable with those of earlier releases.

pub mod archive;
pub mod cloud;
pub mod cron;
pub mod google_drive;
pub mod graphql;
pub mod local;
pub mod migration_backup;
pub mod retention;
pub mod s3;
pub mod settings;
pub mod snapshot;
pub mod worker;

use std::path::Path;

pub use local::{BackupError, Paths, Reason};

/// A backup in cloud storage.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Remote {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub size: Option<i64>,
    /// ISO 8601 text, as `DateTime.to_iso8601/1` renders it.
    pub modified_at: Option<String>,
}

/// A provider timestamp as `DateTime.from_iso8601/1` followed by
/// `DateTime.to_iso8601/1` renders it: UTC, fractional digits kept.
#[must_use]
pub fn parse_remote_datetime(value: &str) -> Option<String> {
    let at =
        time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339).ok()?;
    if value.ends_with('Z') || value.ends_with('z') {
        Some(value.to_owned())
    } else {
        Some(manavault_core::timefmt::utc_seconds(at))
    }
}

/// Writes a downloaded file, creating its directory.
pub fn write_file(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(destination, bytes).map_err(|e| e.to_string())
}
