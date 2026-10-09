//! Deck-wide allocation scenarios: allocating and moving whole decks, bulk
//! allocation previews, buylist counting, and deck disassembly.

mod support;

use lotus::{Finish, OracleId, ScryfallId};
use manavault_allocation::{
    AllocationError, AllocationMode, AllocationState, BuylistOptions, BuylistReason, DeckCardTag,
    DeckStatus, LocationKind, PullListEntry, Requirement, Zone, add_collection_item_to_deck,
    allocate, allocate_deck_pull_list, allocate_proxy, allocation_status,
    bulk_add_collection_items_to_deck, bulk_allocate_deck, bulk_deallocate_deck_cards,
    clear_deck_card_allocations, deallocate_proxy, deck_allocation_statuses, deck_buylist_needs,
    disassemble_deck, preview_bulk_allocate_deck, preview_deck_disassembly, requirement_statuses,
    switch_allocation_to_preferred_printing, trim_deck_card_allocations,
};
use support::{
    BLACK_LOTUS, LOTUS_ALPHA, LOTUS_BETA, NewItem, PLAINS, TIME_WALK, TIME_WALK_ALPHA, TestResult,
    allocation_count, allocation_exists, card, clear_preferred_printing, db, deck, deck_card,
    deck_card_ids, deck_card_row, deck_status, item, item_ids, item_row, location, printing, qty,
    set_deck_card_finish, set_deck_card_quantity, set_deck_status, set_external_source,
    set_image_uris, set_preferred_printing, set_proxy_quantity, set_tag,
};

fn candidate_allocated(
    status: &manavault_allocation::AllocationStatus,
    id: manavault_allocation::CollectionItemId,
) -> Option<(u32, u32)> {
    status
        .candidates
        .iter()
        .find(|c| c.item.id == id)
        .map(|c| (c.allocated, c.available))
}

// --- Preferred printing and finish switches (UpdateDeckCard) ---------------

#[tokio::test]
async fn switching_the_preferred_printing_moves_the_allocation_to_a_matching_copy() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let alpha = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let beta = item(&pool, NewItem::new(LOTUS_BETA, 1, Some(binder))).await?;
    let d = deck(&pool, "Printing Switch", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    set_preferred_printing(&pool, lotus, LOTUS_ALPHA).await?;
    set_tag(&pool, lotus, DeckCardTag::Getting).await?;
    allocate(&pool, lotus, alpha, qty(1)?).await?;
    set_tag(&pool, lotus, DeckCardTag::Getting).await?;

    set_preferred_printing(&pool, lotus, LOTUS_BETA).await?;
    let mut tx = pool.begin().await?;
    let card = switch_allocation_to_preferred_printing(&mut tx, lotus).await?;
    tx.commit().await?;

    assert_eq!(
        card.preferred_printing_id,
        Some(ScryfallId::new(LOTUS_BETA))
    );
    // Switching clears the getting tag in the returned card.
    assert_eq!(card.tag, None);
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(candidate_allocated(&status, alpha), Some((0, 1)));
    assert_eq!(candidate_allocated(&status, beta), Some((1, 0)));
    assert_eq!(item_row(&pool, alpha).await?.location_id, Some(binder));
    assert_eq!(item_row(&pool, beta).await?.location_id, None);
    Ok(())
}

#[tokio::test]
async fn switching_to_an_unavailable_printing_releases_the_old_copy() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let alpha = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let d = deck(&pool, "Unavailable Switch", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    set_preferred_printing(&pool, lotus, LOTUS_ALPHA).await?;
    allocate(&pool, lotus, alpha, qty(1)?).await?;

    set_preferred_printing(&pool, lotus, LOTUS_BETA).await?;
    let mut tx = pool.begin().await?;
    switch_allocation_to_preferred_printing(&mut tx, lotus).await?;
    tx.commit().await?;

    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 0);
    assert_eq!(candidate_allocated(&status, alpha), Some((0, 1)));
    assert_eq!(item_row(&pool, alpha).await?.location_id, Some(binder));
    assert_eq!(
        deck_card_row(&pool, lotus).await?.preferred_printing_id,
        Some(ScryfallId::new(LOTUS_BETA))
    );
    Ok(())
}

#[tokio::test]
async fn switching_the_finish_moves_the_allocation_to_the_exact_finish() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Finish Binder", LocationKind::Binder).await?;
    let nonfoil = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let foil = item(
        &pool,
        NewItem {
            finish: Finish::Foil,
            ..NewItem::new(LOTUS_ALPHA, 1, Some(binder))
        },
    )
    .await?;
    let d = deck(&pool, "Finish Switch", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    set_preferred_printing(&pool, lotus, LOTUS_ALPHA).await?;
    allocate(&pool, lotus, nonfoil, qty(1)?).await?;

    set_deck_card_finish(&pool, lotus, Finish::Foil).await?;
    let mut tx = pool.begin().await?;
    let card = switch_allocation_to_preferred_printing(&mut tx, lotus).await?;
    tx.commit().await?;

    assert_eq!(card.finish, Finish::Foil);
    assert_eq!(
        card.preferred_printing_id,
        Some(ScryfallId::new(LOTUS_ALPHA))
    );
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(candidate_allocated(&status, nonfoil), Some((0, 1)));
    assert_eq!(candidate_allocated(&status, foil), Some((1, 0)));
    assert_eq!(item_row(&pool, nonfoil).await?.location_id, Some(binder));
    assert_eq!(item_row(&pool, foil).await?.location_id, None);
    Ok(())
}

