//! GraphQL tests for the allocation mutations and the fields that cross
//! the deck/collection boundary: single and bulk deck allocations, bulk
//! adds, a collection item's allocation decks, and `node` lookups, plus the
//! allocation resolvers' error paths.

// The deck tests' fixtures, shared with `manavault-collection`, whose test
// modules are private to that crate.
#[path = "../../../manavault-collection/src/decks/tests/support.rs"]
#[allow(dead_code)]
mod deck_support;

use lotus::Finish;
use serde_json::{Value, json};

use crate::decks::model::{CollectionItemId, DeckCardId};
use crate::graphql::{NodeKind, global_id};
use crate::test_support::TestApp;
use deck_support::*;

fn item_gid(id: CollectionItemId) -> String {
    global_id(NodeKind::CollectionItem, id.0).to_string()
}

async fn app_with_card(id: &str, oracle_id: &str, name: &str) -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(&[simple_card(id, oracle_id, name, "Artifact", json!({}))])
        .await;
    app
}

async fn allocated(app: &TestApp, deck_card: DeckCardId) -> i64 {
    allocated_quantity(app, deck_card).await
}

const ADD: &str = r"mutation AddCollectionItemToDeck($id: ID!, $deckId: ID!, $zone: String) {
    addCollectionItemToDeck(id: $id, deckId: $deckId, zone: $zone) {
      deckCard { id quantity zone finish card { name } preferredPrinting { scryfallId } }
    }
  }";

#[tokio::test]
async fn add_collection_item_to_deck_creates_a_deck_card_and_allocation() {
    let app = app_with_card(
        "scryfall-printing-deck-add",
        "oracle-deck-add",
        "Deck Add Card",
    )
    .await;
    let item = collection_item(&app, "scryfall-printing-deck-add", 1, Finish::Nonfoil, None).await;
    let deck = create_deck(&app, "Target Deck", None, None).await;

    let data = app
        .gql_data(
            ADD,
            json!({"id": item_gid(item), "deckId": deck_gid(deck.id), "zone": "mainboard"}),
        )
        .await;
    let card = &data["addCollectionItemToDeck"]["deckCard"];
    assert_eq!(
        card,
        &json!({
            "id": card["id"],
            "quantity": 1,
            "zone": "mainboard",
            "finish": "nonfoil",
            "card": {"name": "Deck Add Card"},
            "preferredPrinting": {"scryfallId": "scryfall-printing-deck-add"}
        })
    );
    let rows = deck_cards(&app, deck.id).await;
    assert_eq!(rows.len(), 1);
    assert_eq!(allocated(&app, rows[0].id).await, 1);
}

#[tokio::test]
async fn add_collection_item_to_deck_reports_documented_errors() {
    let app = app_with_card("scryfall-add-errors", "oracle-add-errors", "Add Errors").await;
    let item = collection_item(&app, "scryfall-add-errors", 2, Finish::Nonfoil, None).await;
    let deck = create_deck(&app, "Errors Deck", None, None).await;
    let add = |id: String, deck_id: String, zone: Value| {
        let app = &app;
        async move {
            error_message(
                &app.gql(ADD, json!({"id": id, "deckId": deck_id, "zone": zone}))
                    .await,
            )
        }
    };
    assert_eq!(
        add(item_gid(item), deck_gid(deck.id), json!("sideboard")).await,
        "zone is invalid"
    );
    assert_eq!(
        add(
            item_gid(CollectionItemId(999)),
            deck_gid(deck.id),
            json!("mainboard")
        )
        .await,
        "Collection item was not found."
    );
    assert_eq!(
        add(
            item_gid(item),
            deck_gid(crate::decks::DeckId(999)),
            json!("mainboard")
        )
        .await,
        "Deck was not found."
    );
    assert_eq!(
        add(deck_gid(deck.id), deck_gid(deck.id), json!(null)).await,
        "Expected collection item ID, got deck ID"
    );
    // Considering cards are only ideas: the copy is not reserved.
    let data = app
        .gql_data(
            ADD,
            json!({"id": item_gid(item), "deckId": deck_gid(deck.id), "zone": "considering"}),
        )
        .await;
    assert_eq!(
        data["addCollectionItemToDeck"]["deckCard"]["zone"],
        "considering"
    );
    assert_eq!(
        allocated(&app, deck_cards(&app, deck.id).await[0].id).await,
        0
    );
    set_status(&app, deck.id, "archived").await;
    // The archive check comes before the zone check, as in `AddCardToDeck`.
    assert_eq!(
        add(item_gid(item), deck_gid(deck.id), json!("sideboard")).await,
        "Unarchive this deck before changing allocations."
    );
}

