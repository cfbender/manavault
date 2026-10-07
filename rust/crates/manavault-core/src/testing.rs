//! Test helpers: temporary directories, an app state over a fresh database
//! without workers or a schema (for this crate's own tests), and shared
//! cases. Other crates reach them through `manavault-server`'s
//! `test-support` feature.

#![allow(clippy::expect_used)]

use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::jobs::Jobs;
use crate::logs::LogHub;
use crate::state::AppState;

/// A temporary directory removed on drop.
pub struct TempDir(PathBuf);

impl TempDir {
    #[must_use]
    #[allow(clippy::expect_used)]
    pub fn new() -> Self {
        let name = format!(
            "manavault-test-{}",
            hex::encode(crate::crypto::random_bytes::<8>())
        );
        let path = std::env::temp_dir().join(name);
        std::fs::create_dir_all(&path).expect("create temp dir");
        Self(path)
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Default for TempDir {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// App state over a fresh migrated database, with no workers registered.
pub struct TestState {
    pub state: AppState,
    pub dir: TempDir,
}

impl TestState {
    pub async fn new() -> Self {
        Self::with_config(|_| {}).await
    }

    pub async fn with_config(configure: impl FnOnce(&mut Config)) -> Self {
        let dir = TempDir::new();
        let mut config = Config::for_tests(dir.path().to_path_buf());
        configure(&mut config);
        for path in config.writable_dirs() {
            std::fs::create_dir_all(path).expect("create dirs");
        }
        let pool = crate::db::test_pool(dir.path())
            .await
            .expect("test database");
        let jobs = Jobs::new(pool.clone(), Vec::new());
        let state = AppState::new(config, pool, LogHub::new(), jobs).expect("state");
        Self { state, dir }
    }

    #[must_use]
    pub fn db(&self) -> &sqlx::SqlitePool {
        &self.state.db
    }
}

/// `web::return_path` cases: `(description, requested, expected)`.
pub const RETURN_PATH_CASES: [(&str, &str, &str); 17] = [
    ("root path", "/", "/"),
    ("nested path", "/collection/decks", "/collection/decks"),
    (
        "path with query and fragment",
        "/collection/decks?view=grid#inventory",
        "/collection/decks?view=grid#inventory",
    ),
    ("protocol-relative URL", "//evil.example/collection", "/"),
    ("absolute URL", "https://evil.example/collection", "/"),
    ("scheme-like URL", "javascript:alert(1)", "/"),
    (
        "userinfo authority",
        "//owner:secret@evil.example/collection",
        "/",
    ),
    ("raw backslash authority", "/\\evil.example/collection", "/"),
    (
        "mixed slash and backslash authority",
        "/\\//evil.example/collection",
        "/",
    ),
    (
        "percent-encoded backslash authority",
        "/%5Cevil.example/collection",
        "/",
    ),
    (
        "double-encoded backslash authority",
        "/%255Cevil.example/collection",
        "/",
    ),
    (
        "percent-encoded protocol-relative URL",
        "/%2F%2Fevil.example/collection",
        "/",
    ),
    (
        "double-encoded protocol-relative URL",
        "/%252F%252Fevil.example/collection",
        "/",
    ),
    (
        "percent-encoded mixed authority",
        "/%255C%252Fevil.example/collection",
        "/",
    ),
    (
        "control characters",
        "/collection\r\nLocation: https://evil.example",
        "/",
    ),
    ("truncated percent escape", "/collection%", "/"),
    ("invalid percent escape", "/collection%ZZ", "/"),
];