#[tokio::test]
async fn switching_to_an_unavailable_finish_or_clearing_the_printing_releases() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Unavailable Finish", LocationKind::Binder).await?;
    let nonfoil = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let d = deck(&pool, "Unavailable Finish Switch", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    set_preferred_printing(&pool, lotus, LOTUS_ALPHA).await?;
    allocate(&pool, lotus, nonfoil, qty(1)?).await?;

    set_deck_card_finish(&pool, lotus, Finish::Foil).await?;
    let mut tx = pool.begin().await?;
    switch_allocation_to_preferred_printing(&mut tx, lotus).await?;
    tx.commit().await?;
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 0);
    assert_eq!(candidate_allocated(&status, nonfoil), Some((0, 1)));
    assert_eq!(item_row(&pool, nonfoil).await?.location_id, Some(binder));

    // Clearing the preferred printing releases an exact allocation too.
    set_deck_card_finish(&pool, lotus, Finish::Nonfoil).await?;
    allocate(&pool, lotus, nonfoil, qty(1)?).await?;
    clear_preferred_printing(&pool, lotus).await?;
    let mut tx = pool.begin().await?;
    let card = switch_allocation_to_preferred_printing(&mut tx, lotus).await?;
    tx.commit().await?;
    assert_eq!(card.preferred_printing_id, None);
    assert_eq!(allocation_status(&pool, lotus).await?.allocated, 0);
    assert_eq!(item_row(&pool, nonfoil).await?.location_id, Some(binder));
    Ok(())
}

// --- Bulk allocation --------------------------------------------------------

#[tokio::test]
async fn bulk_allocation_uses_exact_printings_before_matching_alternates() -> TestResult {
    let pool = db().await?;
    let exact = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let alternate = item(&pool, NewItem::new(LOTUS_BETA, 1, None)).await?;
    let d = deck(&pool, "Bulk", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 2, Zone::Mainboard).await?;
    set_preferred_printing(&pool, lotus, LOTUS_ALPHA).await?;

    let preview = preview_bulk_allocate_deck(&pool, d, AllocationMode::ExactPrintings).await?;
    assert_eq!(
        (preview.allocated, preview.cards, preview.skipped),
        (1, 1, 0)
    );
    let [entry] = preview.entries.as_slice() else {
        return Err(format!("one entry expected: {:?}", preview.entries).into());
    };
    assert_eq!(
        (entry.quantity.get(), entry.exact, entry.item.id),
        (1, true, exact)
    );

    let result = bulk_allocate_deck(&pool, d, AllocationMode::ExactPrintings).await?;
    assert_eq!((result.allocated, result.cards, result.skipped), (1, 1, 0));
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(candidate_allocated(&status, exact).map(|c| c.0), Some(1));
    assert_eq!(
        candidate_allocated(&status, alternate).map(|c| c.0),
        Some(0)
    );

    let preview = preview_bulk_allocate_deck(&pool, d, AllocationMode::MatchingPrintings).await?;
    let [entry] = preview.entries.as_slice() else {
        return Err(format!("one entry expected: {:?}", preview.entries).into());
    };
    assert_eq!(
        (entry.quantity.get(), entry.exact, entry.item.id),
        (1, false, alternate)
    );

    let result = bulk_allocate_deck(&pool, d, AllocationMode::MatchingPrintings).await?;
    assert_eq!((result.allocated, result.cards, result.skipped), (1, 1, 0));
    assert_eq!(
        deck_card_row(&pool, lotus).await?.preferred_printing_id,
        Some(ScryfallId::new(LOTUS_BETA))
    );
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 2);
    assert_eq!(
        candidate_allocated(&status, alternate).map(|c| c.0),
        Some(1)
    );
    Ok(())
}

#[tokio::test]
async fn bulk_preview_covers_every_card_and_skips_cards_without_candidates() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Preview Binder", LocationKind::Binder).await?;
    let d = deck(&pool, "Preview Batch Deck", DeckStatus::Brewing).await?;
    for index in 1..=6 {
        let oracle = format!("oracle-preview-batch-{index}");
        let scryfall = format!("scryfall-preview-batch-{index}");
        card(
            &pool,
            &oracle,
            &format!("Preview Batch {index}"),
            "Artifact",
        )
        .await?;
        printing(&pool, &scryfall, &oracle, "pbt", &index.to_string()).await?;
        item(&pool, NewItem::new(&scryfall, 1, Some(binder))).await?;
        deck_card(&pool, d, &oracle, 1, Zone::Mainboard).await?;
    }
    // Wanted, not owned: needs copies but has no candidate.
    deck_card(&pool, d, TIME_WALK, 1, Zone::Mainboard).await?;
    // Considering cards are never planned.
    deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Considering).await?;
    item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;

    let preview = preview_bulk_allocate_deck(&pool, d, AllocationMode::MatchingPrintings).await?;
    assert_eq!(preview.mode, AllocationMode::MatchingPrintings);
    assert_eq!(
        (preview.allocated, preview.cards, preview.skipped),
        (6, 6, 1)
    );
    assert!(preview.entries.iter().all(|e| !e.exact));
    assert!(
        preview
            .entries
            .iter()
            .all(|e| e.deck_card.zone == Zone::Mainboard)
    );

    let missing = preview_bulk_allocate_deck(
        &pool,
        manavault_allocation::DeckId(999),
        AllocationMode::MatchingPrintings,
    )
    .await;
    assert!(matches!(missing, Err(AllocationError::DeckNotFound)));
    assert!(matches!(
        AllocationMode::parse("everything"),
        Err(AllocationError::InvalidAllocationMode)
    ));
    Ok(())
}

// --- Pull lists -------------------------------------------------------------

