//! Public sharing of decks (`ManavaultWeb.PublicShareSchema`,
//! `ManavaultWeb.DeckSharePreview`, and the share-deck actions of
//! `AppController`): the read-only `/share/graphql` API, the shared deck
//! page, and its SVG/PNG link previews.
//!
//! Want-list and trade-binder share pages live in [`manavault_trade::trade::web`];
//! their public GraphQL fields are served here.

pub mod http;
pub mod pages;
pub mod preview;
pub mod protection;
pub mod schema;
pub mod types;

pub use schema::{PublicSchema, sdl};

#[cfg(test)]
mod tests;