#[tokio::test]
async fn allocation_status_candidates_and_allocation_mutations_over_graphql() {
    let app = app_with_card(
        "scryfall-allocation-status",
        "oracle-allocation-status",
        "Allocation Status Card",
    )
    .await;
    let item = collection_item(&app, "scryfall-allocation-status", 1, Finish::Nonfoil, None).await;
    let deck = create_deck(&app, "Allocation Deck", None, None).await;
    let deck_card = add_card(&app, deck.id, "Allocation Status Card", 1, "mainboard").await;

    let status = app
        .gql_data(
            r"query Deck($id: ID!) {
                deck(id: $id) {
                  deckCards(first: 10) {
                    pageInfo { hasNextPage }
                    edges { node { id allocationStatus {
                      state required owned available allocated missing
                      candidates { available item { id quantity printing { card { name } } } }
                    } } }
                  }
                }
              }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    assert_eq!(
        status["deck"]["deckCards"]["edges"][0]["node"]["allocationStatus"],
        json!({
            "state": "available", "required": 1, "owned": 1, "available": 1, "allocated": 0,
            "missing": 0,
            "candidates": [{"available": 1, "item": {
                "id": item_gid(item), "quantity": 1,
                "printing": {"card": {"name": "Allocation Status Card"}}
            }}]
        })
    );

    let allocate = r"mutation Allocate($deckCardId: ID!, $collectionItemId: ID!) {
        allocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
          deckCard { id allocationStatus { state allocated available missing } }
        }
      }";
    let ids = json!({"deckCardId": card_gid(deck_card.id), "collectionItemId": item_gid(item)});
    let data = app.gql_data(allocate, ids.clone()).await;
    assert_eq!(
        data["allocateDeckCardItem"]["deckCard"],
        json!({"id": card_gid(deck_card.id),
               "allocationStatus": {"state": "allocated", "allocated": 1, "available": 0, "missing": 0}})
    );
    // The only copy is taken now (checked before the deck card's room).
    assert_eq!(
        error_message(&app.gql(allocate, ids.clone()).await),
        "No available copies remain for that collection item."
    );

    let visibility = app
        .gql_data(
            r"query Visibility($unfiledId: ID!) {
                location(id: $unfiledId) {
                  itemCount
                  collectionItems(first: 10) { pageInfo { hasNextPage } edges { node { id } } }
                }
                collectionItems(first: 10) {
                  pageInfo { hasNextPage }
                  edges { node {
                    allocatedQuantity
                    allocationDecks { quantity deck { name } }
                    printing { card { name } }
                  } }
                }
              }",
            json!({"unfiledId": global_id(NodeKind::Location, "unfiled")}),
        )
        .await;
    assert_eq!(
        visibility,
        json!({
            "location": {"itemCount": 0, "collectionItems": {"pageInfo": {"hasNextPage": false}, "edges": []}},
            "collectionItems": {"pageInfo": {"hasNextPage": false}, "edges": [{"node": {
                "allocatedQuantity": 1,
                "allocationDecks": [{"quantity": 1, "deck": {"name": "Allocation Deck"}}],
                "printing": {"card": {"name": "Allocation Status Card"}}
            }}]}
        })
    );

    let deallocate = r"mutation Deallocate($deckCardId: ID!, $collectionItemId: ID!) {
        deallocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
          deckCard { id allocationStatus { state allocated available missing } }
        }
      }";
    let data = app.gql_data(deallocate, ids.clone()).await;
    assert_eq!(
        data["deallocateDeckCardItem"]["deckCard"]["allocationStatus"],
        json!({"state": "available", "allocated": 0, "available": 1, "missing": 0})
    );
    assert_eq!(
        error_message(&app.gql(deallocate, ids).await),
        "Allocation not found."
    );
    assert_eq!(
        error_message(
            &app.gql(
                allocate,
                json!({"deckCardId": card_gid(DeckCardId(999)), "collectionItemId": item_gid(item)})
            )
            .await
        ),
        "Deck card was not found."
    );
    assert_eq!(
        error_message(
            &app.gql(
                allocate,
                json!({"deckCardId": card_gid(deck_card.id), "collectionItemId": item_gid(CollectionItemId(999))})
            )
            .await
        ),
        "Collection item was not found."
    );
}