#[tokio::test]
async fn pull_lists_apply_in_one_transaction_and_skip_failed_entries() -> TestResult {
    let pool = db().await?;
    let lotus_item = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let walk_item = item(
        &pool,
        NewItem {
            finish: Finish::Foil,
            ..NewItem::new(TIME_WALK_ALPHA, 1, None)
        },
    )
    .await?;
    let d = deck(&pool, "Pull List", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    let walk = deck_card(&pool, d, TIME_WALK, 1, Zone::Mainboard).await?;
    let other = deck(&pool, "Other", DeckStatus::Brewing).await?;
    let other_lotus = deck_card(&pool, other, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    let entries = [
        PullListEntry::new(lotus.0, lotus_item.0, Some(1))?,
        PullListEntry::new(walk.0, walk_item.0, None)?,
        // A lotus copy cannot fill the Time Walk entry.
        PullListEntry::new(walk.0, lotus_item.0, Some(1))?,
        // A deck card from another deck is rejected without aborting the rest.
        PullListEntry::new(other_lotus.0, lotus_item.0, Some(1))?,
    ];
    let result = allocate_deck_pull_list(&pool, d, &entries).await?;
    assert_eq!((result.allocated, result.cards, result.skipped), (2, 2, 2));
    assert_eq!(allocation_status(&pool, lotus).await?.allocated, 1);
    assert_eq!(allocation_status(&pool, walk).await?.allocated, 1);
    assert_eq!(allocation_status(&pool, other_lotus).await?.allocated, 0);
    let walk_row = deck_card_row(&pool, walk).await?;
    assert_eq!(
        walk_row.preferred_printing_id,
        Some(ScryfallId::new(TIME_WALK_ALPHA))
    );
    assert_eq!(walk_row.finish, Finish::Foil);

    assert!(matches!(
        PullListEntry::new(lotus.0, 0, None),
        Err(AllocationError::InvalidPullListEntry)
    ));
    assert!(matches!(
        PullListEntry::new(0, lotus_item.0, None),
        Err(AllocationError::InvalidPullListEntry)
    ));
    assert!(matches!(
        PullListEntry::new(lotus.0, lotus_item.0, Some(0)),
        Err(AllocationError::InvalidPullListEntry)
    ));
    Ok(())
}

#[tokio::test]
async fn pull_lists_can_serve_several_entries_from_one_item() -> TestResult {
    let pool = db().await?;
    let source = item(
        &pool,
        NewItem {
            purchase_price_cents: Some(1234),
            ..NewItem::new(LOTUS_ALPHA, 3, None)
        },
    )
    .await?;
    let d = deck(&pool, "Playset", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 3, Zone::Mainboard).await?;

    let entries = [
        PullListEntry::new(lotus.0, source.0, Some(2))?,
        PullListEntry::new(lotus.0, source.0, Some(1))?,
    ];
    let result = allocate_deck_pull_list(&pool, d, &entries).await?;
    assert_eq!((result.allocated, result.cards, result.skipped), (3, 1, 0));
    assert_eq!(allocation_status(&pool, lotus).await?.allocated, 3);

    let items = item_ids(&pool).await?;
    assert_eq!(items.len(), 2);
    for id in items {
        assert_eq!(item_row(&pool, id).await?.purchase_price_cents, Some(1234));
    }
    Ok(())
}

// --- Basic lands ------------------------------------------------------------

#[tokio::test]
async fn basic_lands_never_need_allocating_or_buying() -> TestResult {
    let pool = db().await?;
    let d = deck(&pool, "Basics", DeckStatus::Brewing).await?;
    let plains = deck_card(&pool, d, PLAINS, 12, Zone::Mainboard).await?;

    let status = allocation_status(&pool, plains).await?;
    assert_eq!(status.state, AllocationState::BasicLand);
    assert_eq!(
        (
            status.required,
            status.owned,
            status.allocated,
            status.available,
            status.missing
        ),
        (12, 0, 12, 0, 0)
    );

    let preview = preview_bulk_allocate_deck(&pool, d, AllocationMode::MatchingPrintings).await?;
    assert_eq!(
        (
            preview.allocated,
            preview.cards,
            preview.skipped,
            preview.entries.len()
        ),
        (0, 0, 0, 0)
    );
    let result = bulk_allocate_deck(&pool, d, AllocationMode::MatchingPrintings).await?;
    assert_eq!((result.allocated, result.cards, result.skipped), (0, 0, 0));

    assert_eq!(
        deck_buylist_needs(&pool, d, BuylistOptions::default()).await?,
        vec![]
    );
    let with_basics = BuylistOptions {
        include_basic_lands: true,
        ..BuylistOptions::default()
    };
    assert_eq!(deck_buylist_needs(&pool, d, with_basics).await?, vec![]);
    Ok(())
}

#[tokio::test]
async fn snow_basics_count_as_basic_lands() -> TestResult {
    let pool = db().await?;
    card(
        &pool,
        "oracle-snow-plains",
        "Snow-Covered Plains",
        "Basic Snow Land — Plains",
    )
    .await?;
    printing(
        &pool,
        "scryfall-printing-snow-plains",
        "oracle-snow-plains",
        "khm",
        "1",
    )
    .await?;
    let snow_item = item(
        &pool,
        NewItem::new("scryfall-printing-snow-plains", 2, None),
    )
    .await?;
    let d = deck(&pool, "Snow Basics", DeckStatus::Brewing).await?;
    let plains = deck_card(&pool, d, "oracle-snow-plains", 8, Zone::Mainboard).await?;

    let status = allocation_status(&pool, plains).await?;
    assert_eq!(status.state, AllocationState::BasicLand);
    assert_eq!((status.allocated, status.missing), (8, 0));
    assert_eq!(
        deck_buylist_needs(&pool, d, BuylistOptions::default()).await?,
        vec![]
    );

    // Bulk-adding snow basics creates the card without reserving the copy.
    let other = deck(&pool, "Snow Add", DeckStatus::Brewing).await?;
    let cards =
        bulk_add_collection_items_to_deck(&pool, other, &[snow_item], Zone::Mainboard).await?;
    assert_eq!(cards.len(), 1);
    assert_eq!(allocation_count(&pool).await?, 0);
    assert_eq!(item_row(&pool, snow_item).await?.quantity, 2);
    Ok(())
}

#[tokio::test]
async fn adding_a_single_basic_land_copy_joins_the_deck_without_reserving() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Land Box", LocationKind::Binder).await?;
    let plains_item = item(
        &pool,
        NewItem::new("scryfall-printing-basic-plains", 3, Some(binder)),
    )
    .await?;
    let d = deck(&pool, "Single Basic", DeckStatus::Brewing).await?;

    // A basic land already counts as fully allocated, so the single-item add
    // must behave like the bulk add: grow the deck card and reserve nothing.
    let card = add_collection_item_to_deck(&pool, d, plains_item, Zone::Mainboard).await?;
    assert_eq!(card.oracle_id, OracleId::new(PLAINS));
    assert_eq!(card.quantity.get(), 1);
    let again = add_collection_item_to_deck(&pool, d, plains_item, Zone::Mainboard).await?;
    assert_eq!(again.id, card.id);
    assert_eq!(again.quantity.get(), 2);

    assert_eq!(allocation_count(&pool).await?, 0);
    let row = item_row(&pool, plains_item).await?;
    assert_eq!((row.quantity, row.location_id), (3, Some(binder)));
    let status = allocation_status(&pool, card.id).await?;
    assert_eq!(status.state, AllocationState::BasicLand);
    Ok(())
}

// --- Adding collection items to decks ---------------------------------------

#[tokio::test]
async fn bulk_add_creates_deck_cards_and_allocations() -> TestResult {
    let pool = db().await?;
    let lotus_item = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let walk_item = item(
        &pool,
        NewItem {
            finish: Finish::Foil,
            ..NewItem::new(TIME_WALK_ALPHA, 1, None)
        },
    )
    .await?;
    let d = deck(&pool, "Bulk Add", DeckStatus::Brewing).await?;

    let cards =
        bulk_add_collection_items_to_deck(&pool, d, &[lotus_item, walk_item], Zone::Mainboard)
            .await?;
    let [lotus, walk] = cards.as_slice() else {
        return Err(format!("two deck cards expected: {cards:?}").into());
    };
    assert_eq!(lotus.oracle_id, OracleId::new(BLACK_LOTUS));
    assert_eq!(
        (lotus.quantity.get(), lotus.zone, lotus.finish),
        (1, Zone::Mainboard, Finish::Nonfoil)
    );
    assert_eq!(
        lotus.preferred_printing_id,
        Some(ScryfallId::new(LOTUS_ALPHA))
    );
    assert_eq!(walk.oracle_id, OracleId::new(TIME_WALK));
    assert_eq!((walk.quantity.get(), walk.finish), (1, Finish::Foil));
    assert_eq!(
        walk.preferred_printing_id,
        Some(ScryfallId::new(TIME_WALK_ALPHA))
    );

    let status = allocation_status(&pool, lotus.id).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(
        candidate_allocated(&status, lotus_item).map(|c| c.0),
        Some(1)
    );
    let status = allocation_status(&pool, walk.id).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(
        candidate_allocated(&status, walk_item).map(|c| c.0),
        Some(1)
    );
    Ok(())
}

#[tokio::test]
async fn bulk_add_grows_existing_cards_and_rejects_mixed_finishes() -> TestResult {
    let pool = db().await?;
    let first = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let second = item(&pool, NewItem::new(LOTUS_BETA, 1, None)).await?;
    let foil = item(
        &pool,
        NewItem {
            finish: Finish::Foil,
            ..NewItem::new(LOTUS_ALPHA, 1, None)
        },
    )
    .await?;
    let d = deck(&pool, "Grow", DeckStatus::Brewing).await?;
    let existing = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    let result = bulk_add_collection_items_to_deck(&pool, d, &[first, foil], Zone::Mainboard).await;
    assert!(matches!(result, Err(AllocationError::FinishMismatch)));
    let result = bulk_add_collection_items_to_deck(&pool, d, &[foil], Zone::Mainboard).await;
    assert!(matches!(result, Err(AllocationError::FinishMismatch)));

    let cards =
        bulk_add_collection_items_to_deck(&pool, d, &[first, second, first], Zone::Mainboard)
            .await?;
    let [card] = cards.as_slice() else {
        return Err(format!("one deck card expected: {cards:?}").into());
    };
    assert_eq!(card.id, existing);
    assert_eq!(card.quantity.get(), 3);
    assert_eq!(
        card.preferred_printing_id,
        Some(ScryfallId::new(LOTUS_ALPHA))
    );
    assert_eq!(allocation_status(&pool, existing).await?.allocated, 2);

    let missing = bulk_add_collection_items_to_deck(
        &pool,
        d,
        &[manavault_allocation::CollectionItemId(999)],
        Zone::Mainboard,
    )
    .await;
    assert!(matches!(
        missing,
        Err(AllocationError::CollectionItemNotFound)
    ));
    assert_eq!(
        bulk_add_collection_items_to_deck(&pool, d, &[], Zone::Mainboard).await?,
        vec![]
    );
    Ok(())
}

#[tokio::test]
async fn adding_list_items_rolls_back_the_deck_card() -> TestResult {
    let pool = db().await?;
    let list = location(&pool, "Wishlist", LocationKind::List).await?;
    let wanted = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(list))).await?;
    let d = deck(&pool, "Bulk Reject", DeckStatus::Brewing).await?;

    let result = bulk_add_collection_items_to_deck(&pool, d, &[wanted], Zone::Mainboard).await;
    assert!(matches!(result, Err(AllocationError::ListLocation)));
    let result = add_collection_item_to_deck(&pool, d, wanted, Zone::Mainboard).await;
    assert!(matches!(result, Err(AllocationError::ListLocation)));

    assert_eq!(deck_card_ids(&pool, d).await?, vec![]);
    assert_eq!(item_row(&pool, wanted).await?.location_id, Some(list));
    Ok(())
}

