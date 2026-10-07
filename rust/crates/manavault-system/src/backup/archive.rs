//! Backup zip files (`Manavault.Backup.Archive`). Entries are deflated
//! regular files with paths relative to the staging directory, which is
//! what Erlang's `:zip` (used by earlier releases) writes and reads, so
//! archives from any release restore here and vice versa.

use std::io::{Read as _, Write as _};
use std::path::{Component, Path, PathBuf};

use zip::write::SimpleFileOptions;

/// Why an archive could not be written or read.
#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("failed to write backup {path}: {reason}")]
    Write { path: String, reason: String },
    #[error("failed to read backup {path}: {reason}")]
    Read { path: String, reason: String },
    #[error("refusing to extract backup {path}: entry {entry:?} escapes {dir}")]
    Escapes {
        path: String,
        entry: String,
        dir: String,
    },
    #[error("failed to extract backup {path}: {reason}")]
    Extract { path: String, reason: String },
}

fn regular_files(root: &Path, dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        let path = entry.path();
        let kind = entry.file_type()?;
        if kind.is_dir() {
            regular_files(root, &path, files)?;
        } else if kind.is_file()
            && let Ok(relative) = path.strip_prefix(root)
        {
            files.push(relative.to_path_buf());
        }
    }
    Ok(())
}

/// Zips every regular file under `stage_dir` into `artifact`.
pub fn create(stage_dir: &Path, artifact: &Path) -> Result<(), ArchiveError> {
    let error = |reason: String| ArchiveError::Write {
        path: artifact.display().to_string(),
        reason,
    };
    let mut files = Vec::new();
    regular_files(stage_dir, stage_dir, &mut files).map_err(|e| error(e.to_string()))?;
    let file = std::fs::File::create(artifact).map_err(|e| error(e.to_string()))?;
    let mut writer = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(false);
    for relative in files {
        let name = relative
            .components()
            .map(|component| component.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        let source = stage_dir.join(&relative);
        let size = std::fs::metadata(&source)
            .map_err(|e| error(e.to_string()))?
            .len();
        let options = options.large_file(size >= u64::from(u32::MAX));
        writer
            .start_file(name, options)
            .map_err(|e| error(e.to_string()))?;
        let mut input = std::fs::File::open(&source).map_err(|e| error(e.to_string()))?;
        std::io::copy(&mut input, &mut writer).map_err(|e| error(e.to_string()))?;
    }
    writer.finish().map_err(|e| error(e.to_string()))?;
    Ok(())
}

/// `Path.expand(name, root)`: lexically resolves `.` and `..`.
fn expand(root: &Path, name: &str) -> PathBuf {
    let mut resolved = if Path::new(name).is_absolute() {
        PathBuf::from("/")
    } else {
        root.to_path_buf()
    };
    for component in Path::new(name).components() {
        match component {
            Component::ParentDir => {
                resolved.pop();
            }
            Component::Normal(part) => resolved.push(part),
            Component::RootDir | Component::CurDir | Component::Prefix(_) => {}
        }
    }
    resolved
}

fn lexical_root(dir: &Path) -> PathBuf {
    let absolute = if dir.is_absolute() {
        dir.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(dir)
    };
    expand(&absolute, "")
}

/// Extracts `artifact` into `extract_dir`, refusing archives with an entry
/// that would land outside it (zip-slip) before writing anything.
pub fn extract(artifact: &Path, extract_dir: &Path) -> Result<(), ArchiveError> {
    let path = artifact.display().to_string();
    let read_error = |reason: String| ArchiveError::Read {
        path: path.clone(),
        reason,
    };
    let file = std::fs::File::open(artifact).map_err(|e| read_error(e.to_string()))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| read_error(e.to_string()))?;
    let root = lexical_root(extract_dir);
    let names: Vec<String> = archive.file_names().map(str::to_owned).collect();
    for name in &names {
        let resolved = expand(&root, name);
        if resolved != root && !resolved.starts_with(&root) {
            return Err(ArchiveError::Escapes {
                path,
                entry: name.clone(),
                dir: extract_dir.display().to_string(),
            });
        }
    }
    let extract_error = |reason: String| ArchiveError::Extract {
        path: path.clone(),
        reason,
    };
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| extract_error(e.to_string()))?;
        let target = expand(&root, entry.name());
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| extract_error(e.to_string()))?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| extract_error(e.to_string()))?;
        }
        let mut contents = Vec::new();
        entry
            .read_to_end(&mut contents)
            .map_err(|e| extract_error(e.to_string()))?;
        let mut output =
            std::fs::File::create(&target).map_err(|e| extract_error(e.to_string()))?;
        output
            .write_all(&contents)
            .map_err(|e| extract_error(e.to_string()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use manavault_core::testing::TempDir;

    #[test]
    fn round_trips_nested_files() {
        let dir = TempDir::new();
        let stage = dir.path().join("stage");
        std::fs::create_dir_all(stage.join("nested")).unwrap();
        std::fs::write(stage.join("manavault.db"), b"db").unwrap();
        std::fs::write(stage.join("nested/file.txt"), b"nested").unwrap();
        let artifact = dir.path().join("backup.zip");
        create(&stage, &artifact).unwrap();
        let out = dir.path().join("out");
        std::fs::create_dir_all(&out).unwrap();
        extract(&artifact, &out).unwrap();
        assert_eq!(std::fs::read(out.join("manavault.db")).unwrap(), b"db");
        assert_eq!(
            std::fs::read(out.join("nested/file.txt")).unwrap(),
            b"nested"
        );
    }

    #[test]
    fn extracts_archives_written_by_erlangs_zip() {
        // Written by Erlang's `:zip.create/2` with `manavault.db` and
        // `manifest.json`, as earlier releases built backups.
        let dir = TempDir::new();
        let artifact = dir.path().join("erlang-backup.zip");
        std::fs::write(&artifact, include_bytes!("fixtures/erlang-backup.zip")).unwrap();
        extract(&artifact, dir.path()).unwrap();
        assert_eq!(
            std::fs::read(dir.path().join("manavault.db")).unwrap(),
            b"db-bytes"
        );
        assert_eq!(
            std::fs::read(dir.path().join("manifest.json")).unwrap(),
            br#"{"app":"manavault"}"#
        );
    }

    #[test]
    fn refuses_entries_that_escape_before_writing_anything() {
        let dir = TempDir::new();
        let artifact = dir.path().join("malicious.zip");
        let mut writer = zip::ZipWriter::new(std::fs::File::create(&artifact).unwrap());
        writer
            .start_file("manavault.db", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"not-a-real-db").unwrap();
        writer
            .start_file("../escaped.txt", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"pwned").unwrap();
        writer.finish().unwrap();
        let out = dir.path().join("out");
        std::fs::create_dir_all(&out).unwrap();
        let error = extract(&artifact, &out).unwrap_err();
        assert!(error.to_string().contains("escapes"), "{error}");
        assert!(!dir.path().join("escaped.txt").exists());
        assert!(!out.join("manavault.db").exists());
    }
}
