//! ManaVault's backend.
//!
//! The domain code lives in the `manavault-*` crates; this crate assembles
//! the owner GraphQL schema, the HTTP routes, the background job registry,
//! and the `manavault` command line.

// Layout of the merged root types' nested async resolvers needs more than
// the default query depth once the domain types come from other crates.
#![recursion_limit = "256"]

pub mod app;
pub mod cli;
pub mod graphql;
pub mod web;

#[doc(hidden)]
pub mod test_support;
