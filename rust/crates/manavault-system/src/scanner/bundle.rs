//! The card scanner model bundle on disk (`Manavault.Scanner.Bundle`).
//!
//! Layout under `DATA_DIR/scanner`: one directory per version, a `current`
//! symlink to the active one, a `previous` symlink to the one before, and
//! `corrections/` for training data (never pruned).

use std::io::Write as _;
use std::path::{Path, PathBuf};

use serde_json::Value;

/// Files a bundle may contain.
pub const FILES: [&str; 7] = [
    "manifest.json",
    "arts.json",
    "detector.onnx",
    "embed.onnx",
    "search.onnx",
    "printings.json",
    "SHA256SUMS",
];
const REQUIRED: [&str; 4] = ["arts.json", "detector.onnx", "embed.onnx", "search.onnx"];

/// Why an installation failed.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum InstallError {
    #[error("invalid_version")]
    InvalidVersion,
    #[error("invalid_manifest")]
    InvalidManifest,
    #[error("invalid_file {0}")]
    InvalidFile(String),
    #[error("gzip_failed {0}")]
    GzipFailed(String),
    #[error("publish_failed {0}")]
    PublishFailed(String),
    #[error("symlink_failed {0}")]
    SymlinkFailed(String),
}

/// A version directory name: `[A-Za-z0-9][A-Za-z0-9._-]*`, and not one of the
/// reserved names beside the versions.
#[must_use]
pub fn valid_version(version: &str) -> bool {
    let mut chars = version.chars();
    !matches!(version, "current" | "previous" | "corrections")
        && chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// The active bundle's manifest.
#[must_use]
pub fn current_manifest(root: &Path) -> Option<Value> {
    let contents = std::fs::read(root.join("current").join("manifest.json")).ok()?;
    let manifest: Value = serde_json::from_slice(&contents).ok()?;
    let version = manifest.get("version")?.as_str()?;
    valid_version(version).then_some(manifest)
}

fn current_version(root: &Path) -> Option<String> {
    current_manifest(root).and_then(|manifest| manifest.get("version")?.as_str().map(str::to_owned))
}

/// A bundle file that exists.
#[must_use]
pub fn file_path(root: &Path, version: &str, name: &str) -> Option<PathBuf> {
    let path = root.join(version).join(name);
    (valid_version(version) && FILES.contains(&name) && path.is_file()).then_some(path)
}

/// The gzipped `arts.json`, created on first use for older bundles.
#[must_use]
pub fn ensure_gzip(root: &Path, version: &str, name: &str) -> Option<PathBuf> {
    if name != "arts.json" {
        return None;
    }
    ensure_gzip_path(&file_path(root, version, name)?).ok()
}

fn ensure_gzip_path(source: &Path) -> Result<PathBuf, InstallError> {
    let gzip_path = PathBuf::from(format!("{}.gz", source.display()));
    if gzip_path.is_file() {
        return Ok(gzip_path);
    }
    let temporary = PathBuf::from(format!(
        "{}.tmp-{}",
        gzip_path.display(),
        hex::encode(manavault_core::crypto::random_bytes::<6>())
    ));
    let result = (|| -> std::io::Result<()> {
        let contents = std::fs::read(source)?;
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&contents)?;
        std::fs::write(&temporary, encoder.finish()?)?;
        std::fs::rename(&temporary, &gzip_path)
    })();
    match result {
        Ok(()) => Ok(gzip_path),
        Err(error) => {
            let _ = std::fs::remove_file(&temporary);
            Err(InstallError::GzipFailed(error.to_string()))
        }
    }
}

fn validate_manifest(manifest: &Value) -> Result<&serde_json::Map<String, Value>, InstallError> {
    let files = manifest
        .get("files")
        .and_then(Value::as_object)
        .ok_or(InstallError::InvalidManifest)?;
    if REQUIRED.iter().all(|name| files.contains_key(*name)) {
        Ok(files)
    } else {
        Err(InstallError::InvalidManifest)
    }
}

fn file_sha256(path: &Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).ok()?;
    Some(hex::encode(hasher.finalize()))
}

fn verify_files(
    files: &serde_json::Map<String, Value>,
    directory: &Path,
) -> Result<(), InstallError> {
    if !directory.join("manifest.json").is_file() || !directory.join("SHA256SUMS").is_file() {
        return Err(InstallError::InvalidManifest);
    }
    for (name, metadata) in files {
        let invalid = || InstallError::InvalidFile(name.clone());
        if !FILES.contains(&name.as_str())
            || matches!(name.as_str(), "manifest.json" | "SHA256SUMS")
        {
            return Err(invalid());
        }
        let bytes = metadata
            .get("bytes")
            .and_then(Value::as_u64)
            .ok_or_else(invalid)?;
        let expected = metadata
            .get("sha256")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        let path = directory.join(name);
        let size = std::fs::metadata(&path).map_err(|_| invalid())?.len();
        let actual = file_sha256(&path).ok_or_else(invalid)?;
        if size != bytes
            || !manavault_core::crypto::secure_compare(
                expected.to_lowercase().as_bytes(),
                actual.as_bytes(),
            )
        {
            return Err(invalid());
        }
    }
    Ok(())
}

fn publish_directory(root: &Path, version: &str, incoming: &Path) -> Result<PathBuf, InstallError> {
    let destination = root.join(version);
    match std::fs::rename(incoming, &destination) {
        Ok(()) => Ok(destination),
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::AlreadyExists | std::io::ErrorKind::DirectoryNotEmpty
            ) =>
        {
            Ok(destination)
        }
        Err(error) => Err(InstallError::PublishFailed(error.to_string())),
    }
}

