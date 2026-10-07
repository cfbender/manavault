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
pub mod timestamp;
pub mod validation;
pub mod web;

#[doc(hidden)]
pub mod testing;

#[cfg(test)]
mod test_app;
