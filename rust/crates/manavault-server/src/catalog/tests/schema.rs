//! Card GraphQL fields: card queries, scanner printings, and the card parts
//! of the schema's domain contract.

use serde_json::{Value, json};

use super::{edge_names, insert_collection_item, insert_location};
use crate::graphql::{NodeKind, global_id};
use crate::test_support::TestApp;
use crate::test_support::fixtures::{black_lotus, black_lotus_beta, merge, plains, time_walk};

async fn three_cards() -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(&[time_walk(), black_lotus(), plains()])
        .await;
    app
}

async fn card_names(app: &TestApp, sort: Value) -> Vec<String> {
    let data = app
        .gql_data(
            "query Cards($q: String!, $sort: CardSort) { cards(q: $q, sort: $sort, first: 10) { edges { node { name } } } }",
            json!({"q": "cmc>=0", "sort": sort}),
        )
        .await;
    edge_names(&data["cards"])
}

#[tokio::test]
async fn cards_default_to_name_ascending_and_apply_sorts() {
    let app = three_cards().await;
    assert_eq!(
        card_names(&app, Value::Null).await,
        ["Black Lotus", "Plains", "Time Walk"]
    );
    assert_eq!(
        card_names(&app, json!({"field": "mana_value", "direction": "desc"})).await,
        ["Time Walk", "Black Lotus", "Plains"]
    );
    assert_eq!(
        card_names(&app, json!({"field": "mana_value", "direction": "asc"})).await,
        ["Black Lotus", "Plains", "Time Walk"]
    );
    assert_eq!(
        card_names(&app, json!({"field": "bogus", "direction": "desc"})).await,
        ["Time Walk", "Plains", "Black Lotus"]
    );
    assert_eq!(
        card_names(&app, json!({"field": "bogus", "direction": "sideways"})).await,
        ["Black Lotus", "Plains", "Time Walk"]
    );
}

#[tokio::test]
async fn cards_paginate_with_first_and_after() {
    let app = three_cards().await;
    let query = "query Cards($q: String!, $first: Int, $after: String) {
      cards(q: $q, first: $first, after: $after) { pageInfo { endCursor hasNextPage hasPreviousPage } edges { node { name } } }
    }";
    let first = app
        .gql_data(query, json!({"q": "cmc>=0", "first": 2}))
        .await;
    assert_eq!(edge_names(&first["cards"]), ["Black Lotus", "Plains"]);
    assert_eq!(first["cards"]["pageInfo"]["hasNextPage"], true);
    assert_eq!(first["cards"]["pageInfo"]["hasPreviousPage"], false);
    let cursor = first["cards"]["pageInfo"]["endCursor"]
        .as_str()
        .unwrap()
        .to_owned();
    let second = app
        .gql_data(query, json!({"q": "cmc>=0", "first": 2, "after": cursor}))
        .await;
    assert_eq!(edge_names(&second["cards"]), ["Time Walk"]);
    assert_eq!(second["cards"]["pageInfo"]["hasNextPage"], false);
    assert_eq!(second["cards"]["pageInfo"]["hasPreviousPage"], true);

    // Without `first`, a page holds 24 cards; tokens are excluded by default.
    let data = app
        .gql_data("{ cards { edges { node { name } } } }", json!({}))
        .await;
    assert_eq!(edge_names(&data["cards"]).len(), 3);
    let data = app
        .gql_data(
            "{ cards(tokens: ONLY) { edges { node { name } } } }",
            json!({}),
        )
        .await;
    assert_eq!(edge_names(&data["cards"]).len(), 0);
}

