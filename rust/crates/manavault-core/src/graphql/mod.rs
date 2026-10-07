//! GraphQL building blocks shared by every domain crate: Relay ids and
//! connections, scalars, response extensions, and resolver helpers.

pub mod nullable_errors;
pub mod order;
pub mod relay;
pub mod scalars;
pub mod undefined_variables;

use async_graphql::{Context, ObjectType, SchemaBuilder, SubscriptionType};

use crate::state::AppState;

pub use relay::{LocationRef, NodeKind, PageArgs, global_id};
pub use scalars::Json;

/// Resolver result type.
pub type Result<T> = async_graphql::Result<T>;

/// Installs the response extensions every ManaVault schema uses: field
/// order, nullable error propagation, and undefined variable handling.
pub fn extensions<Q, M, S>(builder: SchemaBuilder<Q, M, S>) -> SchemaBuilder<Q, M, S>
where
    Q: ObjectType + 'static,
    M: ObjectType + 'static,
    S: SubscriptionType + 'static,
{
    builder
        .extension(order::ResponseOrder)
        .extension(nullable_errors::NullableErrors)
        .extension(undefined_variables::UndefinedVariables)
}

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
