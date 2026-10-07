//! The card collection and its storage locations (`Manavault.Catalog.Collection`,
//! `Manavault.Catalog.CardCollection`, `CollectionItem`, `Location`,
//! `AutoSortRule`, `CollectionImport`) and their GraphQL types
//! (`ManavaultWeb.Schema.Catalog.CollectionTypes` and friends).
//!
//! - [`item`]: collection item rows and loaders ([`CollectionItem`]).
//! - [`location`]: storage locations and the virtual "unfiled" bucket.
//! - [`changes`]: the item changeset (create, update, bulk update, trade
//!   quantities, deletes).
//! - [`filters`] / [`queries`]: the collection search, listings, totals, and
//!   value summaries.
//! - [`export`], [`import`], [`auto_sort`], [`bulk_clean`]: collection tools.
//! - [`graphql`]: the GraphQL object types, root queries, and mutations.
//!
//! Deck allocations are read straight from `deck_allocations`/`deck_cards`/
//! `decks`: allocated copies are hidden from location views, skipped by
//! auto-sort and bulk clean, and counted on each item.

pub mod auto_sort;
pub mod bulk_clean;
pub mod changes;
pub mod export;
pub mod filters;
pub mod graphql;
pub mod import;
pub mod item;
pub mod loader;
pub mod location;
pub mod queries;

pub use graphql::{CollectionMutations, CollectionQueries};
pub use item::{CollectionItem, CollectionItemRecord};
pub use location::{Location, LocationKind, LocationRecord};

#[cfg(test)]
mod tests;
