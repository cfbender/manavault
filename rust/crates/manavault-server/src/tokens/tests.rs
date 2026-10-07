//! Token tests, ported from `test/manavault/catalog/tokens_test.exs` and
//! `test/manavault_web/schema/tokens_test.exs`.

use async_graphql::MaybeUndefined;
use serde_json::{Value, json};

use crate::catalog::tests::link_token;
use crate::graphql::{NodeKind, global_id};
use crate::test_support::TestApp;
use crate::test_support::fixtures::{black_lotus, merge};
use crate::tokens::back_options::token_back_options;
use crate::tokens::items::{self, NewTokenItem, TokenItemChanges, TokenItemError};
use crate::tokens::produced;
use crate::tokens::search::{TokenPrintingFilters, search_token_printings};

fn treasure_tlea() -> Value {
    json!({
        "id": "token-treasure-tlea", "oracle_id": "oracle-treasure", "name": "Treasure",
        "type_line": "Token Artifact — Treasure", "layout": "token", "set": "tlea",
        "set_name": "Alpha Tokens", "set_type": "token", "collector_number": "1", "lang": "en",
        "finishes": ["nonfoil", "foil"], "released_at": "1993-08-05"
    })
}

fn treasure_tleb() -> Value {
    merge(
        treasure_tlea(),
        json!({"id": "token-treasure-tleb", "set": "tleb", "set_name": "Beta Tokens", "released_at": "1993-10-04"}),
    )
}

fn soldier_tlea() -> Value {
    merge(
        treasure_tlea(),
        json!({"id": "token-soldier-tlea", "oracle_id": "oracle-soldier", "name": "Soldier", "type_line": "Token Creature — Soldier", "collector_number": "2"}),
    )
}

async fn app() -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(&[
        black_lotus(),
        treasure_tlea(),
        treasure_tleb(),
        soldier_tlea(),
    ])
    .await;
    link_token(&app, "scryfall-printing-1", "token-treasure-tlea").await;
    link_token(&app, "scryfall-printing-1", "token-soldier-tlea").await;
    app
}

fn new(scryfall_id: &str) -> NewTokenItem {
    NewTokenItem {
        scryfall_id: Some(scryfall_id.to_owned()),
        ..NewTokenItem::default()
    }
}

#[tokio::test]
async fn add_merges_copies_of_the_same_printing_back_and_finish() {
    let app = app().await;
    let pool = app.db();
    let first = items::add(
        pool,
        NewTokenItem {
            quantity: Some(2),
            ..new("token-treasure-tlea")
        },
    )
    .await
    .unwrap();
    assert_eq!(first.record.quantity.get(), 2);
    assert_eq!(first.record.finish.as_str(), "nonfoil");
    assert_eq!(first.record.back_scryfall_id, None);
    let merged = items::add(pool, new("token-treasure-tlea")).await.unwrap();
    assert_eq!(merged.record.id, first.record.id);
    assert_eq!(merged.record.quantity.get(), 3);

    let backed = items::add(
        pool,
        NewTokenItem {
            back_scryfall_id: Some("token-soldier-tlea".to_owned()),
            ..new("token-treasure-tlea")
        },
    )
    .await
    .unwrap();
    assert_eq!(
        backed.record.back_scryfall_id.as_ref().unwrap().as_str(),
        "token-soldier-tlea"
    );
    assert_eq!(backed.record.quantity.get(), 1);
    let foil = items::add(
        pool,
        NewTokenItem {
            finish: Some("foil".to_owned()),
            ..new("token-treasure-tlea")
        },
    )
    .await
    .unwrap();
    assert_eq!(foil.record.finish.as_str(), "foil");
    assert_eq!(foil.record.quantity.get(), 1);

    let listed = items::list(pool, "").await.unwrap();
    assert_eq!(listed.len(), 3);
    assert_eq!(listed[0].record.id, first.record.id);
    assert_eq!(listed[0].printing.card.as_ref().unwrap().name, "Treasure");
    // The name filter matches either printed side.
    let soldiers = items::list(pool, "sold").await.unwrap();
    assert_eq!(soldiers.len(), 1);
    assert_eq!(soldiers[0].record.id, backed.record.id);
    assert_eq!(items::list(pool, "lotus").await.unwrap().len(), 0);
}

