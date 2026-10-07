//! Collection and location GraphQL tests, plus the home summary.

use pretty_assertions::assert_eq;
use serde_json::{Value, json};

use super::*;
use crate::collection::auto_sort::rules::{RuleInput, replace};
use manavault_catalog::testing::fixtures::black_lotus;

fn card(id: &str, oracle_id: &str, name: &str, extra: Value) -> Value {
    simple_card(id, oracle_id, name, extra)
}

fn errors(response: &Value) -> Vec<String> {
    response["errors"]
        .as_array()
        .map(|errors| {
            errors
                .iter()
                .map(|e| e["message"].as_str().unwrap_or_default().to_owned())
                .collect()
        })
        .unwrap_or_default()
}

fn edges(connection: &Value) -> Vec<Value> {
    connection["edges"]
        .as_array()
        .unwrap()
        .iter()
        .map(|edge| edge["node"].clone())
        .collect()
}

#[tokio::test]
async fn home_summary_counts_copies_locations_and_unarchived_decks() {
    let app = TestApp::new().await;
    let query = "{ homeSummary { collectionCount locationCount deckCount } }";
    assert_eq!(
        app.gql_data(query, json!({})).await,
        json!({"homeSummary": {"collectionCount": 0, "locationCount": 0, "deckCount": 0}})
    );
    app.import_cards(&[black_lotus()]).await;
    let list = create_location(&app, "Wants", "list").await;
    create_location(&app, "Box", "box").await;
    create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(2),
            ..Attrs::default()
        },
    )
    .await;
    create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(5),
            location_id: Some(list.id),
            ..Attrs::default()
        },
    )
    .await;
    for (name, status) in [
        ("Active", "active"),
        ("Brewing", "brewing"),
        ("Benched", "active"),
        ("Archived", "archived"),
    ] {
        insert_deck(&app, name, status).await;
    }
    assert_eq!(
        app.gql_data(query, json!({})).await,
        json!({"homeSummary": {"collectionCount": 2, "locationCount": 2, "deckCount": 3}})
    );
}

#[tokio::test]
async fn create_collection_item_mutation_adds_a_printing() {
    let app = TestApp::new().await;
    app.import_cards(&[card(
        "scryfall-printing-2",
        "oracle-2",
        "New Collection Card",
        json!({
            "type_line": "Creature", "collector_number": "2", "rarity": "rare",
            "image_uris": {"normal": "https://example.test/new-card.jpg"},
            "finishes": ["nonfoil", "foil"], "prices": {"usd": "1.25", "usd_foil": "3.50"}
        }),
    )])
    .await;
    let binder = create_location(&app, "Trade Binder", "binder").await;
    let query = r"mutation CreateCollectionItem($input: CollectionItemInput!) {
        createCollectionItem(input: $input) {
          collectionItem {
            id quantity condition language finish notes
            printing { scryfallId card { name } }
            purchasePriceCents purchasePriceText valueGainText valueGainPercentText
            location { id name }
          }
        }
      }";
    let data = app
        .gql_data(
            query,
            json!({"input": {
                "scryfallId": gid(NodeKind::Printing, "scryfall-printing-2"),
                "quantity": 2, "condition": "near_mint", "language": "en", "finish": "foil",
                "locationId": gid(NodeKind::Location, binder.id), "notes": "Fresh pull"
            }}),
        )
        .await;
    let item = &data["createCollectionItem"]["collectionItem"];
    let id = item["id"].as_str().unwrap().to_owned();
    assert!(
        manavault_core::graphql::relay::node_int(&async_graphql::ID(id), NodeKind::CollectionItem)
            .is_ok()
    );
    assert_eq!(
        item,
        &json!({
            "id": item["id"], "quantity": 2, "condition": "near_mint", "language": "en",
            "finish": "foil", "notes": "Fresh pull",
            "printing": {"scryfallId": "scryfall-printing-2", "card": {"name": "New Collection Card"}},
            "purchasePriceCents": 350, "purchasePriceText": "$3.50", "valueGainText": "$0",
            "valueGainPercentText": "0%",
            "location": {"id": gid(NodeKind::Location, binder.id), "name": "Trade Binder"}
        })
    );

    let response = app
        .gql(
            query,
            json!({"input": {"scryfallId": gid(NodeKind::Printing, "scryfall-printing-2"), "quantity": 0, "condition": "mint"}}),
        )
        .await;
    assert_eq!(
        errors(&response),
        ["quantity must be greater than 0, condition is invalid"]
    );
    let response = app
        .gql(
            query,
            json!({"input": {"scryfallId": "scryfall-printing-2"}}),
        )
        .await;
    assert_eq!(errors(&response).len(), 1);
    assert!(errors(&response)[0].starts_with("Invalid printing ID"));
}

#[tokio::test]
async fn update_and_delete_mutations_change_owned_printings() {
    let app = TestApp::new().await;
    let base = json!({"type_line": "Creature", "image_uris": {}, "finishes": ["nonfoil", "foil"]});
    app.import_cards(&[
        card("scryfall-printing-update", "oracle-update", "Update Collection Card",
            merge(base.clone(), json!({"collector_number": "12", "set": "upd", "prices": {"usd": "2.00", "usd_foil": "5.00"}}))),
        card("scryfall-printing-update-corrected", "oracle-update", "Update Collection Card",
            merge(base, json!({"collector_number": "99", "set": "fix", "prices": {"usd": "3.00", "usd_foil": "6.00"}}))),
    ])
    .await;
    let old_box = create_location(&app, "Old Box", "box").await;
    let new_list = create_location(&app, "New List", "list").await;
    let item = create_item(
        &app,
        "scryfall-printing-update",
        Attrs {
            quantity: Some(2),
            location_id: Some(old_box.id),
            ..Attrs::default()
        },
    )
    .await;
    let item_id = gid(NodeKind::CollectionItem, item.record.id);
    let data = app
        .gql_data(
            r"mutation UpdateCollectionItem($id: ID!, $input: CollectionItemUpdateInput!) {
                updateCollectionItem(id: $id, input: $input) {
                  collectionItem {
                    quantity condition language finish notes purchasePriceCents purchasePriceText
                    valueGainText valueGainPercentText location { name }
                    printing { scryfallId setCode collectorNumber }
                  }
                }
              }",
            json!({"id": item_id, "input": {
                "scryfallId": gid(NodeKind::Printing, "scryfall-printing-update-corrected"),
                "quantity": 4, "condition": "lightly_played", "language": "ja", "finish": "foil",
                "locationId": gid(NodeKind::Location, new_list.id), "notes": "Moved",
                "purchasePriceCents": 1234
            }}),
        )
        .await;
    assert_eq!(
        data["updateCollectionItem"]["collectionItem"],
        json!({
            "quantity": 4, "condition": "lightly_played", "language": "ja", "finish": "foil",
            "notes": "Moved", "purchasePriceCents": 1234, "purchasePriceText": "$12.34",
            "valueGainText": "-$6.34", "valueGainPercentText": "-51.4%",
            "location": {"name": "New List"},
            "printing": {"scryfallId": "scryfall-printing-update-corrected", "setCode": "fix", "collectorNumber": "99"}
        })
    );

    // Moving to the unfiled location clears it.
    let data = app
        .gql_data(
            r"mutation($id: ID!, $input: CollectionItemUpdateInput!) {
                updateCollectionItem(id: $id, input: $input) { collectionItem { location { name } } }
              }",
            json!({"id": item_id, "input": {"locationId": gid(NodeKind::Location, "unfiled")}}),
        )
        .await;
    assert_eq!(
        data["updateCollectionItem"]["collectionItem"]["location"],
        Value::Null
    );

    let delete = r"mutation DeleteCollectionItem($id: ID!) { deleteCollectionItem(id: $id) { collectionItem { id quantity } } }";
    let data = app.gql_data(delete, json!({"id": item_id})).await;
    assert_eq!(
        data["deleteCollectionItem"]["collectionItem"],
        json!({"id": item_id, "quantity": 4})
    );
    assert_eq!(
        item_ids(&app, &ItemFilters::default()).await,
        Vec::<i64>::new()
    );
    assert_eq!(
        errors(&app.gql(delete, json!({"id": item_id})).await),
        ["Collection item was not found."]
    );
    let response = app
        .gql(delete, json!({"id": gid(NodeKind::Location, 1)}))
        .await;
    assert_eq!(
        errors(&response),
        ["Expected collection item ID, got location ID"]
    );
}

