//! ManaVault's platform layer: configuration, database and migrations, shared state, background jobs, GraphQL primitives, sessions, and web helpers.

pub mod api_keys;
pub mod auth;
pub mod config;
pub mod crypto;
pub mod db;
pub mod graphql;
pub mod http_errors;
pub mod jobs;
pub mod logs;
pub mod pricing;
pub mod settings;
pub mod state;
pub mod timefmt;
pub mod web;

// Compiled in every build (not behind a feature) so test and dev builds of
// the crates above share one build of this crate.
#[doc(hidden)]
pub mod testing;

#[cfg(test)]
pub use manavault_server::test_support;
