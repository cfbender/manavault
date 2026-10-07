//! Bulk clean.

use std::collections::HashMap;

use pretty_assertions::assert_eq;
use serde_json::json;

use super::*;
use crate::collection::bulk_clean::{
    BulkCleanOptions, BulkCleanResult, PullRequest, RemovePullsError, preview, remove,
};
use crate::test_support::fixtures::{plains, time_walk};

struct Setup {
    app: TestApp,
    box_id: i64,
    box_item: i64,
    unfiled: i64,
    binder_item: i64,
}

/// `legality_card("Llanowar Elves", ["G"], ...)` with overrides.
fn elves(overrides: serde_json::Value) -> serde_json::Value {
    merge(
        merge(
            time_walk(),
            json!({
                "id": "scryfall-printing-llanowar-elves",
                "oracle_id": "oracle-llanowar-elves",
                "name": "Llanowar Elves",
                "type_line": "Creature — Elf Druid",
                "colors": ["G"],
                "color_identity": ["G"],
                "legalities": {"commander": "legal"},
                "set": "tst",
                "set_name": "Test Set",
                "collector_number": "llanowar-elves",
                "lang": "en",
                "finishes": ["nonfoil"],
                "prices": {},
                "released_at": "2026-01-01"
            }),
        ),
        overrides,
    )
}