#[tokio::test]
async fn add_rejects_playable_cards_unknown_printings_and_bad_quantities() {
    let app = app().await;
    let pool = app.db();
    assert!(matches!(
        items::add(pool, new("scryfall-printing-1")).await,
        Err(TokenItemError::NotAToken)
    ));
    assert!(matches!(
        items::add(pool, new("nope")).await,
        Err(TokenItemError::PrintingNotFound)
    ));
    assert!(matches!(
        items::add(
            pool,
            NewTokenItem {
                scryfall_id: None,
                ..NewTokenItem::default()
            }
        )
        .await,
        Err(TokenItemError::PrintingNotFound)
    ));
    assert!(matches!(
        items::add(
            pool,
            NewTokenItem {
                back_scryfall_id: Some("scryfall-printing-1".to_owned()),
                ..new("token-treasure-tlea")
            }
        )
        .await,
        Err(TokenItemError::NotAToken)
    ));
    let error = items::add(
        pool,
        NewTokenItem {
            quantity: Some(0),
            ..new("token-treasure-tlea")
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "quantity must be greater than 0");
    let error = items::add(
        pool,
        NewTokenItem {
            finish: Some("shiny".to_owned()),
            ..new("token-treasure-tlea")
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "finish is invalid");
}

#[tokio::test]
async fn owned_counts_span_printings_and_back_faces() {
    let app = app().await;
    let pool = app.db();
    items::add(
        pool,
        NewTokenItem {
            quantity: Some(2),
            ..new("token-treasure-tlea")
        },
    )
    .await
    .unwrap();
    items::add(
        pool,
        NewTokenItem {
            quantity: Some(3),
            ..new("token-treasure-tleb")
        },
    )
    .await
    .unwrap();
    items::add(
        pool,
        NewTokenItem {
            back_scryfall_id: Some("token-treasure-tlea".to_owned()),
            quantity: Some(4),
            ..new("token-soldier-tlea")
        },
    )
    .await
    .unwrap();
    let counts = items::owned_token_counts(
        pool,
        &[
            "oracle-treasure".into(),
            "oracle-soldier".into(),
            "oracle-1".into(),
        ],
    )
    .await
    .unwrap();
    assert_eq!(counts.get(&"oracle-treasure".into()), Some(&9));
    assert_eq!(counts.get(&"oracle-soldier".into()), Some(&4));
    assert_eq!(counts.get(&"oracle-1".into()), None);

    let produced = produced::by_oracle_ids(pool, &["oracle-1".into()])
        .await
        .unwrap();
    let tokens: Vec<(String, i64)> = produced[&"oracle-1".into()]
        .iter()
        .map(|token| (token.printing.scryfall_id.to_string(), token.owned_count))
        .collect();
    assert_eq!(
        tokens,
        [
            ("token-soldier-tlea".to_owned(), 4),
            ("token-treasure-tlea".to_owned(), 9)
        ]
    );
    assert_eq!(items::count(pool).await.unwrap(), 9);
}

#[tokio::test]
async fn update_and_delete_token_items() {
    let app = app().await;
    let pool = app.db();
    let item = items::add(
        pool,
        NewTokenItem {
            quantity: Some(2),
            ..new("token-treasure-tlea")
        },
    )
    .await
    .unwrap();
    let id = item.record.id;
    let updated = items::update(
        pool,
        id,
        TokenItemChanges {
            quantity: MaybeUndefined::Value(5),
            finish: MaybeUndefined::Undefined,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        (
            updated.record.quantity.get(),
            updated.record.finish.as_str()
        ),
        (5, "nonfoil")
    );
    let updated = items::update(
        pool,
        id,
        TokenItemChanges {
            quantity: MaybeUndefined::Undefined,
            finish: MaybeUndefined::Value("foil".to_owned()),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        (
            updated.record.quantity.get(),
            updated.record.finish.as_str()
        ),
        (5, "foil")
    );
    // Explicit nulls fall back to the defaults, as the Elixir normalization does.
    let updated = items::update(
        pool,
        id,
        TokenItemChanges {
            quantity: MaybeUndefined::Null,
            finish: MaybeUndefined::Null,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        (
            updated.record.quantity.get(),
            updated.record.finish.as_str()
        ),
        (1, "nonfoil")
    );
    let error = items::update(
        pool,
        id,
        TokenItemChanges {
            quantity: MaybeUndefined::Value(0),
            finish: MaybeUndefined::Undefined,
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "quantity must be greater than 0");
    items::delete(pool, id).await.unwrap();
    assert_eq!(items::list(pool, "").await.unwrap().len(), 0);
    assert!(matches!(
        items::delete(pool, id).await,
        Err(TokenItemError::NotFound)
    ));
}

#[tokio::test]
async fn search_token_printings_by_name_and_set() {
    let app = app().await;
    let search = |q: &str, set_code: &str, exclude: Option<&str>| {
        let pool = app.db().clone();
        let filters = TokenPrintingFilters {
            q: q.to_owned(),
            set_code: set_code.to_owned(),
            exclude_scryfall_id: exclude.map(str::to_owned),
        };
        async move {
            search_token_printings(&pool, &filters, 60)
                .await
                .unwrap()
                .iter()
                .map(|p| p.scryfall_id.to_string())
                .collect::<Vec<_>>()
        }
    };
    assert_eq!(
        search("treas", "", None).await,
        ["token-treasure-tleb", "token-treasure-tlea"]
    );
    assert_eq!(
        search("", "TLEA", Some("token-treasure-tlea")).await,
        ["token-soldier-tlea"]
    );
    assert_eq!(search("lotus", "", None).await.len(), 0);
    assert_eq!(search("", "", None).await.len(), 0);
}

fn token(base: Value, id: &str, oracle_id: &str, name: &str, set: &str, number: &str) -> Value {
    merge(
        base,
        json!({"id": id, "oracle_id": oracle_id, "name": name, "set": set, "collector_number": number}),
    )
}

async fn back_app() -> TestApp {
    let app = app().await;
    // Real M3C faces: Dragon #12 is printed with Shapeshifter #8, Copy (MH3 #1),
    // or Treasure (MH3 #34, not imported); Goblin #13 only with Tarmogoyf #22.
    let dragon = token(
        treasure_tlea(),
        "token-dragon-m3c",
        "oracle-dragon",
        "Dragon",
        "tm3c",
        "12",
    );
    let shapeshifter = token(
        dragon.clone(),
        "token-shapeshifter-m3c",
        "oracle-shapeshifter",
        "Shapeshifter",
        "tm3c",
        "8",
    );
    let goblin = token(
        dragon.clone(),
        "token-goblin-m3c",
        "oracle-goblin",
        "Goblin",
        "tm3c",
        "13",
    );
    let copy = token(
        dragon.clone(),
        "token-copy-mh3",
        "oracle-copy",
        "Copy",
        "tmh3",
        "1",
    );
    // A playable card at a paired position must never be offered as a back.
    let impostor = merge(
        black_lotus(),
        json!({"id": "card-at-tmh3-34", "set": "tmh3", "collector_number": "34"}),
    );
    app.import_cards(&[dragon, shapeshifter, goblin, copy, impostor])
        .await;
    app
}

async fn back_ids(app: &TestApp, scryfall_id: &str) -> (Vec<String>, Vec<String>) {
    let options = token_back_options(app.db(), scryfall_id).await.unwrap();
    let ids = |printings: &[crate::catalog::Printing]| {
        printings
            .iter()
            .map(|p| p.scryfall_id.to_string())
            .collect::<Vec<_>>()
    };
    (ids(&options.known), ids(&options.same_set))
}

#[tokio::test]
async fn back_options_list_known_backs_then_the_set() {
    let app = back_app().await;
    let options = token_back_options(app.db(), "token-dragon-m3c")
        .await
        .unwrap();
    let known: Vec<(String, String)> = options
        .known
        .iter()
        .map(|p| {
            (
                p.scryfall_id.to_string(),
                p.card.as_ref().unwrap().name.clone(),
            )
        })
        .collect();
    assert_eq!(
        known,
        [
            (
                "token-shapeshifter-m3c".to_owned(),
                "Shapeshifter".to_owned()
            ),
            ("token-copy-mh3".to_owned(), "Copy".to_owned())
        ]
    );
    assert_eq!(
        back_ids(&app, "token-dragon-m3c").await.1,
        ["token-goblin-m3c"]
    );

    let (known, mut same_set) = back_ids(&app, "token-goblin-m3c").await;
    assert_eq!(known.len(), 0);
    same_set.sort();
    assert_eq!(same_set, ["token-dragon-m3c", "token-shapeshifter-m3c"]);
    assert_eq!(back_ids(&app, "nope").await, (vec![], vec![]));
}

#[tokio::test]
async fn back_options_offer_emblems_and_learn_from_owned_tokens() {
    let app = back_app().await;
    let human_wizard = token(
        treasure_tlea(),
        "token-human-wizard-inr",
        "oracle-human-wizard",
        "Human Wizard",
        "tinr",
        "5",
    );
    let emblem = merge(
        token(
            human_wizard.clone(),
            "emblem-jace-inr",
            "oracle-jace-emblem",
            "Jace, Unraveler of Secrets Emblem",
            "tinr",
            "25",
        ),
        json!({"type_line": "Emblem — Jace", "layout": "emblem"}),
    );
    app.import_cards(&[human_wizard, emblem]).await;
    assert_eq!(
        back_ids(&app, "token-human-wizard-inr").await,
        (vec![], vec!["emblem-jace-inr".to_owned()])
    );
    items::add(
        app.db(),
        NewTokenItem {
            back_scryfall_id: Some("emblem-jace-inr".to_owned()),
            quantity: Some(1),
            finish: Some("nonfoil".to_owned()),
            ..new("token-human-wizard-inr")
        },
    )
    .await
    .unwrap();
    assert_eq!(
        back_ids(&app, "token-human-wizard-inr").await,
        (vec!["emblem-jace-inr".to_owned()], vec![])
    );
    assert_eq!(
        back_ids(&app, "emblem-jace-inr").await,
        (vec!["token-human-wizard-inr".to_owned()], vec![])
    );
}

#[tokio::test]
async fn back_options_learn_in_both_directions_ahead_of_gallery_data() {
    let app = back_app().await;
    items::add(
        app.db(),
        NewTokenItem {
            back_scryfall_id: Some("token-dragon-m3c".to_owned()),
            quantity: Some(2),
            ..new("token-goblin-m3c")
        },
    )
    .await
    .unwrap();
    items::add(
        app.db(),
        NewTokenItem {
            back_scryfall_id: Some("token-copy-mh3".to_owned()),
            ..new("token-dragon-m3c")
        },
    )
    .await
    .unwrap();
    assert_eq!(
        back_ids(&app, "token-dragon-m3c").await,
        (
            vec![
                "token-goblin-m3c".to_owned(),
                "token-copy-mh3".to_owned(),
                "token-shapeshifter-m3c".to_owned()
            ],
            vec![]
        )
    );
    assert_eq!(
        back_ids(&app, "token-goblin-m3c").await.0,
        ["token-dragon-m3c"]
    );
}

#[tokio::test]
async fn back_options_ignore_owned_tokens_without_a_back() {
    let app = back_app().await;
    items::add(app.db(), new("token-goblin-m3c")).await.unwrap();
    assert_eq!(back_ids(&app, "token-goblin-m3c").await.0.len(), 0);
}

// GraphQL (`schema/tokens_test.exs`).

fn treasure() -> Value {
    merge(
        treasure_tlea(),
        json!({"id": "token-treasure", "image_uris": {"normal": "https://example.test/treasure.jpg"}}),
    )
}

fn soldier() -> Value {
    merge(
        treasure(),
        json!({"id": "token-soldier", "oracle_id": "oracle-soldier", "name": "Soldier", "type_line": "Token Creature — Soldier", "collector_number": "2", "image_uris": {"normal": "https://example.test/soldier.jpg"}}),
    )
}

async fn gql_app() -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), treasure(), soldier()])
        .await;
    link_token(&app, "scryfall-printing-1", "token-treasure").await;
    app
}

fn printing_id(id: &str) -> String {
    global_id(NodeKind::Printing, id).to_string()
}

#[tokio::test]
async fn token_items_round_trip_over_graphql() {
    let app = gql_app().await;
    let add = app
        .gql_data(
            "mutation($input: TokenItemInput!) { addTokenItem(input: $input) { tokenItem {
                id quantity finish
                printing { scryfallId imageUrl card { name layout } }
                backPrinting { scryfallId card { name } }
            } } }",
            json!({"input": {"scryfallId": printing_id("token-treasure"), "backScryfallId": printing_id("token-soldier"), "quantity": 2, "finish": "foil"}}),
        )
        .await;
    let item = &add["addTokenItem"]["tokenItem"];
    let id = item["id"].as_str().unwrap().to_owned();
    assert_eq!(
        crate::graphql::relay::from_global_id(&id).unwrap().0,
        NodeKind::TokenItem
    );
    assert_eq!(item["quantity"], 2);
    assert_eq!(item["finish"], "foil");
    assert_eq!(
        item["printing"],
        json!({"scryfallId": "token-treasure", "imageUrl": "https://example.test/treasure.jpg", "card": {"name": "Treasure", "layout": "token"}})
    );
    assert_eq!(
        item["backPrinting"],
        json!({"scryfallId": "token-soldier", "card": {"name": "Soldier"}})
    );

    let update = app
        .gql_data(
            "mutation($id: ID!) { updateTokenItem(id: $id, input: {quantity: 5}) { tokenItem { quantity finish } } }",
            json!({"id": id}),
        )
        .await;
    assert_eq!(
        update["updateTokenItem"]["tokenItem"],
        json!({"quantity": 5, "finish": "foil"})
    );

    let list = app
        .gql_data(
            r#"{ tokenItems(q: "sold") { id quantity } tokenItemCount }"#,
            json!({}),
        )
        .await;
    assert_eq!(list["tokenItems"], json!([{"id": id, "quantity": 5}]));
    assert_eq!(list["tokenItemCount"], 5);

    let delete = app
        .gql_data(
            "mutation($id: ID!) { deleteTokenItem(id: $id) { tokenItem { id } } }",
            json!({"id": id}),
        )
        .await;
    assert_eq!(delete["deleteTokenItem"]["tokenItem"]["id"], id.as_str());
    let empty = app
        .gql_data("{ tokenItems { id } tokenItemCount }", json!({}))
        .await;
    assert_eq!(empty, json!({"tokenItems": [], "tokenItemCount": 0}));

    let missing = app
        .gql(
            "mutation($id: ID!) { deleteTokenItem(id: $id) { tokenItem { id } } }",
            json!({"id": id}),
        )
        .await;
    assert_eq!(missing["errors"][0]["message"], "Token item was not found.");
}

