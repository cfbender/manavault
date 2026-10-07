//! Adding owned collection copies to a deck: the deck card is created or
//! grown and the copies are reserved for it in one transaction
//! (`AddCollectionItemToDeck`, `BulkCollectionAllocation`).

use std::collections::{BTreeMap, HashMap};

use lotus::{Finish, OracleId, ScryfallId};
use sqlx::{SqliteConnection, SqlitePool};

use crate::allocate::{allocate_in, begin_write, ensure_item_matches, reserve};
use crate::domain::{CollectionItemId, DeckCardId, DeckId, Quantity, Zone};
use crate::error::AllocationError;
use crate::model::{
    CollectionItem, DeckCard, load_collection_item, load_collection_items, require_deck,
    require_deck_card,
};
use crate::status;

/// The deck card validation's upper bound for a deck card's quantity.
const MAX_DECK_CARD_QUANTITY: u32 = 10_000;

/// Adds one copy of a collection item to a deck and reserves it
/// (`AddCollectionItemToDeck.run/3`). The deck card takes the item's
/// printing and finish. In the considering zone the card is only an idea, so
/// nothing is reserved. If the reservation fails, the deck card change is
/// rolled back too.
pub async fn add_collection_item_to_deck(
    pool: &SqlitePool,
    deck_id: DeckId,
    collection_item_id: CollectionItemId,
    zone: Zone,
) -> Result<DeckCard, AllocationError> {
    let mut tx = begin_write(pool).await?;
    require_deck(&mut tx, deck_id)
        .await?
        .ensure_decklist_editable()?;
    let item = load_collection_item(&mut tx, collection_item_id)
        .await?
        .ok_or(AllocationError::CollectionItemNotFound)?;
    let one = Quantity::new(1).ok_or(AllocationError::InvalidQuantity)?;
    let deck_card_id = upsert_deck_card(
        &mut tx,
        deck_id,
        &item.oracle_id,
        zone,
        &item.scryfall_id,
        item.finish,
        one,
    )
    .await?;
    if zone != Zone::Considering {
        allocate_in(&mut tx, deck_card_id, item.id, one).await?;
    }
    let card = require_deck_card(&mut tx, deck_card_id).await?;
    tx.commit().await?;
    Ok(card)
}

/// Adds one copy of each selected collection item to a deck and reserves it
/// (`BulkCollectionAllocation.bulk_add_collection_items_to_deck/3`). Items
/// of the same card join one deck card, which must agree on finish. Basic
/// lands (snow basics included) join the deck without being reserved, and
/// nothing is reserved in the considering zone. Any failure rolls back the
/// whole request. Returns the touched deck cards ordered by id.
pub async fn bulk_add_collection_items_to_deck(
    pool: &SqlitePool,
    deck_id: DeckId,
    collection_item_ids: &[CollectionItemId],
    zone: Zone,
) -> Result<Vec<DeckCard>, AllocationError> {
    let mut ids: Vec<CollectionItemId> = Vec::with_capacity(collection_item_ids.len());
    for id in collection_item_ids {
        if !ids.contains(id) {
            ids.push(*id);
        }
    }

    let mut tx = begin_write(pool).await?;
    require_deck(&mut tx, deck_id)
        .await?
        .ensure_decklist_editable()?;
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let items = load_ordered_items(&mut tx, &ids).await?;
    ensure_single_finish_per_card(&items)?;

    // Group by card and finish, keeping selection order inside each group.
    let mut groups: BTreeMap<(&str, &str), Vec<&CollectionItem>> = BTreeMap::new();
    for item in &items {
        groups
            .entry((item.oracle_id.as_str(), item.finish.as_str()))
            .or_default()
            .push(item);
    }

    let existing = existing_deck_cards(&mut tx, deck_id, zone, &items).await?;
    let mut deck_card_by_oracle: HashMap<OracleId, DeckCardId> = HashMap::new();
    for group in groups.values() {
        let Some(first) = group.first() else {
            continue;
        };
        let count = u32::try_from(group.len()).unwrap_or(u32::MAX);
        let quantity = Quantity::new(count).ok_or(AllocationError::InvalidQuantity)?;
        if let Some(existing) = existing.get(&first.oracle_id)
            && existing.finish != first.finish
        {
            return Err(AllocationError::FinishMismatch);
        }
        let id = upsert_deck_card(
            &mut tx,
            deck_id,
            &first.oracle_id,
            zone,
            &first.scryfall_id,
            first.finish,
            quantity,
        )
        .await?;
        deck_card_by_oracle.insert(first.oracle_id.clone(), id);
    }

    let allocatable: Vec<&CollectionItem> = if zone == Zone::Considering {
        Vec::new()
    } else {
        let basic: HashMap<OracleId, bool> = basic_land_cards(&mut tx, &items).await?;
        items
            .iter()
            .filter(|item| !basic.get(&item.oracle_id).copied().unwrap_or(false))
            .collect()
    };
    reserve_one_each(&mut tx, &allocatable, &deck_card_by_oracle).await?;

    let mut card_ids: Vec<DeckCardId> = deck_card_by_oracle.into_values().collect();
    card_ids.sort();
    let mut cards = Vec::with_capacity(card_ids.len());
    for id in card_ids {
        cards.push(require_deck_card(&mut tx, id).await?);
    }
    tx.commit().await?;
    Ok(cards)
}

