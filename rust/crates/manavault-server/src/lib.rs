//! ManaVault's backend, ported from the Elixir/Phoenix app in `lib/`.
//!
//! It serves the same GraphQL schema, routes, and background jobs over the
//! same SQLite database, so the React frontend and existing databases work
//! unchanged.

pub mod api_keys;
pub mod app;
pub mod auth;
pub mod catalog;
pub mod config;
pub mod crypto;
pub mod db;
pub mod graphql;
pub mod jobs;
pub mod logs;
pub mod pricing;
pub mod scanner;
pub mod settings;
pub mod state;
pub mod timefmt;
pub mod web;

#[cfg(test)]
pub mod test_support;
