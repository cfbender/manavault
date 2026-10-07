//! Completed preview PNGs on disk (`DeckSharePreview.ArtifactStore`): one
//! `<sha256>.png` per fingerprint, written through a temporary file and a
//! rename, keeping only the newest `max_artifacts`.

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Completed artifacts kept by default.
pub const DEFAULT_MAX_ARTIFACTS: usize = 500;
const TEMPORARY_MARKER: &str = ".tmp-";

/// `<cache_dir>/<fingerprint>.png`.
#[must_use]
pub fn path(cache_dir: &Path, fingerprint: &str) -> PathBuf {
    cache_dir.join(format!("{fingerprint}.png"))
}

/// The artifact for `fingerprint`, if it was completed.
pub fn read(cache_dir: &Path, fingerprint: &str) -> std::io::Result<Vec<u8>> {
    std::fs::read(path(cache_dir, fingerprint))
}

/// Creates the directory, removes partial writes left by an interrupted
/// render, and prunes old artifacts (`prepare/2`).
pub fn prepare(cache_dir: &Path, max_artifacts: usize) -> std::io::Result<()> {
    std::fs::create_dir_all(cache_dir)?;
    remove_stale_temporary_files(cache_dir)?;
    prune(cache_dir, max_artifacts, None)
}

fn temporary_path(artifact: &Path) -> PathBuf {
    let mut name = artifact.as_os_str().to_owned();
    name.push(format!(
        "{TEMPORARY_MARKER}{}-{}",
        std::process::id(),
        hex::encode(manavault_core::crypto::random_bytes::<8>())
    ));
    PathBuf::from(name)
}

/// Publishes `png` for `fingerprint` atomically, then prunes the oldest
/// artifacts other than this one (`write/4`). A failed prune unpublishes it.
pub fn write(
    cache_dir: &Path,
    fingerprint: &str,
    png: &[u8],
    max_artifacts: usize,
) -> std::io::Result<()> {
    let artifact = path(cache_dir, fingerprint);
    let temporary = temporary_path(&artifact);
    let result = (|| {
        std::fs::create_dir_all(cache_dir)?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(png)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temporary, &artifact)?;
        if let Err(error) = prune(cache_dir, max_artifacts, Some(&artifact)) {
            let _ = std::fs::remove_file(&artifact);
            return Err(error);
        }
        Ok(())
    })();
    let _ = std::fs::remove_file(&temporary);
    result
}

fn remove_stale_temporary_files(cache_dir: &Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(cache_dir)? {
        let entry = entry?;
        if !entry
            .file_name()
            .to_string_lossy()
            .contains(TEMPORARY_MARKER)
        {
            continue;
        }
        match std::fs::symlink_metadata(entry.path()) {
            Ok(metadata) if metadata.is_dir() => {}
            Ok(_) => match std::fs::remove_file(entry.path()) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
                _ => {}
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

/// `<64 lowercase hex>.png`.
fn completed_artifact_name(name: &str) -> bool {
    name.strip_suffix(".png").is_some_and(|fingerprint| {
        fingerprint.len() == 64
            && fingerprint
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn prune(cache_dir: &Path, max_artifacts: usize, preserve: Option<&Path>) -> std::io::Result<()> {
    let mut artifacts: Vec<(SystemTime, PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(cache_dir)? {
        let entry = entry?;
        if !completed_artifact_name(&entry.file_name().to_string_lossy()) {
            continue;
        }
        match std::fs::symlink_metadata(entry.path()) {
            Ok(metadata) if metadata.is_file() => {
                artifacts.push((metadata.modified()?, entry.path()));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    let excess = artifacts.len().saturating_sub(max_artifacts);
    artifacts.retain(|(_, path)| Some(path.as_path()) != preserve);
    artifacts.sort();
    for (_, path) in artifacts.into_iter().take(excess) {
        match std::fs::remove_file(&path) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use manavault_core::testing::TempDir;

    fn touch(path: &Path, seconds: u64) {
        let file = std::fs::File::options().write(true).open(path).unwrap();
        file.set_modified(SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(seconds))
            .unwrap();
    }

    // "retention prunes the oldest artifacts without deleting the published artifact"
    #[test]
    fn retention_prunes_the_oldest_but_keeps_the_published_artifact() {
        let dir = TempDir::new();
        let (oldest, middle, current) = ("a".repeat(64), "b".repeat(64), "c".repeat(64));
        write(dir.path(), &oldest, b"oldest", 2).unwrap();
        touch(&path(dir.path(), &oldest), 1_577_836_800);
        write(dir.path(), &middle, b"middle", 2).unwrap();
        touch(&path(dir.path(), &middle), 1_609_459_200);
        write(dir.path(), &current, b"current", 2).unwrap();
        assert!(!path(dir.path(), &oldest).exists());
        assert_eq!(read(dir.path(), &middle).unwrap(), b"middle");
        assert_eq!(read(dir.path(), &current).unwrap(), b"current");
        let leftovers: Vec<_> = std::fs::read_dir(dir.path()).unwrap().collect();
        assert_eq!(leftovers.len(), 2);
    }

    #[test]
    fn prepare_removes_partial_writes_only() {
        let dir = TempDir::new();
        let stale = dir.path().join("orphan.png.tmp-interrupted");
        std::fs::write(&stale, "partial").unwrap();
        let keep = dir.path().join("notes.txt");
        std::fs::write(&keep, "keep").unwrap();
        prepare(dir.path(), 500).unwrap();
        assert!(!stale.exists());
        assert!(keep.exists());
    }
}
