//! What deck edits do to allocations, and how many copies each deck card
//! has, needs, and could still take.
//!
//! Ports `Decks.AllocationStatus` (batched for a whole deck page),
//! `TrimDeckCardAllocations`, `ClearDeckCardAllocations`,
//! `AllocationItems`, and the part of `DeckCardAllocation` that re-reserves
//! the preferred printing after a printing change. The writes run on the
//! caller's transaction so a deck edit and its allocation changes commit
//! together; `manavault_allocation`'s functions open their own transactions,
//! so they cannot be used from inside a deck edit.

use std::collections::{BTreeSet, HashMap};

use lotus::{Condition, Finish, OracleId, ScryfallId, Zone};
use sqlx::SqliteConnection;

use crate::catalog::sql::json_list;
use crate::decks::DeckError;
use crate::decks::model::{CollectionItemId, DeckCardId, DeckCardRow, LocationId, id_list};

/// `AllocationStatus` states, plus `shared` for public share pages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AllocationState {
    /// Basic lands are assumed to be on hand and never need allocating.
    BasicLand,
    Allocated,
    /// Enough unallocated copies exist to finish allocating.
    Available,
    Partial,
    Missing,
    /// Public share pages hide the owner's collection.
    Shared,
}

impl AllocationState {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::BasicLand => "basic_land",
            Self::Allocated => "allocated",
            Self::Available => "available",
            Self::Partial => "partial",
            Self::Missing => "missing",
            Self::Shared => "shared",
        }
    }
}

/// A collection item that matches a deck card's card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusCandidate {
    pub collection_item_id: CollectionItemId,
    pub scryfall_id: ScryfallId,
    pub finish: Finish,
    pub quantity: u32,
    /// Copies of this item reserved for this deck card.
    pub allocated: u32,
    /// Copies of this item reserved for other deck cards.
    pub allocated_elsewhere: u32,
    /// Copies nobody has reserved.
    pub available: u32,
}

/// `DeckCardAllocationStatus`.
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
    /// The deck card's zone, set by callers that look a card up across zones
    /// (EDHREC collection status); `None` on a deck card's own status.
    pub deck_zone: Option<Zone>,
    /// Matching items, the preferred printing first.
    pub candidates: Vec<StatusCandidate>,
}

/// What the status of one deck card depends on. `id` is `None` for a card
/// that is not in a deck (requirement checks); such a card holds nothing.
#[derive(Debug, Clone)]
pub struct StatusInput {
    pub id: Option<DeckCardId>,
    pub oracle_id: OracleId,
    pub preferred_printing_id: Option<ScryfallId>,
    pub quantity: u32,
    pub proxy_quantity: u32,
    pub basic_land: bool,
}

impl StatusInput {
    /// The status input of a deck card whose card is or is not a basic land.
    #[must_use]
    pub fn of(row: &DeckCardRow, basic_land: bool) -> Self {
        Self {
            id: Some(row.id),
            oracle_id: row.oracle_id.clone(),
            preferred_printing_id: row.preferred_printing_id.clone(),
            quantity: row.quantity.get(),
            proxy_quantity: row.proxy_quantity,
            basic_land,
        }
    }
}

struct CandidateRow {
    id: CollectionItemId,
    scryfall_id: ScryfallId,
    oracle_id: OracleId,
    quantity: i64,
    finish: Finish,
}

struct CountRow {
    deck_card_id: DeckCardId,
    collection_item_id: CollectionItemId,
    quantity: i64,
}

fn to_u32(value: i64) -> u32 {
    u32::try_from(value.max(0)).unwrap_or(u32::MAX)
}

