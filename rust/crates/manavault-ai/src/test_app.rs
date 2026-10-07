//! This crate's test app: a fresh database and a schema of the AI fields over the trade, collection, catalog, and core fields.

use std::ops::Deref;

use async_graphql::{EmptySubscription, MergedObject, Schema};
use manavault_core::config::Config;
use manavault_core::testing::TestState;
use serde_json::Value;

#[derive(MergedObject, Default)]
pub struct Query(
    manavault_core::settings::appearance::AppearanceQueries,
    manavault_core::settings::ai::AiSettingsQueries,
    manavault_core::api_keys::ApiKeyQueries,
    manavault_catalog::catalog::CardQueries,
    manavault_catalog::tokens::TokenQueries,
    manavault_catalog::pricing::graphql::PricingQueries,
    manavault_collection::collection::CollectionQueries,
    manavault_collection::decks::DeckQueries,
    manavault_trade::trade::TradeQueries,
    manavault_trade::trade::ShareListQueries,
    crate::ai::AiQueries,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    manavault_core::settings::appearance::AppearanceMutations,
    manavault_core::settings::ai::AiSettingsMutations,
    manavault_core::api_keys::ApiKeyMutations,
    manavault_catalog::tokens::TokenMutations,
    manavault_catalog::pricing::graphql::PricingMutations,
    manavault_catalog::catalog::scryfall::graphql::ScryfallMutations,
    manavault_collection::collection::CollectionMutations,
    manavault_collection::decks::DeckMutations,
    manavault_trade::trade::TradeMutations,
    crate::ai::AiMutations,
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
        let workers = manavault_catalog::workers()
            .into_iter()
            .chain(manavault_collection::workers())
            .chain(crate::workers())
            .collect();
        let state = TestState::build(workers, configure).await;
        Self(manavault_core::testing::TestApp::over(
            state,
            Schema::build(Query::default(), Mutation::default(), EmptySubscription),
            |builder, state| {
                builder
                    .data(manavault_catalog::catalog::loader::data_loader(
                        state.db.clone(),
                    ))
                    .data(manavault_collection::collection::loader::data_loader(
                        state.db.clone(),
                    ))
            },
        ))
    }

    /// Imports Scryfall card JSON into the catalog.
    pub async fn import_cards(&self, cards: &[Value]) {
        manavault_catalog::testing::import_cards(self.db(), cards).await;
    }
}

impl Deref for TestApp {
    type Target = manavault_core::testing::TestApp<Query, Mutation>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
