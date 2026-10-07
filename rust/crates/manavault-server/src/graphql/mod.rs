//! The owner GraphQL API (`/api/graphql`, `ManavaultWeb.Schema`) and the
//! public share API (`/share/graphql`, `ManavaultWeb.PublicShareSchema`).
//!
//! Each domain module contributes `Object` structs for its queries and
//! mutations; they are merged into the root types here.

mod system;

use async_graphql::{MergedObject, MergedSubscription, Schema};

use crate::state::AppState;

pub use manavault_core::graphql::*;

#[derive(MergedObject, Default)]
pub struct Query(
    crate::catalog::CardQueries,
    crate::tokens::TokenQueries,
    crate::collection::CollectionQueries,
    crate::pricing::graphql::PricingQueries,
    crate::settings::appearance::AppearanceQueries,
    crate::settings::ai::AiSettingsQueries,
    crate::api_keys::ApiKeyQueries,
    crate::backup::graphql::BackupQueries,
    crate::decks::DeckQueries,
    crate::deck_intel::DeckIntelQueries,
    crate::trade::TradeQueries,
    crate::trade::ShareListQueries,
    crate::ai::AiQueries,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    crate::tokens::TokenMutations,
    crate::collection::CollectionMutations,
    crate::pricing::graphql::PricingMutations,
    crate::catalog::scryfall::graphql::ScryfallMutations,
    crate::settings::appearance::AppearanceMutations,
    crate::settings::ai::AiSettingsMutations,
    crate::api_keys::ApiKeyMutations,
    crate::backup::graphql::BackupMutations,
    crate::decks::DeckMutations,
    crate::deck_intel::DeckIntelMutations,
    crate::deck_intel::AllocationMutations,
    crate::trade::TradeMutations,
    crate::ai::AiMutations,
);

#[derive(MergedSubscription, Default)]
pub struct Subscription(system::SystemSubscriptions);

pub type AppSchema = Schema<Query, Mutation, Subscription>;

/// Builds the owner schema.
#[must_use]
pub fn build_schema(state: AppState) -> AppSchema {
    Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
    .data(crate::catalog::loader::data_loader(state.db.clone()))
    .data(crate::collection::loader::data_loader(state.db.clone()))
    .data(state)
    .extension(order::ResponseOrder)
    .extension(nullable_errors::NullableErrors)
    .extension(undefined_variables::UndefinedVariables)
    .finish()
}

/// The owner schema's SDL, for structural comparison
/// (`rust/scripts/sdl_diff.py`).
#[must_use]
pub fn sdl() -> String {
    Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
    .finish()
    .sdl()
}
