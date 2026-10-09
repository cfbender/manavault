//! How many copies a deck card has, needs, and could still take.
//!
//! Physical allocations make a collection item unavailable regardless of deck
//! status: one physical copy cannot be pulled into two decks.

use std::collections::HashMap;

use lotus::{Condition, Finish, OracleId, ScryfallId};
use sqlx::{SqliteConnection, SqlitePool};

use crate::domain::{CollectionItemId, DeckCardId, DeckId, LocationId, LocationKind, Quantity};
use crate::error::AllocationError;
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
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AllocationCount {
    pub deck_card_id: DeckCardId,
    pub oracle_id: OracleId,
    pub collection_item_id: CollectionItemId,
    pub quantity: u32,
}

/// What a status is computed for: a persisted deck card, or a bare card
/// requirement (a trade want, an EDHREC suggestion) with no deck card.
#[derive(Debug, Clone)]
pub(crate) struct Subject<'a> {
    pub id: Option<DeckCardId>,
    pub oracle_id: &'a OracleId,
    pub preferred_printing_id: Option<&'a ScryfallId>,
    pub required: Quantity,
    pub proxy_quantity: u32,
    pub basic_land: bool,
}

impl<'a> From<&'a DeckCard> for Subject<'a> {
    fn from(card: &'a DeckCard) -> Self {
        Self {
            id: Some(card.id),
            oracle_id: &card.oracle_id,
            preferred_printing_id: card.preferred_printing_id.as_ref(),
            required: card.quantity,
            proxy_quantity: card.proxy_quantity,
            basic_land: card.is_basic_land(),
        }
    }
}

/// A card someone needs copies of, without a deck card
/// (`AllocationStatus.collection_requirement_statuses/1`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Requirement {
    pub oracle_id: OracleId,
    pub quantity: Quantity,
    pub type_line: Option<String>,
}

impl<'a> From<&'a Requirement> for Subject<'a> {
    fn from(requirement: &'a Requirement) -> Self {
        Self {
            id: None,
            oracle_id: &requirement.oracle_id,
            preferred_printing_id: None,
            required: requirement.quantity,
            proxy_quantity: 0,
            basic_land: requirement
                .type_line
                .as_deref()
                .is_some_and(lotus::is_basic_land),
        }
    }
}

/// The facts a deck card's status depends on, for callers that hold their
/// own deck card rows (the deck pages) instead of a [`DeckCard`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusInput {
    pub id: DeckCardId,
    pub oracle_id: OracleId,
    pub preferred_printing_id: Option<ScryfallId>,
    pub quantity: Quantity,
    pub proxy_quantity: u32,
    /// Whether the card is a basic land (snow basics included).
    pub basic_land: bool,
}

impl<'a> From<&'a StatusInput> for Subject<'a> {
    fn from(input: &'a StatusInput) -> Self {
        Self {
            id: Some(input.id),
            oracle_id: &input.oracle_id,
            preferred_printing_id: input.preferred_printing_id.as_ref(),
            required: input.quantity,
            proxy_quantity: input.proxy_quantity,
            basic_land: input.basic_land,
        }
    }
}

/// Statuses for many deck cards in two queries, in input order, on the
/// caller's connection or transaction
/// (`AllocationStatus.put_deck_card_allocation_statuses/1`).
pub async fn statuses_in(
    conn: &mut SqliteConnection,
    inputs: &[StatusInput],
) -> Result<Vec<AllocationStatus>, sqlx::Error> {
    if inputs.is_empty() {
        return Ok(Vec::new());
    }
    let oracle_ids: Vec<&OracleId> = inputs.iter().map(|input| &input.oracle_id).collect();
    let ids: Vec<DeckCardId> = inputs.iter().map(|input| input.id).collect();
    let candidates = load_candidates(conn, &oracle_ids).await?;
    let counts = load_allocation_counts(conn, &ids, &oracle_ids).await?;
    Ok(inputs
        .iter()
        .map(|input| compute_for(&Subject::from(input), &candidates, &counts))
        .collect())
}

pub(crate) async fn load_status(
    conn: &mut SqliteConnection,
    deck_card: &DeckCard,
) -> Result<AllocationStatus, sqlx::Error> {
    let mut statuses = load_statuses(conn, std::slice::from_ref(deck_card)).await?;
    Ok(statuses
        .remove(&deck_card.id)
        .unwrap_or_else(|| compute(&Subject::from(deck_card), Vec::new(), &[])))
}