#[tokio::test]
async fn bulk_add_rejects_copies_that_are_no_longer_available() -> TestResult {
    let pool = db().await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let d = deck(&pool, "Bulk Over Allocation", DeckStatus::Brewing).await?;

    let cards = bulk_add_collection_items_to_deck(&pool, d, &[copy], Zone::Mainboard).await?;
    assert_eq!(cards.len(), 1);
    let result = bulk_add_collection_items_to_deck(&pool, d, &[copy], Zone::Mainboard).await;
    assert!(matches!(result, Err(AllocationError::NotEnoughAvailable)));

    let ids = deck_card_ids(&pool, d).await?;
    assert_eq!(ids.len(), 1);
    let [only] = ids.as_slice() else {
        return Err("one deck card expected".into());
    };
    assert_eq!(deck_card_row(&pool, *only).await?.quantity, 1);
    Ok(())
}

#[tokio::test]
async fn bulk_add_clears_the_getting_tag() -> TestResult {
    let pool = db().await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let d = deck(&pool, "Bulk Getting", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    set_preferred_printing(&pool, lotus, LOTUS_ALPHA).await?;
    set_tag(&pool, lotus, DeckCardTag::Getting).await?;

    let cards = bulk_add_collection_items_to_deck(&pool, d, &[copy], Zone::Mainboard).await?;
    assert_eq!(cards.first().map(|c| c.tag), Some(None));
    assert_eq!(deck_card_row(&pool, lotus).await?.tag, None);
    Ok(())
}

#[tokio::test]
async fn adding_one_collection_item_creates_and_allocates() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Binder", LocationKind::Binder).await?;
    let copies = item(&pool, NewItem::new(LOTUS_BETA, 2, Some(binder))).await?;
    let d = deck(&pool, "Single Add", DeckStatus::Brewing).await?;

    let card = add_collection_item_to_deck(&pool, d, copies, Zone::Mainboard).await?;
    assert_eq!(card.quantity.get(), 1);
    assert_eq!(
        card.preferred_printing_id,
        Some(ScryfallId::new(LOTUS_BETA))
    );
    assert_eq!(allocation_status(&pool, card.id).await?.allocated, 1);
    assert_eq!(item_row(&pool, copies).await?.quantity, 1);

    let card = add_collection_item_to_deck(&pool, d, copies, Zone::Mainboard).await?;
    assert_eq!(card.quantity.get(), 2);
    assert_eq!(allocation_status(&pool, card.id).await?.allocated, 2);

    // Linked decks own their list remotely.
    set_external_source(&pool, d, "moxfield").await?;
    let result = add_collection_item_to_deck(&pool, d, copies, Zone::Mainboard).await;
    assert!(matches!(result, Err(AllocationError::DeckLinked)));
    let result = bulk_add_collection_items_to_deck(&pool, d, &[copies], Zone::Mainboard).await;
    assert!(matches!(result, Err(AllocationError::DeckLinked)));
    Ok(())
}