/// Validates room for every selected copy before reserving any of them, so
/// the first problem found is the one reported.
async fn reserve_one_each(
    conn: &mut SqliteConnection,
    items: &[&CollectionItem],
    deck_card_by_oracle: &HashMap<OracleId, DeckCardId>,
) -> Result<(), AllocationError> {
    if items.is_empty() {
        return Ok(());
    }
    let mut cards: Vec<DeckCard> = Vec::new();
    for id in deck_card_by_oracle.values() {
        cards.push(require_deck_card(conn, *id).await?);
    }
    cards.sort_by_key(|card| card.id);
    let statuses = status::load_statuses(conn, &cards).await?;
    let card_for = |item: &CollectionItem| -> Result<&DeckCard, AllocationError> {
        let id = deck_card_by_oracle
            .get(&item.oracle_id)
            .ok_or(AllocationError::CardMismatch)?;
        cards
            .iter()
            .find(|card| card.id == *id)
            .ok_or(AllocationError::DeckCardNotFound)
    };

    let mut requested: BTreeMap<DeckCardId, u32> = BTreeMap::new();
    for item in items {
        let card = card_for(item)?;
        let count = requested.entry(card.id).or_default();
        *count = count.saturating_add(1);
    }
    for (id, count) in &requested {
        let status = statuses.get(id).ok_or(AllocationError::DeckCardNotFound)?;
        if status.allocated.saturating_add(*count) > status.required {
            return Err(AllocationError::AlreadyAllocated);
        }
    }
    for item in items {
        let card = card_for(item)?;
        ensure_item_matches(item, card)?;
        let status = statuses
            .get(&card.id)
            .ok_or(AllocationError::DeckCardNotFound)?;
        let candidate = status
            .candidates
            .iter()
            .find(|candidate| candidate.item.id == item.id)
            .ok_or(AllocationError::CardMismatch)?;
        if candidate.available < 1 {
            return Err(AllocationError::NotEnoughAvailable);
        }
    }

    let one = Quantity::new(1).ok_or(AllocationError::InvalidQuantity)?;
    for item in items {
        let card = card_for(item)?.clone().allocatable()?;
        reserve(conn, &card, item, one).await?;
    }
    Ok(())
}

/// Loads every selected item in selection order; any missing id fails.
async fn load_ordered_items(
    conn: &mut SqliteConnection,
    ids: &[CollectionItemId],
) -> Result<Vec<CollectionItem>, AllocationError> {
    let mut by_id: HashMap<CollectionItemId, CollectionItem> = HashMap::new();
    for chunk in ids.chunks(500) {
        for item in load_collection_items(conn, chunk).await? {
            by_id.insert(item.id, item);
        }
    }
    ids.iter()
        .map(|id| {
            by_id
                .remove(id)
                .ok_or(AllocationError::CollectionItemNotFound)
        })
        .collect()
}

