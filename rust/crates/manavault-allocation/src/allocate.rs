//! Reserving collection copies for a deck card and releasing them again.

use sqlx::{SqliteConnection, SqlitePool};

use crate::domain::{
    AllocationId, CollectionItemId, DeckCardId, LocationId, LocationKind, Quantity,
};
use crate::error::AllocationError;
use crate::items;
use crate::model::{
    AllocatableDeckCard, CollectionItem, Deallocation, DeckAllocation, DeckCard,
    load_collection_item, load_deck_card,
};
use crate::status::{self, AllocationStatus};

/// Reserves `quantity` copies of a collection item for a deck card.
///
/// The copies leave their storage location, and the deck card switches to the
/// item's printing and finish so the deck shows the copy it actually holds.
pub async fn allocate(
    pool: &SqlitePool,
    deck_card_id: DeckCardId,
    collection_item_id: CollectionItemId,
    quantity: Quantity,
) -> Result<DeckAllocation, AllocationError> {
    let mut tx = pool.begin().await?;

    let deck_card = load_deck_card(&mut tx, deck_card_id)
        .await?
        .ok_or(AllocationError::DeckCardNotFound)?
        .allocatable()?;
    let item = load_collection_item(&mut tx, collection_item_id)
        .await?
        .ok_or(AllocationError::CollectionItemNotFound)?;
    ensure_item_matches(&item, deck_card.deck_card())?;

    let status = status::load_status(&mut tx, deck_card.deck_card()).await?;
    ensure_room(&status, item.id, quantity)?;

    use_item_printing(&mut tx, &deck_card, &item).await?;
    let allocation = reserve(&mut tx, &deck_card, &item, quantity).await?;

    tx.commit().await?;
    Ok(allocation)
}

/// Returns up to `quantity` reserved copies to the location they came from.
pub async fn deallocate(
    pool: &SqlitePool,
    deck_card_id: DeckCardId,
    collection_item_id: CollectionItemId,
    quantity: Quantity,
) -> Result<Deallocation, AllocationError> {
    let mut tx = pool.begin().await?;

    let allocation = find_allocation(&mut tx, deck_card_id, collection_item_id)
        .await?
        .ok_or(AllocationError::AllocationNotFound)?;
    load_deck_card(&mut tx, deck_card_id)
        .await?
        .ok_or(AllocationError::DeckCardNotFound)?
        .ensure_editable()?;
    let item = load_collection_item(&mut tx, collection_item_id)
        .await?
        .ok_or(AllocationError::CollectionItemNotFound)?;

    let outcome = match allocation.quantity.checked_sub(quantity) {
        None => {
            items::restore_from_deck(
                &mut tx,
                &item,
                allocation.quantity,
                allocation.source_location_id,
            )
            .await?;
            delete_allocation(&mut tx, allocation.id).await?;
            Deallocation::Released(allocation)
        }
        Some(remaining) => {
            items::restore_from_deck(&mut tx, &item, quantity, allocation.source_location_id)
                .await?;
            Deallocation::Reduced(set_allocation_quantity(&mut tx, allocation.id, remaining).await?)
        }
    };

    tx.commit().await?;
    Ok(outcome)
}

/// Single-deck-card allocation status.
pub async fn allocation_status(
    pool: &SqlitePool,
    deck_card_id: DeckCardId,
) -> Result<AllocationStatus, AllocationError> {
    let mut conn = pool.acquire().await?;
    let deck_card = load_deck_card(&mut conn, deck_card_id)
        .await?
        .ok_or(AllocationError::DeckCardNotFound)?;
    Ok(status::load_status(&mut conn, &deck_card).await?)
}

fn ensure_item_matches(item: &CollectionItem, deck_card: &DeckCard) -> Result<(), AllocationError> {
    if item.location_kind == Some(LocationKind::List) {
        Err(AllocationError::ListLocation)
    } else if item.oracle_id != deck_card.oracle_id {
        Err(AllocationError::CardMismatch)
    } else {
        Ok(())
    }
}

fn ensure_room(
    status: &AllocationStatus,
    item_id: CollectionItemId,
    quantity: Quantity,
) -> Result<(), AllocationError> {
    let candidate = status
        .candidates
        .iter()
        .find(|candidate| candidate.item.id == item_id)
        .ok_or(AllocationError::CardMismatch)?;

    if candidate.available < quantity.get() {
        Err(AllocationError::NotEnoughAvailable)
    } else if status.allocated.saturating_add(quantity.get()) > status.required {
        Err(AllocationError::AlreadyAllocated)
    } else {
        Ok(())
    }
}