const BULK_UPDATE: &str = r"mutation Bulk($selector: CollectionItemSelector!, $input: CollectionItemUpdateInput!) {
    bulkUpdateCollectionItems(selector: $selector, input: $input) { updatedCount }
  }";
const BULK_DELETE: &str = r"mutation BulkDelete($selector: CollectionItemSelector!) {
    bulkDeleteCollectionItems(selector: $selector) { deletedCount }
  }";

async fn selector_cards(app: &TestApp) {
    let cards: Vec<Value> = (1..=3)
        .map(|index| {
            card(
                &format!("scryfall-selector-{index}"),
                &format!("oracle-selector-{index}"),
                &format!("Selector Card {index}"),
                json!({"collector_number": index.to_string(), "set": "sel", "finishes": ["nonfoil", "foil"]}),
            )
        })
        .collect();
    app.import_cards(&cards).await;
}

async fn selector_items(app: &TestApp, location_id: Option<i64>, quantity: i64) -> Vec<i64> {
    let mut ids = Vec::new();
    for index in 1..=3 {
        ids.push(
            create_item(
                app,
                &format!("scryfall-selector-{index}"),
                Attrs {
                    quantity: Some(quantity),
                    finish: Some("nonfoil"),
                    location_id,
                    ..Attrs::default()
                },
            )
            .await
            .record
            .id,
        );
    }
    ids
}

#[tokio::test]
async fn bulk_update_edits_selected_items_and_reports_missing_ones() {
    let app = TestApp::new().await;
    selector_cards(&app).await;
    let ids = selector_items(&app, None, 1).await;
    let selected: Vec<String> = ids
        .iter()
        .take(2)
        .map(|id| gid(NodeKind::CollectionItem, id))
        .collect();
    let data = app
        .gql_data(BULK_UPDATE, json!({"selector": {"ids": selected}, "input": {"finish": "foil", "purchasePriceCents": 1234}}))
        .await;
    assert_eq!(data["bulkUpdateCollectionItems"]["updatedCount"], 2);
    for (id, finish) in ids.iter().zip(["foil", "foil", "nonfoil"]) {
        let item = reload(&app, *id).await.unwrap();
        assert_eq!(item.record.finish.as_str(), finish);
    }
    assert_eq!(
        reload(&app, ids[0])
            .await
            .unwrap()
            .record
            .purchase_price_cents,
        Some(1234)
    );

    let response = app
        .gql(BULK_UPDATE, json!({"selector": {"ids": [gid(NodeKind::CollectionItem, 999_999)]}, "input": {"notes": "missing"}}))
        .await;
    assert_eq!(
        errors(&response),
        ["One or more collection items were not found."]
    );
}

#[tokio::test]
async fn all_selector_updates_filtered_items_except_exclusions() {
    let app = TestApp::new().await;
    selector_cards(&app).await;
    let inside = create_location(&app, "Inside Box", "box").await;
    let outside = create_location(&app, "Outside Box", "box").await;
    let ids = selector_items(&app, Some(inside.id), 1).await;
    let other = create_item(
        &app,
        "scryfall-selector-1",
        Attrs {
            finish: Some("nonfoil"),
            location_id: Some(outside.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let data = app
        .gql_data(
            BULK_UPDATE,
            json!({"selector": {
                "all": true,
                "filters": {"locationId": gid(NodeKind::Location, inside.id)},
                "excludedIds": [gid(NodeKind::CollectionItem, ids[1])]
            }, "input": {"finish": "foil"}}),
        )
        .await;
    assert_eq!(data["bulkUpdateCollectionItems"]["updatedCount"], 2);
    let finishes = [ids[0], ids[1], ids[2], other];
    let mut found = Vec::new();
    for id in finishes {
        found.push(
            reload(&app, id)
                .await
                .unwrap()
                .record
                .finish
                .as_str()
                .to_owned(),
        );
    }
    assert_eq!(found, ["foil", "nonfoil", "foil", "nonfoil"]);
}

#[tokio::test]
async fn bulk_delete_removes_selected_or_filtered_items() {
    let app = TestApp::new().await;
    selector_cards(&app).await;
    let location = create_location(&app, "Delete Box", "box").await;
    let ids = selector_items(&app, Some(location.id), 1).await;
    let data = app
        .gql_data(
            BULK_DELETE,
            json!({"selector": {"all": true, "filters": {"locationId": gid(NodeKind::Location, location.id)}, "excludedIds": [gid(NodeKind::CollectionItem, ids[1])]}}),
        )
        .await;
    assert_eq!(data["bulkDeleteCollectionItems"]["deletedCount"], 2);
    assert_eq!(item_ids(&app, &ItemFilters::default()).await, [ids[1]]);

    let loose = selector_items(&app, None, 1).await;
    let data = app
        .gql_data(
            BULK_DELETE,
            json!({"selector": {"ids": [gid(NodeKind::CollectionItem, loose[0]), gid(NodeKind::CollectionItem, loose[2])]}}),
        )
        .await;
    assert_eq!(data["bulkDeleteCollectionItems"]["deletedCount"], 2);
    assert_eq!(
        item_ids(&app, &ItemFilters::default()).await,
        [ids[1], loose[1]]
    );
}

#[tokio::test]
async fn pagination_uses_row_count_not_copies() {
    let app = TestApp::new().await;
    selector_cards(&app).await;
    selector_items(&app, None, 4).await;
    let data = app
        .gql_data(
            "{ collectionItems(first: 5) { pageInfo { hasNextPage } edges { node { id } } } collectionItemCount collectionItemEntryCount }",
            json!({}),
        )
        .await;
    assert_eq!(data["collectionItems"]["pageInfo"]["hasNextPage"], false);
    assert_eq!(edges(&data["collectionItems"]).len(), 3);
    assert_eq!(
        (
            data["collectionItemCount"].as_i64(),
            data["collectionItemEntryCount"].as_i64()
        ),
        (Some(12), Some(3))
    );

    let data = app
        .gql_data(
            "{ collectionItems(first: 2) { pageInfo { hasNextPage hasPreviousPage endCursor } edges { cursor node { quantity } } } }",
            json!({}),
        )
        .await;
    assert_eq!(data["collectionItems"]["pageInfo"]["hasNextPage"], true);
    let cursor = data["collectionItems"]["pageInfo"]["endCursor"]
        .as_str()
        .unwrap()
        .to_owned();
    let data = app
        .gql_data(
            "query($after: String) { collectionItems(first: 2, after: $after) { pageInfo { hasNextPage hasPreviousPage } edges { node { id } } } }",
            json!({"after": cursor}),
        )
        .await;
    assert_eq!(
        data["collectionItems"]["pageInfo"],
        json!({"hasNextPage": false, "hasPreviousPage": true})
    );
    assert_eq!(edges(&data["collectionItems"]).len(), 1);
}

#[tokio::test]
async fn collection_query_resolves_locations_values_and_images() {
    let app = TestApp::new().await;
    app.import_cards(&[card(
        "scryfall-printing-1",
        "oracle-1",
        "Test Card",
        json!({
            "type_line": "Creature", "rarity": "rare",
            "image_uris": {"normal": "https://example.test/card.jpg", "art_crop": "https://example.test/card-art.jpg"},
            "prices": {"usd": "12.34"}
        }),
    )])
    .await;
    let binder = location::create(
        app.db(),
        LocationChanges {
            name: async_graphql::MaybeUndefined::Value("Binder".into()),
            kind: async_graphql::MaybeUndefined::Value("binder".into()),
            cover_scryfall_id: async_graphql::MaybeUndefined::Value("scryfall-printing-1".into()),
            ..LocationChanges::default()
        },
    )
    .await
    .unwrap();
    create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(binder.id),
            quantity: Some(3),
            ..Attrs::default()
        },
    )
    .await;
    let data = app
        .gql_data(
            r"{
              locations(first: 10) {
                pageInfo { hasNextPage }
                edges { node {
                  id name kind description itemCount totalPriceText
                  coverPrinting { imageUrl artCropUrl card { name } }
                  valueSummary { totalPriceText purchasePriceText valueGainText valueGainPercentText }
                } }
              }
              collectionItems(first: 10) {
                pageInfo { hasNextPage }
                edges { node {
                  priceText allocatedQuantity totalOwnedCopies printing { imageUrl card { name } }
                  purchasePriceText valueGainText valueGainPercentText location { name itemCount }
                } }
              }
              collectionItemCount
              collectionValueSummary { totalPriceText purchasePriceText valueGainText valueGainPercentText }
              collectionValueDashboard {
                itemCount positionCount gainPositionCount lossPositionCount unchangedPositionCount
                summary { totalPriceText purchasePriceText valueGainText }
                biggestGains { valueGainText printing { card { name } } }
                biggestLosses { valueGainText printing { card { name } } }
              }
            }",
            json!({}),
        )
        .await;
    assert_eq!(
        data["locations"],
        json!({
            "pageInfo": {"hasNextPage": false},
            "edges": [
                {"node": {
                    "id": gid(NodeKind::Location, binder.id), "name": "Binder", "kind": "binder",
                    "description": null, "itemCount": 3, "totalPriceText": "$37.02",
                    "coverPrinting": {"imageUrl": "https://example.test/card.jpg", "artCropUrl": "https://example.test/card-art.jpg", "card": {"name": "Test Card"}},
                    "valueSummary": {"totalPriceText": "$37.02", "purchasePriceText": "$37.02", "valueGainText": "$0", "valueGainPercentText": "0%"}
                }},
                {"node": {
                    "id": gid(NodeKind::Location, "unfiled"), "name": "Unfiled", "kind": "unfiled",
                    "description": "Cards without an assigned location.", "itemCount": 0, "totalPriceText": "$0",
                    "coverPrinting": null,
                    "valueSummary": {"totalPriceText": "$0", "purchasePriceText": "$0", "valueGainText": "$0", "valueGainPercentText": null}
                }}
            ]
        })
    );
    assert_eq!(
        edges(&data["collectionItems"]),
        [json!({
            "priceText": "$12.34", "allocatedQuantity": 0, "totalOwnedCopies": 3,
            "printing": {"imageUrl": "https://example.test/card.jpg", "card": {"name": "Test Card"}},
            "purchasePriceText": "$12.34", "valueGainText": "$0", "valueGainPercentText": "0%",
            "location": {"name": "Binder", "itemCount": 3}
        })]
    );
    assert_eq!(data["collectionItemCount"], 3);
    assert_eq!(
        data["collectionValueSummary"],
        json!({"totalPriceText": "$37.02", "purchasePriceText": "$37.02", "valueGainText": "$0", "valueGainPercentText": "0%"})
    );
    assert_eq!(
        data["collectionValueDashboard"],
        json!({
            "itemCount": 3, "positionCount": 1, "gainPositionCount": 0, "lossPositionCount": 0,
            "unchangedPositionCount": 1,
            "summary": {"totalPriceText": "$37.02", "purchasePriceText": "$37.02", "valueGainText": "$0"},
            "biggestGains": [], "biggestLosses": []
        })
    );
}