/// Statuses for many deck cards with two queries (one for candidates, one
/// for allocation counts), in input order.
pub async fn statuses(
    conn: &mut SqliteConnection,
    inputs: &[StatusInput],
) -> Result<Vec<AllocationStatus>, sqlx::Error> {
    if inputs.is_empty() {
        return Ok(Vec::new());
    }
    let oracle_ids: Vec<OracleId> = inputs
        .iter()
        .map(|input| input.oracle_id.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let oracle_json = json_list(&oracle_ids);
    let ids_json = id_list(inputs.iter().filter_map(|input| input.id.map(|id| id.0)));

    // Owned copies in any printing or finish; list locations hold wanted
    // cards, not owned ones.
    let candidates = sqlx::query_as!(
        CandidateRow,
        r#"SELECT ci.id AS "id!: CollectionItemId", ci.scryfall_id AS "scryfall_id!: ScryfallId",
                  p.oracle_id AS "oracle_id!: OracleId", ci.quantity AS "quantity!",
                  ci.finish AS "finish!: Finish"
           FROM collection_items AS ci
           JOIN scryfall_printings AS p ON p.scryfall_id = ci.scryfall_id
           JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           LEFT JOIN locations AS l ON l.id = ci.location_id
           WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
             AND (l.id IS NULL OR l.kind != 'list')
           ORDER BY c.name, p.set_code, p.collector_number, ci.id"#,
        oracle_json
    )
    .fetch_all(&mut *conn)
    .await?;

    let counts = sqlx::query!(
        r#"SELECT dc.id AS "deck_card_id!: DeckCardId", dc.oracle_id AS "oracle_id!: OracleId",
                  a.collection_item_id AS "collection_item_id!: CollectionItemId",
                  SUM(a.quantity) AS "quantity!: i64"
           FROM deck_allocations AS a
           JOIN deck_cards AS dc ON dc.id = a.deck_card_id
           WHERE dc.id IN (SELECT value FROM json_each(?1))
              OR dc.oracle_id IN (SELECT value FROM json_each(?2))
           GROUP BY dc.id, dc.oracle_id, a.collection_item_id"#,
        ids_json,
        oracle_json
    )
    .fetch_all(&mut *conn)
    .await?;

    let mut candidates_by_oracle: HashMap<&OracleId, Vec<&CandidateRow>> = HashMap::new();
    for candidate in &candidates {
        candidates_by_oracle
            .entry(&candidate.oracle_id)
            .or_default()
            .push(candidate);
    }
    let mut counts_by_oracle: HashMap<OracleId, Vec<CountRow>> = HashMap::new();
    for row in counts {
        counts_by_oracle
            .entry(row.oracle_id)
            .or_default()
            .push(CountRow {
                deck_card_id: row.deck_card_id,
                collection_item_id: row.collection_item_id,
                quantity: row.quantity,
            });
    }

    Ok(inputs
        .iter()
        .map(|input| {
            let mut candidates: Vec<&CandidateRow> = candidates_by_oracle
                .get(&input.oracle_id)
                .cloned()
                .unwrap_or_default();
            // Stable: the preferred printing first, then the query order.
            candidates.sort_by_key(|candidate| {
                Some(&candidate.scryfall_id) != input.preferred_printing_id.as_ref()
            });
            let counts = counts_by_oracle
                .get(&input.oracle_id)
                .map(Vec::as_slice)
                .unwrap_or_default();
            compute(input, &candidates, counts)
        })
        .collect())
}

fn compute(
    input: &StatusInput,
    candidates: &[&CandidateRow],
    counts: &[CountRow],
) -> AllocationStatus {
    let mut current: HashMap<CollectionItemId, u32> = HashMap::new();
    let mut elsewhere: HashMap<CollectionItemId, u32> = HashMap::new();
    for count in counts {
        let bucket = if Some(count.deck_card_id) == input.id {
            &mut current
        } else {
            &mut elsewhere
        };
        let total = bucket.entry(count.collection_item_id).or_default();
        *total = total.saturating_add(to_u32(count.quantity));
    }
    let sum = |map: &HashMap<CollectionItemId, u32>| {
        map.values().fold(0u32, |total, n| total.saturating_add(*n))
    };
    let required = input.quantity;
    let physical = sum(&current);
    let allocated_elsewhere = sum(&elsewhere);
    let allocated = if input.basic_land {
        required
    } else {
        physical.saturating_add(input.proxy_quantity)
    };
    let candidates: Vec<StatusCandidate> = candidates
        .iter()
        .map(|item| {
            let quantity = to_u32(item.quantity);
            let mine = current.get(&item.id).copied().unwrap_or(0);
            let others = elsewhere.get(&item.id).copied().unwrap_or(0);
            StatusCandidate {
                collection_item_id: item.id,
                scryfall_id: item.scryfall_id.clone(),
                finish: item.finish,
                quantity,
                allocated: mine,
                allocated_elsewhere: others,
                available: quantity.saturating_sub(mine).saturating_sub(others),
            }
        })
        .collect();
    let owned = candidates
        .iter()
        .fold(0u32, |total, c| total.saturating_add(c.quantity));
    let available = candidates
        .iter()
        .fold(0u32, |total, c| total.saturating_add(c.available));
    let missing = if input.basic_land {
        0
    } else {
        required.saturating_sub(allocated).saturating_sub(available)
    };
    let state = if input.basic_land {
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
        proxy_allocated: input.proxy_quantity,
        available,
        allocated_elsewhere,
        missing,
        deck_zone: None,
        candidates,
    }
}

/// Whether the card is a basic land (snow basics included).
pub async fn is_basic_land(
    conn: &mut SqliteConnection,
    oracle_id: &OracleId,
) -> Result<bool, sqlx::Error> {
    let type_line: Option<Option<String>> = sqlx::query_scalar!(
        "SELECT type_line FROM scryfall_cards WHERE oracle_id = ?1",
        oracle_id
    )
    .fetch_optional(conn)
    .await?;
    Ok(type_line
        .flatten()
        .is_some_and(|type_line| lotus::is_basic_land(&type_line)))
}

/// One reservation with the collection item it holds.
struct HeldAllocation {
    id: i64,
    source_location_id: Option<LocationId>,
    quantity: i64,
    item: HeldItem,
}

struct HeldItem {
    id: CollectionItemId,
    scryfall_id: ScryfallId,
    quantity: i64,
    condition: Condition,
    language: String,
    finish: Finish,
    location_id: Option<LocationId>,
    notes: Option<String>,
    purchase_price_cents: Option<i64>,
}

async fn held_allocations(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
) -> Result<Vec<HeldAllocation>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT a.id AS "id!", a.source_location_id AS "source_location_id?: LocationId",
                  a.quantity AS "quantity!",
                  ci.id AS "item_id!: CollectionItemId", ci.scryfall_id AS "scryfall_id!: ScryfallId",
                  ci.quantity AS "item_quantity!", ci.condition AS "condition!: Condition",
                  ci.language AS "language!", ci.finish AS "finish!: Finish",
                  ci.location_id AS "location_id?: LocationId", ci.notes,
                  ci.purchase_price_cents
           FROM deck_allocations AS a
           JOIN collection_items AS ci ON ci.id = a.collection_item_id
           WHERE a.deck_card_id = ?1
           ORDER BY a.id"#,
        deck_card_id
    )
    .fetch_all(conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| HeldAllocation {
            id: row.id,
            source_location_id: row.source_location_id,
            quantity: row.quantity,
            item: HeldItem {
                id: row.item_id,
                scryfall_id: row.scryfall_id,
                quantity: row.item_quantity,
                condition: row.condition,
                language: row.language,
                finish: row.finish,
                location_id: row.location_id,
                notes: row.notes,
                purchase_price_cents: row.purchase_price_cents,
            },
        })
        .collect())
}

