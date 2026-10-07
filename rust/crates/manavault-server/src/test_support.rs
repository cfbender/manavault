//! Helpers for tests: a fresh database and app per test, GraphQL execution,
//! HTTP requests through the router, and Scryfall card fixtures.

use std::path::{Path, PathBuf};

use axum::body::Body;
use axum::http::{Request, Response};
use serde_json::Value;
use tower::ServiceExt as _;

use crate::config::Config;
use crate::graphql::AppSchema;
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

/// A test application over a fresh database.
pub struct TestApp {
    pub state: AppState,
    pub schema: AppSchema,
    pub dir: TempDir,
}

impl TestApp {
    /// A new app with the default test configuration.
    pub async fn new() -> Self {
        Self::with_config(|_| {}).await
    }

    /// A new app with a modified test configuration.
    #[allow(clippy::expect_used)]
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
        let jobs = Jobs::new(pool.clone(), crate::app::workers());
        let state = AppState::new(config, pool, LogHub::new(), jobs).expect("state");
        let schema = crate::graphql::build_schema(state.clone());
        Self { state, schema, dir }
    }

    /// A new app whose database file is first prepared by `setup` (for
    /// example loaded from an old release's dump); the server then migrates
    /// it at startup like `app::build_state` does.
    #[allow(clippy::expect_used)]
    pub async fn with_database(
        setup: impl FnOnce(
            sqlx::SqlitePool,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>,
    ) -> Self {
        let dir = TempDir::new();
        let raw = crate::db::connect(&dir.path().join("test.db"), 1)
            .await
            .expect("raw database");
        setup(raw.clone()).await;
        raw.close().await;
        let config = Config::for_tests(dir.path().to_path_buf());
        for path in config.writable_dirs() {
            std::fs::create_dir_all(path).expect("create dirs");
        }
        let pool = crate::db::connect(&dir.path().join("test.db"), 4)
            .await
            .expect("test database");
        crate::db::prepare(&pool).await.expect("migrate");
        let jobs = Jobs::new(pool.clone(), crate::app::workers());
        let state = AppState::new(config, pool, LogHub::new(), jobs).expect("state");
        let schema = crate::graphql::build_schema(state.clone());
        Self { state, schema, dir }
    }

    #[must_use]
    pub fn db(&self) -> &sqlx::SqlitePool {
        &self.state.db
    }

    /// Executes a GraphQL operation against the owner schema and returns the
    /// full JSON response (`data` and `errors`).
    #[allow(clippy::expect_used)]
    pub async fn gql(&self, query: &str, variables: Value) -> Value {
        let request = async_graphql::Request::new(query)
            .variables(async_graphql::Variables::from_json(variables));
        let response = self.schema.execute(request).await;
        serde_json::to_value(&response).expect("serializable response")
    }

    /// Like [`Self::gql`], but panics on errors and returns `data`.
    #[allow(clippy::panic)]
    pub async fn gql_data(&self, query: &str, variables: Value) -> Value {
        let response = self.gql(query, variables).await;
        if let Some(errors) = response.get("errors") {
            panic!("GraphQL errors: {errors}");
        }
        response.get("data").cloned().unwrap_or(Value::Null)
    }

    /// The router for HTTP tests.
    #[must_use]
    pub fn router(&self) -> axum::Router {
        crate::app::router(self.state.clone())
    }

    /// Sends one request through the router.
    #[allow(clippy::expect_used)]
    pub async fn request(&self, request: Request<Body>) -> Response<Body> {
        self.router().oneshot(request).await.expect("infallible")
    }

    /// Imports Scryfall card JSON (`Catalog.import_cards/1`).
    #[allow(clippy::expect_used)]
    pub async fn import_cards(&self, cards: &[Value]) {
        let cards: Vec<lotus::scryfall::ScryfallCard> = cards
            .iter()
            .map(|card| serde_json::from_value(card.clone()).expect("valid Scryfall card"))
            .collect();
        crate::catalog::scryfall::import::import_cards(&self.state.db, cards)
            .await
            .expect("import");
    }
}

/// The process-wide log hub for tests that assert on log lines. A global
/// subscriber is needed (a thread-scoped one races with callsite interest
/// caching in tests running in parallel), and only one can be installed, so
/// every such test must share this hub. Events from all tests arrive here;
/// filter by something unique to the test.
pub fn log_hub() -> &'static crate::logs::LogHub {
    use tracing_subscriber::layer::SubscriberExt as _;
    static HUB: std::sync::OnceLock<crate::logs::LogHub> = std::sync::OnceLock::new();
    HUB.get_or_init(|| {
        let hub = crate::logs::LogHub::new();
        let _ = tracing::subscriber::set_global_default(
            tracing_subscriber::registry().with(hub.layer()),
        );
        hub
    })
}

