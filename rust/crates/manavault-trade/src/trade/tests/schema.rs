//! Deck diff ids and the trade parts of the schema's domain contract.

use serde_json::{Value, json};

use super::{add_deck_card, error_message, insert_deck};
use crate::test_app::TestApp;
use manavault_core::graphql::relay::from_global_id;
use manavault_core::graphql::{NodeKind, global_id};

#[tokio::test]
async fn deck_diff_rows_expose_relay_deck_card_ids_that_decode_back() {
    let app = TestApp::new().await;
    app.import_cards(&[json!({
        "id": "printing-diff-ids",
        "oracle_id": "oracle-diff-ids",
        "name": "Diff Ids Card",
        "type_line": "Artifact",
        "collector_number": "1",
        "set": "dif",
        "set_name": "Diff Set",
        "lang": "en",
        "image_uris": {},
        "finishes": ["nonfoil"],
        "legalities": {}
    })])
    .await;
    let deck = insert_deck(&app, "Diff Ids Deck").await;
    let deck_card = add_deck_card(&app, deck, "oracle-diff-ids", 1, "mainboard").await;

    let data = app
        .gql_data(
            "mutation DeckDiffIds($deckId: ID!, $text: String) {
               deckDiff(deckId: $deckId, text: $text) {
                 sourceName unrecognized
                 adds { cardName quantity oracleId imageUrl deckCardIds }
                 cuts { cardName quantity oracleId imageUrl deckCardIds }
                 changes { cardName fromQuantity toQuantity oracleId deckCardIds }
               }
             }",
            json!({
                "deckId": global_id(NodeKind::Deck, deck).0,
                "text": "1 Unrelated Placeholder"
            }),
        )
        .await;
    let diff = &data["deckDiff"];
    assert_eq!(diff["unrecognized"], json!(["Unrelated Placeholder"]));
    assert_eq!(
        diff["adds"],
        json!([{
            "cardName": "Unrelated Placeholder", "quantity": 1, "oracleId": null,
            "imageUrl": null, "deckCardIds": []
        }])
    );
    let cut = &diff["cuts"][0];
    assert_eq!(cut["cardName"], "Diff Ids Card");
    assert_eq!(cut["oracleId"], "oracle-diff-ids");
    assert_eq!(cut["imageUrl"], Value::Null);
    let ids = cut["deckCardIds"].as_array().unwrap();
    assert_eq!(ids.len(), 1);
    let (kind, raw) = from_global_id(ids[0].as_str().unwrap()).unwrap();
    assert_eq!(kind, NodeKind::DeckCard);
    assert_eq!(raw, deck_card.to_string());

    let changed = app
        .gql_data(
            "mutation($deckId: ID!) { deckDiff(deckId: $deckId, text: \"3 Diff Ids Card\") {
               changes { cardName fromQuantity toQuantity oracleId deckCardIds } } }",
            json!({"deckId": global_id(NodeKind::Deck, deck).0}),
        )
        .await;
    assert_eq!(
        changed["deckDiff"]["changes"],
        json!([{
            "cardName": "Diff Ids Card", "fromQuantity": 1, "toQuantity": 3,
            "oracleId": "oracle-diff-ids",
            "deckCardIds": [global_id(NodeKind::DeckCard, deck_card).0]
        }])
    );
}

#[tokio::test]
async fn deck_diff_validates_the_deck_id_and_reports_missing_decks() {
    let app = TestApp::new().await;
    let query =
        "mutation($deckId: ID!) { deckDiff(deckId: $deckId, text: \"1 Sol Ring\") { sourceName } }";
    let wrong_kind = app
        .gql(query, json!({"deckId": global_id(NodeKind::DeckCard, 1).0}))
        .await;
    assert_eq!(
        error_message(&wrong_kind),
        "Expected deck ID, got deck card ID"
    );
    let missing = app
        .gql(query, json!({"deckId": global_id(NodeKind::Deck, 999).0}))
        .await;
    assert_eq!(error_message(&missing), "That deck couldn't be found.");
    // The list is resolved after the deck id is decoded.
    let deck = insert_deck(&app, "Deck").await;
    let nothing = app
        .gql(
            "mutation($deckId: ID!) { deckDiff(deckId: $deckId) { sourceName } }",
            json!({"deckId": global_id(NodeKind::Deck, deck).0}),
        )
        .await;
    assert_eq!(
        error_message(&nothing),
        "Paste a decklist or a supported link to match."
    );
}