#[tokio::test]
async fn card_fields_resolve() {
    let app = TestApp::new().await;
    let tagged = merge(
        black_lotus(),
        json!({"edhrec_rank": 1, "game_changer": true}),
    );
    app.import_cards(&[black_lotus_beta(), tagged]).await;
    sqlx::query("UPDATE scryfall_cards SET oracle_tags = ?1, deck_themes = '[\"Ramp\"]', deck_category = 'ramp' WHERE oracle_id = 'oracle-1'")
        .bind(json!([{"id": "tag-1", "slug": "ramp", "label": "Ramp", "weight": 0.5, "annotation": null}, {"id": 2, "slug": "fast-mana", "label": "Fast mana", "weight": 3}]).to_string())
        .execute(app.db())
        .await
        .unwrap();
    insert_collection_item(&app, "scryfall-printing-3", 3, None).await;
    let data = app
        .gql_data(
            r#"{ card(id: "oracle-1") {
                id oracleId name typeLine oracleText manaCost cmc layout colors colorIdentity
                gameChanger edhrecRank edhrecCommanderRank edhrecSaltiness deckCategory deckThemes
                oracleTags { id slug label weight annotation }
                legalities { format status }
                primaryPrinting { scryfallId }
                printings(first: 1) { pageInfo { hasNextPage } edges { node {
                  id scryfallId oracleId setCode setName collectorNumber illustrationId lang rarity
                  ownedCount finishes promoTypes promo priceCents nonfoil: priceCents(finish: "nonfoil")
                  imageUrl backImageUrl artCropUrl imageUris prices priceText releasedAt card { name }
                } } }
              } }"#,
            json!({}),
        )
        .await;
    let card = &data["card"];
    assert_eq!(
        card["id"],
        global_id(NodeKind::Card, "oracle-1").to_string()
    );
    assert_eq!(card["oracleId"], "oracle-1");
    assert_eq!(card["cmc"], 0.0);
    assert_eq!(card["layout"], Value::Null);
    assert_eq!(card["colors"], json!([]));
    assert_eq!(card["gameChanger"], true);
    assert_eq!(card["edhrecRank"], 1);
    assert_eq!(card["deckCategory"], "ramp");
    assert_eq!(card["deckThemes"], json!(["Ramp"]));
    assert_eq!(
        card["oracleTags"],
        json!([
            {"id": "tag-1", "slug": "ramp", "label": "Ramp", "weight": "0.5", "annotation": null},
            {"id": "2", "slug": "fast-mana", "label": "Fast mana", "weight": "3", "annotation": null}
        ])
    );
    assert_eq!(
        card["legalities"],
        json!([{"format": "vintage", "status": "restricted"}])
    );
    // Newest printing first.
    assert_eq!(card["primaryPrinting"]["scryfallId"], "scryfall-printing-3");
    let connection = &card["printings"];
    assert_eq!(connection["pageInfo"]["hasNextPage"], true);
    let printing = &connection["edges"][0]["node"];
    assert_eq!(
        printing,
        &json!({
            "id": global_id(NodeKind::Printing, "scryfall-printing-3").to_string(),
            "scryfallId": "scryfall-printing-3", "oracleId": "oracle-1", "setCode": "leb",
            "setName": "Limited Edition Beta", "collectorNumber": "233", "illustrationId": null,
            "lang": "en", "rarity": "rare", "ownedCount": 3, "finishes": ["nonfoil"],
            "promoTypes": [], "promo": false, "priceCents": 10_000_000, "nonfoil": 10_000_000,
            "imageUrl": "https://example.test/black-lotus.jpg", "backImageUrl": null,
            "artCropUrl": "https://example.test/black-lotus.jpg",
            "imageUris": {"normal": "https://example.test/black-lotus.jpg"},
            "prices": {"usd": "100000.00"}, "priceText": "$100k", "releasedAt": "1993-10-04",
            "card": {"name": "Black Lotus"}
        })
    );
}

#[tokio::test]
async fn card_accepts_global_and_raw_ids() {
    let app = three_cards().await;
    let query = "query($id: ID!) { card(id: $id) { oracleId } }";
    let global = global_id(NodeKind::Card, "oracle-2").to_string();
    for id in [global.as_str(), "oracle-2"] {
        let data = app.gql_data(query, json!({"id": id})).await;
        assert_eq!(data["card"]["oracleId"], "oracle-2", "{id}");
    }
    let data = app.gql_data(query, json!({"id": "nope"})).await;
    assert_eq!(data["card"], Value::Null);
}