async fn use_item_printing(
    conn: &mut SqliteConnection,
    deck_card: &AllocatableDeckCard,
    item: &CollectionItem,
) -> Result<(), sqlx::Error> {
    let card = deck_card.deck_card();
    if card.preferred_printing_id.as_ref() == Some(&item.scryfall_id) && card.finish == item.finish
    {
        return Ok(());
    }

    sqlx::query!(
        r#"
        UPDATE deck_cards
        SET preferred_printing_id = ?2, finish = ?3,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?1
        "#,
        card.id,
        item.scryfall_id,
        item.finish
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// The only function that creates or grows an allocation. Taking
/// [`AllocatableDeckCard`] makes the zone and archive checks a precondition
/// the compiler enforces for every caller.
async fn reserve(
    conn: &mut SqliteConnection,
    deck_card: &AllocatableDeckCard,
    item: &CollectionItem,
    quantity: Quantity,
) -> Result<DeckAllocation, AllocationError> {
    let card = deck_card.deck_card();
    let held_by = items::move_to_deck(conn, item, quantity).await?;

    let allocation = match find_allocation(conn, card.id, held_by).await? {
        Some(existing) => {
            let total = existing.quantity.saturating_add(quantity);
            set_allocation_quantity(conn, existing.id, total).await?
        }
        None => insert_allocation(conn, card.id, held_by, item.location_id, quantity).await?,
    };

    sqlx::query!(
        r#"
        UPDATE deck_cards
        SET tag = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?1 AND tag = 'getting'
        "#,
        card.id
    )
    .execute(conn)
    .await?;

    Ok(allocation)
}

async fn find_allocation(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
    collection_item_id: CollectionItemId,
) -> Result<Option<DeckAllocation>, sqlx::Error> {
    sqlx::query_as!(
        DeckAllocation,
        r#"
        SELECT
          id AS "id!: AllocationId",
          deck_card_id AS "deck_card_id: DeckCardId",
          collection_item_id AS "collection_item_id: CollectionItemId",
          source_location_id AS "source_location_id: LocationId",
          quantity AS "quantity: Quantity"
        FROM deck_allocations
        WHERE deck_card_id = ?1 AND collection_item_id = ?2
        LIMIT 1
        "#,
        deck_card_id,
        collection_item_id
    )
    .fetch_optional(conn)
    .await
}

async fn insert_allocation(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
    collection_item_id: CollectionItemId,
    source_location_id: Option<LocationId>,
    quantity: Quantity,
) -> Result<DeckAllocation, sqlx::Error> {
    let quantity = quantity.as_i64();
    sqlx::query_as!(
        DeckAllocation,
        r#"
        INSERT INTO deck_allocations (
          deck_card_id, collection_item_id, source_location_id, quantity, inserted_at, updated_at
        )
        VALUES (
          ?1, ?2, ?3, ?4,
          strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        )
        RETURNING
          id AS "id!: AllocationId",
          deck_card_id AS "deck_card_id: DeckCardId",
          collection_item_id AS "collection_item_id: CollectionItemId",
          source_location_id AS "source_location_id: LocationId",
          quantity AS "quantity: Quantity"
        "#,
        deck_card_id,
        collection_item_id,
        source_location_id,
        quantity
    )
    .fetch_one(conn)
    .await
}

async fn set_allocation_quantity(
    conn: &mut SqliteConnection,
    id: AllocationId,
    quantity: Quantity,
) -> Result<DeckAllocation, sqlx::Error> {
    let quantity = quantity.as_i64();
    sqlx::query_as!(
        DeckAllocation,
        r#"
        UPDATE deck_allocations
        SET quantity = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?1
        RETURNING
          id AS "id!: AllocationId",
          deck_card_id AS "deck_card_id: DeckCardId",
          collection_item_id AS "collection_item_id: CollectionItemId",
          source_location_id AS "source_location_id: LocationId",
          quantity AS "quantity: Quantity"
        "#,
        id,
        quantity
    )
    .fetch_one(conn)
    .await
}

async fn delete_allocation(
    conn: &mut SqliteConnection,
    id: AllocationId,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM deck_allocations WHERE id = ?1", id)
        .execute(conn)
        .await?;
    Ok(())
}