fn field_type(field: &Value) -> String {
    fn render(ty: &Value) -> String {
        match ty["kind"].as_str().unwrap() {
            "NON_NULL" => format!("{}!", render(&ty["ofType"])),
            "LIST" => format!("[{}]", render(&ty["ofType"])),
            _ => ty["name"].as_str().unwrap().to_owned(),
        }
    }
    render(&field["type"])
}

#[tokio::test]
async fn the_schema_exposes_the_trade_contract() {
    let app = TestApp::new().await;
    let data = app
        .gql_data(
            "{ __schema {
                 queryType { fields { name args { name type { kind name ofType { kind name ofType { kind name } } } }
                   type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
                 mutationType { fields { name args { name type { kind name ofType { kind name ofType { kind name } } } }
                   type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
               } }",
            json!({}),
        )
        .await;
    let fields =
        |root: &str| -> Vec<Value> { data["__schema"][root]["fields"].as_array().unwrap().clone() };
    let signature = |root: &str, name: &str| -> String {
        let field = fields(root)
            .into_iter()
            .find(|field| field["name"] == name)
            .expect("root field");
        let mut args: Vec<String> = field["args"]
            .as_array()
            .unwrap()
            .iter()
            .map(|arg| format!("{}: {}", arg["name"].as_str().unwrap(), field_type(arg)))
            .collect();
        args.sort();
        format!("({}) -> {}", args.join(", "), field_type(&field))
    };
    for (name, expected) in [
        ("tradeWants", "() -> [TradeWant!]!"),
        ("tradeWantsShareToken", "() -> String"),
        ("tradeBinderShareToken", "() -> String"),
        ("binderList", "(id: ID!) -> BinderList"),
        ("wantsList", "(id: ID!) -> WantsList"),
    ] {
        assert_eq!(signature("queryType", name), expected, "{name}");
    }
    for (name, expected) in [
        (
            "createTradeWant",
            "(name: String, quantity: Int, scryfallId: ID) -> CreateTradeWantPayload",
        ),
        (
            "updateTradeWant",
            "(id: ID!, quantity: Int!) -> UpdateTradeWantPayload",
        ),
        ("deleteTradeWant", "(id: ID!) -> DeleteTradeWantPayload"),
        (
            "ensureTradeWantsShareToken",
            "() -> EnsureTradeWantsShareTokenPayload",
        ),
        (
            "ensureTradeBinderShareToken",
            "() -> EnsureTradeBinderShareTokenPayload",
        ),
        (
            "disableTradeWantsSharing",
            "() -> DisableTradeWantsSharingPayload",
        ),
        (
            "rotateTradeWantsShareToken",
            "() -> RotateTradeWantsShareTokenPayload",
        ),
        (
            "disableTradeBinderSharing",
            "() -> DisableTradeBinderSharingPayload",
        ),
        (
            "rotateTradeBinderShareToken",
            "() -> RotateTradeBinderShareTokenPayload",
        ),
        (
            "collectionCheck",
            "(includeConsidering: Boolean, text: String, url: String) -> CollectionCheckResult!",
        ),
        (
            "tradeMatches",
            "(text: String, url: String) -> TradeMatchResult!",
        ),
        (
            "deckDiff",
            "(deckId: ID!, text: String, url: String) -> DeckDiffResult!",
        ),
    ] {
        assert_eq!(signature("mutationType", name), expected, "{name}");
    }
}