#[tokio::test]
async fn groups_combine_price_lots_while_items_stay_separate() {
    let app = TestApp::new().await;
    app.import_cards(&[card(
        "grouped-printing",
        "grouped-card",
        "Grouped Card",
        json!({"rarity": "rare", "prices": {"usd": "10.00"}}),
    )])
    .await;
    let first = create_item(
        &app,
        "grouped-printing",
        Attrs {
            quantity: Some(2),
            purchase_price_cents: Some(100),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let second = create_item(
        &app,
        "grouped-printing",
        Attrs {
            quantity: Some(3),
            purchase_price_cents: Some(200),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let data = app
        .gql_data(
            r"{
              collectionItemGroups(first: 1) { pageInfo { hasNextPage } edges { node { printingId quantity items { id quantity purchasePriceCents } } } }
              collectionValueDashboard {
                gainPositionCount
                biggestGains { quantity totalPriceCents purchasePriceCents valueGainCents valueGainText valueGainPercent valueGainPercentText items { id } }
                biggestPercentGains { printing { scryfallId } }
                biggestLosses { quantity }
              }
              collectionItems(first: 10) { edges { node { id quantity purchasePriceCents } } }
            }",
            json!({}),
        )
        .await;
    let first_id = gid(NodeKind::CollectionItem, first);
    let second_id = gid(NodeKind::CollectionItem, second);
    assert_eq!(
        data["collectionItemGroups"],
        json!({
            "pageInfo": {"hasNextPage": false},
            "edges": [{"node": {"printingId": "grouped-printing", "quantity": 5, "items": [
                {"id": first_id, "quantity": 2, "purchasePriceCents": 100},
                {"id": second_id, "quantity": 3, "purchasePriceCents": 200}
            ]}}]
        })
    );
    assert_eq!(
        data["collectionValueDashboard"],
        json!({
            "gainPositionCount": 1,
            "biggestGains": [{
                "quantity": 5, "totalPriceCents": 5_000, "purchasePriceCents": 800,
                "valueGainCents": 4_200, "valueGainText": "+$42", "valueGainPercent": 525.0,
                "valueGainPercentText": "+525%", "items": [{"id": first_id}, {"id": second_id}]
            }],
            "biggestPercentGains": [{"printing": {"scryfallId": "grouped-printing"}}],
            "biggestLosses": []
        })
    );
    let purchase: Vec<Value> = edges(&data["collectionItems"])
        .iter()
        .map(|n| n["purchasePriceCents"].clone())
        .collect();
    assert_eq!(purchase, [json!(100), json!(200)]);
}

/// The value-gain group sort weighs each copy's gain, not `quantity * price -
/// purchase` (the unparenthesized fragment of earlier releases; found by the parity
/// harness): five copies bought at market price gained nothing and sort
/// below one copy that gained a dollar.
#[tokio::test]
async fn value_gain_group_sort_multiplies_the_whole_gain() {
    let app = TestApp::new().await;
    app.import_cards(&[
        card(
            "bulk-printing",
            "bulk-card",
            "Bulk Card",
            json!({"prices": {"usd": "3.00"}}),
        ),
        card(
            "gain-printing",
            "gain-card",
            "Gain Card",
            json!({"collector_number": "2", "prices": {"usd": "2.00"}}),
        ),
    ])
    .await;
    create_item(
        &app,
        "bulk-printing",
        Attrs {
            quantity: Some(5),
            ..Attrs::default()
        },
    )
    .await;
    create_item(
        &app,
        "gain-printing",
        Attrs {
            purchase_price_cents: Some(100),
            ..Attrs::default()
        },
    )
    .await;
    for (direction, expected) in [
        ("asc", ["bulk-printing", "gain-printing"]),
        ("desc", ["gain-printing", "bulk-printing"]),
    ] {
        let data = app
            .gql_data(
                r"query($sort: CollectionItemSort) { collectionItemGroups(first: 10, sort: $sort) { edges { node { printingId } } } }",
                json!({"sort": {"field": "value_gain", "direction": direction}}),
            )
            .await;
        let order: Vec<Value> = edges(&data["collectionItemGroups"])
            .iter()
            .map(|node| node["printingId"].clone())
            .collect();
        assert_eq!(order, expected.map(Value::from), "{direction}");
    }
}

/// `valueGainPercentText` rounds like `Float.round/2` (exact float value):
/// a $21.07 copy bought for $20 gained 5.35%, stored as 5.3499…, so "+5.3%"
/// (found by the parity harness; naive `(x * 10).round()` gave "+5.4%").
#[tokio::test]
async fn value_gain_percent_text_rounds_the_exact_float() {
    let app = TestApp::new().await;
    app.import_cards(&[card(
        "percent-printing",
        "percent-card",
        "Percent Card",
        json!({"prices": {"usd": "21.07"}}),
    )])
    .await;
    create_item(
        &app,
        "percent-printing",
        Attrs {
            purchase_price_cents: Some(2_000),
            ..Attrs::default()
        },
    )
    .await;
    let data = app
        .gql_data(
            "{ collectionItems(first: 1) { edges { node { valueGainText valueGainPercentText } } } }",
            json!({}),
        )
        .await;
    assert_eq!(
        edges(&data["collectionItems"]),
        [json!({"valueGainText": "+$1.07", "valueGainPercentText": "+5.3%"})]
    );
}

#[tokio::test]
async fn card_filters_count_owned_copies_outside_lists() {
    let app = TestApp::new().await;
    let base = json!({"rarity": "rare", "finishes": ["nonfoil"]});
    app.import_cards(&[
        card("scryfall-owned-old", "oracle-owned-card", "Owned Card", merge(base.clone(), json!({"set": "old", "released_at": "1993-08-05", "prices": {"usd": "1.00"}}))),
        card("scryfall-owned-new", "oracle-owned-card", "Owned Card", merge(base, json!({"collector_number": "2", "set": "new", "released_at": "1994-08-05", "prices": {"usd": "2.00"}}))),
    ])
    .await;
    let binder = create_location(&app, "Binder", "binder").await;
    let list = create_location(&app, "Wishlist", "list").await;
    create_item(
        &app,
        "scryfall-owned-old",
        Attrs {
            location_id: Some(binder.id),
            quantity: Some(2),
            ..Attrs::default()
        },
    )
    .await;
    create_item(&app, "scryfall-owned-old", Attrs::default()).await;
    create_item(
        &app,
        "scryfall-owned-new",
        Attrs {
            location_id: Some(binder.id),
            ..Attrs::default()
        },
    )
    .await;
    create_item(
        &app,
        "scryfall-owned-new",
        Attrs {
            location_id: Some(list.id),
            quantity: Some(5),
            ..Attrs::default()
        },
    )
    .await;
    let query = r"query($id: ID!) {
        collectionItemCount(filters: {cardId: $id})
        collectionItems(first: 10, filters: {cardId: $id}) { edges { node { quantity totalOwnedCopies printing { scryfallId } } } }
      }";
    for id in [
        gid(NodeKind::Card, "oracle-owned-card"),
        "oracle-owned-card".to_owned(),
    ] {
        let data = app.gql_data(query, json!({"id": id})).await;
        assert_eq!(data["collectionItemCount"], 4);
        assert_eq!(
            edges(&data["collectionItems"]),
            [
                json!({"quantity": 1, "totalOwnedCopies": 4, "printing": {"scryfallId": "scryfall-owned-new"}}),
                json!({"quantity": 2, "totalOwnedCopies": 4, "printing": {"scryfallId": "scryfall-owned-old"}}),
                json!({"quantity": 1, "totalOwnedCopies": 4, "printing": {"scryfallId": "scryfall-owned-old"}}),
            ]
        );
    }
}

#[tokio::test]
async fn unfiled_location_resolves_items_without_a_location() {
    let app = TestApp::new().await;
    app.import_cards(&[card(
        "scryfall-unfiled",
        "oracle-unfiled",
        "Loose Card",
        json!({"collector_number": "7", "rarity": "common", "prices": {"usd": "0.50"}}),
    )])
    .await;
    create_item(
        &app,
        "scryfall-unfiled",
        Attrs {
            quantity: Some(4),
            ..Attrs::default()
        },
    )
    .await;
    let data = app
        .gql_data(
            r#"query UnfiledLocation($id: ID!) {
                location(id: $id) {
                  id name kind itemCount totalPriceText
                  collectionItems(first: 10) { pageInfo { hasNextPage } edges { node { quantity location { name } printing { card { name } } } } }
                }
                unfiledCollectionItemCount: collectionItemCount(filters: {locationId: "unfiled"})
                unfiledCollectionItems: collectionItems(first: 10, filters: {locationId: "unfiled"}) {
                  edges { node { quantity location { name } printing { card { name } } } }
                }
              }"#,
            json!({"id": gid(NodeKind::Location, "unfiled")}),
        )
        .await;
    let node =
        json!({"quantity": 4, "location": null, "printing": {"card": {"name": "Loose Card"}}});
    assert_eq!(
        data,
        json!({
            "location": {
                "id": gid(NodeKind::Location, "unfiled"), "name": "Unfiled", "kind": "unfiled",
                "itemCount": 4, "totalPriceText": "$2",
                "collectionItems": {"pageInfo": {"hasNextPage": false}, "edges": [{"node": node}]}
            },
            "unfiledCollectionItemCount": 4,
            "unfiledCollectionItems": {"edges": [{"node": node}]}
        })
    );
    let response = app
        .gql(
            "query($id: ID!) { location(id: $id) { name } }",
            json!({"id": gid(NodeKind::Location, 9_999)}),
        )
        .await;
    assert_eq!(errors(&response), ["Location was not found."]);
}

#[tokio::test]
async fn items_filter_by_added_window() {
    let app = TestApp::new().await;
    let base = json!({"type_line": "Creature", "rarity": "common", "finishes": ["nonfoil"]});
    app.import_cards(&[
        card(
            "scryfall-old",
            "oracle-old",
            "Old Card",
            merge(base.clone(), json!({"prices": {"usd": "1.00"}})),
        ),
        card(
            "scryfall-new",
            "oracle-new",
            "New Card",
            merge(
                base,
                json!({"collector_number": "2", "prices": {"usd": "2.00"}}),
            ),
        ),
    ])
    .await;
    let old = create_item(
        &app,
        "scryfall-old",
        Attrs {
            quantity: Some(2),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    create_item(
        &app,
        "scryfall-new",
        Attrs {
            quantity: Some(3),
            ..Attrs::default()
        },
    )
    .await;
    let eight_days_ago = manavault_core::timefmt::utc_seconds(
        time::OffsetDateTime::now_utc() - time::Duration::days(8),
    );
    set_item_column(&app, old, "inserted_at", &eight_days_ago).await;
    let data = app
        .gql_data(
            r"{
              recentCount: collectionItemCount(filters: {addedWithinDays: 7})
              recentItems: collectionItems(first: 10, filters: {addedWithinDays: 7}) { edges { node { quantity printing { card { name } } } } }
            }",
            json!({}),
        )
        .await;
    assert_eq!(data["recentCount"], 3);
    assert_eq!(
        edges(&data["recentItems"]),
        [json!({"quantity": 3, "printing": {"card": {"name": "New Card"}}})]
    );
}

#[tokio::test]
async fn value_summary_scopes_to_filters() {
    let app = TestApp::new().await;
    let base = json!({"type_line": "Creature", "finishes": ["nonfoil"]});
    app.import_cards(&[
        card(
            "scryfall-filed",
            "oracle-filed",
            "Filed Card",
            merge(
                base.clone(),
                json!({"rarity": "rare", "prices": {"usd": "10.00"}}),
            ),
        ),
        card(
            "scryfall-loose",
            "oracle-loose",
            "Loose Card",
            merge(
                base,
                json!({"collector_number": "2", "rarity": "common", "prices": {"usd": "0.50"}}),
            ),
        ),
    ])
    .await;
    let binder = create_location(&app, "Binder", "binder").await;
    create_item(
        &app,
        "scryfall-filed",
        Attrs {
            location_id: Some(binder.id),
            quantity: Some(2),
            ..Attrs::default()
        },
    )
    .await;
    create_item(
        &app,
        "scryfall-loose",
        Attrs {
            quantity: Some(4),
            ..Attrs::default()
        },
    )
    .await;
    let data = app
        .gql_data(
            r#"{
              collectionValueSummary { totalPriceText purchasePriceText }
              unfiledValueSummary: collectionValueSummary(filters: {locationId: "unfiled"}) { totalPriceText purchasePriceText }
              searchedValueSummary: collectionValueSummary(filters: {q: "Filed"}) { totalPriceText purchasePriceText }
            }"#,
            json!({}),
        )
        .await;
    assert_eq!(
        data,
        json!({
            "collectionValueSummary": {"totalPriceText": "$22", "purchasePriceText": "$22"},
            "unfiledValueSummary": {"totalPriceText": "$2", "purchasePriceText": "$2"},
            "searchedValueSummary": {"totalPriceText": "$20", "purchasePriceText": "$20"}
        })
    );
}

#[tokio::test]
async fn allocation_fields_report_deck_allocations_and_hide_allocated_copies_from_locations() {
    let app = TestApp::new().await;
    let cards: Vec<Value> = (1..=3)
        .map(|index| {
            card(
                &format!("scryfall-alloc-{index}"),
                &format!("oracle-alloc-{index}"),
                &format!("Alloc {index}"),
                json!({"collector_number": index.to_string()}),
            )
        })
        .collect();
    app.import_cards(&cards).await;
    let binder = create_location(&app, "Binder", "binder").await;
    let mut ids = Vec::new();
    for index in 1..=3 {
        ids.push(
            create_item(
                &app,
                &format!("scryfall-alloc-{index}"),
                Attrs {
                    quantity: Some(2),
                    location_id: Some(binder.id),
                    ..Attrs::default()
                },
            )
            .await
            .record
            .id,
        );
    }
    let zeta = insert_deck(&app, "Zeta", "brewing").await;
    let alpha = insert_deck(&app, "Alpha", "brewing").await;
    allocate(&app, zeta, ids[0], 1).await;
    allocate(&app, alpha, ids[0], 1).await;
    allocate(&app, alpha, ids[1], 2).await;
    let data = app
        .gql_data(
            r"{ collectionItems(first: 50) { edges { node { allocatedQuantity allocationDecks { quantity } } } }
                locations { edges { node { name itemCount collectionItems { edges { node { id } } } } } } }",
            json!({}),
        )
        .await;
    assert_eq!(
        edges(&data["collectionItems"]),
        [
            json!({"allocatedQuantity": 2, "allocationDecks": [{"quantity": 1}, {"quantity": 1}]}),
            json!({"allocatedQuantity": 2, "allocationDecks": [{"quantity": 2}]}),
            json!({"allocatedQuantity": 0, "allocationDecks": []}),
        ]
    );
    // Allocated stacks are in decks, so the binder shows only the free one.
    let binder_node = &edges(&data["locations"])[0];
    assert_eq!(binder_node["itemCount"], 2);
    assert_eq!(
        edges(&binder_node["collectionItems"]),
        [json!({"id": gid(NodeKind::CollectionItem, ids[2])})]
    );
    // Decks come by name.
    let allocations = queries::allocations(app.db(), &[ids[0]]).await.unwrap();
    let decks: Vec<(i64, &str)> = allocations[&ids[0]]
        .decks
        .iter()
        .map(|d| (d.deck_id, d.deck_name.as_str()))
        .collect();
    assert_eq!(decks, [(alpha, "Alpha"), (zeta, "Zeta")]);
}