/// Reads a response body as text.
#[allow(clippy::expect_used)]
pub async fn body_text(response: Response<Body>) -> String {
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body");
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Card fixtures shared by the tests.
pub mod fixtures {
    use serde_json::{Value, json};

    /// Shallow-merges `overrides` into `base` (`Map.merge/2`).
    #[must_use]
    pub fn merge(mut base: Value, overrides: Value) -> Value {
        if let (Some(base), Value::Object(overrides)) = (base.as_object_mut(), overrides) {
            for (key, value) in overrides {
                base.insert(key, value);
            }
        }
        base
    }

    /// `black_lotus/0`.
    #[must_use]
    pub fn black_lotus() -> Value {
        json!({
            "id": "scryfall-printing-1",
            "oracle_id": "oracle-1",
            "name": "Black Lotus",
            "type_line": "Artifact",
            "oracle_text": "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
            "mana_cost": "{0}",
            "cmc": 0.0,
            "colors": [],
            "color_identity": [],
            "legalities": {"vintage": "restricted"},
            "games": ["paper"],
            "edhrec_rank": 1,
            "set": "lea",
            "set_name": "Limited Edition Alpha",
            "collector_number": "232",
            "lang": "en",
            "rarity": "rare",
            "finishes": ["nonfoil"],
            "image_uris": {"normal": "https://example.test/black-lotus.jpg"},
            "prices": {"usd": "100000.00"},
            "released_at": "1993-08-05",
            "rulings_uri": "https://api.scryfall.com/cards/oracle-1/rulings"
        })
    }

    /// `black_lotus_beta/0`.
    #[must_use]
    pub fn black_lotus_beta() -> Value {
        merge(
            black_lotus(),
            json!({
                "id": "scryfall-printing-3",
                "set": "leb",
                "set_name": "Limited Edition Beta",
                "collector_number": "233",
                "released_at": "1993-10-04"
            }),
        )
    }

    /// `time_walk/0`.
    #[must_use]
    pub fn time_walk() -> Value {
        json!({
            "id": "scryfall-printing-2",
            "oracle_id": "oracle-2",
            "name": "Time Walk",
            "type_line": "Sorcery",
            "oracle_text": "Take an extra turn after this turn.",
            "mana_cost": "{1}{U}",
            "cmc": 2.0,
            "colors": ["U"],
            "color_identity": ["U"],
            "set": "lea",
            "set_name": "Limited Edition Alpha",
            "collector_number": "84",
            "lang": "ja",
            "rarity": "rare",
            "finishes": ["foil"],
            "prices": {"usd_foil": "5.00"},
            "released_at": "1993-08-05"
        })
    }

    /// `plains/0`.
    #[must_use]
    pub fn plains() -> Value {
        json!({
            "id": "scryfall-printing-basic-plains",
            "oracle_id": "oracle-plains",
            "name": "Plains",
            "type_line": "Basic Land — Plains",
            "cmc": 0.0,
            "colors": [],
            "color_identity": ["W"],
            "set": "lea",
            "set_name": "Limited Edition Alpha",
            "collector_number": "250",
            "lang": "en",
            "rarity": "common",
            "finishes": ["nonfoil"],
            "released_at": "1993-08-05"
        })
    }

    /// `legal_commander_card/0`.
    #[must_use]
    pub fn legal_commander_card() -> Value {
        merge(
            time_walk(),
            json!({
                "id": "scryfall-printing-test-commander",
                "oracle_id": "oracle-test-commander",
                "name": "Test Commander",
                "type_line": "Legendary Creature — Cat",
                "colors": ["W"],
                "color_identity": ["W"],
                "legalities": {"commander": "legal"},
                "set": "tst",
                "set_name": "Test Set",
                "collector_number": "1",
                "lang": "en",
                "finishes": ["nonfoil"],
                "prices": {},
                "released_at": "2026-01-01"
            }),
        )
    }

    /// A card with overrides applied to `black_lotus/0`.
    #[must_use]
    pub fn card(overrides: Value) -> Value {
        merge(black_lotus(), overrides)
    }
}