async fn item(
    app: &TestApp,
    scryfall_id: &str,
    quantity: i64,
    location_id: Option<i64>,
    finish: &'static str,
) -> i64 {
    create_item(
        app,
        scryfall_id,
        Attrs {
            quantity: Some(quantity),
            location_id,
            finish: Some(finish),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id
}

async fn setup() -> Setup {
    let app = TestApp::new().await;
    app.import_cards(&[
        elves(json!({"id": "elves-a", "prices": {"usd": "0.10"}})),
        elves(json!({
            "id": "elves-b",
            "collector_number": "b",
            "finishes": ["nonfoil", "foil"],
            "prices": {"usd": "0.05", "usd_foil": "0.01"}
        })),
        elves(json!({"id": "elves-c", "collector_number": "c", "prices": {"usd": "1.00"}})),
        plains(),
    ])
    .await;
    let box_location = create_location(&app, "Box A", "box").await;
    let binder = create_location(&app, "Binder", "binder").await;
    let list = create_location(&app, "Wishlist", "list").await;
    let box_item = item(&app, "elves-a", 5, Some(box_location.id), "nonfoil").await;
    let unfiled = item(&app, "elves-b", 3, None, "nonfoil").await;
    let binder_item = item(&app, "elves-b", 4, Some(binder.id), "nonfoil").await;
    item(&app, "elves-c", 20, Some(box_location.id), "nonfoil").await;
    item(&app, "elves-a", 2, Some(list.id), "nonfoil").await;
    item(
        &app,
        "scryfall-printing-basic-plains",
        6,
        Some(box_location.id),
        "nonfoil",
    )
    .await;
    let allocated = item(&app, "elves-a", 1, Some(box_location.id), "nonfoil").await;
    let deck = insert_deck(&app, "Elves", "brewing").await;
    allocate(&app, deck, allocated, 1).await;
    Setup {
        app,
        box_id: box_location.id,
        box_item,
        unfiled,
        binder_item,
    }
}

async fn clean(app: &TestApp, options: BulkCleanOptions) -> BulkCleanResult {
    preview(app.db(), &options).await.unwrap()
}

fn pulls(result: &BulkCleanResult) -> Vec<(i64, i64)> {
    result.cards[0]
        .pulls
        .iter()
        .map(|pull| (pull.collection_item_id, pull.quantity))
        .collect()
}

#[tokio::test]
async fn pulls_surplus_cheap_copies_cheapest_and_largest_first() {
    let s = setup().await;
    let result = clean(&s.app, BulkCleanOptions::default()).await;
    assert_eq!(
        (
            result.max_price_cents,
            result.min_copies,
            result.keep_copies,
            result.prefer_keep_foils
        ),
        (20, 10, 4, true)
    );
    assert_eq!(
        (
            result.card_count,
            result.pull_quantity,
            result.pull_value_cents
        ),
        (1, 8, 45)
    );
    let card = &result.cards[0];
    assert_eq!(
        (card.card_name.as_str(), card.total_copies),
        ("Llanowar Elves", 12)
    );
    let summary: Vec<(i64, i64, &str)> = card
        .pulls
        .iter()
        .map(|p| {
            (
                p.collection_item_id,
                p.quantity,
                p.from_location_name.as_str(),
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            (s.binder_item, 4, "Binder"),
            (s.unfiled, 3, "Unfiled"),
            (s.box_item, 1, "Box A")
        ]
    );
    let last = card.pulls.last().unwrap();
    assert_eq!(
        (last.price_cents, last.owned_quantity, last.from_location_id),
        (10, 5, Some(s.box_id))
    );
}

#[tokio::test]
async fn thresholds_are_configurable() {
    let s = setup().await;
    for options in [
        BulkCleanOptions {
            min_copies: Some(13),
            ..BulkCleanOptions::default()
        },
        BulkCleanOptions {
            max_price_cents: Some(6),
            ..BulkCleanOptions::default()
        },
        BulkCleanOptions {
            keep_copies: Some(12),
            ..BulkCleanOptions::default()
        },
    ] {
        assert_eq!(clean(&s.app, options).await.cards.len(), 0);
    }
    let result = clean(
        &s.app,
        BulkCleanOptions {
            min_copies: Some(5),
            keep_copies: Some(0),
            ..BulkCleanOptions::default()
        },
    )
    .await;
    assert_eq!(result.pull_quantity, 18);
    let cards: Vec<(&str, i64)> = result
        .cards
        .iter()
        .map(|c| (c.card_name.as_str(), c.pull_quantity))
        .collect();
    assert_eq!(cards, [("Llanowar Elves", 12), ("Plains", 6)]);
}

#[tokio::test]
async fn cards_are_alphabetical_with_colors_and_types() {
    let s = setup().await;
    item(
        &s.app,
        "scryfall-printing-basic-plains",
        10,
        None,
        "nonfoil",
    )
    .await;
    let result = clean(
        &s.app,
        BulkCleanOptions {
            min_copies: Some(5),
            ..BulkCleanOptions::default()
        },
    )
    .await;
    let cards: Vec<(&str, i64, Vec<String>, Option<&str>)> = result
        .cards
        .iter()
        .map(|c| {
            (
                c.card_name.as_str(),
                c.total_copies,
                c.colors.clone(),
                c.type_line.as_deref(),
            )
        })
        .collect();
    assert_eq!(
        cards,
        [
            (
                "Llanowar Elves",
                12,
                vec!["G".to_owned()],
                Some("Creature — Elf Druid")
            ),
            ("Plains", 16, vec![], Some("Basic Land — Plains")),
        ]
    );
}

#[tokio::test]
async fn foils_are_pulled_last_unless_the_preference_is_off() {
    let s = setup().await;
    let foil = item(&s.app, "elves-b", 2, None, "foil").await;
    let result = clean(&s.app, BulkCleanOptions::default()).await;
    assert!(result.prefer_keep_foils);
    assert_eq!(result.cards[0].total_copies, 14);
    assert_eq!(
        pulls(&result),
        [(s.binder_item, 4), (s.unfiled, 3), (s.box_item, 3)]
    );
    let result = clean(
        &s.app,
        BulkCleanOptions {
            prefer_keep_foils: Some(false),
            ..BulkCleanOptions::default()
        },
    )
    .await;
    assert_eq!(pulls(&result)[0], (foil, 2));
}

#[tokio::test]
async fn removes_pulled_copies_and_deletes_emptied_stacks() {
    let s = setup().await;
    let removed = remove(
        s.app.db(),
        &[
            PullRequest {
                collection_item_id: s.binder_item,
                quantity: 4,
            },
            PullRequest {
                collection_item_id: s.box_item,
                quantity: 3,
            },
        ],
    )
    .await
    .unwrap();
    assert_eq!(removed, 7);
    assert!(reload(&s.app, s.binder_item).await.is_none());
    assert_eq!(
        reload(&s.app, s.box_item)
            .await
            .unwrap()
            .record
            .quantity
            .as_i64(),
        2
    );

    let error = remove(
        s.app.db(),
        &[
            PullRequest {
                collection_item_id: s.unfiled,
                quantity: 1,
            },
            PullRequest {
                collection_item_id: s.box_item,
                quantity: 3,
            },
        ],
    )
    .await
    .unwrap_err();
    assert!(matches!(error, RemovePullsError::Stale));
    assert_eq!(
        reload(&s.app, s.unfiled)
            .await
            .unwrap()
            .record
            .quantity
            .as_i64(),
        3
    );
}

#[tokio::test]
async fn kept_copies_swap_for_copies_from_other_stacks() {
    let s = setup().await;
    let result = clean(&s.app, BulkCleanOptions::default()).await;
    assert_eq!(result.cards[0].swappable_copies, 4);

    let mut kept = HashMap::from([(s.binder_item, 3)]);
    let result = clean(
        &s.app,
        BulkCleanOptions {
            kept: kept.clone(),
            ..BulkCleanOptions::default()
        },
    )
    .await;
    assert_eq!(
        (
            result.cards[0].pull_quantity,
            result.cards[0].swappable_copies
        ),
        (8, 1)
    );
    assert_eq!(
        pulls(&result),
        [(s.binder_item, 1), (s.unfiled, 3), (s.box_item, 4)]
    );

    kept.insert(s.unfiled, 3);
    let result = clean(
        &s.app,
        BulkCleanOptions {
            kept,
            ..BulkCleanOptions::default()
        },
    )
    .await;
    assert_eq!(
        (
            result.cards[0].pull_quantity,
            result.cards[0].swappable_copies
        ),
        (6, 0)
    );
}