#[tokio::test]
async fn trade_quantity_and_bulk_clean_mutations() {
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
    .await
    .record
    .id;
    let second = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            quantity: Some(3),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let mutation = r"mutation($selector: CollectionItemSelector!, $quantity: Int!) {
        setCollectionItemsForTradeQuantity(selector: $selector, quantity: $quantity) { updatedCount quantity totalQuantity }
      }";
    let selector = json!({"ids": [gid(NodeKind::CollectionItem, first), gid(NodeKind::CollectionItem, second)]});
    let data = app
        .gql_data(mutation, json!({"selector": selector, "quantity": 3}))
        .await;
    assert_eq!(
        data["setCollectionItemsForTradeQuantity"],
        json!({"updatedCount": 2, "quantity": 3, "totalQuantity": 5})
    );
    let response = app
        .gql(mutation, json!({"selector": selector, "quantity": 9}))
        .await;
    assert_eq!(
        errors(&response),
        ["Trade quantity must be between zero and the number of copies owned."]
    );
    let data = app
        .gql_data(r"{ collectionItemCount(filters: {forTrade: true}) collectionItemGroups(filters: {forTrade: true}) { edges { node { quantity } } } }", json!({}))
        .await;
    assert_eq!(data["collectionItemCount"], 3);
    assert_eq!(
        edges(&data["collectionItemGroups"]),
        [json!({"quantity": 5})]
    );

    let response = app
        .gql(
            r"mutation($pulls: [BulkCleanPullInput!]!) { removeBulkCleanPulls(pulls: $pulls) { removedCount } }",
            json!({"pulls": [{"collectionItemId": first.to_string(), "quantity": 2}, {"collectionItemId": second.to_string(), "quantity": 1}]}),
        )
        .await;
    assert_eq!(response["data"]["removeBulkCleanPulls"]["removedCount"], 3);
    assert!(reload(&app, first).await.is_none());
    let second_item = reload(&app, second).await.unwrap();
    assert_eq!(
        (
            second_item.record.quantity.as_i64(),
            second_item.record.for_trade_quantity
        ),
        (2, 1)
    );
    let response = app
        .gql(
            r"mutation($pulls: [BulkCleanPullInput!]!) { removeBulkCleanPulls(pulls: $pulls) { removedCount } }",
            json!({"pulls": [{"collectionItemId": "abc", "quantity": 1}]}),
        )
        .await;
    assert_eq!(errors(&response), ["Invalid collection item id"]);
    let response = app
        .gql(
            r"mutation($pulls: [BulkCleanPullInput!]!) { removeBulkCleanPulls(pulls: $pulls) { removedCount } }",
            json!({"pulls": [{"collectionItemId": first.to_string(), "quantity": 1}]}),
        )
        .await;
    assert_eq!(
        errors(&response),
        ["Your collection changed since this list was made. Refresh and try again."]
    );
}

