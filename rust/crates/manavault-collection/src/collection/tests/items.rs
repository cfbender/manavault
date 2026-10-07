//! Collection item CRUD, listings, filters, sorting, and totals.

use async_graphql::MaybeUndefined;
use pretty_assertions::assert_eq;
use serde_json::json;

use super::*;
use crate::collection::changes::{ItemError, bulk_update, set_trade_quantity, update};
use crate::collection::filters::{LocationFilter, Sort};
use manavault_catalog::testing::fixtures::{black_lotus, plains, time_walk};

fn sorted(field: &str, direction: &str) -> Page {
    Page {
        sort: Sort::parse(Some(field), Some(direction)),
        ..Page::default()
    }
}

#[tokio::test]
async fn crud_persists_exact_printing_inventory() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;

    let item = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(2),
            condition: Some("lightly_played"),
            language: Some("en"),
            finish: Some("nonfoil"),
            notes: Some("First page"),
            ..Attrs::default()
        },
    )
    .await;
    assert_eq!(item.record.quantity.as_i64(), 2);
    assert_eq!(item.record.scryfall_id.as_str(), "scryfall-printing-1");
    assert_eq!(item.record.purchase_price_cents, Some(10_000_000));
    assert_eq!(item.card().unwrap().name, "Black Lotus");

    assert_eq!(search_ids(&app, "lotus").await, [item.record.id]);

    let updated = update(
        app.db(),
        item.record.id,
        ItemChanges {
            quantity: MaybeUndefined::Value(3),
            condition: MaybeUndefined::Value("near_mint".into()),
            language: MaybeUndefined::Value("ja".into()),
            location_id: MaybeUndefined::Null,
            notes: MaybeUndefined::Value("Updated".into()),
            purchase_price_cents: MaybeUndefined::Value(12_345),
            ..ItemChanges::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.record.quantity.as_i64(), 3);
    assert_eq!(updated.record.condition.as_str(), "near_mint");
    assert_eq!(updated.record.language, "ja");
    assert_eq!(updated.record.finish.as_str(), "nonfoil");
    assert_eq!(updated.record.location_id, None);
    assert_eq!(updated.record.notes.as_deref(), Some("Updated"));
    assert_eq!(updated.record.purchase_price_cents, Some(12_345));

    let error = update(
        app.db(),
        item.record.id,
        ItemChanges {
            condition: MaybeUndefined::Value("creased".into()),
            finish: MaybeUndefined::Value("gold".into()),
            ..ItemChanges::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "condition is invalid, finish is invalid");

    let error = update(
        app.db(),
        item.record.id,
        ItemChanges {
            finish: MaybeUndefined::Value("foil".into()),
            ..ItemChanges::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "finish is not available for this printing"
    );

    let error = update(
        app.db(),
        item.record.id,
        ItemChanges {
            quantity: MaybeUndefined::Value(0),
            language: MaybeUndefined::Value(String::new()),
            ..ItemChanges::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "language can't be blank, quantity must be greater than 0"
    );

    let deleted = changes::delete(app.db(), item.record.id).await.unwrap();
    assert_eq!(deleted.record.id, item.record.id);
    assert_eq!(
        item_ids(&app, &ItemFilters::default()).await,
        Vec::<i64>::new()
    );
    assert!(matches!(
        changes::delete(app.db(), item.record.id).await,
        Err(ItemError::NotFound)
    ));
}

#[tokio::test]
async fn creating_coerces_an_unavailable_finish_and_rejects_missing_references() {
    let app = TestApp::new().await;
    app.import_cards(&[time_walk()]).await;
    let item = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("nonfoil"),
            ..Attrs::default()
        },
    )
    .await;
    assert_eq!(item.record.finish.as_str(), "foil");
    // The default purchase price is the price of the coerced finish.
    assert_eq!(item.record.purchase_price_cents, Some(500));

    let error = changes::create(
        app.db(),
        &app.state.prices,
        Attrs {
            finish: Some("foil"),
            location_id: Some(999),
            ..Attrs::default()
        }
        .changes("scryfall-printing-2"),
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "location id does not exist");
    let error = changes::create(
        app.db(),
        &app.state.prices,
        Attrs::default().changes("nope"),
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "scryfall id does not exist");
    // A finish error comes before the reference checks.
    let error = changes::create(
        app.db(),
        &app.state.prices,
        Attrs {
            location_id: Some(999),
            ..Attrs::default()
        }
        .changes("scryfall-printing-2"),
    )
    .await
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "finish is not available for this printing"
    );
}