/// Moves a whole item, stamping `location_changed_at` on a move to a real
/// location (`Collection.update_collection_item/2` with a location).
async fn set_item_location(
    conn: &mut SqliteConnection,
    id: CollectionItemId,
    location_id: Option<LocationId>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE collection_items
           SET location_changed_at = CASE WHEN ?2 IS NOT NULL
                 THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE location_changed_at END,
               updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
               location_id = ?2
           WHERE id = ?1 AND location_id IS NOT ?2"#,
        id,
        location_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Moves `quantity` copies of `item` to `location_id`, splitting the item
/// when only part of it moves; returns the item now holding the copies
/// (`AllocationItems.move_to_deck!/2` and `restore_from_deck!/3`).
async fn move_copies(
    conn: &mut SqliteConnection,
    item: &HeldItem,
    quantity: i64,
    location_id: Option<LocationId>,
    too_few: DeckError,
) -> Result<CollectionItemId, DeckError> {
    if item.quantity == quantity {
        set_item_location(conn, item.id, location_id).await?;
        return Ok(item.id);
    }
    if item.quantity < quantity {
        return Err(too_few);
    }
    let remaining = item.quantity - quantity;
    sqlx::query!(
        r#"UPDATE collection_items
           SET quantity = ?2,
               for_trade_quantity = MIN(for_trade_quantity, ?2),
               for_trade = MIN(for_trade_quantity, ?2) > 0,
               updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE id = ?1"#,
        item.id,
        remaining
    )
    .execute(&mut *conn)
    .await?;
    let id = sqlx::query_scalar!(
        r#"INSERT INTO collection_items (
             scryfall_id, quantity, condition, language, finish, location_id, notes,
             purchase_price_cents, for_trade, for_trade_quantity, location_changed_at,
             inserted_at, updated_at
           ) VALUES (
             ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 0,
             CASE WHEN ?6 IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%SZ', 'now') END,
             strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           ) RETURNING id AS "id!: CollectionItemId""#,
        item.scryfall_id,
        quantity,
        item.condition,
        item.language,
        item.finish,
        location_id,
        item.notes,
        item.purchase_price_cents
    )
    .fetch_one(conn)
    .await?;
    Ok(id)
}

