//! The owner GraphQL API (`/api/graphql`, `ManavaultWeb.Schema`) and the
//! public share API (`/share/graphql`, `ManavaultWeb.PublicShareSchema`).
//!
//! Each domain module contributes `Object` structs for its queries and
//! mutations; they are merged into the Absinthe-named root types here.

pub mod relay;
pub mod scalars;
mod system;

use async_graphql::{Context, MergedObject, MergedSubscription, Schema};

use crate::state::AppState;

pub use relay::{LocationRef, NodeKind, PageArgs, global_id};
pub use scalars::Json;

/// Resolver result type.
pub type Result<T> = async_graphql::Result<T>;

/// The app state from a resolver context.
#[must_use]
pub fn state<'a>(ctx: &Context<'a>) -> &'a AppState {
    ctx.data_unchecked::<AppState>()
}

/// Logs an internal failure (usually a database error) and returns the
/// generic resolver error clients see.
pub fn internal_error(error: impl std::fmt::Display) -> async_graphql::Error {
    tracing::error!(%error, "resolver failed");
    async_graphql::Error::new("Something went wrong.")
}

/// A resolver error with a user-facing message.
pub fn user_error(message: impl Into<String>) -> async_graphql::Error {
    async_graphql::Error::new(message.into())
}

#[derive(MergedObject, Default)]
#[graphql(name = "RootQueryType")]
pub struct Query(
    system::SystemQueries,
    crate::catalog::CardQueries,
    crate::tokens::TokenQueries,
    crate::pricing::graphql::PricingQueries,
    crate::settings::appearance::AppearanceQueries,
    crate::settings::ai::AiSettingsQueries,
    crate::api_keys::ApiKeyQueries,
    crate::backup::graphql::BackupQueries,
    crate::trade::TradeQueries,
    crate::trade::ShareListQueries,
);

#[derive(MergedObject, Default)]
#[graphql(name = "RootMutationType")]
pub struct Mutation(
    system::SystemMutations,
    crate::tokens::TokenMutations,
    crate::pricing::graphql::PricingMutations,
    crate::catalog::scryfall::graphql::ScryfallMutations,
    crate::settings::appearance::AppearanceMutations,
    crate::settings::ai::AiSettingsMutations,
    crate::api_keys::ApiKeyMutations,
    crate::backup::graphql::BackupMutations,
    crate::trade::TradeMutations,
);

#[derive(MergedSubscription, Default)]
#[graphql(name = "RootSubscriptionType")]
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
    .data(state)
    .finish()
}

/// The owner schema's SDL, for comparison with Absinthe's
/// (`mix absinthe.schema.sdl`).
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