const PROXY_FIELDS: &str =
    "deckCard { id allocationStatus { state allocated proxyAllocated available missing } }";

#[tokio::test]
async fn deck_proxy_allocation_mutations_over_graphql() {
    let app = app_with_card(
        "scryfall-proxy-allocation",
        "oracle-proxy-allocation",
        "Proxy Allocation Card",
    )
    .await;
    let deck = create_deck(&app, "Proxy Allocation Deck", None, None).await;
    let deck_card = add_card(&app, deck.id, "Proxy Allocation Card", 1, "mainboard").await;
    let allocate = format!(
        "mutation AllocateProxy($deckCardId: ID!, $quantity: Int) {{ allocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {{ {PROXY_FIELDS} }} }}"
    );
    let deallocate = format!(
        "mutation DeallocateProxy($deckCardId: ID!, $quantity: Int) {{ deallocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {{ {PROXY_FIELDS} }} }}"
    );
    let id = json!({"deckCardId": card_gid(deck_card.id)});

    let data = app.gql_data(&allocate, id.clone()).await;
    assert_eq!(
        data["allocateDeckCardProxy"]["deckCard"]["allocationStatus"],
        json!({"state": "allocated", "allocated": 1, "proxyAllocated": 1, "available": 0, "missing": 0})
    );
    assert_eq!(
        error_message(&app.gql(&allocate, id.clone()).await),
        "That deck card already has enough allocated copies."
    );
    let data = app.gql_data(&deallocate, id.clone()).await;
    assert_eq!(
        data["deallocateDeckCardProxy"]["deckCard"]["allocationStatus"],
        json!({"state": "missing", "allocated": 0, "proxyAllocated": 0, "available": 0, "missing": 1})
    );
    assert_eq!(
        error_message(&app.gql(&deallocate, id.clone()).await),
        "Proxy allocation not found."
    );
    let zero = json!({"deckCardId": card_gid(deck_card.id), "quantity": 0});
    assert_eq!(
        error_message(&app.gql(&allocate, zero.clone()).await),
        "Allocation quantity is invalid."
    );
    // The deck card's checks come before the quantity's.
    set_status(&app, deck.id, "archived").await;
    assert_eq!(
        error_message(&app.gql(&allocate, zero.clone()).await),
        "Unarchive this deck before changing allocations."
    );
    assert_eq!(
        error_message(&app.gql(&deallocate, zero).await),
        "Unarchive this deck before changing allocations."
    );
    assert_eq!(
        error_message(
            &app.gql(&allocate, json!({"deckCardId": card_gid(DeckCardId(999))}))
                .await
        ),
        "Deck card was not found."
    );
}

#[tokio::test]
async fn bulk_deck_allocation_preview_and_mutation_over_graphql() {
    let app = app_with_card(
        "scryfall-bulk-allocation",
        "oracle-bulk-allocation",
        "Bulk Allocation Card",
    )
    .await;
    sqlx::query("UPDATE scryfall_printings SET set_code = 'alc', collector_number = '9'")
        .execute(app.db())
        .await
        .unwrap();
    collection_item(&app, "scryfall-bulk-allocation", 2, Finish::Nonfoil, None).await;
    let deck = create_deck(&app, "Bulk Allocation Deck", None, None).await;
    add_printing(
        &app,
        deck.id,
        "Bulk Allocation Card",
        2,
        "scryfall-bulk-allocation",
    )
    .await;
    let preview = r"mutation PreviewBulkAllocateDeck($id: ID!, $mode: String!) {
        previewBulkAllocateDeck(id: $id, mode: $mode) {
          allocationPreview {
            mode allocated cards skipped
            entries {
              quantity exact
              deckCard { card { name } preferredPrinting { setCode collectorNumber } }
              item { quantity printing { card { name } setCode collectorNumber } }
            }
          }
        }
      }";
    let data = app
        .gql_data(
            preview,
            json!({"id": deck_gid(deck.id), "mode": "exact_printings"}),
        )
        .await;
    assert_eq!(
        data["previewBulkAllocateDeck"]["allocationPreview"],
        json!({
            "mode": "exact_printings", "allocated": 2, "cards": 1, "skipped": 0,
            "entries": [{
                "quantity": 2, "exact": true,
                "deckCard": {"card": {"name": "Bulk Allocation Card"},
                             "preferredPrinting": {"setCode": "alc", "collectorNumber": "9"}},
                "item": {"quantity": 2, "printing": {"card": {"name": "Bulk Allocation Card"},
                                                     "setCode": "alc", "collectorNumber": "9"}}
            }]
        })
    );
    // The preview reserves nothing.
    assert_eq!(
        allocated(&app, deck_cards(&app, deck.id).await[0].id).await,
        0
    );
    assert_eq!(
        error_message(
            &app.gql(
                preview,
                json!({"id": deck_gid(deck.id), "mode": "every_printing"})
            )
            .await
        ),
        "Could not add collection item to deck."
    );
    assert_eq!(
        error_message(
            &app.gql(
                preview,
                json!({"id": deck_gid(crate::decks::DeckId(999)), "mode": "every_printing"})
            )
            .await
        ),
        "Deck was not found."
    );

    let data = app
        .gql_data(
            r"mutation BulkAllocateDeck($id: ID!, $mode: String!) {
                bulkAllocateDeck(id: $id, mode: $mode) { allocationResult { allocated cards skipped } }
              }",
            json!({"id": deck_gid(deck.id), "mode": "exact_printings"}),
        )
        .await;
    assert_eq!(
        data["bulkAllocateDeck"]["allocationResult"],
        json!({"allocated": 2, "cards": 1, "skipped": 0})
    );
}