// --- Proxies, deallocation, trimming ----------------------------------------

#[tokio::test]
async fn proxy_allocation_counts_without_moving_copies() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let d = deck(&pool, "Proxy Test", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 2, Zone::Mainboard).await?;

    let card = allocate_proxy(&pool, lotus, qty(1)?).await?;
    assert_eq!(card.proxy_quantity, 1);
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(
        (
            status.allocated,
            status.proxy_allocated,
            status.available,
            status.missing
        ),
        (1, 1, 1, 0)
    );
    assert_eq!(item_row(&pool, copy).await?.location_id, Some(binder));

    let allocation = allocate(&pool, lotus, copy, qty(1)?).await?;
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.state, AllocationState::Allocated);
    assert_eq!((status.allocated, status.proxy_allocated), (2, 1));

    deallocate_proxy(&pool, lotus, qty(1)?).await?;
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(
        (status.allocated, status.proxy_allocated, status.missing),
        (1, 0, 1)
    );
    assert_eq!(
        item_row(&pool, allocation.collection_item_id)
            .await?
            .location_id,
        None
    );

    let result = allocate_proxy(&pool, lotus, qty(2)?).await;
    assert!(matches!(result, Err(AllocationError::AlreadyAllocated)));
    let result = deallocate_proxy(&pool, lotus, qty(1)?).await;
    assert!(matches!(
        result,
        Err(AllocationError::ProxyAllocationNotFound)
    ));
    allocate_proxy(&pool, lotus, qty(1)?).await?;
    let result = deallocate_proxy(&pool, lotus, qty(2)?).await;
    assert!(matches!(
        result,
        Err(AllocationError::ProxyAllocationNotFound)
    ));
    Ok(())
}

#[tokio::test]
async fn bulk_deallocation_restores_copies_and_clears_proxies() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let d = deck(&pool, "Bulk Deallocate", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 2, Zone::Mainboard).await?;
    allocate_proxy(&pool, lotus, qty(1)?).await?;
    let allocation = allocate(&pool, lotus, copy, qty(1)?).await?;

    let cards = bulk_deallocate_deck_cards(&pool, &[lotus, lotus]).await?;
    let [card] = cards.as_slice() else {
        return Err(format!("one deck card expected: {cards:?}").into());
    };
    assert_eq!((card.id, card.proxy_quantity), (lotus, 0));
    assert!(!allocation_exists(&pool, allocation.id).await?);
    let row = item_row(&pool, allocation.collection_item_id).await?;
    assert_eq!((row.location_id, row.quantity), (Some(binder), 1));

    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(
        (
            status.allocated,
            status.proxy_allocated,
            status.available,
            status.missing
        ),
        (0, 0, 1, 1)
    );

    let missing =
        bulk_deallocate_deck_cards(&pool, &[lotus, manavault_allocation::DeckCardId(999)]).await;
    assert!(matches!(missing, Err(AllocationError::DeckCardNotFound)));
    set_deck_status(&pool, d, DeckStatus::Archived).await?;
    let archived = bulk_deallocate_deck_cards(&pool, &[lotus]).await;
    assert!(matches!(archived, Err(AllocationError::DeckArchived)));
    Ok(())
}

#[tokio::test]
async fn clearing_a_deck_card_returns_copies_but_keeps_proxies() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Considering Binder", LocationKind::Binder).await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let d = deck(&pool, "Considering Deallocation", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 2, Zone::Mainboard).await?;
    allocate_proxy(&pool, lotus, qty(1)?).await?;
    let allocation = allocate(&pool, lotus, copy, qty(1)?).await?;

    let mut tx = pool.begin().await?;
    clear_deck_card_allocations(&mut tx, lotus).await?;
    tx.commit().await?;

    assert!(!allocation_exists(&pool, allocation.id).await?);
    let row = item_row(&pool, allocation.collection_item_id).await?;
    assert_eq!((row.location_id, row.quantity), (Some(binder), 1));
    assert_eq!(deck_card_row(&pool, lotus).await?.proxy_quantity, 1);
    Ok(())
}