#[tokio::test]
async fn bulk_updates_apply_one_change_set_transactionally() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk(), plains()])
        .await;
    let lotus = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            purchase_price_cents: Some(100),
            ..Attrs::default()
        },
    )
    .await;
    let plains = create_item(
        &app,
        "scryfall-printing-basic-plains",
        Attrs {
            purchase_price_cents: Some(200),
            ..Attrs::default()
        },
    )
    .await;
    let changes = ItemChanges {
        finish: MaybeUndefined::Value("nonfoil".into()),
        purchase_price_cents: MaybeUndefined::Value(350),
        ..ItemChanges::default()
    };
    let ids = [lotus.record.id, plains.record.id];
    assert_eq!(bulk_update(app.db(), &ids, changes).await.unwrap(), 2);
    for id in ids {
        let item = reload(&app, id).await.unwrap();
        assert_eq!(item.record.finish.as_str(), "nonfoil");
        assert_eq!(item.record.purchase_price_cents, Some(350));
    }

    let walk = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            purchase_price_cents: Some(400),
            ..Attrs::default()
        },
    )
    .await;
    let error = bulk_update(
        app.db(),
        &[walk.record.id, lotus.record.id],
        ItemChanges {
            finish: MaybeUndefined::Value("foil".into()),
            purchase_price_cents: MaybeUndefined::Value(999),
            ..ItemChanges::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "finish is not available for this printing"
    );
    let walk = reload(&app, walk.record.id).await.unwrap();
    assert_eq!(walk.record.purchase_price_cents, Some(400));
    let lotus = reload(&app, lotus.record.id).await.unwrap();
    assert_eq!(lotus.record.purchase_price_cents, Some(350));
}

#[tokio::test]
async fn bulk_updates_report_missing_ids_without_changing_items() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let item = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            notes: Some("unchanged"),
            ..Attrs::default()
        },
    )
    .await;
    let missing = item.record.id + 10_000;
    let error = bulk_update(
        app.db(),
        &[item.record.id, missing],
        ItemChanges {
            notes: MaybeUndefined::Value("changed".into()),
            ..ItemChanges::default()
        },
    )
    .await
    .unwrap_err();
    assert!(matches!(error, ItemError::Missing(ref ids) if ids == &[missing]));
    let item = reload(&app, item.record.id).await.unwrap();
    assert_eq!(item.record.notes.as_deref(), Some("unchanged"));
}

#[tokio::test]
async fn offered_quantities_are_bounded_and_keep_the_for_trade_flag_in_sync() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let item = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(4),
            for_trade: Some(true),
            ..Attrs::default()
        },
    )
    .await;
    assert!(item.record.for_trade);
    assert_eq!(item.record.for_trade_quantity, 4);
    let for_trade = ItemFilters {
        for_trade: true,
        ..ItemFilters::default()
    };
    assert_eq!(count(&app, &for_trade).await, 4);

    let change = |changes: ItemChanges| update(app.db(), item.record.id, changes);
    let item = change(ItemChanges {
        for_trade_quantity: MaybeUndefined::Value(2),
        ..ItemChanges::default()
    })
    .await
    .unwrap();
    assert!(item.record.for_trade);
    assert_eq!(item.record.for_trade_quantity, 2);
    assert_eq!(count(&app, &for_trade).await, 2);

    // The quantity wins over the legacy flag.
    let item = change(ItemChanges {
        for_trade_quantity: MaybeUndefined::Value(2),
        for_trade: MaybeUndefined::Value(false),
        ..ItemChanges::default()
    })
    .await
    .unwrap();
    assert!(item.record.for_trade);
    assert_eq!(item.record.for_trade_quantity, 2);

    let error = change(ItemChanges {
        for_trade_quantity: MaybeUndefined::Null,
        ..ItemChanges::default()
    })
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "for trade quantity can't be blank");
    let error = change(ItemChanges {
        for_trade_quantity: MaybeUndefined::Value(5),
        ..ItemChanges::default()
    })
    .await
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "for trade quantity cannot exceed quantity owned"
    );

    let item = change(ItemChanges {
        quantity: MaybeUndefined::Value(1),
        ..ItemChanges::default()
    })
    .await
    .unwrap();
    assert_eq!(item.record.for_trade_quantity, 1);

    let item = change(ItemChanges {
        for_trade: MaybeUndefined::Value(false),
        ..ItemChanges::default()
    })
    .await
    .unwrap();
    assert!(!item.record.for_trade);
    assert_eq!(item.record.for_trade_quantity, 0);
    assert_eq!(item_ids(&app, &for_trade).await, Vec::<i64>::new());
}

