//! This crate's test app: a fresh database and a schema of the backup fields over the core fields.

use std::ops::Deref;

use async_graphql::{EmptySubscription, MergedObject, Schema};
use manavault_core::config::Config;
use manavault_core::testing::TestState;

#[derive(MergedObject, Default)]
pub struct Query(
    manavault_core::settings::appearance::AppearanceQueries,
    manavault_core::settings::ai::AiSettingsQueries,
    manavault_core::api_keys::ApiKeyQueries,
    crate::backup::graphql::BackupQueries,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    manavault_core::settings::appearance::AppearanceMutations,
    manavault_core::settings::ai::AiSettingsMutations,
    manavault_core::api_keys::ApiKeyMutations,
    crate::backup::graphql::BackupMutations,
);

/// A test app over this crate's schema.
pub struct TestApp(manavault_core::testing::TestApp<Query, Mutation>);

impl TestApp {
    /// A new app with the default test configuration.
    pub async fn new() -> Self {
        Self::with_config(|_| {}).await
    }

    /// A new app with a modified test configuration.
    pub async fn with_config(configure: impl FnOnce(&mut Config)) -> Self {
        let workers = crate::workers();
        let state = TestState::build(workers, configure).await;
        Self(manavault_core::testing::TestApp::over(
            state,
            Schema::build(Query::default(), Mutation::default(), EmptySubscription),
            |builder, _| builder,
        ))
    }
}

impl Deref for TestApp {
    type Target = manavault_core::testing::TestApp<Query, Mutation>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