#[tokio::test]
async fn trimming_releases_proxies_first_then_the_oldest_copies() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let box_ = location(&pool, "Box", LocationKind::Box).await?;
    let from_binder = item(&pool, NewItem::new(LOTUS_ALPHA, 2, Some(binder))).await?;
    let from_box = item(&pool, NewItem::new(LOTUS_BETA, 1, Some(box_))).await?;
    let d = deck(&pool, "Trim", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 4, Zone::Mainboard).await?;
    let first = allocate(&pool, lotus, from_binder, qty(2)?).await?;
    let second = allocate(&pool, lotus, from_box, qty(1)?).await?;
    set_proxy_quantity(&pool, lotus, 1).await?;

    // 3 physical copies fit 3; the proxy has to go.
    set_deck_card_quantity(&pool, lotus, 3).await?;
    let mut tx = pool.begin().await?;
    trim_deck_card_allocations(&mut tx, lotus).await?;
    tx.commit().await?;
    assert_eq!(deck_card_row(&pool, lotus).await?.proxy_quantity, 0);
    assert_eq!(allocation_status(&pool, lotus).await?.allocated, 3);

    // Down to 1: the oldest allocation gives back both of its copies.
    set_deck_card_quantity(&pool, lotus, 1).await?;
    let mut tx = pool.begin().await?;
    trim_deck_card_allocations(&mut tx, lotus).await?;
    tx.commit().await?;
    assert!(!allocation_exists(&pool, first.id).await?);
    assert!(allocation_exists(&pool, second.id).await?);
    let status = allocation_status(&pool, lotus).await?;
    assert_eq!(status.allocated, 1);
    assert_eq!(
        item_row(&pool, first.collection_item_id).await?.location_id,
        Some(binder)
    );
    Ok(())
}

// --- Considering zone and archived decks ------------------------------------

#[tokio::test]
async fn considering_cards_never_allocate_copies_or_proxies() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Idea Binder", LocationKind::Binder).await?;
    let copies = item(&pool, NewItem::new(LOTUS_ALPHA, 2, Some(binder))).await?;
    let d = deck(&pool, "Considering Only", DeckStatus::Brewing).await?;

    let cards = bulk_add_collection_items_to_deck(&pool, d, &[copies], Zone::Considering).await?;
    let [idea] = cards.as_slice() else {
        return Err(format!("one deck card expected: {cards:?}").into());
    };
    assert_eq!(idea.zone, Zone::Considering);
    let again = add_collection_item_to_deck(&pool, d, copies, Zone::Considering).await?;
    assert_eq!((again.id, again.quantity.get()), (idea.id, 2));
    assert_eq!(allocation_count(&pool).await?, 0);
    let row = item_row(&pool, copies).await?;
    assert_eq!((row.location_id, row.quantity), (Some(binder), 2));

    let result = allocate(&pool, idea.id, copies, qty(1)?).await;
    assert!(matches!(
        result,
        Err(AllocationError::ConsideringNotAllocatable)
    ));
    let result = allocate_proxy(&pool, idea.id, qty(1)?).await;
    assert!(matches!(
        result,
        Err(AllocationError::ConsideringNotAllocatable)
    ));
    let result = bulk_allocate_deck(&pool, d, AllocationMode::MatchingPrintings).await?;
    assert_eq!(result.allocated, 0);
    assert_eq!(allocation_count(&pool).await?, 0);
    Ok(())
}

#[tokio::test]
async fn archived_decks_reject_deck_wide_allocation_changes() -> TestResult {
    let pool = db().await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let d = deck(&pool, "Archived Allocation Guard", DeckStatus::Archived).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;

    let result = allocate_proxy(&pool, lotus, qty(1)?).await;
    assert!(matches!(result, Err(AllocationError::DeckArchived)));
    let result = bulk_allocate_deck(&pool, d, AllocationMode::ExactPrintings).await;
    assert!(matches!(result, Err(AllocationError::DeckArchived)));
    let result = allocate_deck_pull_list(&pool, d, &[]).await;
    assert!(matches!(result, Err(AllocationError::DeckArchived)));
    let result = add_collection_item_to_deck(&pool, d, copy, Zone::Mainboard).await;
    assert!(matches!(result, Err(AllocationError::DeckArchived)));
    Ok(())
}

// --- Deck-wide statuses -----------------------------------------------------