#[tokio::test]
async fn trade_quantity_is_spread_over_a_printing_group_in_id_order() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let first = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(2),
            ..Attrs::default()
        },
    )
    .await;
    let second = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(3),
            condition: Some("lightly_played"),
            ..Attrs::default()
        },
    )
    .await;
    let ids = [second.record.id, first.record.id];
    let result = set_trade_quantity(app.db(), &ids, 4).await.unwrap();
    assert_eq!(
        (result.quantity, result.total_quantity, result.updated_count),
        (4, 5, 2)
    );
    assert_eq!(
        reload(&app, first.record.id)
            .await
            .unwrap()
            .record
            .for_trade_quantity,
        2
    );
    assert_eq!(
        reload(&app, second.record.id)
            .await
            .unwrap()
            .record
            .for_trade_quantity,
        2
    );

    for quantity in [6, -1] {
        let error = set_trade_quantity(app.db(), &ids, quantity)
            .await
            .unwrap_err();
        assert!(matches!(error, ItemError::InvalidTradeQuantity));
    }
    assert_eq!(
        reload(&app, first.record.id)
            .await
            .unwrap()
            .record
            .for_trade_quantity,
        2
    );

    let missing = first.record.id + 10_000;
    let error = set_trade_quantity(app.db(), &[first.record.id, missing], 1)
        .await
        .unwrap_err();
    assert!(matches!(error, ItemError::Missing(ref ids) if ids == &[missing]));
    assert_eq!(
        reload(&app, first.record.id)
            .await
            .unwrap()
            .record
            .for_trade_quantity,
        2
    );
}

#[tokio::test]
async fn groups_combine_rows_by_printing_before_pagination() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let lotus_one = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(2),
            purchase_price_cents: Some(100),
            ..Attrs::default()
        },
    )
    .await;
    let lotus_two = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(3),
            purchase_price_cents: Some(200),
            ..Attrs::default()
        },
    )
    .await;
    let walk = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            ..Attrs::default()
        },
    )
    .await;

    let totals = queries::totals(app.db(), &ItemFilters::default())
        .await
        .unwrap();
    assert_eq!((totals.quantity, totals.entries, totals.groups), (6, 3, 2));

    let groups = queries::list_item_groups(
        app.db(),
        &ItemFilters::default(),
        Page {
            limit: 1,
            ..Page::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(groups.len(), 1);
    let lotus = &groups[0];
    assert_eq!(lotus.printing_id.as_str(), "scryfall-printing-1");
    assert_eq!(lotus.quantity, 5);
    let ids: Vec<i64> = lotus.items.iter().map(|i| i.record.id).collect();
    assert_eq!(ids, [lotus_one.record.id, lotus_two.record.id]);

    let groups = queries::list_item_groups(
        app.db(),
        &ItemFilters::default(),
        Page {
            limit: 1,
            offset: 1,
            ..Page::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(groups[0].printing_id.as_str(), "scryfall-printing-2");
    assert_eq!(groups[0].quantity, 1);
    assert_eq!(groups[0].items[0].record.id, walk.record.id);

    assert_eq!(
        item_ids(&app, &ItemFilters::default()).await,
        [lotus_one.record.id, lotus_two.record.id, walk.record.id]
    );
}

#[tokio::test]
async fn for_trade_groups_include_every_owned_row_of_a_printing() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let offered = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(2),
            for_trade_quantity: Some(1),
            ..Attrs::default()
        },
    )
    .await;
    let unoffered = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(3),
            ..Attrs::default()
        },
    )
    .await;
    let filters = ItemFilters {
        for_trade: true,
        ..ItemFilters::default()
    };
    let groups = queries::list_item_groups(app.db(), &filters, Page::default())
        .await
        .unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].quantity, 5);
    let rows: Vec<(i64, i64)> = groups[0]
        .items
        .iter()
        .map(|i| (i.record.id, i.record.for_trade_quantity))
        .collect();
    assert_eq!(rows, [(offered.record.id, 1), (unoffered.record.id, 0)]);
    // Totals under the trade filter count offered copies.
    assert_eq!(count(&app, &filters).await, 1);
}