#[tokio::test]
async fn deck_pull_list_allocation_over_graphql() {
    let app = app_with_card(
        "scryfall-pull-list-allocation",
        "oracle-pull-list-allocation",
        "Pull List Card",
    )
    .await;
    let item = collection_item(
        &app,
        "scryfall-pull-list-allocation",
        2,
        Finish::Nonfoil,
        None,
    )
    .await;
    let deck = create_deck(&app, "Pull List Deck", None, None).await;
    let deck_card = add_printing(
        &app,
        deck.id,
        "Pull List Card",
        2,
        "scryfall-pull-list-allocation",
    )
    .await;
    let mutation = r"mutation AllocateDeckPullList($deckId: ID!, $entries: [DeckPullListEntryInput!]!) {
        allocateDeckPullList(deckId: $deckId, entries: $entries) { allocationResult { allocated cards skipped } }
      }";
    let data = app
        .gql_data(
            mutation,
            json!({"deckId": deck_gid(deck.id), "entries": [{
                "deckCardId": card_gid(deck_card.id),
                "collectionItemId": item_gid(item),
                "quantity": 2
            }]}),
        )
        .await;
    assert_eq!(
        data["allocateDeckPullList"]["allocationResult"],
        json!({"allocated": 2, "cards": 1, "skipped": 0})
    );
    assert_eq!(allocated(&app, deck_card.id).await, 2);
    assert_eq!(
        error_message(
            &app.gql(
                mutation,
                json!({"deckId": deck_gid(deck.id), "entries": [{
                    "deckCardId": item_gid(item),
                    "collectionItemId": item_gid(item)
                }]})
            )
            .await
        ),
        "Expected deck card ID, got collection item ID"
    );
}

#[tokio::test]
async fn allocation_decks_resolve_their_decks_across_many_items() {
    let cards: Vec<Value> = (1..=5)
        .map(|index| {
            simple_card(
                &format!("scryfall-alloc-decks-{index}"),
                &format!("oracle-alloc-decks-{index}"),
                &format!("Alloc Decks {index}"),
                "Artifact",
                json!({"collector_number": index.to_string(), "set": "adk"}),
            )
        })
        .collect();
    let app = TestApp::new().await;
    app.import_cards(&cards).await;
    let deck = create_deck(&app, "Alloc Decks Deck", None, None).await;
    for index in 1..=5 {
        let item = collection_item(
            &app,
            &format!("scryfall-alloc-decks-{index}"),
            1,
            Finish::Nonfoil,
            None,
        )
        .await;
        app.gql_data(
            "mutation Add($id: ID!, $deckId: ID!) { addCollectionItemToDeck(id: $id, deckId: $deckId) { deckCard { id } } }",
            json!({"id": item_gid(item), "deckId": deck_gid(deck.id)}),
        )
        .await;
    }
    let data = app
        .gql_data(
            "query { collectionItems(first: 50) { edges { node { allocationDecks { quantity deck { name } } } } } }",
            json!({}),
        )
        .await;
    let edges = data["collectionItems"]["edges"].as_array().unwrap();
    assert_eq!(edges.len(), 5);
    for edge in edges {
        assert_eq!(
            edge["node"]["allocationDecks"],
            json!([{"quantity": 1, "deck": {"name": "Alloc Decks Deck"}}])
        );
    }
}