#[tokio::test]
async fn deck_and_requirement_statuses_match_the_single_card_status() -> TestResult {
    let pool = db().await?;
    let alpha = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let beta = item(&pool, NewItem::new(LOTUS_BETA, 2, None)).await?;
    let d = deck(&pool, "Statuses", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 2, Zone::Mainboard).await?;
    set_preferred_printing(&pool, lotus, LOTUS_BETA).await?;
    let walk = deck_card(&pool, d, TIME_WALK, 1, Zone::Mainboard).await?;
    let other = deck(&pool, "Other", DeckStatus::Brewing).await?;
    let other_lotus = deck_card(&pool, other, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    allocate(&pool, other_lotus, alpha, qty(1)?).await?;

    let statuses = deck_allocation_statuses(&pool, d).await?;
    assert_eq!(statuses.len(), 2);
    assert_eq!(
        statuses.get(&lotus),
        Some(&allocation_status(&pool, lotus).await?)
    );
    assert_eq!(
        statuses.get(&walk),
        Some(&allocation_status(&pool, walk).await?)
    );
    let lotus_status = statuses.get(&lotus).ok_or("lotus status")?;
    // The preferred printing comes first.
    assert_eq!(
        lotus_status.candidates.first().map(|c| c.item.id),
        Some(beta)
    );
    assert_eq!(lotus_status.state, AllocationState::Available);
    assert_eq!(
        statuses.get(&walk).map(|s| s.state),
        Some(AllocationState::Missing)
    );

    let requirements = requirement_statuses(
        &pool,
        &[
            Requirement {
                oracle_id: OracleId::new(BLACK_LOTUS),
                quantity: qty(1)?,
                type_line: Some("Artifact".to_owned()),
            },
            Requirement {
                oracle_id: OracleId::new(PLAINS),
                quantity: qty(1)?,
                type_line: Some("Basic Land — Plains".to_owned()),
            },
        ],
    )
    .await?;
    let lotus_need = requirements
        .get(&OracleId::new(BLACK_LOTUS))
        .ok_or("lotus requirement")?;
    assert_eq!(
        (
            lotus_need.owned,
            lotus_need.available,
            lotus_need.allocated_elsewhere
        ),
        (3, 2, 1)
    );
    assert_eq!(lotus_need.state, AllocationState::Available);
    let plains_need = requirements
        .get(&OracleId::new(PLAINS))
        .ok_or("plains requirement")?;
    assert_eq!(plains_need.state, AllocationState::BasicLand);
    assert_eq!((plains_need.allocated, plains_need.missing), (1, 0));
    Ok(())
}

// --- Buylist needs ----------------------------------------------------------

#[tokio::test]
async fn buylist_distinguishes_missing_from_owned_but_unavailable() -> TestResult {
    let pool = db().await?;
    let _available = item(&pool, NewItem::new(LOTUS_ALPHA, 1, None)).await?;
    let unavailable = item(&pool, NewItem::new(LOTUS_BETA, 1, None)).await?;
    let target = deck(&pool, "Target", DeckStatus::Active).await?;
    let other = deck(&pool, "Other", DeckStatus::Active).await?;
    let target_lotus = deck_card(&pool, target, BLACK_LOTUS, 3, Zone::Mainboard).await?;
    set_preferred_printing(&pool, target_lotus, LOTUS_ALPHA).await?;
    let other_lotus = deck_card(&pool, other, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    allocate(&pool, other_lotus, unavailable, qty(1)?).await?;
    assert_eq!(allocation_status(&pool, target_lotus).await?.available, 1);

    let needs = deck_buylist_needs(&pool, target, BuylistOptions::default()).await?;
    let [need] = needs.as_slice() else {
        return Err(format!("one need expected: {needs:?}").into());
    };
    assert_eq!(need.card_name, "Black Lotus");
    assert_eq!(
        (
            need.quantity.get(),
            need.missing,
            need.unavailable,
            need.reason
        ),
        (2, 1, 1, BuylistReason::MissingAndUnavailable)
    );
    assert_eq!(need.reason.as_str(), "missing and unavailable");

    let assume = BuylistOptions {
        assume_no_owned: true,
        ..BuylistOptions::default()
    };
    let needs = deck_buylist_needs(&pool, target, assume).await?;
    let [need] = needs.as_slice() else {
        return Err(format!("one need expected: {needs:?}").into());
    };
    assert_eq!(
        (
            need.quantity.get(),
            need.missing,
            need.unavailable,
            need.reason
        ),
        (3, 3, 0, BuylistReason::Missing)
    );
    Ok(())
}

#[tokio::test]
async fn buylist_zones_and_getting_tags() -> TestResult {
    let pool = db().await?;
    let d = deck(&pool, "Zone Deck", DeckStatus::Brewing).await?;
    let names = [
        (
            "zone-mainboard",
            "Mainboard Zone Card",
            Zone::Mainboard,
            false,
        ),
        (
            "zone-commander",
            "Commander Zone Card",
            Zone::Commander,
            false,
        ),
        ("zone-getting", "Getting Tagged Card", Zone::Mainboard, true),
        (
            "zone-considering-a",
            "Considering Zone Card A",
            Zone::Considering,
            false,
        ),
        (
            "zone-considering-b",
            "Considering Zone Card B",
            Zone::Considering,
            false,
        ),
    ];
    for (oracle, name, zone, getting) in names {
        card(&pool, oracle, name, "Artifact").await?;
        let id = deck_card(&pool, d, oracle, 1, zone).await?;
        if getting {
            set_tag(&pool, id, DeckCardTag::Getting).await?;
        }
    }
    let assume = BuylistOptions {
        assume_no_owned: true,
        ..BuylistOptions::default()
    };
    let mut names: Vec<String> = deck_buylist_needs(&pool, d, assume)
        .await?
        .into_iter()
        .map(|n| n.card_name)
        .collect();
    names.sort();
    assert_eq!(names, ["Commander Zone Card", "Mainboard Zone Card"]);

    let considering = BuylistOptions {
        include_considering: true,
        ..assume
    };
    let mut names: Vec<String> = deck_buylist_needs(&pool, d, considering)
        .await?
        .into_iter()
        .map(|n| n.card_name)
        .collect();
    names.sort();
    assert_eq!(
        names,
        [
            "Commander Zone Card",
            "Considering Zone Card A",
            "Considering Zone Card B",
            "Mainboard Zone Card"
        ]
    );

    // Basic lands only appear when assuming nothing is owned and asked for.
    let plains = deck_card(&pool, d, PLAINS, 2, Zone::Mainboard).await?;
    let has_plains = |needs: &[manavault_allocation::BuylistNeed]| {
        needs.iter().any(|n| n.deck_card.id == plains)
    };
    assert!(!has_plains(&deck_buylist_needs(&pool, d, assume).await?));
    let with_basics = BuylistOptions {
        include_basic_lands: true,
        ..assume
    };
    assert!(has_plains(
        &deck_buylist_needs(&pool, d, with_basics).await?
    ));
    Ok(())
}

// --- Disassembly ------------------------------------------------------------

#[tokio::test]
async fn disassembly_preview_reports_stable_moves_without_writing() -> TestResult {
    let pool = db().await?;
    set_image_uris(
        &pool,
        LOTUS_ALPHA,
        r#"{"normal":"https://example.test/black-lotus.jpg"}"#,
    )
    .await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let walk_item = item(
        &pool,
        NewItem {
            finish: Finish::Foil,
            ..NewItem::new(TIME_WALK_ALPHA, 1, Some(binder))
        },
    )
    .await?;
    let lotus_item = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let d = deck(&pool, "Powered", DeckStatus::Brewing).await?;
    let walk = deck_card(&pool, d, TIME_WALK, 2, Zone::Mainboard).await?;
    set_deck_card_finish(&pool, walk, Finish::Foil).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    let walk_allocation = allocate(&pool, walk, walk_item, qty(1)?).await?;
    let lotus_allocation = allocate(&pool, lotus, lotus_item, qty(1)?).await?;

    let result = preview_deck_disassembly(&pool, d).await?;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count,
            result.dry_run
        ),
        (3, 2, 1, true)
    );
    let [lotus_move, walk_move] = result.moves.as_slice() else {
        return Err(format!("two moves expected: {:?}", result.moves).into());
    };
    assert_eq!(
        lotus_move.collection_item_id,
        lotus_allocation.collection_item_id
    );
    assert_eq!(lotus_move.card_name, "Black Lotus");
    assert_eq!(lotus_move.card_id, OracleId::new(BLACK_LOTUS));
    assert_eq!(
        (
            lotus_move.set_code.as_str(),
            lotus_move.collector_number.as_str()
        ),
        ("lea", "232")
    );
    assert_eq!(
        lotus_move.image_url.as_deref(),
        Some("https://example.test/black-lotus.jpg")
    );
    assert_eq!(
        (lotus_move.quantity.get(), lotus_move.finish),
        (1, Finish::Nonfoil)
    );
    assert_eq!(lotus_move.from_deck_id, d);
    assert_eq!(lotus_move.from_location_name, "Powered");
    assert_eq!(lotus_move.to_location_id, Some(binder));
    assert_eq!(lotus_move.to_location_name, "Trade Binder");

    assert_eq!(
        walk_move.collection_item_id,
        walk_allocation.collection_item_id
    );
    assert_eq!(walk_move.card_name, "Time Walk");
    assert_eq!(walk_move.image_url, None);
    assert_eq!(
        (walk_move.quantity.get(), walk_move.finish),
        (1, Finish::Foil)
    );

    assert_eq!(deck_status(&pool, d).await?, DeckStatus::Brewing);
    assert!(allocation_exists(&pool, lotus_allocation.id).await?);
    assert!(allocation_exists(&pool, walk_allocation.id).await?);
    assert_eq!(
        item_row(&pool, lotus_allocation.collection_item_id)
            .await?
            .location_id,
        None
    );
    Ok(())
}

