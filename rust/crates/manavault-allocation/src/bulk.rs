//! Allocating a whole deck at once, and applying a pull list
//! (`BulkDeckAllocation`, `PullListAllocation`).

use std::collections::BTreeSet;

use sqlx::{Connection, SqliteConnection, SqlitePool};

use crate::allocate::{allocate_in, begin_write};
use crate::domain::{AllocationMode, CollectionItemId, DeckCardId, DeckId, Quantity, Zone};
use crate::error::AllocationError;
use crate::model::{CollectionItem, DeckCard, load_deck_card, load_deck_cards, require_deck};
use crate::status;

/// One planned allocation in a bulk preview.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BulkAllocationEntry {
    pub deck_card: DeckCard,
    pub item: CollectionItem,
    pub quantity: Quantity,
    /// The copy is the deck card's preferred printing.
    pub exact: bool,
}

/// What [`bulk_allocate_deck`] would do (`previewBulkAllocateDeck`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BulkAllocationPreview {
    pub mode: AllocationMode,
    /// Copies the entries reserve.
    pub allocated: u32,
    /// Deck cards with at least one entry.
    pub cards: u32,
    /// Deck cards that still need copies but have no usable candidate.
    pub skipped: u32,
    pub entries: Vec<BulkAllocationEntry>,
}

/// The outcome of a bulk allocation or pull list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BulkAllocationResult {
    /// Copies reserved.
    pub allocated: u32,
    /// Distinct deck cards that received copies.
    pub cards: u32,
    /// Entries that could not be applied.
    pub skipped: u32,
}

/// Plans reserving available copies for every deck card that still needs
/// them (`BulkDeckAllocation.preview_bulk_allocate_deck/2`). Statuses are
/// computed in a fixed number of queries for the whole deck.
pub async fn preview_bulk_allocate_deck(
    pool: &SqlitePool,
    deck_id: DeckId,
    mode: AllocationMode,
) -> Result<BulkAllocationPreview, AllocationError> {
    let mut conn = pool.acquire().await?;
    require_deck(&mut conn, deck_id).await?;
    preview_in(&mut conn, deck_id, mode).await
}

async fn preview_in(
    conn: &mut SqliteConnection,
    deck_id: DeckId,
    mode: AllocationMode,
) -> Result<BulkAllocationPreview, AllocationError> {
    let cards: Vec<DeckCard> = load_deck_cards(conn, deck_id)
        .await?
        .into_iter()
        .map(|named| named.card)
        .filter(|card| card.zone != Zone::Considering)
        .collect();
    let statuses = status::load_statuses(conn, &cards).await?;

    let mut preview = BulkAllocationPreview {
        mode,
        allocated: 0,
        cards: 0,
        skipped: 0,
        entries: Vec::new(),
    };
    for card in &cards {
        let Some(status) = statuses.get(&card.id) else {
            continue;
        };
        let needed = status.required.saturating_sub(status.allocated);
        if needed == 0 {
            continue;
        }
        let mut planned = 0u32;
        let mut entries = Vec::new();
        for candidate in &status.candidates {
            let usable = match mode {
                AllocationMode::ExactPrintings => {
                    card.preferred_printing_id.as_ref() == Some(&candidate.item.scryfall_id)
                }
                AllocationMode::MatchingPrintings => true,
            };
            if !usable {
                continue;
            }
            let remaining = needed.saturating_sub(planned);
            if remaining == 0 {
                break;
            }
            let Some(quantity) = Quantity::new(remaining.min(candidate.available)) else {
                continue;
            };
            planned = planned.saturating_add(quantity.get());
            entries.push(BulkAllocationEntry {
                deck_card: card.clone(),
                item: candidate.item.clone(),
                quantity,
                exact: card.preferred_printing_id.as_ref() == Some(&candidate.item.scryfall_id),
            });
        }
        if entries.is_empty() {
            preview.skipped = preview.skipped.saturating_add(1);
        } else {
            preview.allocated = preview.allocated.saturating_add(planned);
            preview.cards = preview.cards.saturating_add(1);
            preview.entries.extend(entries);
        }
    }
    Ok(preview)
}