#[tokio::test]
async fn card_by_name_resolves_exact_names() {
    let app = three_cards().await;
    let query = "query CardByName($name: String!) { cardByName(name: $name) { id oracleId name printings { edges { node { scryfallId } } } } }";
    let data = app.gql_data(query, json!({"name": "black lotus"})).await;
    assert_eq!(data["cardByName"]["oracleId"], "oracle-1");
    assert_eq!(data["cardByName"]["name"], "Black Lotus");
    assert_ne!(data["cardByName"]["id"].as_str().unwrap(), "");
    assert_eq!(
        data["cardByName"]["printings"]["edges"][0]["node"]["scryfallId"],
        "scryfall-printing-1"
    );
    let data = app.gql_data(query, json!({"name": "Time Walk"})).await;
    assert_eq!(data["cardByName"]["oracleId"], "oracle-2");
    for name in ["Not A Real Card", "Black"] {
        let data = app.gql_data(query, json!({"name": name})).await;
        assert_eq!(data["cardByName"], Value::Null, "{name}");
    }
}

#[tokio::test]
async fn name_and_set_suggestions() {
    let app = three_cards().await;
    let data = app
        .gql_data(
            r#"{ a: cardNameSuggestions(q: "lotsu") b: cardNameSuggestions cardNameSuggestions(q: "l", limit: 1)
                 setSuggestions(q: "ALPHA") { setCode setName } none: setSuggestions(q: " ") { setCode } }"#,
            json!({}),
        )
        .await;
    assert_eq!(data["a"], json!(["Black Lotus"]));
    assert_eq!(data["b"], json!([]));
    // Short terms only gather names with a word starting with the term.
    assert_eq!(data["cardNameSuggestions"], json!(["Black Lotus"]));
    assert_eq!(
        data["setSuggestions"],
        json!([{"setCode": "lea", "setName": "Limited Edition Alpha"}])
    );
    assert_eq!(data["none"], json!([]));
}

fn scan_printing(
    id: &str,
    illustration_id: &str,
    released_at: &str,
    collector_number: &str,
) -> Value {
    merge(
        black_lotus(),
        json!({"id": id, "illustration_id": illustration_id, "released_at": released_at, "collector_number": collector_number}),
    )
}

async fn scan(app: &TestApp, scryfall_id: &str, illustration_id: Option<&str>) -> Vec<Value> {
    let data = app
        .gql_data(
            "query ScannerPrintings($scryfallId: ID!, $illustrationId: ID) {
              scannerPrintings(scryfallId: $scryfallId, illustrationId: $illustrationId) {
                scryfallId illustrationId ownedCount promo imageUrl backImageUrl
                foilCents: priceCents(finish: \"foil\")
                card { name layout }
              }
            }",
            json!({"scryfallId": scryfall_id, "illustrationId": illustration_id}),
        )
        .await;
    data["scannerPrintings"].as_array().unwrap().clone()
}