#[tokio::test]
async fn bulk_clean_query_suggests_pulls() {
    let app = TestApp::new().await;
    app.import_cards(&[card(
        "cheap",
        "oracle-cheap",
        "Cheap Card",
        json!({"prices": {"usd": "0.05"}}),
    )])
    .await;
    let a = create_item(
        &app,
        "cheap",
        Attrs {
            quantity: Some(6),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let b = create_item(
        &app,
        "cheap",
        Attrs {
            quantity: Some(6),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let data = app
        .gql_data(
            r"query($kept: [BulkCleanPullInput!]) {
                collectionBulkClean(minCopies: 10, kept: $kept) {
                  maxPriceCents minCopies keepCopies preferKeepFoils cardCount pullQuantity pullValueCents
                  cards { cardId cardName typeLine colors imageUrl totalCopies pullQuantity swappableCopies pullValueCents
                    pulls { collectionItemId cardId cardName setCode collectorNumber finish priceCents ownedQuantity quantity fromLocationId fromLocationName } }
                }
              }",
            json!({"kept": [{"collectionItemId": a.to_string(), "quantity": 6}]}),
        )
        .await;
    assert_eq!(
        data["collectionBulkClean"],
        json!({
            "maxPriceCents": 20, "minCopies": 10, "keepCopies": 4, "preferKeepFoils": true,
            "cardCount": 1, "pullQuantity": 6, "pullValueCents": 30,
            "cards": [{
                "cardId": "oracle-cheap", "cardName": "Cheap Card", "typeLine": "Artifact", "colors": [],
                "imageUrl": null, "totalCopies": 12, "pullQuantity": 6, "swappableCopies": 0, "pullValueCents": 30,
                "pulls": [{
                    "collectionItemId": b.to_string(), "cardId": "oracle-cheap", "cardName": "Cheap Card",
                    "setCode": "tst", "collectorNumber": "1", "finish": "nonfoil", "priceCents": 5,
                    "ownedQuantity": 6, "quantity": 6, "fromLocationId": null, "fromLocationName": "Unfiled"
                }]
            }]
        })
    );
}

#[tokio::test]
async fn create_update_and_delete_location_mutations() {
    let app = TestApp::new().await;
    app.import_cards(&[
        card("scryfall-printing-3", "oracle-3", "Location Cover", json!({"collector_number": "3", "image_uris": {"art_crop": "https://example.test/location-cover.jpg"}})),
        card("scryfall-printing-2", "oracle-2", "Cover Card", json!({"collector_number": "2", "type_line": "Creature", "image_uris": {"art_crop": "https://example.test/cover-art.jpg"}})),
    ])
    .await;
    let data = app
        .gql_data(
            r"mutation CreateLocation($input: LocationInput!) {
                createLocation(input: $input) { location { id name kind description itemCount coverPrinting { scryfallId artCropUrl card { name } } } }
              }",
            json!({"input": {"name": "New Box", "kind": "box", "description": "Sealed cards", "coverScryfallId": gid(NodeKind::Printing, "scryfall-printing-3")}}),
        )
        .await;
    let location = &data["createLocation"]["location"];
    assert_eq!(
        location,
        &json!({
            "id": location["id"], "name": "New Box", "kind": "box", "description": "Sealed cards", "itemCount": 0,
            "coverPrinting": {"scryfallId": "scryfall-printing-3", "artCropUrl": "https://example.test/location-cover.jpg", "card": {"name": "Location Cover"}}
        })
    );
    let id = location["id"].as_str().unwrap().to_owned();

    let update = r"mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
        updateLocation(id: $id, input: $input) { location { id name kind description coverPrinting { artCropUrl card { name } } } }
      }";
    let data = app
        .gql_data(update, json!({"id": id, "input": {"name": "New Binder", "kind": "binder", "description": "Trade cards", "coverScryfallId": gid(NodeKind::Printing, "scryfall-printing-2")}}))
        .await;
    assert_eq!(
        data["updateLocation"]["location"],
        json!({"id": id, "name": "New Binder", "kind": "binder", "description": "Trade cards", "coverPrinting": {"artCropUrl": "https://example.test/cover-art.jpg", "card": {"name": "Cover Card"}}})
    );
    // Absent fields stay; null clears.
    let data = app
        .gql_data(
            update,
            json!({"id": id, "input": {"coverScryfallId": null}}),
        )
        .await;
    assert_eq!(data["updateLocation"]["location"]["name"], "New Binder");
    assert_eq!(
        data["updateLocation"]["location"]["coverPrinting"],
        Value::Null
    );

    let response = app
        .gql(
            update,
            json!({"id": gid(NodeKind::Location, "unfiled"), "input": {"name": "Cannot Edit"}}),
        )
        .await;
    assert_eq!(errors(&response), ["Unfiled cannot be edited"]);
    let response = app
        .gql(update, json!({"id": id, "input": {"kind": "drawer"}}))
        .await;
    assert_eq!(errors(&response), ["kind is invalid"]);
    let response = app
        .gql(
            update,
            json!({"id": gid(NodeKind::Location, 9_999), "input": {"name": "X"}}),
        )
        .await;
    assert_eq!(errors(&response), ["Location was not found."]);

    let delete =
        r"mutation DeleteLocation($id: ID!) { deleteLocation(id: $id) { location { id name } } }";
    let response = app
        .gql(delete, json!({"id": gid(NodeKind::Location, "unfiled")}))
        .await;
    assert_eq!(errors(&response), ["Unfiled cannot be deleted"]);
    let data = app.gql_data(delete, json!({"id": id})).await;
    assert_eq!(
        data["deleteLocation"]["location"],
        json!({"id": id, "name": "New Binder"})
    );
    assert_eq!(location::count(app.db()).await.unwrap(), 0);
}

/// Absinthe answers a failed nullable field with `null` next to the error;
/// async-graphql used to drop the field, nulling the whole `data` of a
/// failed mutation (found by the parity harness, `rust/scripts/parity`).
#[tokio::test]
async fn failed_mutations_and_queries_answer_null_fields() {
    let app = TestApp::new().await;
    let response = app
        .gql(
            r"mutation CreateLocation($input: LocationInput!) {
                createLocation(input: $input) { location { id } }
              }",
            json!({"input": {"name": "", "kind": "box"}}),
        )
        .await;
    assert_eq!(response["data"], json!({"createLocation": null}));
    assert_eq!(errors(&response), ["name can't be blank"]);
    assert_eq!(response["errors"][0]["path"], json!(["createLocation"]));

    let response = app
        .gql(
            r"query($id: ID!) { location(id: $id) { id } pricingSettings { source } }",
            json!({"id": gid(NodeKind::Location, 9_999)}),
        )
        .await;
    assert_eq!(
        response["data"],
        json!({"location": null, "pricingSettings": {"source": "scryfall"}})
    );
    assert_eq!(errors(&response), ["Location was not found."]);
}