#[tokio::test]
async fn listings_hide_list_items_unless_scoped_to_the_list() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let binder = create_location(&app, "Trade Binder", "binder").await;
    let list = create_location(&app, "Wishlist", "list").await;
    let binder_item = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(2),
            location_id: Some(binder.id),
            ..Attrs::default()
        },
    )
    .await;
    let list_item = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(3),
            location_id: Some(list.id),
            ..Attrs::default()
        },
    )
    .await;

    assert_eq!(
        item_ids(&app, &ItemFilters::default()).await,
        [binder_item.record.id]
    );
    assert_eq!(count(&app, &ItemFilters::default()).await, 2);
    let at_list = ItemFilters::at(LocationFilter::Id(list.id));
    assert_eq!(item_ids(&app, &at_list).await, [list_item.record.id]);
    assert_eq!(count(&app, &at_list).await, 3);
    let including = ItemFilters {
        include_list_locations: true,
        ..ItemFilters::default()
    };
    assert_eq!(
        item_ids(&app, &including).await,
        [binder_item.record.id, list_item.record.id]
    );
}

#[tokio::test]
async fn pagination_uses_limit_and_offset_deterministically() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            language: Some("ja"),
            ..Attrs::default()
        },
    )
    .await;
    let lotus = create_item(&app, "scryfall-printing-1", Attrs::default()).await;
    let first = list(
        &app,
        &ItemFilters::default(),
        Page {
            limit: 1,
            ..Page::default()
        },
    )
    .await;
    assert_eq!(first, [lotus.record.id]);
    let second = list(
        &app,
        &ItemFilters::default(),
        Page {
            limit: 1,
            offset: 1,
            ..Page::default()
        },
    )
    .await;
    assert_ne!(second, [lotus.record.id]);
    assert_eq!(second.len(), 1);
}

#[tokio::test]
async fn filters_cover_search_and_metadata_facets() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let binder = create_location(&app, "Trade Binder", "binder").await;
    let lotus = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(binder.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let walk = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            condition: Some("damaged"),
            language: Some("ja"),
            finish: Some("foil"),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;

    assert_eq!(search_ids(&app, "lotus").await, [lotus]);
    assert_eq!(search_ids(&app, "84").await, [walk]);
    assert_eq!(search_ids(&app, "scryfall-printing-2").await, [walk]);
    let filters = |f: fn(&mut ItemFilters)| {
        let mut filters = ItemFilters::default();
        f(&mut filters);
        filters
    };
    assert_eq!(
        item_ids(&app, &filters(|f| f.card_id = "oracle-1".into())).await,
        [lotus]
    );
    assert_eq!(
        item_ids(&app, &filters(|f| f.card_id = "missing".into())).await,
        Vec::<i64>::new()
    );
    assert_eq!(
        item_ids(&app, &filters(|f| f.condition = "near_mint".into())).await,
        [lotus]
    );
    assert_eq!(
        item_ids(
            &app,
            &filters(|f| {
                f.language = "ja".into();
                f.finish = "foil".into();
            })
        )
        .await,
        [walk]
    );
    assert_eq!(
        item_ids(&app, &ItemFilters::at(LocationFilter::Id(binder.id))).await,
        [lotus]
    );
    assert_eq!(
        item_ids(&app, &ItemFilters::at(LocationFilter::Unfiled)).await,
        [walk]
    );
    assert_eq!(
        item_ids(&app, &ItemFilters::at(LocationFilter::Id(9_999))).await,
        Vec::<i64>::new()
    );
}

#[tokio::test]
async fn filters_support_scryfall_search_syntax() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk(), plains()])
        .await;
    let lotus = create_item(&app, "scryfall-printing-1", Attrs::default())
        .await
        .record
        .id;
    let walk = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            language: Some("ja"),
            finish: Some("foil"),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let plains = create_item(&app, "scryfall-printing-basic-plains", Attrs::default())
        .await
        .record
        .id;

    assert_eq!(
        search_ids(&app, "t:artifact mv=0 id:c usd>999").await,
        [lotus]
    );
    assert_eq!(
        search_ids(&app, "set:lea number:84 lang:ja is:foil").await,
        [walk]
    );
    assert_eq!(search_ids(&app, "rarity:common type:land").await, [plains]);
    assert_eq!(
        search_ids(&app, "lotus or \"time walk\"").await,
        [lotus, walk]
    );
    assert_eq!(search_ids(&app, "-type:land").await, [lotus, walk]);
    assert_eq!(search_ids(&app, "c:u oracle:extra").await, [walk]);
    assert_eq!(search_ids(&app, "rarity>=rare").await, [lotus, walk]);
    assert_eq!(count(&app, &ItemFilters::search("rarity>=rare")).await, 2);
    assert_eq!(search_ids(&app, "artist:Someone").await, Vec::<i64>::new());
    assert_eq!(search_ids(&app, "is:permanent").await, [lotus, plains]);
    assert_eq!(search_ids(&app, "is:spell").await, [lotus, walk]);
    assert_eq!(search_ids(&app, "quantity>1").await, Vec::<i64>::new());
    assert_eq!(search_ids(&app, "lang!=ja").await, [lotus, plains]);
    // The search filter only matches the copy's finish, not the printing's.
    assert_eq!(search_ids(&app, "is:nonfoil").await, [lotus, plains]);
}

