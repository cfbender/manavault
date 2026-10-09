//! Moving physical copies between storage locations and decks.
//!
//! Allocated copies leave their location (`location_id` becomes `NULL`).
//! When only part of a collection item moves, the item is split: the source
//! keeps the remainder and a new item holds the moved copies.

use std::cmp::Ordering;

use lotus::{Condition, Finish, ScryfallId};
use sqlx::SqliteConnection;

use crate::domain::{CollectionItemId, LocationId, Quantity};
use crate::error::AllocationError;
use crate::model::CollectionItem;

/// Moves `quantity` copies of `item` out of their location and returns the id
/// of the item now holding them.
pub(crate) async fn move_to_deck(
    conn: &mut SqliteConnection,
    item: &CollectionItem,
    quantity: Quantity,
) -> Result<CollectionItemId, AllocationError> {
    move_copies(
        conn,
        item,
        quantity,
        None,
        AllocationError::NotEnoughAvailable,
    )
    .await
}

/// Returns `quantity` allocated copies of `item` to `source_location_id`.
pub(crate) async fn restore_from_deck(
    conn: &mut SqliteConnection,
    item: &CollectionItem,
    quantity: Quantity,
    source_location_id: Option<LocationId>,
) -> Result<CollectionItemId, AllocationError> {
    move_copies(
        conn,
        item,
        quantity,
        source_location_id,
        AllocationError::QuantityMismatch,
    )
    .await
}

async fn move_copies(
    conn: &mut SqliteConnection,
    item: &CollectionItem,
    quantity: Quantity,
    location_id: Option<LocationId>,
    too_few: AllocationError,
) -> Result<CollectionItemId, AllocationError> {
    match item.quantity.cmp(&quantity) {
        Ordering::Equal => {
            set_location(conn, item.id, location_id).await?;
            Ok(item.id)
        }
        Ordering::Greater => {
            let remaining = item.quantity.checked_sub(quantity).ok_or(too_few)?;
            set_quantity(conn, item.id, remaining).await?;
            let split = split_off(item, quantity, location_id);
            Ok(insert(conn, &split).await?)
        }
        Ordering::Less => Err(too_few),
    }
}

/// A collection item about to be inserted.
///
/// There is deliberately no `Default`: building one means naming every field,
/// so adding a column here forces every construction site to decide its value.
struct NewCollectionItem<'a> {
    scryfall_id: &'a ScryfallId,
    quantity: Quantity,
    condition: Condition,
    language: &'a str,
    finish: Finish,
    location_id: Option<LocationId>,
    notes: Option<&'a str>,
    purchase_price_cents: Option<i64>,
    acquisition_market_price_cents: Option<i64>,
}

/// The copies split off `item`: same printing and provenance, new quantity
/// and location. Trade flags start cleared, as for any newly created item.
fn split_off(
    item: &CollectionItem,
    quantity: Quantity,
    location_id: Option<LocationId>,
) -> NewCollectionItem<'_> {
    NewCollectionItem {
        scryfall_id: &item.scryfall_id,
        quantity,
        condition: item.condition,
        language: &item.language,
        finish: item.finish,
        location_id,
        notes: item.notes.as_deref(),
        purchase_price_cents: item.purchase_price_cents,
        acquisition_market_price_cents: item.acquisition_market_price_cents,
    }
}

async fn insert(
    conn: &mut SqliteConnection,
    item: &NewCollectionItem<'_>,
) -> Result<CollectionItemId, sqlx::Error> {
    let quantity = item.quantity.as_i64();
    sqlx::query_scalar!(
        r#"
        INSERT INTO collection_items (
          scryfall_id, quantity, condition, language, finish, location_id, notes,
          purchase_price_cents, acquisition_market_price_cents, for_trade, for_trade_quantity,
          location_changed_at, inserted_at, updated_at
        )
        VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 0,
          CASE WHEN ?6 IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%SZ', 'now') END,
          strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        )
        RETURNING id AS "id!: CollectionItemId"
        "#,
        item.scryfall_id,
        quantity,
        item.condition,
        item.language,
        item.finish,
        item.location_id,
        item.notes,
        item.purchase_price_cents,
        item.acquisition_market_price_cents
    )
    .fetch_one(conn)
    .await
}

/// Moves a whole item. A move to a real location
/// stamps `location_changed_at`, and an unchanged location writes nothing.
async fn set_location(
    conn: &mut SqliteConnection,
    id: CollectionItemId,
    location_id: Option<LocationId>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        UPDATE collection_items
        SET
          location_changed_at = CASE WHEN ?2 IS NOT NULL
            THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            ELSE location_changed_at END,
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          location_id = ?2
        WHERE id = ?1 AND location_id IS NOT ?2
        "#,
        id,
        location_id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Shrinks an item. Copies marked for trade can never exceed copies owned, so
/// the trade count is clamped to the new quantity.
async fn set_quantity(
    conn: &mut SqliteConnection,
    id: CollectionItemId,
    quantity: Quantity,
) -> Result<(), sqlx::Error> {
    let quantity = quantity.as_i64();
    sqlx::query!(
        r#"
        UPDATE collection_items
        SET
          quantity = ?2,
          for_trade_quantity = MIN(for_trade_quantity, ?2),
          for_trade = MIN(for_trade_quantity, ?2) > 0,
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?1
        "#,
        id,
        quantity
    )
    .execute(conn)
    .await?;
    Ok(())
}
