//! Releasing reservations: clearing or trimming one deck card, bulk
//! deallocation, proxies, and moving an allocation to a new preferred
//! printing.
//!
//! Ports `ClearDeckCardAllocations`, `TrimDeckCardAllocations`,
//! `DeckCardDeallocation`, `ProxyAllocation`, and
//! `DeckCardAllocation.allocate_available_preferred_printing_to_deck_card/2`.

use std::collections::HashMap;

use sqlx::{SqliteConnection, SqlitePool};

use crate::allocate::{
    begin_write, delete_allocation, reserve, set_allocation_quantity, use_item_printing,
};
use crate::domain::{DeckCardId, Quantity};
use crate::error::AllocationError;
use crate::items;
use crate::model::{
    AllocatableDeckCard, DeckAllocation, DeckCard, load_allocations, load_collection_item,
    load_deck_cards_by_ids, require_deck_card,
};
use crate::status;

/// Returns `quantity` copies of an allocation to its source location,
/// deleting the allocation when nothing remains.
async fn release(
    conn: &mut SqliteConnection,
    allocation: &DeckAllocation,
    quantity: Quantity,
) -> Result<(), AllocationError> {
    let item = load_collection_item(conn, allocation.collection_item_id)
        .await?
        .ok_or(AllocationError::CollectionItemNotFound)?;
    match allocation.quantity.checked_sub(quantity) {
        None => {
            items::restore_from_deck(
                conn,
                &item,
                allocation.quantity,
                allocation.source_location_id,
            )
            .await?;
            delete_allocation(conn, allocation.id).await?;
        }
        Some(remaining) => {
            items::restore_from_deck(conn, &item, quantity, allocation.source_location_id).await?;
            set_allocation_quantity(conn, allocation.id, remaining).await?;
        }
    }
    Ok(())
}

/// Returns every physical copy a deck card holds to its source location
/// (`ClearDeckCardAllocations.run!/1`). Proxies are left alone. Runs in the
/// caller's transaction and does not check the deck's status: deleting a
/// deck card, moving it to considering, and switching its printing all clear
/// it after their own checks.
pub async fn clear_deck_card_allocations(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
) -> Result<(), AllocationError> {
    for allocation in load_allocations(conn, deck_card_id).await? {
        release(conn, &allocation, allocation.quantity).await?;
    }
    Ok(())
}

/// Releases reservations that no longer fit after a deck card's quantity
/// dropped (`TrimDeckCardAllocations.run!/1`): proxies go first, then
/// physical copies (oldest allocation first) return to their source
/// locations, so proxies plus allocations never exceed the quantity. Runs in
/// the caller's transaction.
pub async fn trim_deck_card_allocations(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
) -> Result<(), AllocationError> {
    let card = require_deck_card(conn, deck_card_id).await?;
    let allocations = load_allocations(conn, deck_card_id).await?;
    let physical = allocations
        .iter()
        .fold(0u32, |sum, a| sum.saturating_add(a.quantity.get()));
    let required = card.quantity.get();

    let proxy_limit = required.saturating_sub(physical);
    if card.proxy_quantity > proxy_limit {
        set_proxy_quantity(conn, card.id, proxy_limit).await?;
    }

    let mut excess = physical.saturating_sub(required);
    for allocation in &allocations {
        let Some(released) = Quantity::new(excess.min(allocation.quantity.get())) else {
            break;
        };
        release(conn, allocation, released).await?;
        excess = excess.saturating_sub(released.get());
    }
    Ok(())
}

/// Returns every physical copy and clears every proxy of the given deck
/// cards (`DeckCardDeallocation.bulk_deallocate_deck_cards/1`). Fails without
/// changes if any card is missing or in an archived deck. Returns the cards
/// in request order, without duplicates.
pub async fn bulk_deallocate_deck_cards(
    pool: &SqlitePool,
    deck_card_ids: &[DeckCardId],
) -> Result<Vec<DeckCard>, AllocationError> {
    let mut ids: Vec<DeckCardId> = Vec::with_capacity(deck_card_ids.len());
    for id in deck_card_ids {
        if !ids.contains(id) {
            ids.push(*id);
        }
    }

    let mut tx = begin_write(pool).await?;
    let loaded: HashMap<DeckCardId, DeckCard> = load_deck_cards_by_ids(&mut tx, &ids)
        .await?
        .into_iter()
        .map(|card| (card.id, card))
        .collect();
    let mut cards = Vec::with_capacity(ids.len());
    for id in &ids {
        let card = loaded.get(id).ok_or(AllocationError::DeckCardNotFound)?;
        cards.push(card);
    }
    for card in &cards {
        card.ensure_editable()?;
    }
    for card in &cards {
        clear_deck_card_allocations(&mut tx, card.id).await?;
        if card.proxy_quantity > 0 {
            set_proxy_quantity(&mut tx, card.id, 0).await?;
        }
    }
    let mut result = Vec::with_capacity(ids.len());
    for id in &ids {
        result.push(require_deck_card(&mut tx, *id).await?);
    }
    tx.commit().await?;
    Ok(result)
}

