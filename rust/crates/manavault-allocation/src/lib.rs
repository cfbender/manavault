//! Deck allocation: reserving physical collection copies for deck cards.
//!
//! A Rust port of the Elixir modules `Manavault.Catalog.Decks.DeckCardAllocation`,
//! `AllocationItems`, and `AllocationStatus`, working on the same SQLite
//! schema. Every query is checked at compile time against the schema dumped
//! from the Ecto migrations (`priv/repo/structure.sql`).

mod allocate;
mod domain;
mod error;
mod items;
mod model;
mod status;

pub use allocate::{allocate, allocation_status, deallocate};
pub use domain::{
    AllocationId, CollectionItemId, DeckCardId, DeckCardTag, DeckId, DeckStatus, InvalidQuantity,
    LocationId, LocationKind, Quantity, Zone,
};
pub use error::AllocationError;
pub use model::{AllocatableDeckCard, CollectionItem, Deallocation, DeckAllocation, DeckCard};
pub use status::{AllocationState, AllocationStatus, Candidate};