#[tokio::test]
async fn delete_token_items_removes_only_the_given_items() {
    let app = gql_app().await;
    let pool = app.db();
    let treasure = items::add(pool, new("token-treasure")).await.unwrap();
    let foil = items::add(
        pool,
        NewTokenItem {
            finish: Some("foil".to_owned()),
            ..new("token-treasure")
        },
    )
    .await
    .unwrap();
    let soldier = items::add(pool, new("token-soldier")).await.unwrap();
    let ids: Vec<String> = [treasure.record.id, foil.record.id]
        .iter()
        .map(|id| global_id(NodeKind::TokenItem, id).to_string())
        .collect();
    let result = app
        .gql_data(
            "mutation($ids: [ID!]!) { deleteTokenItems(ids: $ids) { deletedCount } }",
            json!({"ids": ids}),
        )
        .await;
    assert_eq!(result["deleteTokenItems"]["deletedCount"], 2);
    let remaining = app.gql_data("{ tokenItems { id } }", json!({})).await;
    assert_eq!(
        remaining["tokenItems"],
        json!([{"id": global_id(NodeKind::TokenItem, soldier.record.id).to_string()}])
    );
}

#[tokio::test]
async fn token_mutations_reject_wrong_ids_and_playable_cards() {
    let app = gql_app().await;
    let result = app
        .gql(
            "mutation($ids: [ID!]!) { deleteTokenItems(ids: $ids) { deletedCount } }",
            json!({"ids": [printing_id("token-treasure")]}),
        )
        .await;
    assert!(
        result["errors"][0]["message"]
            .as_str()
            .unwrap()
            .contains("token item")
    );
    let result = app
        .gql(
            "mutation($input: TokenItemInput!) { addTokenItem(input: $input) { tokenItem { id } } }",
            json!({"input": {"scryfallId": printing_id("scryfall-printing-1")}}),
        )
        .await;
    assert_eq!(
        result["errors"][0]["message"],
        "That printing is not a token."
    );
    let result = app
        .gql(
            "mutation($input: TokenItemInput!) { addTokenItem(input: $input) { tokenItem { id } } }",
            json!({"input": {"scryfallId": ""}}),
        )
        .await;
    assert_eq!(result["errors"][0]["message"], "Token printing not found.");
}