#[tokio::test]
async fn filters_support_allocation_status() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let lotus = create_item(&app, "scryfall-printing-1", Attrs::default())
        .await
        .record
        .id;
    let walk = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let deck = insert_deck(&app, "Allocation Filter", "brewing").await;
    allocate(&app, deck, lotus, 1).await;

    assert_eq!(search_ids(&app, "is:allocated").await, [lotus]);
    assert_eq!(search_ids(&app, "is:unallocated").await, [walk]);
    assert_eq!(search_ids(&app, "-is:allocated").await, [walk]);
    assert_eq!(search_ids(&app, "lotus is:allocated").await, [lotus]);
    assert_eq!(
        search_ids(&app, "lotus is:unallocated").await,
        Vec::<i64>::new()
    );
    let unallocated = ItemFilters {
        unallocated_only: true,
        ..ItemFilters::default()
    };
    assert_eq!(item_ids(&app, &unallocated).await, [walk]);
}

#[tokio::test]
async fn filters_support_purchase_price_added_date_and_sets() {
    let app = TestApp::new().await;
    let walk_card = merge(
        time_walk(),
        json!({"set": "leb", "set_name": "Limited Edition Beta"}),
    );
    let plains_card = merge(plains(), json!({"set": "tst", "set_name": "Test Set"}));
    app.import_cards(&[black_lotus(), walk_card, plains_card])
        .await;
    let lotus = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            purchase_price_cents: Some(1_250),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let walk = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            purchase_price_cents: Some(300),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let plains = create_item(&app, "scryfall-printing-basic-plains", Attrs::default())
        .await
        .record
        .id;
    // Plains has no price, so it gets no default purchase price either.
    assert_eq!(
        reload(&app, plains)
            .await
            .unwrap()
            .record
            .purchase_price_cents,
        None
    );
    set_item_column(&app, lotus, "inserted_at", "2026-01-01T23:59:59Z").await;
    set_item_column(&app, walk, "inserted_at", "2026-01-02T00:00:00Z").await;
    set_item_column(&app, plains, "inserted_at", "2026-02-15T12:00:00Z").await;

    for (q, expected) in [
        ("paid>=12.50", vec![lotus]),
        ("paid>3", vec![lotus]),
        ("paid<=3", vec![walk]),
        ("paid=$3", vec![walk]),
        ("paid>=1 paid<=20", vec![lotus, walk]),
        ("paid>=cheap", vec![]),
        ("is:paid", vec![lotus, walk]),
        ("is:unpaid", vec![plains]),
        ("added=2026-01-01", vec![lotus]),
        ("added<=2026-01-01", vec![lotus]),
        ("added<2026-01-02", vec![lotus]),
        ("added>2026-01-01", vec![plains, walk]),
        ("added>=2026-01-02", vec![plains, walk]),
        ("added>=2026-01-01 added<=2026-01-31", vec![lotus, walk]),
        ("added!=2026-01-02", vec![lotus, plains]),
        ("added>=yesterday", vec![]),
        ("set:tst", vec![plains]),
        ("(set:lea or set:tst)", vec![lotus, plains]),
        ("(set:leb or set:tst)", vec![plains, walk]),
        ("(set:leb or set:tst) paid<5 added>=2026-01-02", vec![walk]),
    ] {
        assert_eq!(search_ids(&app, q).await, expected, "{q}");
    }
}

