//! ManaVault's backend.
//!
//! It serves the GraphQL schema, routes, and background jobs of earlier
//! releases over the same SQLite database, so the React frontend and
//! existing databases work unchanged. The domain code lives in the
//! `manavault-*` crates; this crate assembles the owner schema, the HTTP
//! routes, and the job registry, and re-exports the domain modules under
//! their old paths.

// Layout of the merged root types' nested async resolvers needs more than
// the default query depth once the domain types come from other crates.
#![recursion_limit = "256"]

pub mod app;
pub mod cli;
pub mod graphql;
pub mod web;

pub use manavault_ai::ai;
pub use manavault_catalog::{catalog, pricing, scryfall_assets, tokens};
pub use manavault_collection::{collection, decks};
pub use manavault_core::{
    api_keys, auth, config, crypto, db, http_errors, jobs, logs, settings, state, timefmt,
};
pub use manavault_deck_intel::deck_intel;
pub use manavault_share::share;
pub use manavault_system::{backup, scanner};
pub use manavault_trade::trade;

// The test app for every crate's tests (they take this crate as a
// dev-dependency). Compiled in every build, not behind a feature, so test and
// dev builds share one build of each crate.
#[doc(hidden)]
pub mod test_support;