#[tokio::test]
async fn disassembly_restores_copies_and_archives_the_deck() -> TestResult {
    let pool = db().await?;
    let binder = location(&pool, "Trade Binder", LocationKind::Binder).await?;
    let copy = item(&pool, NewItem::new(LOTUS_ALPHA, 1, Some(binder))).await?;
    let unfiled = item(&pool, NewItem::new(TIME_WALK_ALPHA, 1, None)).await?;
    let d = deck(&pool, "Sleeved", DeckStatus::Active).await?;
    let lotus = deck_card(&pool, d, BLACK_LOTUS, 1, Zone::Mainboard).await?;
    let walk = deck_card(&pool, d, TIME_WALK, 1, Zone::Mainboard).await?;
    let allocation = allocate(&pool, lotus, copy, qty(1)?).await?;
    let walk_allocation = allocate(&pool, walk, unfiled, qty(1)?).await?;

    let result = disassemble_deck(&pool, d).await?;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count,
            result.dry_run
        ),
        (2, 2, 0, false)
    );
    let destinations: Vec<_> = result
        .moves
        .iter()
        .map(|m| (m.to_location_id, m.to_location_name.as_str()))
        .collect();
    assert_eq!(
        destinations,
        [(Some(binder), "Trade Binder"), (None, "Unfiled")]
    );
    assert_eq!(deck_status(&pool, d).await?, DeckStatus::Archived);
    assert_eq!(deck_card_ids(&pool, d).await?, vec![lotus, walk]);
    assert_eq!(allocation_count(&pool).await?, 0);
    let row = item_row(&pool, allocation.collection_item_id).await?;
    assert_eq!((row.location_id, row.quantity), (Some(binder), 1));
    let row = item_row(&pool, walk_allocation.collection_item_id).await?;
    assert_eq!((row.location_id, row.quantity), (None, 1));
    Ok(())
}

#[tokio::test]
async fn disassembly_handles_empty_and_unallocated_decks() -> TestResult {
    let pool = db().await?;
    let empty = deck(&pool, "Empty", DeckStatus::Brewing).await?;
    let preview = preview_deck_disassembly(&pool, empty).await?;
    assert_eq!(
        (
            preview.checked_count,
            preview.moved_count,
            preview.skipped_count,
            preview.dry_run
        ),
        (0, 0, 0, true)
    );
    assert_eq!(preview.moves, vec![]);
    let result = disassemble_deck(&pool, empty).await?;
    assert!(!result.dry_run);
    assert_eq!(deck_status(&pool, empty).await?, DeckStatus::Archived);

    let unallocated = deck(&pool, "Unallocated", DeckStatus::Brewing).await?;
    let lotus = deck_card(&pool, unallocated, BLACK_LOTUS, 2, Zone::Mainboard).await?;
    let result = disassemble_deck(&pool, unallocated).await?;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count
        ),
        (2, 0, 2)
    );
    assert_eq!(result.moves, vec![]);
    assert_eq!(deck_status(&pool, unallocated).await?, DeckStatus::Archived);
    assert_eq!(deck_card_ids(&pool, unallocated).await?, vec![lotus]);

    let missing = disassemble_deck(&pool, manavault_allocation::DeckId(999)).await;
    assert!(matches!(missing, Err(AllocationError::DeckNotFound)));
    Ok(())
}