/// Applies [`preview_bulk_allocate_deck`]'s plan in one transaction
/// (`BulkDeckAllocation.bulk_allocate_deck/2`). Entries that fail (another
/// entry already took the copies) are skipped, not fatal.
pub async fn bulk_allocate_deck(
    pool: &SqlitePool,
    deck_id: DeckId,
    mode: AllocationMode,
) -> Result<BulkAllocationResult, AllocationError> {
    let mut tx = begin_write(pool).await?;
    require_deck(&mut tx, deck_id).await?.ensure_editable()?;
    let preview = preview_in(&mut tx, deck_id, mode).await?;
    let mut tally = Tally::default();
    for entry in &preview.entries {
        let outcome =
            allocate_in_savepoint(&mut tx, entry.deck_card.id, entry.item.id, entry.quantity)
                .await?;
        tally.record(entry.deck_card.id, entry.quantity, outcome.is_ok());
    }
    tx.commit().await?;
    Ok(tally.result())
}

/// One requested allocation of a pull list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PullListEntry {
    pub deck_card_id: DeckCardId,
    pub collection_item_id: CollectionItemId,
    pub quantity: Quantity,
}

impl PullListEntry {
    /// Validates raw ids and an optional quantity (default 1)
    /// (`PullListAllocation.normalize_pull_list_entry/1`).
    pub fn new(
        deck_card_id: i64,
        collection_item_id: i64,
        quantity: Option<i64>,
    ) -> Result<Self, AllocationError> {
        if deck_card_id <= 0 || collection_item_id <= 0 {
            return Err(AllocationError::InvalidPullListEntry);
        }
        let quantity = Quantity::try_from(quantity.unwrap_or(1))
            .map_err(|_| AllocationError::InvalidPullListEntry)?;
        Ok(Self {
            deck_card_id: DeckCardId(deck_card_id),
            collection_item_id: CollectionItemId(collection_item_id),
            quantity,
        })
    }
}

/// Reserves the listed copies in one transaction, skipping entries that
/// fail (a different card, too few copies, a card from another deck)
/// (`PullListAllocation.allocate_deck_pull_list/2`).
pub async fn allocate_deck_pull_list(
    pool: &SqlitePool,
    deck_id: DeckId,
    entries: &[PullListEntry],
) -> Result<BulkAllocationResult, AllocationError> {
    let mut tx = begin_write(pool).await?;
    require_deck(&mut tx, deck_id).await?.ensure_editable()?;
    let mut tally = Tally::default();
    for entry in entries {
        let in_deck = load_deck_card(&mut tx, entry.deck_card_id)
            .await?
            .is_some_and(|card| card.deck_id == deck_id);
        let outcome = if in_deck {
            allocate_in_savepoint(
                &mut tx,
                entry.deck_card_id,
                entry.collection_item_id,
                entry.quantity,
            )
            .await?
        } else {
            Err(AllocationError::DeckCardNotFound)
        };
        tally.record(entry.deck_card_id, entry.quantity, outcome.is_ok());
    }
    tx.commit().await?;
    Ok(tally.result())
}

/// Runs one allocation in a savepoint. The outer result is a database
/// failure that aborts the whole operation; the inner one is the
/// allocation's own outcome.
async fn allocate_in_savepoint(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
    collection_item_id: CollectionItemId,
    quantity: Quantity,
) -> Result<Result<(), AllocationError>, AllocationError> {
    let mut savepoint = conn.begin().await?;
    match allocate_in(&mut savepoint, deck_card_id, collection_item_id, quantity).await {
        Ok(_) => {
            savepoint.commit().await?;
            Ok(Ok(()))
        }
        Err(AllocationError::Database(error)) => Err(AllocationError::Database(error)),
        Err(error) => {
            savepoint.rollback().await?;
            Ok(Err(error))
        }
    }
}

#[derive(Default)]
struct Tally {
    allocated: u32,
    cards: BTreeSet<DeckCardId>,
    skipped: u32,
}

impl Tally {
    fn record(&mut self, deck_card_id: DeckCardId, quantity: Quantity, succeeded: bool) {
        if succeeded {
            self.allocated = self.allocated.saturating_add(quantity.get());
            self.cards.insert(deck_card_id);
        } else {
            self.skipped = self.skipped.saturating_add(1);
        }
    }

    fn result(&self) -> BulkAllocationResult {
        BulkAllocationResult {
            allocated: self.allocated,
            cards: u32::try_from(self.cards.len()).unwrap_or(u32::MAX),
            skipped: self.skipped,
        }
    }
}