/// Counts `quantity` proxies toward a deck card
/// (`ProxyAllocation.allocate_proxy_to_deck_card/2`).
pub async fn allocate_proxy(
    pool: &SqlitePool,
    deck_card_id: DeckCardId,
    quantity: Quantity,
) -> Result<DeckCard, AllocationError> {
    let mut tx = begin_write(pool).await?;
    let card = require_deck_card(&mut tx, deck_card_id)
        .await?
        .allocatable()?;
    let status = status::load_status(&mut tx, card.deck_card()).await?;
    if status.allocated.saturating_add(quantity.get()) > status.required {
        return Err(AllocationError::AlreadyAllocated);
    }
    add_proxies(&mut tx, &card, quantity).await?;
    let card = require_deck_card(&mut tx, deck_card_id).await?;
    tx.commit().await?;
    Ok(card)
}

/// Removes `quantity` proxies from a deck card
/// (`ProxyAllocation.deallocate_proxy_from_deck_card/2`).
pub async fn deallocate_proxy(
    pool: &SqlitePool,
    deck_card_id: DeckCardId,
    quantity: Quantity,
) -> Result<DeckCard, AllocationError> {
    let mut tx = begin_write(pool).await?;
    let card = require_deck_card(&mut tx, deck_card_id).await?;
    card.ensure_editable()?;
    let remaining = card
        .proxy_quantity
        .checked_sub(quantity.get())
        .filter(|_| card.proxy_quantity > 0)
        .ok_or(AllocationError::ProxyAllocationNotFound)?;
    set_proxy_quantity(&mut tx, card.id, remaining).await?;
    let card = require_deck_card(&mut tx, deck_card_id).await?;
    tx.commit().await?;
    Ok(card)
}

/// Adding proxies needs the same zone and archive proof as physical copies.
async fn add_proxies(
    conn: &mut SqliteConnection,
    card: &AllocatableDeckCard,
    quantity: Quantity,
) -> Result<(), sqlx::Error> {
    let card = card.deck_card();
    set_proxy_quantity(
        conn,
        card.id,
        card.proxy_quantity.saturating_add(quantity.get()),
    )
    .await
}

async fn set_proxy_quantity(
    conn: &mut SqliteConnection,
    id: DeckCardId,
    proxy_quantity: u32,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        UPDATE deck_cards
        SET proxy_quantity = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?1 AND proxy_quantity != ?2
        "#,
        id,
        proxy_quantity
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Reserves up to `quantity` available copies of the deck card's preferred
/// printing in its finish, lowest item id first
/// (`DeckCardAllocation.allocate_available_preferred_printing_to_deck_card/2`).
/// A card without a preferred printing gets nothing. Runs in the caller's
/// transaction and returns the reloaded card.
pub async fn allocate_available_preferred_printing(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
    quantity: Quantity,
) -> Result<DeckCard, AllocationError> {
    let card = require_deck_card(conn, deck_card_id).await?.allocatable()?;
    let status = status::load_status(conn, card.deck_card()).await?;
    let mut needed = quantity
        .get()
        .min(status.required.saturating_sub(status.allocated));

    let deck_card = card.deck_card();
    let mut candidates: Vec<_> = status
        .candidates
        .iter()
        .filter(|candidate| {
            deck_card.preferred_printing_id.as_ref() == Some(&candidate.item.scryfall_id)
                && candidate.item.finish == deck_card.finish
        })
        .collect();
    candidates.sort_by_key(|candidate| candidate.item.id);

    for candidate in candidates {
        if needed == 0 {
            break;
        }
        let Some(take) = Quantity::new(needed.min(candidate.available)) else {
            continue;
        };
        use_item_printing(conn, &card, &candidate.item).await?;
        reserve(conn, &card, &candidate.item, take).await?;
        needed = needed.saturating_sub(take.get());
    }
    require_deck_card(conn, deck_card_id).await
}

/// After a deck card's preferred printing or finish changed: returns its
/// physical copies and reserves the same number of copies of the new
/// printing and finish where available (`UpdateDeckCard`'s allocation
/// switch). Copies that cannot be replaced stay released. Runs in the
/// caller's transaction, after the deck card row was updated.
pub async fn switch_allocation_to_preferred_printing(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
) -> Result<DeckCard, AllocationError> {
    let physical = load_allocations(conn, deck_card_id)
        .await?
        .iter()
        .fold(0u32, |sum, a| sum.saturating_add(a.quantity.get()));
    clear_deck_card_allocations(conn, deck_card_id).await?;
    match Quantity::new(physical) {
        Some(quantity) => allocate_available_preferred_printing(conn, deck_card_id, quantity).await,
        None => require_deck_card(conn, deck_card_id).await,
    }
}