#[tokio::test]
async fn deleting_storage_unfiles_cards_and_deleting_a_list_deletes_them() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let storage = create_location(&app, "Delete Location", "box").await;
    let list = create_location(&app, "Delete List", "list").await;
    let stored = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(storage.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let listed = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(list.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let delete =
        r"mutation DeleteLocation($id: ID!) { deleteLocation(id: $id) { location { name } } }";
    app.gql_data(delete, json!({"id": gid(NodeKind::Location, storage.id)}))
        .await;
    assert_eq!(reload(&app, stored).await.unwrap().record.location_id, None);
    app.gql_data(delete, json!({"id": gid(NodeKind::Location, list.id)}))
        .await;
    assert!(reload(&app, listed).await.is_none());
    assert_eq!(
        item_ids(
            &app,
            &ItemFilters::at(crate::collection::filters::LocationFilter::Unfiled)
        )
        .await,
        [stored]
    );
}

const PREVIEW_IMPORT: &str = r"mutation PreviewCollectionImport($input: CollectionImportPreviewInput!) {
    previewCollectionImport(input: $input) {
      importPreview {
        locationId total exact ambiguous unresolved
        rows {
          rowNumber status
          attrs { name setCode collectorNumber quantity finish condition language scryfallId backScryfallId locationId purchasePriceCents }
          printing { scryfallId card { name } }
          candidates { scryfallId }
        }
      }
    }
  }";

fn commit_rows(rows: &Value) -> Value {
    Value::Array(
        rows.as_array()
            .unwrap()
            .iter()
            .map(|row| json!({"rowNumber": row["rowNumber"], "status": row["status"], "attrs": row["attrs"]}))
            .collect(),
    )
}

#[tokio::test]
async fn import_preview_commit_and_export_over_graphql() {
    let app = TestApp::new().await;
    app.import_cards(&[card(
        "scryfall-printing-import",
        "oracle-import",
        "Imported Card",
        json!({"type_line": "Creature", "collector_number": "9", "set": "imp", "set_name": "Import Set", "rarity": "rare",
               "image_uris": {"normal": "https://example.test/import.jpg"}, "prices": {"usd": "4.25"}}),
    )])
    .await;
    let binder = create_location(&app, "Import Binder", "binder").await;
    let csv = "Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language\n3,Imported Card,imp,9,nonfoil,NM,en\n";
    let data = app
        .gql_data(
            PREVIEW_IMPORT,
            json!({"input": {"text": csv, "format": "csv", "locationId": gid(NodeKind::Location, binder.id), "purchasePriceCents": 100}}),
        )
        .await;
    let preview = &data["previewCollectionImport"]["importPreview"];
    assert_eq!(
        preview,
        &json!({
            "locationId": binder.id.to_string(), "total": 1, "exact": 1, "ambiguous": 0, "unresolved": 0,
            "rows": [{
                "rowNumber": 2, "status": "exact",
                "attrs": {
                    "name": "Imported Card", "setCode": "imp", "collectorNumber": "9", "quantity": 3,
                    "finish": "nonfoil", "condition": "near_mint", "language": "en",
                    "scryfallId": "scryfall-printing-import", "backScryfallId": "",
                    "locationId": binder.id.to_string(), "purchasePriceCents": 100
                },
                "printing": {"scryfallId": "scryfall-printing-import", "card": {"name": "Imported Card"}},
                "candidates": []
            }]
        })
    );
    let commit = r"mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
        commitCollectionImport(input: $input) { importResult { imported skipped autoSorted } }
      }";
    let data = app
        .gql_data(
            commit,
            json!({"input": {"rows": commit_rows(&preview["rows"])}}),
        )
        .await;
    assert_eq!(
        data["commitCollectionImport"]["importResult"],
        json!({"imported": 1, "skipped": 0, "autoSorted": 0})
    );

    let data = app.gql_data("{ collectionExportCsv }", json!({})).await;
    let export = data["collectionExportCsv"].as_str().unwrap();
    assert!(export.starts_with("Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Location,Purchase Price\n"));
    assert!(export.contains("3,Imported Card,imp,9,nonfoil,near_mint,en,Import Binder,$1"));
    let data = app
        .gql_data(
            "query CollectionExportText($filters: CollectionItemFilters) { collectionExportText(filters: $filters) }",
            json!({"filters": {"locationId": gid(NodeKind::Location, binder.id)}}),
        )
        .await;
    assert_eq!(data["collectionExportText"], "3x Imported Card (IMP) 9");

    let response = app
        .gql(
            PREVIEW_IMPORT,
            json!({"input": {"text": "x", "format": "pdf"}}),
        )
        .await;
    assert_eq!(
        errors(&response),
        ["Import file must be a CSV or TXT file."]
    );
    let response = app
        .gql(
            PREVIEW_IMPORT,
            json!({"input": {"text": "x", "locationId": "9999"}}),
        )
        .await;
    assert_eq!(errors(&response), ["Import location was not found."]);
    let data = app
        .gql_data(
            PREVIEW_IMPORT,
            json!({"input": {"text": "1 Nothing", "locationId": "unfiled"}}),
        )
        .await;
    assert_eq!(
        data["previewCollectionImport"]["importPreview"]["locationId"],
        Value::Null
    );
}

