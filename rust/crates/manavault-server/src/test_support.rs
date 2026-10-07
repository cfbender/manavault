//! Helpers for this crate's tests: the full owner schema and router over a
//! fresh database. Public (hidden) so the integration tests in `tests/` can
//! use them.

#![allow(clippy::expect_used)]

use std::future::Future;
use std::ops::Deref;
use std::pin::Pin;

use axum::body::Body;
use axum::http::{Request, Response};
use manavault_core::config::Config;
use manavault_core::testing::TestState;
use serde_json::Value;
use tower::ServiceExt as _;

use crate::graphql::{Mutation, Query, Subscription};

/// A test app over the owner schema with every worker registered.
pub struct TestApp(manavault_core::testing::TestApp<Query, Mutation, Subscription>);

impl TestApp {
    /// A new app with the default test configuration.
    pub async fn new() -> Self {
        Self::with_config(|_| {}).await
    }

    /// A new app with a modified test configuration.
    pub async fn with_config(configure: impl FnOnce(&mut Config)) -> Self {
        Self::over(TestState::build(crate::app::workers(), configure).await)
    }

    /// A new app whose database file is first prepared by `setup` (for
    /// example loaded from an old release's dump) and then migrated at
    /// startup like `app::build_state` does.
    pub async fn with_database(
        setup: impl FnOnce(sqlx::SqlitePool) -> Pin<Box<dyn Future<Output = ()> + Send>>,
    ) -> Self {
        Self::over(TestState::with_database(setup).await)
    }

    fn over(state: TestState) -> Self {
        Self(manavault_core::testing::TestApp::over(
            state,
            crate::graphql::schema_builder(),
            crate::graphql::schema_data,
        ))
    }

    /// The router for HTTP tests.
    #[must_use]
    pub fn router(&self) -> axum::Router {
        crate::app::router(self.state.clone())
    }

    /// Sends one request through the router.
    pub async fn request(&self, request: Request<Body>) -> Response<Body> {
        self.router().oneshot(request).await.expect("infallible")
    }

    /// Imports Scryfall card JSON into the catalog.
    pub async fn import_cards(&self, cards: &[Value]) {
        manavault_catalog::testing::import_cards(self.db(), cards).await;
    }
}

impl Deref for TestApp {
    type Target = manavault_core::testing::TestApp<Query, Mutation, Subscription>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
