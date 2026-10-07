//! The owner GraphQL API (`/api/graphql`). The public share API
//! (`/share/graphql`) is `manavault_share::share::graphql`.
//!
//! Each domain crate contributes `Object` structs for its queries and
//! mutations; they are merged into the root types here.

mod system;

use async_graphql::{MergedObject, MergedSubscription, Schema, SchemaBuilder};
use manavault_core::state::AppState;

#[derive(MergedObject, Default)]
pub struct Query(
    manavault_catalog::catalog::CardQueries,
    manavault_catalog::tokens::TokenQueries,
    manavault_collection::collection::CollectionQueries,
    manavault_catalog::pricing::graphql::PricingQueries,
    manavault_core::settings::appearance::AppearanceQueries,
    manavault_core::settings::ai::AiSettingsQueries,
    manavault_core::api_keys::ApiKeyQueries,
    manavault_system::backup::graphql::BackupQueries,
    manavault_collection::decks::DeckQueries,
    manavault_deck_intel::deck_intel::DeckIntelQueries,
    manavault_trade::trade::TradeQueries,
    manavault_trade::trade::ShareListQueries,
    manavault_ai::ai::AiQueries,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    manavault_catalog::tokens::TokenMutations,
    manavault_collection::collection::CollectionMutations,
    manavault_catalog::pricing::graphql::PricingMutations,
    manavault_catalog::catalog::scryfall::graphql::ScryfallMutations,
    manavault_core::settings::appearance::AppearanceMutations,
    manavault_core::settings::ai::AiSettingsMutations,
    manavault_core::api_keys::ApiKeyMutations,
    manavault_system::backup::graphql::BackupMutations,
    manavault_collection::decks::DeckMutations,
    manavault_deck_intel::deck_intel::DeckIntelMutations,
    manavault_deck_intel::deck_intel::AllocationMutations,
    manavault_trade::trade::TradeMutations,
    manavault_ai::ai::AiMutations,
);

#[derive(MergedSubscription, Default)]
pub struct Subscription(system::SystemSubscriptions);

pub type AppSchema = Schema<Query, Mutation, Subscription>;
type AppSchemaBuilder = SchemaBuilder<Query, Mutation, Subscription>;

/// The owner schema's root types, without context or extensions.
#[must_use]
pub fn schema_builder() -> AppSchemaBuilder {
    Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
}

/// Adds the data loaders the resolvers read from the context.
#[must_use]
pub fn schema_data(builder: AppSchemaBuilder, state: &AppState) -> AppSchemaBuilder {
    builder
        .data(manavault_catalog::catalog::loader::data_loader(
            state.db.clone(),
        ))
        .data(manavault_collection::collection::loader::data_loader(
            state.db.clone(),
        ))
}

/// Builds the owner schema.
#[must_use]
pub fn build_schema(state: AppState) -> AppSchema {
    manavault_core::graphql::extensions(schema_data(schema_builder(), &state))
        .data(state)
        .finish()
}

/// The owner schema's SDL (`manavault sdl`).
#[must_use]
pub fn sdl() -> String {
    schema_builder().finish().sdl()
}
