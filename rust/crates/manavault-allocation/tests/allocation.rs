//! Ports of the single-card scenarios in
//! `test/manavault/catalog/deck_allocation_test.exs` and
//! `deck_allocation_movement_test.exs`, plus regressions for past Elixir bugs.

mod support;

use lotus::{Finish, ScryfallId};
use manavault_allocation::{
    AllocationError, AllocationState, Deallocation, DeckCardTag, DeckStatus, LocationKind, Zone,
    allocate, allocation_status, deallocate,
};
use support::{
    BLACK_LOTUS, LOTUS_ALPHA, LOTUS_BETA, NewItem, PLAINS, TIME_WALK_ALPHA, TestResult,
    allocation_count, db, deck, deck_card, deck_card_row, item, item_row, items_in, location, qty,
    set_deck_status, set_preferred_printing, set_proxy_quantity, set_tag,
};

#[tokio::test]
async fn status_covers_available_elsewhere_missing_and_alternate_printings() -> TestResult {
    let pool = db().await?;
    let available_item = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let alternate_item = item(&pool, NewItem::new(LOTUS_BETA, 1, None)).await?;
    let active = deck(&pool, "Active", DeckStatus::Active).await?;
    let other = deck(&pool, "Other", DeckStatus::Active).await?;
    let active_lotus = deck_card(&pool, active, BLACK_LOTUS, 2, Zone::Mainboard).await?;
    set_preferred_printing(&pool, active_lotus, LOTUS_ALPHA).await?;
    let other_lotus = deck_card(&pool, other, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    let status = allocation_status(&pool, active_lotus).await?;
    assert_eq!(status.state, AllocationState::Available);
    assert_eq!(status.available, 2);
    assert_eq!(status.missing, 0);

    allocate(&pool, other_lotus, available_item, qty(1)?).await?;

    let status = allocation_status(&pool, active_lotus).await?;
    assert_eq!(status.state, AllocationState::Partial);
    assert_eq!(status.owned, 2);
    assert_eq!(status.available, 1);
    assert_eq!(status.allocated_elsewhere, 1);
    assert_eq!(status.missing, 1);
    assert!(
        status
            .candidates
            .iter()
            .any(|c| c.item.id == alternate_item && c.available == 1)
    );

    allocate(&pool, active_lotus, alternate_item, qty(1)?).await?;

    let row = deck_card_row(&pool, active_lotus).await?;
    assert_eq!(row.preferred_printing_id, Some(ScryfallId::new(LOTUS_BETA)));
    let status = allocation_status(&pool, active_lotus).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(status.available, 0);
    assert_eq!(status.missing, 1);

    let result = allocate(&pool, active_lotus, available_item, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::NotEnoughAvailable)));
    Ok(())
}

#[tokio::test]
async fn allocation_moves_copies_out_of_their_location_and_restores_them() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let source = item(&pool, NewItem::new(LOTUS_ALPHA, 2, Some(binder))).await?;
    let sleeved = deck(&pool, "Sleeved", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, sleeved, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    let allocation = allocate(&pool, lotus, source, qty(1)?).await?;

    assert_eq!(allocation.source_location_id, Some(binder));
    assert_eq!(item_row(&pool, source).await?.quantity, 1);
    let allocated = item_row(&pool, allocation.collection_item_id).await?;
    assert_eq!(allocated.quantity, 1);
    assert_eq!(allocated.location_id, None);
    assert_eq!(items_in(&pool, Some(binder)).await?, vec![source]);

    let outcome = deallocate(&pool, lotus, allocation.collection_item_id, qty(1)?).await?;

    assert!(matches!(outcome, Deallocation::Released(_)));
    let returned = item_row(&pool, allocation.collection_item_id).await?;
    assert_eq!(returned.location_id, Some(binder));
    assert_eq!(returned.quantity, 1);
    assert!(returned.location_changed_at.is_some());
    assert_eq!(item_row(&pool, source).await?.quantity, 1);
    assert_eq!(allocation_count(&pool).await?, 0);
    Ok(())
}

#[tokio::test]
async fn partial_deallocation_splits_the_returned_copies_off() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Binder", LocationKind::Binder).await?;
    let source = item(&pool, NewItem::new(LOTUS_ALPHA, 2, Some(binder))).await?;
    let d = deck(&pool, "Deck", DeckStatus::Active).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 2, Zone::Mainboard).await?;

    let allocation = allocate(&pool, lotus, source, qty(2)?).await?;
    assert_eq!(
        allocation.collection_item_id, source,
        "a full move keeps the item"
    );

    let Deallocation::Reduced(reduced) = deallocate(&pool, lotus, source, qty(1)?).await? else {
        return Err("expected the allocation to keep one copy".into());
    };

    assert_eq!(reduced.quantity, qty(1)?);
    assert_eq!(item_row(&pool, source).await?.quantity, 1);
    let returned = items_in(&pool, Some(binder)).await?;
    assert_eq!(returned.len(), 1);
    assert_ne!(returned.first(), Some(&source));
    Ok(())
}