#[tokio::test]
async fn token_printings_search_and_exclude_the_scanned_face() {
    let app = gql_app().await;
    let data = app
        .gql_data(
            r#"{ all: tokenPrintings { scryfallId }
                 set: tokenPrintings(setCode: "TLEA", excludeScryfallId: "token-treasure") { scryfallId }
                 lotus: tokenPrintings(q: "lotus") { scryfallId } }"#,
            json!({}),
        )
        .await;
    assert_eq!(data["all"], json!([]));
    assert_eq!(data["set"], json!([{"scryfallId": "token-soldier"}]));
    assert_eq!(data["lotus"], json!([]));
}

#[tokio::test]
async fn token_back_options_over_graphql() {
    let app = gql_app().await;
    let dragon = token(
        treasure(),
        "token-dragon",
        "oracle-dragon",
        "Dragon",
        "tm3c",
        "12",
    );
    let copy = token(treasure(), "token-copy", "oracle-copy", "Copy", "tmh3", "1");
    let goblin = token(
        treasure(),
        "token-goblin",
        "oracle-goblin",
        "Goblin",
        "tm3c",
        "13",
    );
    app.import_cards(&[dragon, copy, goblin]).await;
    let data = app
        .gql_data(
            r#"{ tokenBackOptions(scryfallId: "token-dragon") { known { scryfallId card { name } } sameSet { scryfallId } }
                 none: tokenBackOptions(scryfallId: "nope") { known { id } sameSet { id } } }"#,
            json!({}),
        )
        .await;
    assert_eq!(
        data["tokenBackOptions"],
        json!({"known": [{"scryfallId": "token-copy", "card": {"name": "Copy"}}], "sameSet": [{"scryfallId": "token-goblin"}]})
    );
    assert_eq!(data["none"], json!({"known": [], "sameSet": []}));
}