/// The import page resolves an ambiguous row by writing the chosen
/// candidate's `id` (a `Printing` global id) into `attrs.scryfallId`
/// (`selectCandidate` in `use-collection-import.ts`). Earlier releases rejected it as a
/// missing printing; found by the parity harness.
#[tokio::test]
async fn import_commit_accepts_a_chosen_candidate_global_id() {
    let app = TestApp::new().await;
    app.import_cards(&[
        card(
            "scryfall-ambiguous-a",
            "oracle-ambiguous",
            "Ambiguous Card",
            json!({"set": "aaa", "collector_number": "1"}),
        ),
        card(
            "scryfall-ambiguous-b",
            "oracle-ambiguous",
            "Ambiguous Card",
            json!({"set": "bbb", "collector_number": "2"}),
        ),
    ])
    .await;
    let data = app
        .gql_data(
            PREVIEW_IMPORT,
            json!({"input": {"text": "2 Ambiguous Card", "format": "text"}}),
        )
        .await;
    let row = &data["previewCollectionImport"]["importPreview"]["rows"][0];
    assert_eq!(row["status"], "ambiguous");
    let mut attrs = row["attrs"].clone();
    attrs["scryfallId"] = json!(gid(NodeKind::Printing, "scryfall-ambiguous-b"));
    let rows = json!([{"rowNumber": row["rowNumber"], "status": "exact", "attrs": attrs}]);
    let data = app
        .gql_data(
            r"mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
                commitCollectionImport(input: $input) { importResult { imported skipped } }
              }",
            json!({"input": {"rows": rows}}),
        )
        .await;
    assert_eq!(
        data["commitCollectionImport"]["importResult"],
        json!({"imported": 1, "skipped": 0})
    );
    let data = app
        .gql_data(
            "{ collectionItems(first: 5) { edges { node { quantity printing { scryfallId } } } } }",
            json!({}),
        )
        .await;
    assert_eq!(
        edges(&data["collectionItems"]),
        [json!({"quantity": 2, "printing": {"scryfallId": "scryfall-ambiguous-b"}})]
    );
}

fn rule_input(location: &str, overrides: Value) -> Value {
    merge(
        json!({
            "targetLocationId": location, "name": "Auto-sort rule", "enabled": false, "priority": 0,
            "colorMode": "any", "colors": [], "typeLineIncludes": [], "typeLineExcludes": [], "rarities": [],
            "minPriceCents": null, "maxPriceCents": null, "setOperator": "in", "setCodes": [],
            "releaseDateOperator": "after", "releaseDate": null
        }),
        overrides,
    )
}

const RULE_FIELDS: &str = "id name enabled priority targetLocation { id name kind } colorMode colors typeLineIncludes typeLineExcludes rarities minPriceCents maxPriceCents setOperator setCodes releaseDateOperator releaseDate";

#[tokio::test]
async fn auto_sort_rules_round_trip_over_graphql() {
    let app = TestApp::new().await;
    let binder = create_location(&app, "Rules Binder", "binder").await;
    let input = rule_input(
        &gid(NodeKind::Location, binder.id),
        json!({
            "name": "Izzet rares", "enabled": true, "priority": 7, "colorMode": "include_any",
            "colors": ["U", "R"], "typeLineIncludes": ["Wizard", "Instant"], "typeLineExcludes": ["Token"],
            "rarities": ["rare", "mythic"], "minPriceCents": 150, "maxPriceCents": 900,
            "setOperator": "not_in", "setCodes": ["lea", "sld"], "releaseDateOperator": "before",
            "releaseDate": "2026-01-01"
        }),
    );
    let data = app
        .gql_data(
            &format!("mutation($input: [CollectionAutoSortRuleInput!]!) {{ updateCollectionAutoSortRules(input: $input) {{ collectionAutoSortRules {{ {RULE_FIELDS} }} rules {{ name }} }} }}"),
            json!({"input": [input.clone()]}),
        )
        .await;
    let mut expected = input;
    let map = expected.as_object_mut().unwrap();
    map.remove("targetLocationId");
    let returned = &data["updateCollectionAutoSortRules"]["collectionAutoSortRules"][0];
    for (key, value) in map.iter() {
        assert_eq!(&returned[key], value, "{key}");
    }
    assert_eq!(
        returned["targetLocation"],
        json!({"id": gid(NodeKind::Location, binder.id), "name": "Rules Binder", "kind": "binder"})
    );
    assert_eq!(
        data["updateCollectionAutoSortRules"]["rules"],
        json!([{"name": "Izzet rares"}])
    );
    let data = app
        .gql_data(
            &format!("{{ collectionAutoSortRules {{ {RULE_FIELDS} }} }}"),
            json!({}),
        )
        .await;
    assert_eq!(&data["collectionAutoSortRules"][0], returned);
    assert!(returned["id"].as_str().unwrap().parse::<i64>().is_ok());
}

#[tokio::test]
async fn auto_sort_rules_query_and_target_validation() {
    let app = TestApp::new().await;
    let binder = create_location(&app, "Settings Binder", "binder").await;
    let wish = create_location(&app, "Wishlist", "list").await;
    replace(
        app.db(),
        &[RuleInput {
            name: Some("Binder rares".into()),
            target_location_id: Some(binder.id),
            enabled: Some(true),
            priority: Some(1),
            color_mode: Some("any".into()),
            rarities: Some(vec!["rare".into()]),
            ..RuleInput::default()
        }],
    )
    .await
    .unwrap();
    let data = app
        .gql_data(
            &format!("{{ collectionAutoSortRules {{ {RULE_FIELDS} }} locations(first: 100) {{ edges {{ node {{ id name kind }} }} }} }}"),
            json!({}),
        )
        .await;
    let rule = &data["collectionAutoSortRules"][0];
    assert_eq!(
        rule,
        &json!({
            "id": rule["id"], "name": "Binder rares", "enabled": true, "priority": 1,
            "targetLocation": {"id": gid(NodeKind::Location, binder.id), "name": "Settings Binder", "kind": "binder"},
            "colorMode": "any", "colors": [], "typeLineIncludes": [], "typeLineExcludes": [], "rarities": ["rare"],
            "minPriceCents": null, "maxPriceCents": null, "setOperator": "in", "setCodes": [],
            "releaseDateOperator": "after", "releaseDate": null
        })
    );
    let kinds: Vec<Value> = edges(&data["locations"])
        .iter()
        .map(|n| n["kind"].clone())
        .collect();
    assert_eq!(kinds, [json!("binder"), json!("list"), json!("unfiled")]);

    let mutation = "mutation($input: [CollectionAutoSortRuleInput!]!) { updateCollectionAutoSortRules(input: $input) { collectionAutoSortRules { id } } }";
    let response = app
        .gql(
            mutation,
            json!({"input": [rule_input(&gid(NodeKind::Location, "unfiled"), json!({}))]}),
        )
        .await;
    assert_eq!(
        errors(&response),
        ["Unfiled cannot be an auto-sort target."]
    );
    let response = app
        .gql(
            mutation,
            json!({"input": [rule_input(&gid(NodeKind::Location, wish.id), json!({}))]}),
        )
        .await;
    assert_eq!(
        errors(&response),
        ["Auto-sort target must be a box or binder."]
    );
    let response = app
        .gql(
            mutation,
            json!({"input": [rule_input(&gid(NodeKind::Location, 9_999), json!({}))]}),
        )
        .await;
    assert_eq!(
        errors(&response),
        ["Auto-sort target location was not found."]
    );
    let response = app.gql(mutation, json!({"input": [rule_input(&gid(NodeKind::Location, binder.id), json!({"colorMode": "plaid"}))]})).await;
    assert_eq!(errors(&response), ["color mode is invalid"]);
}

fn sorter(
    id: &str,
    oracle_id: &str,
    name: &str,
    type_line: &str,
    colors: &[&str],
    rarity: &str,
    price: &str,
) -> Value {
    json!({
        "id": id, "oracle_id": oracle_id, "name": name, "type_line": type_line, "collector_number": "1",
        "set": "aus", "set_name": "Auto Sort Set", "lang": "en", "rarity": rarity, "colors": colors,
        "color_identity": colors, "image_uris": {}, "finishes": ["nonfoil"], "prices": {"usd": price}, "legalities": {}
    })
}

const AUTO_SORT: &str = r"mutation AutoSortCollection($input: AutoSortCollectionInput) {
    autoSortCollection(input: $input) {
      autoSortResult {
        checkedCount movedCount skippedCount dryRun
        moves { collectionItemId cardName cardId setCode collectorNumber imageUrl quantity finish fromLocationId fromLocationName toLocationId toLocationName }
      }
    }
  }";