#[tokio::test]
async fn bulk_add_collection_items_to_deck_in_one_mutation() {
    let cards: Vec<Value> = (1..=5)
        .map(|index| {
            simple_card(
                &format!("scryfall-bulk-add-collection-{index}"),
                &format!("oracle-bulk-add-collection-{index}"),
                &format!("Bulk Add Collection {index}"),
                "Artifact",
                json!({"collector_number": index.to_string(), "set": "bac"}),
            )
        })
        .collect();
    let app = TestApp::new().await;
    app.import_cards(&cards).await;
    let binder = location(&app, "Bulk Add Binder", "binder").await;
    let deck = create_deck(&app, "Bulk Add Deck", None, None).await;
    let mut ids = Vec::new();
    for index in 1..=5 {
        let item = collection_item(
            &app,
            &format!("scryfall-bulk-add-collection-{index}"),
            1,
            Finish::Nonfoil,
            Some(binder),
        )
        .await;
        ids.push(item_gid(item));
    }
    let mutation = r"mutation BulkAdd($deckId: ID!, $selector: CollectionItemSelector!, $zone: String) {
        bulkAddCollectionItemsToDeck(deckId: $deckId, selector: $selector, zone: $zone) {
          deckCards { id quantity zone allocationStatus { allocated } }
        }
      }";
    let data = app
        .gql_data(
            mutation,
            json!({"deckId": deck_gid(deck.id), "selector": {"ids": ids}}),
        )
        .await;
    let added = data["bulkAddCollectionItemsToDeck"]["deckCards"]
        .as_array()
        .unwrap();
    assert_eq!(added.len(), 5);
    for card in added {
        assert_eq!(
            (
                &card["quantity"],
                &card["zone"],
                &card["allocationStatus"]["allocated"]
            ),
            (&json!(1), &json!("mainboard"), &json!(1))
        );
    }
    assert_eq!(location_quantity(&app, binder).await, 0);

    // An empty selection with a bad zone is a no-op; a non-empty one fails
    // the deck card changeset.
    let empty = app
        .gql(
            mutation,
            json!({"deckId": deck_gid(deck.id), "selector": {"ids": []}, "zone": "sideboard"}),
        )
        .await;
    assert_eq!(
        empty["data"]["bulkAddCollectionItemsToDeck"]["deckCards"],
        json!([])
    );
    assert_eq!(
        error_message(
            &app.gql(
                mutation,
                json!({"deckId": deck_gid(deck.id), "selector": {"ids": [ids[0]]}, "zone": "sideboard"})
            )
            .await
        ),
        "zone is invalid"
    );
    assert_eq!(
        error_message(
            &app.gql(
                mutation,
                json!({"deckId": deck_gid(deck.id), "selector": {"ids": [item_gid(CollectionItemId(999))]}})
            )
            .await
        ),
        "Could not add collection item to deck."
    );
}

#[tokio::test]
async fn bulk_deallocate_deck_cards_returns_copies_and_proxies() {
    let app = app_with_card(
        "scryfall-bulk-release",
        "oracle-bulk-release",
        "Bulk Release",
    )
    .await;
    let binder = location(&app, "Release Binder", "binder").await;
    let item = collection_item(
        &app,
        "scryfall-bulk-release",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let deck = create_deck(&app, "Release Deck", None, None).await;
    let deck_card = add_card(&app, deck.id, "Bulk Release", 2, "mainboard").await;
    allocate(&app, deck_card.id, item, 1).await;
    manavault_allocation::allocate_proxy(
        app.db(),
        deck_card.id,
        manavault_allocation::parse_quantity(1).unwrap(),
    )
    .await
    .unwrap();
    let mutation = r"mutation Release($ids: [ID!]!) {
        bulkDeallocateDeckCards(deckCardIds: $ids) {
          deckCards { id allocationStatus { allocated proxyAllocated } }
        }
      }";
    let gid = card_gid(deck_card.id);
    let data = app
        .gql_data(mutation, json!({"ids": [gid.clone(), gid.clone()]}))
        .await;
    assert_eq!(
        data["bulkDeallocateDeckCards"]["deckCards"],
        json!([{"id": gid, "allocationStatus": {"allocated": 0, "proxyAllocated": 0}}])
    );
    assert_eq!(location_quantity(&app, binder).await, 1);
    assert_eq!(
        error_message(
            &app.gql(mutation, json!({"ids": [gid, card_gid(DeckCardId(999))]}))
                .await
        ),
        "Deck card was not found."
    );
}
