//! Deck allocation: reserving physical collection copies for deck cards.
//!
//! Covers single-card and bulk allocation for decks and collection items,
//! allocation status, adding a collection item to a deck, pull-list and
//! proxy allocation, deallocation, trimming and clearing, deck disassembly,
//! and the counting half of the buylist, all on the app's SQLite schema.
//! Every query is checked at compile time against the schema the
//! migrations produce (`rust/schema.sql`).
//!
//! Functions taking a pool run in their own `BEGIN IMMEDIATE` transaction.
//! Functions taking a `&mut SqliteConnection` (`*_in`, clearing, trimming,
//! printing switches) run inside the caller's transaction so deck edits can
//! compose them.

mod allocate;
mod bulk;
mod buylist;
mod collection_add;
mod disassembly;
mod domain;
mod error;
mod items;
mod json;
mod model;
mod release;
mod status;

pub use allocate::{allocate, allocate_in, allocation_status, deallocate};
pub use bulk::{
    BulkAllocationEntry, BulkAllocationPreview, BulkAllocationResult, PullListEntry,
    allocate_deck_pull_list, bulk_allocate_deck, preview_bulk_allocate_deck,
};
pub use buylist::{BuylistNeed, BuylistOptions, BuylistReason, deck_buylist_needs};
pub use collection_add::{add_collection_item_to_deck, bulk_add_collection_items_to_deck};
pub use disassembly::{
    DisassemblyMove, DisassemblyResult, disassemble_deck, preview_deck_disassembly,
};
pub use domain::{
    AllocationId, AllocationMode, CollectionItemId, DeckCardId, DeckCardTag, DeckId, DeckStatus,
    InvalidQuantity, LocationId, LocationKind, Quantity, Zone,
};
pub use error::{AllocationError, parse_quantity};
pub use model::{
    AllocatableDeckCard, CollectionItem, Deallocation, Deck, DeckAllocation, DeckCard,
    NamedDeckCard,
};
pub use release::{
    allocate_available_preferred_printing, allocate_proxy, bulk_deallocate_deck_cards,
    clear_deck_card_allocations, deallocate_proxy, switch_allocation_to_preferred_printing,
    trim_deck_card_allocations,
};
pub use status::{
    AllocationState, AllocationStatus, Candidate, Requirement, StatusInput,
    deck_allocation_statuses, deck_card_statuses, requirement_statuses, statuses_in,
};

/// A deck by id.
pub async fn deck(pool: &sqlx::SqlitePool, id: DeckId) -> Result<Option<Deck>, AllocationError> {
    let mut conn = pool.acquire().await?;
    Ok(model::load_deck(&mut conn, id).await?)
}

/// A deck card by id.
pub async fn deck_card(
    pool: &sqlx::SqlitePool,
    id: DeckCardId,
) -> Result<Option<DeckCard>, AllocationError> {
    let mut conn = pool.acquire().await?;
    Ok(model::load_deck_card(&mut conn, id).await?)
}

/// Every card of a deck with its card name, ordered by zone, name, and id
/// (`Decks.Preloads`).
pub async fn deck_cards(
    pool: &sqlx::SqlitePool,
    deck_id: DeckId,
) -> Result<Vec<NamedDeckCard>, AllocationError> {
    let mut conn = pool.acquire().await?;
    Ok(model::load_deck_cards(&mut conn, deck_id).await?)
}