#[tokio::test]
async fn auto_sort_mutation_moves_matching_source_items() {
    let app = TestApp::new().await;
    app.import_cards(&[
        merge(
            sorter(
                "scryfall-auto-sort-red",
                "oracle-auto-sort-red",
                "Red Sorter",
                "Creature — Goblin",
                &["R"],
                "rare",
                "5.50",
            ),
            json!({"image_uris": {"normal": "https://example.test/red-sorter.jpg"}}),
        ),
        merge(
            sorter(
                "scryfall-auto-sort-blue",
                "oracle-auto-sort-blue",
                "Blue Sorter",
                "Creature — Merfolk",
                &["U"],
                "rare",
                "5.50",
            ),
            json!({"collector_number": "2"}),
        ),
    ])
    .await;
    let source = create_location(&app, "Sort Source", "box").await;
    let target = create_location(&app, "Red Auto Binder", "binder").await;
    let matching = create_item(
        &app,
        "scryfall-auto-sort-red",
        Attrs {
            location_id: Some(source.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let other = create_item(
        &app,
        "scryfall-auto-sort-blue",
        Attrs {
            location_id: Some(source.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let stale = manavault_core::timefmt::utc_seconds(
        time::OffsetDateTime::now_utc() - time::Duration::days(31),
    );
    set_item_column(&app, matching, "location_changed_at", &stale).await;
    set_item_column(&app, other, "location_changed_at", &stale).await;
    replace(
        app.db(),
        &[RuleInput {
            name: Some("Red creatures".into()),
            target_location_id: Some(target.id),
            enabled: Some(true),
            priority: Some(1),
            color_mode: Some("exact".into()),
            colors: Some(vec!["R".into()]),
            type_line_includes: Some(vec!["Creature".into()]),
            rarities: Some(vec!["rare".into()]),
            ..RuleInput::default()
        }],
    )
    .await
    .unwrap();
    let source_id = gid(NodeKind::Location, source.id);
    let data = app
        .gql_data(
            AUTO_SORT,
            json!({"input": {"sourceLocationId": source_id, "dryRun": true}}),
        )
        .await;
    let result = &data["autoSortCollection"]["autoSortResult"];
    assert_eq!(
        (
            result["checkedCount"].as_i64(),
            result["movedCount"].as_i64(),
            result["skippedCount"].as_i64()
        ),
        (Some(2), Some(1), Some(1))
    );
    assert_eq!(result["dryRun"], true);
    assert_eq!(result["moves"][0]["collectionItemId"], matching.to_string());
    assert_eq!(
        reload(&app, matching).await.unwrap().record.location_id,
        Some(source.id)
    );

    let data = app
        .gql_data(
            AUTO_SORT,
            json!({"input": {"sourceLocationId": source_id, "dryRun": false}}),
        )
        .await;
    assert_eq!(
        data["autoSortCollection"]["autoSortResult"],
        json!({
            "checkedCount": 2, "movedCount": 1, "skippedCount": 1, "dryRun": false,
            "moves": [{
                "collectionItemId": matching.to_string(), "cardName": "Red Sorter", "cardId": "oracle-auto-sort-red",
                "setCode": "aus", "collectorNumber": "1", "imageUrl": "https://example.test/red-sorter.jpg",
                "quantity": 1, "finish": "nonfoil", "fromLocationId": source.id.to_string(),
                "fromLocationName": "Sort Source", "toLocationId": target.id.to_string(), "toLocationName": "Red Auto Binder"
            }]
        })
    );
    assert_eq!(
        reload(&app, matching).await.unwrap().record.location_id,
        Some(target.id)
    );
    assert_eq!(
        reload(&app, other).await.unwrap().record.location_id,
        Some(source.id)
    );
}

#[tokio::test]
async fn auto_sort_mutation_accepts_an_unfiled_source_and_unsaved_rules() {
    let app = TestApp::new().await;
    app.import_cards(&[sorter(
        "scryfall-auto-sort-unfiled",
        "oracle-auto-sort-unfiled",
        "Unfiled Sorter",
        "Artifact Creature",
        &[],
        "uncommon",
        "0.50",
    )])
    .await;
    let target = create_location(&app, "Unfiled Auto Box", "box").await;
    let item = create_item(&app, "scryfall-auto-sort-unfiled", Attrs::default())
        .await
        .record
        .id;
    replace(
        app.db(),
        &[RuleInput {
            name: Some("Unfiled artifacts".into()),
            target_location_id: Some(target.id),
            enabled: Some(true),
            priority: Some(1),
            color_mode: Some("colorless".into()),
            type_line_includes: Some(vec!["Artifact".into()]),
            rarities: Some(vec!["uncommon".into()]),
            ..RuleInput::default()
        }],
    )
    .await
    .unwrap();
    // Unsaved rules preview without the stored ones.
    let data = app
        .gql_data(
            AUTO_SORT,
            json!({"input": {"sourceLocationId": "unfiled", "dryRun": true, "rules": [rule_input(&gid(NodeKind::Location, target.id), json!({"enabled": true, "colorMode": "multicolor"}))]}}),
        )
        .await;
    assert_eq!(
        data["autoSortCollection"]["autoSortResult"]["movedCount"],
        0
    );

    let data = app
        .gql_data(AUTO_SORT, json!({"input": {"sourceLocationId": "unfiled"}}))
        .await;
    let result = &data["autoSortCollection"]["autoSortResult"];
    assert_eq!(
        (
            result["checkedCount"].as_i64(),
            result["movedCount"].as_i64(),
            result["skippedCount"].as_i64()
        ),
        (Some(1), Some(1), Some(0))
    );
    let moved = &result["moves"][0];
    assert_eq!(
        (
            moved["collectionItemId"].clone(),
            moved["fromLocationId"].clone(),
            moved["fromLocationName"].clone(),
            moved["toLocationId"].clone()
        ),
        (
            json!(item.to_string()),
            Value::Null,
            json!("Unfiled"),
            json!(target.id.to_string())
        )
    );
    assert_eq!(
        reload(&app, item).await.unwrap().record.location_id,
        Some(target.id)
    );
}

#[tokio::test]
async fn import_commit_can_auto_sort_imported_cards() {
    let app = TestApp::new().await;
    app.import_cards(&[sorter(
        "scryfall-import-auto-sort",
        "oracle-import-auto-sort",
        "Auto Imported Card",
        "Creature — Dragon",
        &["R"],
        "mythic",
        "12.00",
    )])
    .await;
    let target = create_location(&app, "Auto Import Binder", "binder").await;
    replace(
        app.db(),
        &[RuleInput {
            name: Some("Imported red creatures".into()),
            target_location_id: Some(target.id),
            enabled: Some(true),
            priority: Some(1),
            color_mode: Some("include_any".into()),
            colors: Some(vec!["R".into()]),
            type_line_includes: Some(vec!["Creature".into()]),
            rarities: Some(vec!["mythic".into()]),
            min_price_cents: Some(1_000),
            ..RuleInput::default()
        }],
    )
    .await
    .unwrap();
    let csv = "Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language\n1,Auto Imported Card,aus,1,nonfoil,NM,en\n";
    let data = app
        .gql_data(
            r"mutation($input: CollectionImportPreviewInput!) { previewCollectionImport(input: $input) { importPreview { rows { rowNumber status attrs { quantity finish condition language scryfallId locationId } } } } }",
            json!({"input": {"text": csv, "format": "csv"}}),
        )
        .await;
    let rows = commit_rows(&data["previewCollectionImport"]["importPreview"]["rows"]);
    let data = app
        .gql_data(
            r"mutation($input: CollectionImportCommitInput!) {
                previewCollectionImportAutoSort(input: $input) {
                  autoSortResult { checkedCount movedCount skippedCount dryRun moves { cardName cardId imageUrl quantity finish fromLocationId fromLocationName toLocationId toLocationName } }
                }
              }",
            json!({"input": {"rows": rows}}),
        )
        .await;
    assert_eq!(
        data["previewCollectionImportAutoSort"]["autoSortResult"],
        json!({
            "checkedCount": 1, "movedCount": 1, "skippedCount": 0, "dryRun": true,
            "moves": [{
                "cardName": "Auto Imported Card", "cardId": "oracle-import-auto-sort", "imageUrl": null,
                "quantity": 1, "finish": "nonfoil", "fromLocationId": null, "fromLocationName": "Unfiled",
                "toLocationId": target.id.to_string(), "toLocationName": "Auto Import Binder"
            }]
        })
    );
    assert_eq!(
        item_ids(&app, &ItemFilters::default()).await,
        Vec::<i64>::new()
    );
    let data = app
        .gql_data(
            r"mutation($input: CollectionImportCommitInput!) { commitCollectionImport(input: $input) { importResult { imported skipped autoSorted } } }",
            json!({"input": {"autoSort": true, "rows": rows}}),
        )
        .await;
    assert_eq!(
        data["commitCollectionImport"]["importResult"],
        json!({"imported": 1, "skipped": 0, "autoSorted": 1})
    );
    let items = queries::list_items(
        app.db(),
        &ItemFilters::at(crate::collection::filters::LocationFilter::Id(target.id)),
        Page::default(),
    )
    .await
    .unwrap();
    assert_eq!(
        items[0].record.scryfall_id.as_str(),
        "scryfall-import-auto-sort"
    );
}