#[tokio::test]
async fn cards_expose_produced_tokens_with_owned_counts() {
    let app = gql_app().await;
    items::add(
        app.db(),
        NewTokenItem {
            quantity: Some(3),
            ..new("token-treasure")
        },
    )
    .await
    .unwrap();
    let data = app
        .gql_data(
            "query($id: ID!) { card(id: $id) { layout producedTokens { ownedCount printing { scryfallId card { name typeLine } } } } }",
            json!({"id": global_id(NodeKind::Card, "oracle-1").to_string()}),
        )
        .await;
    assert_eq!(
        data["card"],
        json!({"layout": null, "producedTokens": [{"ownedCount": 3, "printing": {"scryfallId": "token-treasure", "card": {"name": "Treasure", "typeLine": "Token Artifact — Treasure"}}}]})
    );
    // Batched through the data loader for many cards at once.
    let data = app
        .gql_data(
            r#"{ cards(q: "", tokens: INCLUDE) { edges { node { name producedTokens { ownedCount } } } } }"#,
            json!({}),
        )
        .await;
    let produced: Vec<(String, usize)> = data["cards"]["edges"]
        .as_array()
        .unwrap()
        .iter()
        .map(|edge| {
            (
                edge["node"]["name"].as_str().unwrap().to_owned(),
                edge["node"]["producedTokens"].as_array().unwrap().len(),
            )
        })
        .collect();
    assert_eq!(
        produced,
        [
            ("Black Lotus".to_owned(), 1),
            ("Soldier".to_owned(), 0),
            ("Treasure".to_owned(), 0)
        ]
    );
}