fn swap_symlink(root: &Path, name: &str, target: &str) -> Result<(), InstallError> {
    let temporary = root.join(format!(
        ".{name}-{}",
        hex::encode(manavault_core::crypto::random_bytes::<6>())
    ));
    let result = std::os::unix::fs::symlink(target, &temporary)
        .and_then(|()| std::fs::rename(&temporary, root.join(name)));
    result.map_err(|error| {
        let _ = std::fs::remove_file(&temporary);
        InstallError::SymlinkFailed(error.to_string())
    })
}

fn activate(root: &Path, version: &str) -> Result<(), InstallError> {
    let previous = current_version(root);
    swap_symlink(root, "current", version)?;
    match previous {
        Some(previous) if previous != version => swap_symlink(root, "previous", &previous),
        _ => Ok(()),
    }
}

fn symlink_version(root: &Path, name: &str) -> Option<String> {
    std::fs::read_link(root.join(name))
        .ok()
        .map(|target| target.display().to_string())
}

fn prune_versions(root: &Path) {
    let keep = [current_version(root), symlink_version(root, "previous")];
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if valid_version(&name) && !keep.iter().flatten().any(|kept| *kept == name) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// Verifies `incoming` against the manifest and atomically activates it.
pub fn install(root: &Path, manifest: &Value, incoming: &Path) -> Result<PathBuf, InstallError> {
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .ok_or(InstallError::InvalidManifest)?;
    if !valid_version(version) {
        return Err(InstallError::InvalidVersion);
    }
    let files = validate_manifest(manifest)?;
    verify_files(files, incoming)?;
    ensure_gzip_path(&incoming.join("arts.json"))?;
    std::fs::create_dir_all(root)
        .map_err(|error| InstallError::PublishFailed(error.to_string()))?;
    let destination = publish_directory(root, version, incoming)?;
    activate(root, version)?;
    prune_versions(root);
    Ok(destination)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use manavault_core::testing::TempDir;
    use serde_json::json;
    use std::collections::BTreeMap;

    pub fn sha(body: &str) -> String {
        manavault_core::crypto::sha256_hex(body.as_bytes())
    }

    /// Writes an incoming bundle and returns its manifest and directory.
    pub fn bundle(root: &Path, version: &str, overrides: &[(&str, &str)]) -> (Value, PathBuf) {
        let mut files: BTreeMap<&str, &str> = BTreeMap::from([
            ("arts.json", "[]"),
            ("detector.onnx", "detector"),
            ("embed.onnx", "embed"),
            ("search.onnx", "search"),
        ]);
        let tampered = !overrides.is_empty();
        for (name, body) in overrides {
            files.insert(name, body);
        }
        let manifest = json!({
            "version": version,
            "created": "now",
            "gallery": {},
            "constants": {},
            "files": files.iter().map(|(name, body)| {
                ((*name).to_owned(), json!({"bytes": body.len(), "sha256": sha(body)}))
            }).collect::<serde_json::Map<_, _>>()
        });
        let incoming = root.join(".incoming").join(format!("{version}-test"));
        std::fs::create_dir_all(&incoming).unwrap();
        for (name, body) in &files {
            let contents = if *name == "arts.json" && tampered {
                "bad"
            } else {
                body
            };
            std::fs::write(incoming.join(name), contents).unwrap();
        }
        std::fs::write(incoming.join("manifest.json"), manifest.to_string()).unwrap();
        std::fs::write(incoming.join("SHA256SUMS"), "checksums").unwrap();
        (manifest, incoming)
    }

    #[test]
    fn rejects_a_checksum_mismatch() {
        let dir = TempDir::new();
        let (manifest, incoming) = bundle(dir.path(), "v1", &[("arts.json", "tampered")]);
        assert_eq!(
            install(dir.path(), &manifest, &incoming),
            Err(InstallError::InvalidFile("arts.json".into()))
        );
        assert_eq!(current_manifest(dir.path()), None);
    }

    #[test]
    fn swaps_current_keeps_previous_and_prunes_older_versions() {
        let dir = TempDir::new();
        std::fs::create_dir_all(dir.path().join("corrections/capture")).unwrap();
        for version in ["v1", "v2", "v3"] {
            let (manifest, incoming) = bundle(dir.path(), version, &[]);
            install(dir.path(), &manifest, &incoming).unwrap();
        }
        assert_eq!(current_manifest(dir.path()).unwrap()["version"], "v3");
        assert_eq!(
            std::fs::read_link(dir.path().join("current")).unwrap(),
            PathBuf::from("v3")
        );
        assert_eq!(
            std::fs::read_link(dir.path().join("previous")).unwrap(),
            PathBuf::from("v2")
        );
        assert!(!dir.path().join("v1").exists());
        assert!(dir.path().join("corrections/capture").is_dir());
        let corrections = json!({"version": "corrections", "files": {}});
        assert_eq!(
            install(dir.path(), &corrections, dir.path()),
            Err(InstallError::InvalidVersion)
        );
    }

    #[test]
    fn creates_a_compressed_arts_file_during_installation() {
        let dir = TempDir::new();
        let (manifest, incoming) = bundle(dir.path(), "v1", &[]);
        install(dir.path(), &manifest, &incoming).unwrap();
        let gzip_path = ensure_gzip(dir.path(), "v1", "arts.json").unwrap();
        let mut decoded = String::new();
        std::io::Read::read_to_string(
            &mut flate2::read::GzDecoder::new(std::fs::File::open(gzip_path).unwrap()),
            &mut decoded,
        )
        .unwrap();
        assert_eq!(decoded, "[]");
        assert_eq!(file_path(dir.path(), "v1", "arts.json.gz"), None);
        assert_eq!(file_path(dir.path(), "../v1", "arts.json"), None);
    }
}