/// Statuses for many deck cards in two queries, however many cards there are
/// (`AllocationStatus.put_deck_card_allocation_statuses/1`).
pub(crate) async fn load_statuses(
    conn: &mut SqliteConnection,
    deck_cards: &[DeckCard],
) -> Result<HashMap<DeckCardId, AllocationStatus>, sqlx::Error> {
    if deck_cards.is_empty() {
        return Ok(HashMap::new());
    }
    let oracle_ids: Vec<&OracleId> = deck_cards.iter().map(|card| &card.oracle_id).collect();
    let ids: Vec<DeckCardId> = deck_cards.iter().map(|card| card.id).collect();
    let candidates = load_candidates(conn, &oracle_ids).await?;
    let counts = load_allocation_counts(conn, &ids, &oracle_ids).await?;
    Ok(deck_cards
        .iter()
        .map(|card| {
            let subject = Subject::from(card);
            let status = compute_for(&subject, &candidates, &counts);
            (card.id, status)
        })
        .collect())
}

/// Statuses for card requirements that have no deck card, keyed by oracle
/// id. Every reservation of the card counts as elsewhere.
pub(crate) async fn load_requirement_statuses(
    conn: &mut SqliteConnection,
    requirements: &[Requirement],
) -> Result<HashMap<OracleId, AllocationStatus>, sqlx::Error> {
    if requirements.is_empty() {
        return Ok(HashMap::new());
    }
    let oracle_ids: Vec<&OracleId> = requirements.iter().map(|r| &r.oracle_id).collect();
    let candidates = load_candidates(conn, &oracle_ids).await?;
    let counts = load_allocation_counts(conn, &[], &oracle_ids).await?;
    Ok(requirements
        .iter()
        .map(|requirement| {
            let subject = Subject::from(requirement);
            let status = compute_for(&subject, &candidates, &counts);
            (requirement.oracle_id.clone(), status)
        })
        .collect())
}

/// Picks the subject's candidates (preferred printing first, otherwise in
/// the query's name/set/number order) and computes its status.
fn compute_for(
    subject: &Subject<'_>,
    candidates: &[CollectionItem],
    counts: &[AllocationCount],
) -> AllocationStatus {
    let mut own: Vec<CollectionItem> = candidates
        .iter()
        .filter(|item| &item.oracle_id == subject.oracle_id)
        .cloned()
        .collect();
    // Stable, so non-preferred items keep the query order.
    own.sort_by_key(|item| Some(&item.scryfall_id) != subject.preferred_printing_id);
    compute(subject, own, counts)
}

/// Builds the status from already-loaded rows. Pure, so the counting rules can
/// be tested without a database.
pub(crate) fn compute(
    subject: &Subject<'_>,
    candidates: Vec<CollectionItem>,
    counts: &[AllocationCount],
) -> AllocationStatus {
    let mut current: HashMap<CollectionItemId, u32> = HashMap::new();
    let mut elsewhere: HashMap<CollectionItemId, u32> = HashMap::new();
    for count in counts {
        let bucket = if Some(count.deck_card_id) == subject.id {
            &mut current
        } else if &count.oracle_id == subject.oracle_id {
            &mut elsewhere
        } else {
            continue;
        };
        let total = bucket.entry(count.collection_item_id).or_default();
        *total = total.saturating_add(count.quantity);
    }

    let required = subject.required.get();
    let basic_land = subject.basic_land;
    let proxy_allocated = subject.proxy_quantity;
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

/// Owned copies of the given cards, in any printing or finish, ordered by
/// card name, set, collector number, and id. Items in list locations are
/// wanted, not owned, so they are excluded.
async fn load_candidates(
    conn: &mut SqliteConnection,
    oracle_ids: &[&OracleId],
) -> Result<Vec<CollectionItem>, sqlx::Error> {
    let oracle_ids = crate::json::string_list(oracle_ids.iter().map(|id| id.as_str()));
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
          ci.purchase_price_cents,
          ci.acquisition_market_price_cents
        FROM collection_items ci
        JOIN scryfall_printings p ON p.scryfall_id = ci.scryfall_id
        JOIN scryfall_cards c ON c.oracle_id = p.oracle_id
        LEFT JOIN locations l ON l.id = ci.location_id
        WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
          AND (l.id IS NULL OR l.kind != 'list')
        ORDER BY c.name, p.set_code, p.collector_number, ci.id
        "#,
        oracle_ids
    )
    .fetch_all(conn)
    .await
}