fn ensure_single_finish_per_card(items: &[CollectionItem]) -> Result<(), AllocationError> {
    let mut finishes: HashMap<&OracleId, Finish> = HashMap::new();
    for item in items {
        match finishes.insert(&item.oracle_id, item.finish) {
            Some(finish) if finish != item.finish => return Err(AllocationError::FinishMismatch),
            _ => {}
        }
    }
    Ok(())
}

struct ExistingCard {
    oracle_id: OracleId,
    finish: Finish,
}

async fn existing_deck_cards(
    conn: &mut SqliteConnection,
    deck_id: DeckId,
    zone: Zone,
    items: &[CollectionItem],
) -> Result<HashMap<OracleId, ExistingCard>, sqlx::Error> {
    let oracle_ids = crate::json::string_list(items.iter().map(|item| item.oracle_id.as_str()));
    let rows = sqlx::query_as!(
        ExistingCard,
        r#"
        SELECT oracle_id AS "oracle_id: OracleId", finish AS "finish: Finish"
        FROM deck_cards
        WHERE deck_id = ?1 AND zone = ?2
          AND oracle_id IN (SELECT value FROM json_each(?3))
        "#,
        deck_id,
        zone,
        oracle_ids
    )
    .fetch_all(conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.oracle_id.clone(), row))
        .collect())
}

async fn basic_land_cards(
    conn: &mut SqliteConnection,
    items: &[CollectionItem],
) -> Result<HashMap<OracleId, bool>, sqlx::Error> {
    let oracle_ids = crate::json::string_list(items.iter().map(|item| item.oracle_id.as_str()));
    let rows = sqlx::query!(
        r#"
        SELECT oracle_id AS "oracle_id!: OracleId", type_line
        FROM scryfall_cards
        WHERE oracle_id IN (SELECT value FROM json_each(?1))
        "#,
        oracle_ids
    )
    .fetch_all(conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let basic = row.type_line.as_deref().is_some_and(lotus::is_basic_land);
            (row.oracle_id, basic)
        })
        .collect())
}

/// Inserts a deck card, or adds `quantity` copies to the existing one in the
/// same zone and switches it to the given printing and finish
/// (`AddCardToDeck`'s upsert, as used by the collection flows).
async fn upsert_deck_card(
    conn: &mut SqliteConnection,
    deck_id: DeckId,
    oracle_id: &OracleId,
    zone: Zone,
    printing: &ScryfallId,
    finish: Finish,
    quantity: Quantity,
) -> Result<DeckCardId, AllocationError> {
    let existing = sqlx::query!(
        r#"
        SELECT id AS "id!: DeckCardId", quantity AS "quantity: Quantity"
        FROM deck_cards
        WHERE deck_id = ?1 AND oracle_id = ?2 AND zone = ?3
        LIMIT 1
        "#,
        deck_id,
        oracle_id,
        zone
    )
    .fetch_optional(&mut *conn)
    .await?;

    let total = existing
        .as_ref()
        .map_or(quantity, |row| row.quantity.saturating_add(quantity));
    if total.get() >= MAX_DECK_CARD_QUANTITY {
        return Err(AllocationError::QuantityTooLarge);
    }
    let total = total.as_i64();

    match existing {
        Some(row) => {
            sqlx::query!(
                r#"
                UPDATE deck_cards
                SET quantity = ?2, preferred_printing_id = ?3, finish = ?4,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                WHERE id = ?1
                "#,
                row.id,
                total,
                printing,
                finish
            )
            .execute(&mut *conn)
            .await?;
            Ok(row.id)
        }
        None => Ok(sqlx::query_scalar!(
            r#"
                INSERT INTO deck_cards (
                  deck_id, oracle_id, preferred_printing_id, quantity, proxy_quantity, zone,
                  finish, tag, inserted_at, updated_at
                )
                VALUES (
                  ?1, ?2, ?3, ?4, 0, ?5, ?6, NULL,
                  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                )
                RETURNING id AS "id!: DeckCardId"
                "#,
            deck_id,
            oracle_id,
            printing,
            total,
            zone,
            finish
        )
        .fetch_one(&mut *conn)
        .await?),
    }
}
