//! `cardEdhrec`, ported from `edhrec/card_page_test.exs`,
//! `card_name_lookup_index_test.exs`, and `edhrec/card_lookup_preload_test.exs`.

use serde_json::{Value, json};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::catalog::edhrec::CardLookup;
use crate::test_support::TestApp;
use crate::test_support::fixtures::{black_lotus, time_walk};

fn section(header: &str, tag: &str, cards: Value) -> Value {
    let mut section = json!({"header": header, "tag": tag});
    section["cardviews"] = cards;
    section
}

fn entry(name: &str, id: &str, url: &str, lift: Option<f64>) -> Value {
    json!({"name": name, "id": id, "url": url, "lift": lift, "num_decks": 120, "potential_decks": 400})
}

fn page(cardlists: Value) -> Value {
    let mut page = json!({"container": {"json_dict": {"card": {"name": "Black Lotus"}}}});
    page["container"]["json_dict"]["cardlists"] = cardlists;
    page
}

const QUERY: &str = r"query($name: String!) {
  cardEdhrec(name: $name) {
    url
    sections { header tag cards { name scryfallId lift numDecks potentialDecks url card { oracleId name } } }
  }
}";

async fn app_with(server: &MockServer) -> TestApp {
    let uri = server.uri();
    TestApp::with_config(move |config| config.edhrec_json_base_url = uri).await
}