#[tokio::test]
async fn splitting_an_item_keeps_its_provenance_and_clamps_trade_copies() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Binder", LocationKind::Binder).await?;
    let source = item(
        &pool,
        NewItem {
            notes: Some("signed"),
            purchase_price_cents: Some(12_345),
            for_trade_quantity: 3,
            ..NewItem::new(LOTUS_ALPHA, 3, Some(binder))
        },
    )
    .await?;
    let d = deck(&pool, "Deck", DeckStatus::Active).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    let allocation = allocate(&pool, lotus, source, qty(1)?).await?;

    // Regression for 26cac7e: the split-off copy lost its purchase price.
    let moved = item_row(&pool, allocation.collection_item_id).await?;
    assert_eq!(moved.purchase_price_cents, Some(12_345));
    assert_eq!(moved.notes.as_deref(), Some("signed"));
    assert!(!moved.for_trade);
    assert_eq!(moved.for_trade_quantity, 0);
    assert_eq!(moved.location_changed_at, None);

    let kept = item_row(&pool, source).await?;
    assert_eq!(kept.quantity, 2);
    assert_eq!(kept.for_trade_quantity, 2);
    assert!(kept.for_trade);
    Ok(())
}

#[tokio::test]
async fn proxies_count_as_allocated_without_moving_copies() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let d = deck(&pool, "Proxy Test", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 2, Zone::Mainboard).await?;
    set_proxy_quantity(&pool, lotus, 1).await?;

    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(status.proxy_allocated, 1);
    assert_eq!(status.available, 1);
    assert_eq!(status.missing, 0);
    assert_eq!(item_row(&pool, copy).await?.location_id, Some(binder));

    let allocation = allocate(&pool, lotus, copy, qty(1)?).await?;
    assert_eq!(
        item_row(&pool, allocation.collection_item_id)
            .await?
            .location_id,
        None
    );
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.state, AllocationState::Allocated);
    assert_eq!(status.allocated, 2);

    set_proxy_quantity(&pool, lotus, 0).await?;
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(status.missing, 1);
    Ok(())
}

#[tokio::test]
async fn considering_cards_never_allocate_collection_copies() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Idea Binder", LocationKind::Binder).await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 2, Some(binder))).await?;
    let d = deck(&pool, "Considering Only", DeckStatus::Brewing).await?;
    let idea = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Considering).await?;

    let result = allocate(&pool, idea, copy, qty(1)?).await;

    assert!(matches!(
        result,
        Err(AllocationError::ConsideringNotAllocatable)
    ));
    assert_eq!(allocation_count(&pool).await?, 0);
    let row = item_row(&pool, copy).await?;
    assert_eq!((row.quantity, row.location_id), (2, Some(binder)));
    Ok(())
}

#[tokio::test]
async fn items_in_list_locations_are_not_owned() -> TestResult {
    let pool = db().await?;
    let wishlist = location(&pool, "Wishlist", LocationKind::List).await?;
    let wanted = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(wishlist))).await?;
    let d = deck(&pool, "Sleeved", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.owned, 0);
    assert_eq!(status.available, 0);
    assert_eq!(status.missing, 1);

    let result = allocate(&pool, lotus, wanted, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::ListLocation)));
    Ok(())
}

#[tokio::test]
async fn archived_decks_reject_allocation_changes_until_unarchived() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let d = deck(&pool, "Archived Allocation Guard", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    set_deck_status(&pool, d, DeckStatus::Archived).await?;

    let result = allocate(&pool, lotus, copy, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::DeckArchived)));

    set_deck_status(&pool, d, DeckStatus::Active).await?;
    let allocation = allocate(&pool, lotus, copy, qty(1)?).await?;
    set_deck_status(&pool, d, DeckStatus::Archived).await?;

    let result = deallocate(&pool, lotus, allocation.collection_item_id, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::DeckArchived)));
    assert_eq!(allocation_count(&pool).await?, 1);
    Ok(())
}

