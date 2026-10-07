//! Trading (`Manavault.Trade`, `Manavault.Trade.Lists`): the want list, the
//! public wants-list and trade-binder share links, and the trade list tools
//! that resolve a pasted decklist or deck link and compare it with the trade
//! binder, the want list, the collection, or a deck.
//!
//! The "for trade" quantity of collection items belongs to the collection;
//! this module only reads it (see [`binder`]).

pub mod binder;
pub mod collection_check;
pub mod collection_item_stub;
pub mod deck_diff;
pub mod entry_resolver;
pub mod list_source;
pub mod matcher;
pub mod schema;
pub mod share;
pub mod want;
pub mod web;

pub use schema::{ShareListQueries, TradeMutations, TradeQueries};

#[cfg(test)]
mod tests;