async fn restore(
    conn: &mut SqliteConnection,
    allocation: &HeldAllocation,
    quantity: i64,
) -> Result<(), DeckError> {
    move_copies(
        conn,
        &allocation.item,
        quantity,
        allocation.source_location_id,
        DeckError::Code("allocation_quantity_mismatch"),
    )
    .await?;
    Ok(())
}

/// Returns every reserved copy to the location it came from and deletes the
/// reservations (`ClearDeckCardAllocations.run!/1`).
pub async fn clear(conn: &mut SqliteConnection, deck_card_id: DeckCardId) -> Result<(), DeckError> {
    for allocation in held_allocations(conn, deck_card_id).await? {
        restore(conn, &allocation, allocation.quantity).await?;
        sqlx::query!("DELETE FROM deck_allocations WHERE id = ?1", allocation.id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

/// Releases reservations that no longer fit after a deck card's quantity
/// drops: proxies first, then physical copies, so proxies plus allocations
/// never exceed the quantity (`TrimDeckCardAllocations.run!/1`).
pub async fn trim(conn: &mut SqliteConnection, deck_card_id: DeckCardId) -> Result<(), DeckError> {
    let Some(row) = crate::decks::model::load_deck_card_on(conn, deck_card_id).await? else {
        return Ok(());
    };
    let allocations = held_allocations(conn, deck_card_id).await?;
    let quantity = row.quantity.as_i64();
    let physical: i64 = allocations
        .iter()
        .map(|allocation| allocation.quantity)
        .sum();
    let proxy_limit = (quantity - physical).max(0);
    if i64::from(row.proxy_quantity) > proxy_limit {
        sqlx::query!(
            "UPDATE deck_cards SET proxy_quantity = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            deck_card_id,
            proxy_limit
        )
        .execute(&mut *conn)
        .await?;
    }
    let mut excess = physical - quantity;
    for allocation in allocations {
        if excess <= 0 {
            break;
        }
        let released = allocation.quantity.min(excess);
        restore(conn, &allocation, released).await?;
        if released == allocation.quantity {
            sqlx::query!("DELETE FROM deck_allocations WHERE id = ?1", allocation.id)
                .execute(&mut *conn)
                .await?;
        } else {
            sqlx::query!(
                "UPDATE deck_allocations SET quantity = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
                allocation.id,
                allocation.quantity - released
            )
            .execute(&mut *conn)
            .await?;
        }
        excess -= released;
    }
    Ok(())
}

/// Copies currently reserved for a deck card.
pub async fn physical_quantity(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT COALESCE(SUM(quantity), 0) AS "total!: i64" FROM deck_allocations WHERE deck_card_id = ?1"#,
        deck_card_id
    )
    .fetch_one(conn)
    .await
}

/// Reserves up to `quantity` unreserved copies of the deck card's preferred
/// printing and finish, lowest item id first
/// (`DeckCardAllocation.allocate_available_preferred_printing_to_deck_card/2`).
/// Used after a printing or finish change re-points a card that held copies.
pub async fn allocate_preferred_printing(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
    quantity: u32,
) -> Result<(), DeckError> {
    let row = crate::decks::model::load_deck_card_on(conn, deck_card_id)
        .await?
        .ok_or(DeckError::NotFound)?;
    if row.zone == Zone::Considering {
        return Err(DeckError::Code("considering_not_allocatable"));
    }
    if quantity == 0 {
        return Err(DeckError::Code("invalid_allocation_quantity"));
    }
    let Some(preferred) = row.preferred_printing_id.clone() else {
        return Ok(());
    };
    let basic_land = is_basic_land(conn, &row.oracle_id).await?;
    let status = statuses(conn, &[StatusInput::of(&row, basic_land)])
        .await?
        .pop()
        .ok_or(DeckError::NotFound)?;
    let needed = quantity.min(status.required.saturating_sub(status.allocated));
    let mut candidates: Vec<&StatusCandidate> = status
        .candidates
        .iter()
        .filter(|candidate| candidate.scryfall_id == preferred && candidate.finish == row.finish)
        .collect();
    candidates.sort_by_key(|candidate| candidate.collection_item_id);
    let mut allocated = 0u32;
    for candidate in candidates {
        let remaining = needed.saturating_sub(allocated);
        if remaining == 0 {
            break;
        }
        if candidate.available == 0 {
            continue;
        }
        let take = remaining.min(candidate.available);
        reserve(conn, &row, candidate.collection_item_id, i64::from(take)).await?;
        allocated = allocated.saturating_add(take);
    }
    Ok(())
}

async fn load_item(
    conn: &mut SqliteConnection,
    id: CollectionItemId,
) -> Result<Option<HeldItem>, sqlx::Error> {
    let row = sqlx::query!(
        r#"SELECT id AS "id!: CollectionItemId", scryfall_id AS "scryfall_id!: ScryfallId",
                  quantity AS "quantity!", condition AS "condition!: Condition",
                  language AS "language!", finish AS "finish!: Finish",
                  location_id AS "location_id?: LocationId", notes, purchase_price_cents
           FROM collection_items WHERE id = ?1"#,
        id
    )
    .fetch_optional(conn)
    .await?;
    Ok(row.map(|row| HeldItem {
        id: row.id,
        scryfall_id: row.scryfall_id,
        quantity: row.quantity,
        condition: row.condition,
        language: row.language,
        finish: row.finish,
        location_id: row.location_id,
        notes: row.notes,
        purchase_price_cents: row.purchase_price_cents,
    }))
}

/// Moves copies out of their location into the deck card's reservation and
/// clears a `getting` tag (`insert_or_update_deck_allocation!/3`).
async fn reserve(
    conn: &mut SqliteConnection,
    row: &DeckCardRow,
    item_id: CollectionItemId,
    quantity: i64,
) -> Result<(), DeckError> {
    let item = load_item(conn, item_id)
        .await?
        .ok_or(DeckError::Code("collection_item_not_found"))?;
    let source = item.location_id;
    let held_by = move_copies(
        conn,
        &item,
        quantity,
        None,
        DeckError::Code("not_enough_available"),
    )
    .await?;
    let existing = sqlx::query!(
        r#"SELECT id AS "id!", quantity AS "quantity!" FROM deck_allocations
           WHERE deck_card_id = ?1 AND collection_item_id = ?2 LIMIT 1"#,
        row.id,
        held_by
    )
    .fetch_optional(&mut *conn)
    .await?;
    match existing {
        Some(existing) => {
            sqlx::query!(
                "UPDATE deck_allocations SET quantity = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
                existing.id,
                existing.quantity + quantity
            )
            .execute(&mut *conn)
            .await?;
        }
        None => {
            sqlx::query!(
                r#"INSERT INTO deck_allocations
                     (deck_card_id, collection_item_id, source_location_id, quantity, inserted_at, updated_at)
                   VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"#,
                row.id,
                held_by,
                source,
                quantity
            )
            .execute(&mut *conn)
            .await?;
        }
    }
    sqlx::query!(
        "UPDATE deck_cards SET tag = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1 AND tag = 'getting'",
        row.id
    )
    .execute(conn)
    .await?;
    Ok(())
}
