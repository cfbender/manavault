//! This crate's test app: a fresh database and a schema of the settings and API key fields this crate contributes.

use std::ops::Deref;

use crate::config::Config;
use crate::testing::TestState;
use async_graphql::{EmptySubscription, MergedObject, Schema};

#[derive(MergedObject, Default)]
pub struct Query(
    crate::settings::appearance::AppearanceQueries,
    crate::settings::ai::AiSettingsQueries,
    crate::api_keys::ApiKeyQueries,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    crate::settings::appearance::AppearanceMutations,
    crate::settings::ai::AiSettingsMutations,
    crate::api_keys::ApiKeyMutations,
);

/// A test app over this crate's schema.
pub struct TestApp(crate::testing::TestApp<Query, Mutation>);

impl TestApp {
    /// A new app with the default test configuration.
    pub async fn new() -> Self {
        Self::with_config(|_| {}).await
    }

    /// A new app with a modified test configuration.
    pub async fn with_config(configure: impl FnOnce(&mut Config)) -> Self {
        let workers = Vec::new();
        let state = TestState::build(workers, configure).await;
        Self(crate::testing::TestApp::over(
            state,
            Schema::build(Query::default(), Mutation::default(), EmptySubscription),
            |builder, _| builder,
        ))
    }
}

impl Deref for TestApp {
    type Target = crate::testing::TestApp<Query, Mutation>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