/// Reservations held by the given deck cards or by any deck card for the
/// given cards, whatever the deck's status.
async fn load_allocation_counts(
    conn: &mut SqliteConnection,
    deck_card_ids: &[DeckCardId],
    oracle_ids: &[&OracleId],
) -> Result<Vec<AllocationCount>, sqlx::Error> {
    let deck_card_ids = crate::json::id_list(deck_card_ids.iter().map(|id| id.0));
    let oracle_ids = crate::json::string_list(oracle_ids.iter().map(|id| id.as_str()));
    sqlx::query_as!(
        AllocationCount,
        r#"
        SELECT
          a.deck_card_id AS "deck_card_id: DeckCardId",
          dc.oracle_id AS "oracle_id: OracleId",
          a.collection_item_id AS "collection_item_id: CollectionItemId",
          SUM(a.quantity) AS "quantity!: u32"
        FROM deck_allocations a
        JOIN deck_cards dc ON dc.id = a.deck_card_id
        WHERE dc.id IN (SELECT value FROM json_each(?1))
           OR dc.oracle_id IN (SELECT value FROM json_each(?2))
        GROUP BY a.deck_card_id, dc.oracle_id, a.collection_item_id
        "#,
        deck_card_ids,
        oracle_ids
    )
    .fetch_all(conn)
    .await
}

/// Statuses for many deck cards, computed in two queries
/// (`AllocationStatus.put_deck_card_allocation_statuses/1`). Use this for
/// `DeckCard.allocationStatus` on lists of deck cards.
pub async fn deck_card_statuses(
    pool: &SqlitePool,
    deck_cards: &[DeckCard],
) -> Result<HashMap<DeckCardId, AllocationStatus>, AllocationError> {
    let mut conn = pool.acquire().await?;
    Ok(load_statuses(&mut conn, deck_cards).await?)
}

/// Every deck card's status in one deck (`AllocationStatus.deck_allocation_status/1`).
pub async fn deck_allocation_statuses(
    pool: &SqlitePool,
    deck_id: DeckId,
) -> Result<HashMap<DeckCardId, AllocationStatus>, AllocationError> {
    let mut conn = pool.acquire().await?;
    let cards: Vec<DeckCard> = crate::model::load_deck_cards(&mut conn, deck_id)
        .await?
        .into_iter()
        .map(|named| named.card)
        .collect();
    Ok(load_statuses(&mut conn, &cards).await?)
}

/// Statuses for cards needed without a deck card, keyed by oracle id
/// (`AllocationStatus.collection_requirement_statuses/1`, used by trade
/// checks and by EDHREC/Recommander suggestions with quantity 1). Every
/// reservation of the card, in any deck, counts as allocated elsewhere.
pub async fn requirement_statuses(
    pool: &SqlitePool,
    requirements: &[Requirement],
) -> Result<HashMap<OracleId, AllocationStatus>, AllocationError> {
    let mut conn = pool.acquire().await?;
    Ok(load_requirement_statuses(&mut conn, requirements).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{DeckStatus, Zone};

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
            acquisition_market_price_cents: None,
        }
    }

    fn count(deck_card_id: i64, item_id: i64, quantity: u32) -> AllocationCount {
        AllocationCount {
            deck_card_id: DeckCardId(deck_card_id),
            oracle_id: OracleId::new("oracle-1"),
            collection_item_id: CollectionItemId(item_id),
            quantity,
        }
    }

    #[test]
    fn copies_reserved_elsewhere_are_not_available() {
        let card = deck_card(2, 0, "Artifact");

        let status = compute(
            &Subject::from(&card),
            vec![item(10, 1), item(11, 1)],
            &[count(2, 10, 1)],
        );

        assert_eq!(status.state, AllocationState::Partial);
        assert_eq!(status.owned, 2);
        assert_eq!(status.available, 1);
        assert_eq!(status.allocated_elsewhere, 1);
        assert_eq!(status.missing, 1);
    }

    #[test]
    fn proxies_count_as_allocated() {
        let card = deck_card(2, 1, "Artifact");

        let status = compute(&Subject::from(&card), vec![item(10, 1)], &[count(1, 10, 1)]);

        assert_eq!(status.state, AllocationState::Allocated);
        assert_eq!(status.allocated, 2);
        assert_eq!(status.proxy_allocated, 1);
        assert_eq!(status.missing, 0);
    }

    #[test]
    fn basic_lands_are_always_allocated() {
        let card = deck_card(12, 0, "Basic Land — Plains");

        let status = compute(&Subject::from(&card), vec![], &[]);

        assert_eq!(status.state, AllocationState::BasicLand);
        assert_eq!(status.allocated, 12);
        assert_eq!(status.missing, 0);
    }
}