fn ids(results: &[Value]) -> Vec<&str> {
    results
        .iter()
        .map(|r| r["scryfallId"].as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn scanner_printings_put_illustration_matches_first_with_owned_counts() {
    let app = TestApp::new().await;
    app.import_cards(&[
        scan_printing("scan-base", "art-a", "2020-01-01", "1"),
        scan_printing("same-art", "art-a", "2022-01-01", "2"),
        scan_printing("other-art", "art-b", "2024-01-01", "3"),
    ])
    .await;
    insert_collection_item(&app, "same-art", 2, None).await;
    let list = insert_location(&app, "Wishlist", "list").await;
    insert_collection_item(&app, "same-art", 4, Some(list)).await;
    let results = scan(&app, "scan-base-1", Some("art-a")).await;
    assert_eq!(ids(&results), ["same-art", "scan-base", "other-art"]);
    let owned: Vec<i64> = results
        .iter()
        .map(|r| r["ownedCount"].as_i64().unwrap())
        .collect();
    assert_eq!(owned, [2, 0, 0]);
    assert!(
        results
            .iter()
            .all(|r| r["card"]["name"] == "Black Lotus" && r["promo"] == false)
    );
    // Without an illustration, the scanned printing's illustration leads.
    let results = scan(&app, "scan-base", None).await;
    assert_eq!(ids(&results), ["same-art", "scan-base", "other-art"]);
    let results = scan(&app, "other-art", None).await;
    assert_eq!(ids(&results), ["other-art", "same-art", "scan-base"]);
}

#[tokio::test]
async fn scanner_printings_resolve_tokens_with_both_faces() {
    let app = TestApp::new().await;
    let single = merge(
        scan_printing("token-single", "art-single", "2024-01-01", "1"),
        json!({"oracle_id": "oracle-token-single", "name": "Treasure", "layout": "token", "set": "tfdc", "set_type": "token", "image_uris": {"normal": "https://example.test/treasure.jpg"}}),
    );
    let mut double = merge(
        scan_printing("token-double", "art-double", "2024-01-01", "2"),
        json!({
            "oracle_id": "oracle-token-double", "name": "Angel // Soldier", "layout": "double_faced_token",
            "set": "tfdc", "set_type": "token",
            "card_faces": [
                {"name": "Angel", "image_uris": {"normal": "https://example.test/angel.jpg"}},
                {"name": "Soldier", "image_uris": {"normal": "https://example.test/soldier.jpg"}}
            ]
        }),
    );
    double.as_object_mut().unwrap().remove("image_uris");
    app.import_cards(&[single, double]).await;
    let results = scan(&app, "token-single", None).await;
    assert_eq!(ids(&results), ["token-single"]);
    assert_eq!(results[0]["backImageUrl"], Value::Null);
    assert_eq!(results[0]["card"]["layout"], "token");
    let results = scan(&app, "token-double", None).await;
    assert_eq!(results[0]["imageUrl"], "https://example.test/angel.jpg");
    assert_eq!(
        results[0]["backImageUrl"],
        "https://example.test/soldier.jpg"
    );
    assert_eq!(results[0]["card"]["layout"], "double_faced_token");
}

#[tokio::test]
async fn scanner_printings_expose_promo_flags_and_fall_back_to_illustrations() {
    let app = TestApp::new().await;
    let promo = merge(
        scan_printing("promo-art", "promo-art", "2024-01-01", "1p"),
        json!({"promo": true, "prices": {"usd": "1.50", "usd_foil": "12.25"}}),
    );
    app.import_cards(&[promo]).await;
    let results = scan(&app, "promo-art", None).await;
    assert_eq!(results[0]["promo"], true);
    assert_eq!(results[0]["foilCents"], 1225);

    let app = TestApp::new().await;
    app.import_cards(&[
        scan_printing("fallback", "fallback-art", "2023-01-01", "1"),
        scan_printing("older", "other-art", "2020-01-01", "2"),
    ])
    .await;
    assert_eq!(
        ids(&scan(&app, "unknown", Some("fallback-art")).await),
        ["fallback", "older"]
    );
    assert_eq!(scan(&app, "unknown", Some("missing-art")).await.len(), 0);

    let app = TestApp::new().await;
    let digits = "0a1b2c3d-0000-4000-8000-123456789012";
    app.import_cards(&[scan_printing(digits, "digits-art", "2021-01-01", "9")])
        .await;
    assert_eq!(ids(&scan(&app, digits, None).await), [digits]);
    assert_eq!(
        ids(&scan(&app, &format!("{digits}-1"), None).await),
        [digits]
    );
}

#[tokio::test]
async fn scanner_set_illustrations_list_locked_sets() {
    let app = TestApp::new().await;
    app.import_cards(&[
        merge(
            scan_printing("fra-1", "art-fra", "2026-08-01", "1"),
            json!({"set": "fra"}),
        ),
        merge(
            scan_printing("spg-1", "art-spg", "2026-08-01", "2"),
            json!({"set": "spg"}),
        ),
        merge(
            scan_printing("dsk-1", "art-dsk", "2024-09-01", "3"),
            json!({"set": "dsk"}),
        ),
    ])
    .await;
    let data = app
        .gql_data(
            "query($s: [String!]!) { scannerSetIllustrations(setCodes: $s) }",
            json!({"s": ["FRA", "spg", "none"]}),
        )
        .await;
    let mut illustrations: Vec<&str> = data["scannerSetIllustrations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    illustrations.sort_unstable();
    assert_eq!(illustrations, ["art-fra", "art-spg"]);
}

fn type_signature(ty: &Value) -> String {
    match ty["kind"].as_str() {
        Some("NON_NULL") => format!("{}!", type_signature(&ty["ofType"])),
        Some("LIST") => format!("[{}]", type_signature(&ty["ofType"])),
        _ => ty["name"].as_str().unwrap().to_owned(),
    }
}

#[tokio::test]
async fn schema_keeps_card_and_token_field_contracts() {
    let app = TestApp::new().await;
    let data = app
        .gql_data(
            "{ __schema {
                queryType { fields { name args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
                mutationType { fields { name args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } type { kind name } } }
            } }",
            json!({}),
        )
        .await;
    let field = |root: &str, name: &str| -> Value {
        data["__schema"][root]["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["name"] == name)
            .cloned()
            .unwrap()
    };
    let arg = |field: &Value, name: &str| -> String {
        let arg = field["args"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["name"] == name)
            .unwrap();
        type_signature(&arg["type"])
    };
    let query = |name: &str| field("queryType", name);
    assert_eq!(type_signature(&query("cards")["type"]), "CardConnection!");
    assert_eq!(arg(&query("cards"), "q"), "String");
    assert_eq!(arg(&query("cards"), "tokens"), "CardTokenScope");
    assert_eq!(type_signature(&query("cardEdhrec")["type"]), "CardEdhrec!");
    assert_eq!(arg(&query("cardEdhrec"), "name"), "String!");
    assert_eq!(
        type_signature(&query("cardNameSuggestions")["type"]),
        "[String!]!"
    );
    assert_eq!(arg(&query("cardNameSuggestions"), "limit"), "Int");
    assert_eq!(
        type_signature(&query("scannerPrintings")["type"]),
        "[Printing!]!"
    );
    assert_eq!(arg(&query("scannerPrintings"), "scryfallId"), "ID!");
    assert_eq!(arg(&query("scannerPrintings"), "illustrationId"), "ID");
    assert_eq!(
        type_signature(&query("scannerSetIllustrations")["type"]),
        "[ID!]!"
    );
    assert_eq!(
        arg(&query("scannerSetIllustrations"), "setCodes"),
        "[String!]!"
    );
    assert_eq!(
        type_signature(&query("tokenItems")["type"]),
        "[TokenItem!]!"
    );
    assert_eq!(type_signature(&query("tokenItemCount")["type"]), "Int!");
    assert_eq!(
        type_signature(&query("tokenPrintings")["type"]),
        "[Printing!]!"
    );
    assert_eq!(arg(&query("tokenPrintings"), "excludeScryfallId"), "ID");
    assert_eq!(
        type_signature(&query("tokenBackOptions")["type"]),
        "TokenBackOptions!"
    );
    assert_eq!(arg(&query("tokenBackOptions"), "scryfallId"), "ID!");
    assert_eq!(type_signature(&query("card")["type"]), "Card");
    assert_eq!(
        type_signature(&query("setSuggestions")["type"]),
        "[SetSuggestion!]!"
    );
    let mutation = |name: &str| field("mutationType", name);
    assert_eq!(
        mutation("addTokenItem")["type"]["name"],
        "AddTokenItemPayload"
    );
    assert_eq!(arg(&mutation("addTokenItem"), "input"), "TokenItemInput!");
    assert_eq!(arg(&mutation("deleteTokenItems"), "ids"), "[ID!]!");
}