#[tokio::test]
async fn sorting_supports_quantity_price_value_gain_and_added_date() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let lotus = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            purchase_price_cents: Some(11_000_000),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let walk = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            quantity: Some(3),
            language: Some("ja"),
            finish: Some("foil"),
            purchase_price_cents: Some(100),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    set_item_column(&app, lotus, "inserted_at", "2026-01-01T00:00:00Z").await;
    set_item_column(&app, walk, "inserted_at", "2026-01-02T00:00:00Z").await;
    let all = ItemFilters::default();
    for (field, direction, expected) in [
        ("quantity", "desc", [walk, lotus]),
        ("quantity", "asc", [lotus, walk]),
        ("price", "asc", [walk, lotus]),
        ("price", "desc", [lotus, walk]),
        ("value_gain", "asc", [lotus, walk]),
        ("value_gain", "desc", [walk, lotus]),
        ("added", "asc", [lotus, walk]),
        ("added", "desc", [walk, lotus]),
        ("name", "desc", [walk, lotus]),
        ("bogus", "sideways", [lotus, walk]),
    ] {
        assert_eq!(
            list(&app, &all, sorted(field, direction)).await,
            expected,
            "{field} {direction}"
        );
    }
    for (direction, expected) in [("asc", [lotus, walk]), ("desc", [walk, lotus])] {
        let groups = queries::list_item_groups(app.db(), &all, sorted("value_gain", direction))
            .await
            .unwrap();
        let ids: Vec<i64> = groups
            .iter()
            .flat_map(|g| g.items.iter().map(|i| i.record.id))
            .collect();
        assert_eq!(ids, expected, "groups {direction}");
    }
}

#[tokio::test]
async fn value_summaries_count_current_and_purchase_prices() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let list = create_location(&app, "Wishlist", "list").await;
    create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(2),
            purchase_price_cents: Some(100),
            ..Attrs::default()
        },
    )
    .await;
    create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            ..Attrs::default()
        },
    )
    .await;
    create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            location_id: Some(list.id),
            ..Attrs::default()
        },
    )
    .await;
    let summary = queries::value_summary(app.db(), &ItemFilters::default())
        .await
        .unwrap();
    assert_eq!(summary.item_count, 3);
    assert_eq!(summary.total_price_cents, 2 * 10_000_000 + 500);
    assert_eq!(summary.purchase_price_cents, 2 * 100 + 500);
}

#[tokio::test]
async fn cached_counts_reflect_writes() {
    let app = TestApp::new().await;
    assert_eq!(count(&app, &ItemFilters::default()).await, 0);
    assert_eq!(location::count(app.db()).await.unwrap(), 0);
    app.import_cards(&[black_lotus()]).await;
    create_item(&app, "scryfall-printing-1", Attrs::default()).await;
    create_location(&app, "Box", "box").await;
    assert_eq!(count(&app, &ItemFilters::default()).await, 1);
    assert_eq!(location::count(app.db()).await.unwrap(), 1);
}

#[tokio::test]
async fn exports_render_csv_and_text() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let binder = create_location(&app, "Binder, \"Main\"", "binder").await;
    create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(2),
            location_id: Some(binder.id),
            purchase_price_cents: Some(150),
            ..Attrs::default()
        },
    )
    .await;
    create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            condition: Some("lightly_played"),
            language: Some("ja"),
            ..Attrs::default()
        },
    )
    .await;
    let csv =
        crate::collection::export::export_csv(app.db(), &app.state.prices, &ItemFilters::default())
            .await
            .unwrap();
    assert_eq!(
        csv,
        "Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Location,Purchase Price\n\
         2,Black Lotus,lea,232,nonfoil,near_mint,en,\"Binder, \"\"Main\"\"\",$1.50\n\
         1,Time Walk,lea,84,foil,lightly_played,ja,,$5"
    );
    let text = crate::collection::export::export_text(app.db(), &ItemFilters::default())
        .await
        .unwrap();
    assert_eq!(
        text,
        "2x Black Lotus (LEA) 232\n1x Time Walk (LEA) 84 [foil] {lightly_played} <ja>"
    );
}

#[tokio::test]
async fn exports_include_every_matching_row() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    for _ in 0..101 {
        create_item(&app, "scryfall-printing-1", Attrs::default()).await;
    }
    let csv =
        crate::collection::export::export_csv(app.db(), &app.state.prices, &ItemFilters::default())
            .await
            .unwrap();
    assert_eq!(csv.split('\n').count(), 102);
    let text = crate::collection::export::export_text(app.db(), &ItemFilters::default())
        .await
        .unwrap();
    assert_eq!(text.split('\n').count(), 101);
}
