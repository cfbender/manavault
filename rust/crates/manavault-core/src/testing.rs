//! Test helpers shared by every crate's tests: temporary directories, an app
//! state over a fresh migrated database, a test app that runs GraphQL
//! operations against a schema the crate under test assembles from the root
//! objects it and its dependencies own, the process-wide log hub, and shared
//! cases.
//!
//! Compiled in every build (not behind a feature) so test and dev builds of
//! the crates above share one build of this crate.

#![allow(clippy::expect_used, clippy::panic)]

use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;

use async_graphql::{ObjectType, Schema, SchemaBuilder, SubscriptionType};
use serde_json::Value;

use crate::config::Config;
use crate::jobs::{DynWorker, Jobs};
use crate::logs::LogHub;
use crate::state::AppState;

/// A temporary directory removed on drop.
pub struct TempDir(PathBuf);

impl TempDir {
    #[must_use]
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

/// App state over a fresh migrated database in a temporary directory, with
/// `workers` registered on its job queue.
pub struct TestState {
    pub state: AppState,
    pub dir: TempDir,
}

impl TestState {
    /// The default test configuration and no workers.
    pub async fn new() -> Self {
        Self::build(Vec::new(), |_| {}).await
    }

    /// The default test configuration, modified by `configure`, and no
    /// workers.
    pub async fn with_config(configure: impl FnOnce(&mut Config)) -> Self {
        Self::build(Vec::new(), configure).await
    }

    pub async fn build(
        workers: Vec<Arc<dyn DynWorker>>,
        configure: impl FnOnce(&mut Config),
    ) -> Self {
        let dir = TempDir::new();
        let mut config = Config::for_tests(dir.path().to_path_buf());
        configure(&mut config);
        for path in config.writable_dirs() {
            std::fs::create_dir_all(path).expect("create dirs");
        }
        let pool = crate::db::test_pool(dir.path())
            .await
            .expect("test database");
        Self::over(config, pool, workers, dir)
    }

    /// A state whose database file is first prepared by `setup` (for example
    /// loaded from an old release's dump); it is then migrated like
    /// `manavault_server::app::build_state` does at startup.
    pub async fn with_database(
        setup: impl FnOnce(sqlx::SqlitePool) -> Pin<Box<dyn Future<Output = ()> + Send>>,
    ) -> Self {
        let dir = TempDir::new();
        let path = dir.path().join("test.db");
        let raw = crate::db::connect(&path, 1).await.expect("raw database");
        setup(raw.clone()).await;
        raw.close().await;
        let config = Config::for_tests(dir.path().to_path_buf());
        for path in config.writable_dirs() {
            std::fs::create_dir_all(path).expect("create dirs");
        }
        let pool = crate::db::connect(&path, 4).await.expect("test database");
        crate::db::prepare(&pool).await.expect("migrate");
        Self::over(config, pool, Vec::new(), dir)
    }

    fn over(
        config: Config,
        pool: sqlx::SqlitePool,
        workers: Vec<Arc<dyn DynWorker>>,
        dir: TempDir,
    ) -> Self {
        let jobs = Jobs::new(pool.clone(), workers);
        let state = AppState::new(config, pool, LogHub::new(), jobs).expect("state");
        Self { state, dir }
    }

    #[must_use]
    pub fn db(&self) -> &sqlx::SqlitePool {
        &self.state.db
    }
}

/// A test app: a [`TestState`] and a GraphQL schema over it.
///
/// Each crate's tests wrap this in their own `TestApp` whose root types merge
/// the query and mutation objects the crate and its dependencies contribute
/// to the server's schema, so the tests exercise the real resolvers without
/// linking the server (which would link a second copy of the crate under
/// test).
pub struct TestApp<Q, M, S = async_graphql::EmptySubscription> {
    pub state: AppState,
    pub schema: Schema<Q, M, S>,
    pub dir: TempDir,
}

impl<Q, M, S> TestApp<Q, M, S>
where
    Q: ObjectType + 'static,
    M: ObjectType + 'static,
    S: SubscriptionType + 'static,
{
    /// Builds the schema over `state` like the server does; `data` adds the
    /// crate's loaders and other context.
    pub fn over(
        state: TestState,
        builder: SchemaBuilder<Q, M, S>,
        data: impl FnOnce(SchemaBuilder<Q, M, S>, &AppState) -> SchemaBuilder<Q, M, S>,
    ) -> Self {
        let TestState { state, dir } = state;
        let schema = crate::graphql::extensions(data(builder, &state))
            .data(state.clone())
            .finish();
        Self { state, schema, dir }
    }

    #[must_use]
    pub fn db(&self) -> &sqlx::SqlitePool {
        &self.state.db
    }

    /// Executes a GraphQL operation and returns the full JSON response
    /// (`data` and `errors`).
    pub async fn gql(&self, query: &str, variables: Value) -> Value {
        let request = async_graphql::Request::new(query)
            .variables(async_graphql::Variables::from_json(variables));
        let response = self.schema.execute(request).await;
        serde_json::to_value(&response).expect("serializable response")
    }

    /// Like [`Self::gql`], but panics on errors and returns `data`.
    pub async fn gql_data(&self, query: &str, variables: Value) -> Value {
        let response = self.gql(query, variables).await;
        if let Some(errors) = response.get("errors") {
            panic!("GraphQL errors: {errors}");
        }
        response.get("data").cloned().unwrap_or(Value::Null)
    }
}

/// Reads a response body as text.
pub async fn body_text(response: axum::response::Response) -> String {
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body");
    String::from_utf8_lossy(&bytes).into_owned()
}

/// The process-wide log hub for tests that assert on log lines. A global
/// subscriber is needed (a thread-scoped one races with callsite interest
/// caching in tests running in parallel), and only one can be installed, so
/// every such test must share this hub. Events from all tests arrive here;
/// filter by something unique to the test.
pub fn log_hub() -> &'static LogHub {
    use tracing_subscriber::layer::SubscriberExt as _;
    static HUB: std::sync::OnceLock<LogHub> = std::sync::OnceLock::new();
    HUB.get_or_init(|| {
        let hub = LogHub::new();
        let _ = tracing::subscriber::set_global_default(
            tracing_subscriber::registry().with(hub.layer()),
        );
        hub
    })
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