#[tokio::test]
async fn foil_copies_can_fill_nonfoil_entries() -> TestResult {
    let pool = db().await?;
    let foil = item(
        &pool,
        NewItem {
            finish: Finish::Foil,
            ..NewItem::new(LOTUS_ALPHA, 1, None)
        },
    )
    .await?;
    let d = deck(&pool, "Foil Allocation", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    assert_eq!(deck_card_row(&pool, lotus).await?.finish, Finish::Nonfoil);

    let status = allocation_status(&pool, lotus).await?;
    assert_eq!((status.owned, status.available, status.missing), (1, 1, 0));
    assert!(
        status
            .candidates
            .iter()
            .any(|c| c.item.id == foil && c.item.finish == Finish::Foil && c.available == 1)
    );

    allocate(&pool, lotus, foil, qty(1)?).await?;

    let row = deck_card_row(&pool, lotus).await?;
    assert_eq!(row.finish, Finish::Foil);
    assert_eq!(
        row.preferred_printing_id,
        Some(ScryfallId::new(LOTUS_ALPHA))
    );
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(
        (status.allocated, status.available, status.missing),
        (1, 0, 0)
    );
    Ok(())
}

#[tokio::test]
async fn allocations_in_any_deck_make_copies_unavailable_elsewhere() -> TestResult {
    let pool = db().await?;
    let brewing_item = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let archived_item = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let active = deck(&pool, "Active", DeckStatus::Active).await?;
    let brewing = deck(&pool, "Brew", DeckStatus::Brewing).await?;
    let archive = deck(&pool, "Archive", DeckStatus::Brewing).await?;
    let active_lotus = deck_card(&pool, active, BLACK_LOTUS, 2, Zone::Mainboard).await?;
    let brewing_lotus = deck_card(&pool, brewing, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    let archived_lotus = deck_card(&pool, archive, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    allocate(&pool, brewing_lotus, brewing_item, qty(1)?).await?;
    allocate(&pool, archived_lotus, archived_item, qty(1)?).await?;
    set_deck_status(&pool, archive, DeckStatus::Archived).await?;

    let result = deallocate(&pool, archived_lotus, archived_item, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::DeckArchived)));

    let status = allocation_status(&pool, active_lotus).await?;
    assert_eq!(status.available, 0);
    assert_eq!(status.allocated_elsewhere, 2);
    assert_eq!(status.missing, 2);

    let result = allocate(&pool, active_lotus, brewing_item, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::NotEnoughAvailable)));
    Ok(())
}

#[tokio::test]
async fn basic_lands_are_treated_as_allocated() -> TestResult {
    let pool = db().await?;
    let d = deck(&pool, "Basics", DeckStatus::Brewing).await?;
    let plains = deck_card(&pool, d, PLAINS, 12, Zone::Mainboard).await?;

    let status = allocation_status(&pool, plains).await?;

    assert_eq!(status.state, AllocationState::BasicLand);
    assert_eq!(status.required, 12);
    assert_eq!(status.owned, 0);
    assert_eq!(status.allocated, 12);
    assert_eq!(status.available, 0);
    assert_eq!(status.missing, 0);
    Ok(())
}

#[tokio::test]
async fn allocating_a_physical_copy_clears_the_getting_tag() -> TestResult {
    let pool = db().await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let d = deck(&pool, "Getting", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    set_preferred_printing(&pool, lotus, LOTUS_ALPHA).await?;
    set_tag(&pool, lotus, DeckCardTag::Getting).await?;

    allocate(&pool, lotus, copy, qty(1)?).await?;

    assert_eq!(deck_card_row(&pool, lotus).await?.tag, None);
    Ok(())
}

#[tokio::test]
async fn rejects_other_cards_extra_copies_and_unknown_rows() -> TestResult {
    let pool = db().await?;
    let lotus_copies = item(&pool, NewItem::new(LOTUS_ALPHA, 2, None)).await?;
    let time_walk = item(&pool, NewItem::new(TIME_WALK_ALPHA, 1, None)).await?;
    let d = deck(&pool, "Deck", DeckStatus::Active).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    let result = allocate(&pool, lotus, time_walk, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::CardMismatch)));

    let result = allocate(&pool, lotus, lotus_copies, qty(2)?).await;
    assert!(matches!(result, Err(AllocationError::AlreadyAllocated)));

    let result = deallocate(&pool, lotus, lotus_copies, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::AllocationNotFound)));

    let missing = manavault_allocation::DeckCardId(-1);
    let result = allocate(&pool, missing, lotus_copies, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::DeckCardNotFound)));

    assert_eq!(allocation_count(&pool).await?, 0);
    let row = item_row(&pool, lotus_copies).await?;
    assert_eq!((row.quantity, row.location_id), (2, None));
    Ok(())
}