async fn serve(server: &MockServer, body: Value) {
    Mock::given(method("GET"))
        .and(path("/pages/cards/black-lotus.json"))
        .and(header("accept", "application/json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(body))
        .mount(server)
        .await;
}

#[tokio::test]
async fn normalizes_the_four_synergy_sections_and_resolves_local_cards() {
    let server = MockServer::start().await;
    serve(
        &server,
        page(json!([
            section(
                "New Commanders",
                "newcommanders",
                json!([entry(
                    "Time Walk",
                    "scryfall-printing-2",
                    "/commanders/time-walk",
                    None
                )])
            ),
            section(
                "Top Commanders",
                "topcommanders",
                json!([entry(
                    "Black Lotus",
                    "scryfall-printing-1",
                    "/commanders/black-lotus",
                    None
                )])
            ),
            section(
                "New Cards",
                "newcards",
                json!([entry(
                    "Time Walk",
                    "scryfall-printing-2",
                    "/cards/time-walk",
                    Some(1.5)
                )])
            ),
            section(
                "High Lift Cards",
                "highliftcards",
                json!([entry(
                    "Time Walk",
                    "scryfall-printing-2",
                    "/cards/time-walk",
                    Some(3.25)
                )])
            ),
            section(
                "Top Cards",
                "topcards",
                json!([entry(
                    "Time Walk",
                    "scryfall-printing-2",
                    "/cards/time-walk",
                    None
                )])
            ),
        ])),
    )
    .await;
    let app = app_with(&server).await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let data = app.gql_data(QUERY, json!({"name": "Black Lotus"})).await;
    let result = &data["cardEdhrec"];
    assert_eq!(result["url"], "https://edhrec.com/cards/black-lotus");
    let headers: Vec<&str> = result["sections"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["header"].as_str().unwrap())
        .collect();
    assert_eq!(
        headers,
        [
            "New Commanders",
            "Top Commanders",
            "New Cards",
            "High Lift Cards"
        ]
    );
    assert_eq!(
        result["sections"][0]["cards"][0],
        json!({
            "name": "Time Walk", "scryfallId": "scryfall-printing-2", "lift": null,
            "numDecks": 120, "potentialDecks": 400,
            "url": "https://edhrec.com/commanders/time-walk",
            "card": {"oracleId": "oracle-2", "name": "Time Walk"}
        })
    );
    let last = &result["sections"][3]["cards"][0];
    assert_eq!(last["lift"], 3.25);
    assert_eq!(last["numDecks"], 120);
    assert_eq!(last["potentialDecks"], 400);
}

#[tokio::test]
async fn keeps_remote_entries_missing_from_the_catalog() {
    let server = MockServer::start().await;
    serve(
        &server,
        page(json!([section(
            "New Cards",
            "newcards",
            json!([
                entry(
                    "Future Card",
                    "future-printing",
                    "/cards/future-card",
                    Some(2.0)
                ),
                entry("", "nameless", "/cards/nameless", None),
                entry("Other Card", "other", "https://example.com/x", None),
            ])
        )])),
    )
    .await;
    let app = app_with(&server).await;
    let data = app.gql_data(QUERY, json!({"name": "Black Lotus"})).await;
    let cards = &data["cardEdhrec"]["sections"][0]["cards"];
    assert_eq!(cards.as_array().unwrap().len(), 2);
    assert_eq!(cards[0]["card"], Value::Null);
    assert_eq!(cards[0]["scryfallId"], "future-printing");
    assert_eq!(cards[0]["url"], "https://edhrec.com/cards/future-card");
    assert_eq!(cards[1]["url"], "https://edhrec.com/cards/other-card");
}

#[tokio::test]
async fn treats_partial_and_empty_sections_as_empty_lists() {
    let server = MockServer::start().await;
    serve(
        &server,
        json!({"container": {"json_dict": {"cardlists": [
            {"header": "Top Commanders", "tag": "topcommanders", "cardviews": null},
            null,
            {"header": "New Cards", "tag": "newcards"},
            {"tag": "highliftcards", "cardviews": []}
        ]}}}),
    )
    .await;
    let app = app_with(&server).await;
    let data = app.gql_data(QUERY, json!({"name": "Black Lotus"})).await;
    assert_eq!(
        data["cardEdhrec"],
        json!({"url": "https://edhrec.com", "sections": [
            {"header": "Top Commanders", "tag": "topcommanders", "cards": []},
            {"header": "New Cards", "tag": "newcards", "cards": []},
            {"header": "Cards", "tag": "highliftcards", "cards": []}
        ]})
    );
}

#[tokio::test]
async fn edhrec_failures_are_graphql_errors() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/pages/cards/missing.json"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/pages/cards/listy.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([1, 2])))
        .mount(&server)
        .await;
    let app = app_with(&server).await;
    let response = app.gql(QUERY, json!({"name": "Missing"})).await;
    assert_eq!(
        response["errors"][0]["message"],
        "EDHREC returned HTTP 404."
    );
    let response = app.gql(QUERY, json!({"name": "Listy"})).await;
    assert_eq!(
        response["errors"][0]["message"],
        "EDHREC returned an unexpected response."
    );
}

/// Transport failures read like Req's (`Exception.message/1` of the Mint
/// error), not reqwest's "error sending request for url (...)". Found by the
/// parity harness.
#[tokio::test]
async fn unreachable_edhrec_reports_the_transport_reason() {
    let app = TestApp::with_config(|config| {
        // Nothing listens on the discard port.
        config.edhrec_json_base_url = "http://127.0.0.1:9".to_owned();
    })
    .await;
    let response = app.gql(QUERY, json!({"name": "Black Lotus"})).await;
    assert_eq!(
        response["errors"][0]["message"],
        "Could not reach EDHREC: connection refused"
    );
}

#[tokio::test]
async fn card_lookup_matches_ids_then_names_case_and_diacritic_insensitively() {
    let app = TestApp::new().await;
    let sol_ring = json!({
        "id": "scryfall-sol-ring", "oracle_id": "oracle-sol-ring", "name": "Sol Ring",
        "type_line": "Artifact", "set": "c21", "collector_number": "1"
    });
    let oin = json!({
        "id": "scryfall-oin", "oracle_id": "oracle-oin-the-brave", "name": "Óin the Brave",
        "type_line": "Legendary Creature — Dwarf", "set": "ltr", "collector_number": "2"
    });
    app.import_cards(&[sol_ring, oin]).await;
    let lookup = CardLookup::build(
        app.db(),
        &[
            "oracle-sol-ring".to_owned(),
            "scryfall-oin".to_owned(),
            "missing-id".to_owned(),
        ],
        &[
            "SOL RING".to_owned(),
            "Oin the brave".to_owned(),
            "Nonexistent".to_owned(),
        ],
    )
    .await
    .unwrap();
    let oracle = |card: Option<&crate::catalog::CardRecord>| card.map(|c| c.oracle_id.to_string());
    assert_eq!(
        oracle(lookup.local_card(Some("oracle-sol-ring"), "")).as_deref(),
        Some("oracle-sol-ring")
    );
    assert_eq!(
        oracle(lookup.local_card(Some("scryfall-oin"), "")).as_deref(),
        Some("oracle-oin-the-brave")
    );
    assert_eq!(
        oracle(lookup.local_card(None, "SOL RING")).as_deref(),
        Some("oracle-sol-ring")
    );
    assert_eq!(
        oracle(lookup.local_card(None, "  Sol Ring  ")).as_deref(),
        Some("oracle-sol-ring")
    );
    assert_eq!(
        oracle(lookup.local_card(None, "Óin the Brave")).as_deref(),
        Some("oracle-oin-the-brave")
    );
    assert_eq!(
        oracle(lookup.local_card(Some("missing-id"), "Nonexistent")),
        None
    );
}
