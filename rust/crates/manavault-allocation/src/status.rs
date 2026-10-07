//! How many copies a deck card has, needs, and could still take.
//!
//! Physical allocations make a collection item unavailable regardless of deck
//! status: one physical copy cannot be pulled into two decks.

use std::collections::HashMap;

use lotus::{Condition, Finish, OracleId, ScryfallId};
use sqlx::SqliteConnection;

use crate::domain::{CollectionItemId, DeckCardId, LocationId, LocationKind, Quantity};
use crate::model::{CollectionItem, DeckCard};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AllocationState {
    /// Basic lands are assumed to be on hand and never need allocating.
    BasicLand,
    Allocated,
    /// Enough unallocated copies exist to finish allocating.
    Available,
    Partial,
    Missing,
}

/// A collection item that matches the deck card's card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    pub item: CollectionItem,
    /// Copies of this item reserved for this deck card.
    pub allocated: u32,
    /// Copies of this item reserved for other deck cards.
    pub allocated_elsewhere: u32,
    /// Copies of this item nobody has reserved.
    pub available: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AllocationStatus {
    pub state: AllocationState,
    pub required: u32,
    pub owned: u32,
    /// Physical plus proxy copies; for basic lands, always `required`.
    pub allocated: u32,
    pub proxy_allocated: u32,
    pub available: u32,
    pub allocated_elsewhere: u32,
    pub missing: u32,
    /// Matching items, the preferred printing first.
    pub candidates: Vec<Candidate>,
}

/// Reserved quantity of one collection item for one deck card.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct AllocationCount {
    pub deck_card_id: DeckCardId,
    pub collection_item_id: CollectionItemId,
    pub quantity: u32,
}

pub(crate) async fn load_status(
    conn: &mut SqliteConnection,
    deck_card: &DeckCard,
) -> Result<AllocationStatus, sqlx::Error> {
    let candidates = load_candidates(conn, deck_card).await?;
    let counts = load_allocation_counts(conn, deck_card).await?;
    Ok(compute(deck_card, candidates, &counts))
}

/// Builds the status from already-loaded rows. Pure, so the counting rules can
/// be tested without a database.
pub(crate) fn compute(
    deck_card: &DeckCard,
    candidates: Vec<CollectionItem>,
    counts: &[AllocationCount],
) -> AllocationStatus {
    let mut current: HashMap<CollectionItemId, u32> = HashMap::new();
    let mut elsewhere: HashMap<CollectionItemId, u32> = HashMap::new();
    for count in counts {
        let bucket = if count.deck_card_id == deck_card.id {
            &mut current
        } else {
            &mut elsewhere
        };
        let total = bucket.entry(count.collection_item_id).or_default();
        *total = total.saturating_add(count.quantity);
    }

    let required = deck_card.quantity.get();
    let basic_land = deck_card.is_basic_land();
    let proxy_allocated = deck_card.proxy_quantity;
    let physical_allocated = current.values().fold(0u32, |sum, n| sum.saturating_add(*n));
    let allocated_elsewhere = elsewhere
        .values()
        .fold(0u32, |sum, n| sum.saturating_add(*n));
    let allocated = if basic_land {
        required
    } else {
        physical_allocated.saturating_add(proxy_allocated)
    };

    let candidates: Vec<Candidate> = candidates
        .into_iter()
        .map(|item| {
            let allocated = current.get(&item.id).copied().unwrap_or(0);
            let allocated_elsewhere = elsewhere.get(&item.id).copied().unwrap_or(0);
            let available = item
                .quantity
                .get()
                .saturating_sub(allocated)
                .saturating_sub(allocated_elsewhere);
            Candidate {
                item,
                allocated,
                allocated_elsewhere,
                available,
            }
        })
        .collect();

    let owned = candidates
        .iter()
        .fold(0u32, |sum, c| sum.saturating_add(c.item.quantity.get()));
    let available = candidates
        .iter()
        .fold(0u32, |sum, c| sum.saturating_add(c.available));
    let missing = if basic_land {
        0
    } else {
        required.saturating_sub(allocated).saturating_sub(available)
    };

    let state = if basic_land {
        AllocationState::BasicLand
    } else if allocated >= required {
        AllocationState::Allocated
    } else if allocated.saturating_add(available) >= required {
        AllocationState::Available
    } else if allocated > 0 || owned > 0 {
        AllocationState::Partial
    } else {
        AllocationState::Missing
    };

    AllocationStatus {
        state,
        required,
        owned,
        allocated,
        proxy_allocated,
        available,
        allocated_elsewhere,
        missing,
        candidates,
    }
}

/// Owned copies of the deck card's card, in any printing or finish. Items in
/// list locations are wanted, not owned, so they are excluded.
async fn load_candidates(
    conn: &mut SqliteConnection,
    deck_card: &DeckCard,
) -> Result<Vec<CollectionItem>, sqlx::Error> {
    sqlx::query_as!(
        CollectionItem,
        r#"
        SELECT
          ci.id AS "id!: CollectionItemId",
          ci.scryfall_id AS "scryfall_id: ScryfallId",
          p.oracle_id AS "oracle_id: OracleId",
          ci.quantity AS "quantity: Quantity",
          ci.condition AS "condition: Condition",
          ci.language,
          ci.finish AS "finish: Finish",
          ci.location_id AS "location_id: LocationId",
          l.kind AS "location_kind?: LocationKind",
          ci.notes,
          ci.purchase_price_cents
        FROM collection_items ci
        JOIN scryfall_printings p ON p.scryfall_id = ci.scryfall_id
        JOIN scryfall_cards c ON c.oracle_id = p.oracle_id
        LEFT JOIN locations l ON l.id = ci.location_id
        WHERE p.oracle_id = ?1 AND (l.id IS NULL OR l.kind != 'list')
        ORDER BY
          (ci.scryfall_id = ?2) DESC,
          c.name,
          p.set_code,
          p.collector_number,
          ci.id
        "#,
        deck_card.oracle_id,
        deck_card.preferred_printing_id
    )
    .fetch_all(conn)
    .await
}

/// Reservations held by this deck card or by any other deck card for the
/// same card.
async fn load_allocation_counts(
    conn: &mut SqliteConnection,
    deck_card: &DeckCard,
) -> Result<Vec<AllocationCount>, sqlx::Error> {
    sqlx::query_as!(
        AllocationCount,
        r#"
        SELECT
          a.deck_card_id AS "deck_card_id: DeckCardId",
          a.collection_item_id AS "collection_item_id: CollectionItemId",
          SUM(a.quantity) AS "quantity!: u32"
        FROM deck_allocations a
        JOIN deck_cards dc ON dc.id = a.deck_card_id
        WHERE dc.id = ?1 OR dc.oracle_id = ?2
        GROUP BY a.deck_card_id, a.collection_item_id
        "#,
        deck_card.id,
        deck_card.oracle_id
    )
    .fetch_all(conn)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{DeckId, DeckStatus, Zone};

    fn quantity(n: u32) -> Quantity {
        Quantity::new(n).expect("test quantities are positive")
    }

    fn deck_card(quantity_needed: u32, proxy_quantity: u32, type_line: &str) -> DeckCard {
        DeckCard {
            id: DeckCardId(1),
            deck_id: DeckId(1),
            deck_status: DeckStatus::Active,
            oracle_id: OracleId::new("oracle-1"),
            preferred_printing_id: None,
            quantity: quantity(quantity_needed),
            proxy_quantity,
            zone: Zone::Mainboard,
            finish: Finish::Nonfoil,
            tag: None,
            type_line: Some(type_line.to_owned()),
        }
    }

    fn item(id: i64, owned: u32) -> CollectionItem {
        CollectionItem {
            id: CollectionItemId(id),
            scryfall_id: ScryfallId::new("scryfall-printing-1"),
            oracle_id: OracleId::new("oracle-1"),
            quantity: quantity(owned),
            condition: Condition::NearMint,
            language: "en".to_owned(),
            finish: Finish::Nonfoil,
            location_id: None,
            location_kind: None,
            notes: None,
            purchase_price_cents: None,
        }
    }

    fn count(deck_card_id: i64, item_id: i64, quantity: u32) -> AllocationCount {
        AllocationCount {
            deck_card_id: DeckCardId(deck_card_id),
            collection_item_id: CollectionItemId(item_id),
            quantity,
        }
    }

    #[test]
    fn copies_reserved_elsewhere_are_not_available() {
        let card = deck_card(2, 0, "Artifact");

        let status = compute(&card, vec![item(10, 1), item(11, 1)], &[count(2, 10, 1)]);

        assert_eq!(status.state, AllocationState::Partial);
        assert_eq!(status.owned, 2);
        assert_eq!(status.available, 1);
        assert_eq!(status.allocated_elsewhere, 1);
        assert_eq!(status.missing, 1);
    }

    #[test]
    fn proxies_count_as_allocated() {
        let card = deck_card(2, 1, "Artifact");

        let status = compute(&card, vec![item(10, 1)], &[count(1, 10, 1)]);

        assert_eq!(status.state, AllocationState::Allocated);
        assert_eq!(status.allocated, 2);
        assert_eq!(status.proxy_allocated, 1);
        assert_eq!(status.missing, 0);
    }

    #[test]
    fn basic_lands_are_always_allocated() {
        let card = deck_card(12, 0, "Basic Land — Plains");

        let status = compute(&card, vec![], &[]);

        assert_eq!(status.state, AllocationState::BasicLand);
        assert_eq!(status.allocated, 12);
        assert_eq!(status.missing, 0);
    }
}
