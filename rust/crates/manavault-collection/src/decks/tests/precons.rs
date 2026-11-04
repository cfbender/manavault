//! Commander precons from MTGJSON: the list and importing one, against a
//! wiremock MTGJSON API serving files shaped like its `DeckList.json` and
//! `decks/<file>.json`.

use lotus::{Finish, Zone};
use serde_json::{Value, json};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::decks::precons::{self, PreconImport};
use crate::test_app::TestApp;
use crate::testing::*;
use manavault_catalog::testing::fixtures::{
    black_lotus, black_lotus_beta, legal_commander_card, plains, time_walk,
};

const PRECON: &str = "KittyCommittee_TST";

/// A collection item: printing, quantity, finish, location, and its
/// allocation's source location.
type Item = (String, i64, String, Option<i64>, Option<i64>);

async fn app_with_mtgjson() -> (TestApp, MockServer) {
    let server = MockServer::start().await;
    let uri = server.uri();
    let app = TestApp::with_config(|config| {
        config.platform_urls.mtgjson_api = format!("{uri}/api/v5/");
    })
    .await;
    app.import_cards(&[
        black_lotus(),
        black_lotus_beta(),
        time_walk(),
        plains(),
        legal_commander_card(),
    ])
    .await;
    sqlx::query("INSERT INTO scryfall_sets (code, name) VALUES ('tst', 'Test Commander')")
        .execute(app.db())
        .await
        .unwrap();
    (app, server)
}

fn listed(file_name: &str, name: &str, code: &str, kind: &str, released: &str) -> Value {
    json!({
        "code": code,
        "fileName": file_name,
        "name": name,
        "releaseDate": released,
        "source": format!("https://magic.wizards.com/{file_name}"),
        "type": kind
    })
}

async fn stub_list(server: &MockServer, decks: Vec<Value>, expected_requests: u64) {
    Mock::given(method("GET"))
        .and(path("/api/v5/DeckList.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "meta": {"date": "2026-11-03", "version": "5.3.0"},
            "data": decks
        })))
        .expect(expected_requests)
        .mount(server)
        .await;
}

fn deck_card(name: &str, printing: &str, count: i64, foil: bool) -> Value {
    json!({
        "name": name,
        "count": count,
        "isFoil": foil,
        "isEtched": false,
        "identifiers": {"scryfallId": printing}
    })
}

/// A precon with a commander, a main deck (basic lands included), a
/// sideboard card, and a card the catalog lacks.
async fn stub_precon(server: &MockServer) {
    stub_list(
        server,
        vec![listed(
            PRECON,
            "Kitty Committee",
            "TST",
            "Commander Deck",
            "2026-01-01",
        )],
        1,
    )
    .await;
    Mock::given(method("GET"))
        .and(path(format!("/api/v5/decks/{PRECON}.json")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "meta": {"date": "2026-11-03", "version": "5.3.0"},
            "data": {
                "name": "Kitty Committee",
                "code": "TST",
                "type": "Commander Deck",
                "commander": [
                    deck_card("Test Commander", "scryfall-printing-test-commander", 1, false)
                ],
                "mainBoard": [
                    deck_card("Black Lotus", "scryfall-printing-3", 1, false),
                    deck_card("Time Walk", "scryfall-printing-2", 2, true),
                    deck_card("Plains", "scryfall-printing-basic-plains", 5, false),
                    deck_card("Missing Card", "missing-printing", 1, false)
                ],
                "sideBoard": [deck_card("Black Lotus", "scryfall-printing-1", 1, false)],
                "tokens": []
            }
        })))
        .mount(server)
        .await;
}

async fn count(app: &TestApp, sql: &'static str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(app.db()).await.unwrap()
}

/// Serves a deck file whose commanders have these color identities.
async fn stub_commanders(
    server: &MockServer,
    file_name: &str,
    identities: &[&[&str]],
    expected: u64,
) {
    let commanders: Vec<Value> = identities
        .iter()
        .map(|colors| json!({"name": "Commander", "count": 1, "colorIdentity": colors}))
        .collect();
    Mock::given(method("GET"))
        .and(path(format!("/api/v5/decks/{file_name}.json")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": {"name": file_name, "commander": commanders, "mainBoard": []}
        })))
        .expect(expected)
        .mount(server)
        .await;
}

#[tokio::test]
async fn list_keeps_commander_decks_newest_first_and_caches_them() {
    let (app, server) = app_with_mtgjson().await;
    stub_list(
        &server,
        vec![
            listed(
                "Older_TST",
                "Older Deck",
                "TST",
                "Commander Deck",
                "2018-08-10",
            ),
            listed("Dragons_JMP", "Dragons", "JMP", "Jumpstart", "2026-07-17"),
            listed(
                "Newer_ZZZ",
                "Newer Deck",
                "ZZZ",
                "Commander Deck",
                "2026-10-02",
            ),
            listed(
                "Colorless_ZZZ",
                "Colorless Deck",
                "ZZZ",
                "Commander Deck",
                "2026-10-01",
            ),
            // In the snapshot (Atraxa): its deck file is never read.
            listed(
                "BreedLethality_C16",
                "Breed Lethality",
                "C16",
                "Commander Deck",
                "2016-11-11",
            ),
        ],
        1,
    )
    .await;
    // Partners: the union, in WUBRG order.
    stub_commanders(&server, "Newer_ZZZ", &[&["G", "U"], &["W", "U"]], 1).await;
    stub_commanders(&server, "Colorless_ZZZ", &[&[]], 1).await;
    stub_commanders(&server, "BreedLethality_C16", &[&["R"]], 0).await;
    // Older_TST's deck file is missing (404).

    let listed = precons::list(&app.state).await.unwrap();
    let summary: Vec<(&str, &str, Option<&str>, Option<&str>)> = listed
        .iter()
        .map(|precon| {
            (
                precon.id.as_str(),
                precon.name.as_str(),
                precon.product.as_deref(),
                precon.release_date.as_deref(),
            )
        })
        .collect();
    // ZZZ is not in the catalog's set list, so it has no product name.
    assert_eq!(
        summary,
        vec![
            ("Newer_ZZZ", "Newer Deck", None, Some("2026-10-02")),
            ("Colorless_ZZZ", "Colorless Deck", None, Some("2026-10-01")),
            (
                "Older_TST",
                "Older Deck",
                Some("Test Commander"),
                Some("2018-08-10")
            ),
            (
                "BreedLethality_C16",
                "Breed Lethality",
                None,
                Some("2016-11-11")
            ),
        ]
    );
    let colors: Vec<Option<Vec<String>>> = listed
        .iter()
        .map(|precon| precon.color_identity.clone())
        .collect();
    let owned = |colors: &[&str]| Some(colors.iter().map(|&color| color.to_owned()).collect());
    assert_eq!(
        colors,
        vec![
            owned(&["W", "U", "G"]),
            owned(&["C"]),
            None,
            owned(&["W", "U", "B", "G"]),
        ]
    );
    assert_eq!(
        listed[2].url.as_deref(),
        Some("https://magic.wizards.com/Older_TST")
    );
    // Served from the cache: the list and deck files were requested once.
    assert_eq!(precons::list(&app.state).await.unwrap(), listed);
}

#[tokio::test]
async fn list_does_not_cache_an_empty_result() {
    let (app, server) = app_with_mtgjson().await;
    stub_list(&server, Vec::new(), 2).await;
    assert_eq!(precons::list(&app.state).await.unwrap(), Vec::new());
    assert_eq!(precons::list(&app.state).await.unwrap(), Vec::new());
}

#[tokio::test]
async fn import_refuses_decks_missing_from_the_list() {
    let (app, server) = app_with_mtgjson().await;
    stub_precon(&server).await;
    for id in ["Dragons_JMP", "../DeckList"] {
        let error = precons::import(
            &app.state,
            &PreconImport {
                precon_id: id.into(),
                ..PreconImport::default()
            },
        )
        .await
        .unwrap_err();
        assert_eq!(
            error.failure_message(),
            "Choose a precon from the list.",
            "{id}"
        );
    }
    assert_eq!(count(&app, "SELECT count(*) FROM decks").await, 0);
}

#[tokio::test]
async fn import_adds_the_cards_to_the_collection_and_allocates_them() {
    let (app, server) = app_with_mtgjson().await;
    stub_precon(&server).await;
    let shelf = location(app.db(), "Precon shelf", "box").await;

    let imported = precons::import(
        &app.state,
        &PreconImport {
            precon_id: PRECON.into(),
            name: None,
            add_to_collection: true,
            location_id: Some(shelf.0),
        },
    )
    .await
    .unwrap();

    assert_eq!(imported.deck.name, "Kitty Committee");
    assert_eq!(imported.deck.external_source, None);
    assert_eq!(imported.unresolved, vec!["Missing Card"]);
    // Commander 1 + Black Lotus 1 + Time Walk 2; the basics are skipped.
    assert_eq!(imported.added_to_collection, 4);

    let cards: Vec<(String, Zone, u32, Finish, i64)> = {
        let mut cards = Vec::new();
        for row in deck_cards(app.db(), imported.deck.id).await {
            cards.push((
                row.oracle_id.to_string(),
                row.zone,
                row.quantity.get(),
                row.finish,
                allocated_quantity(app.db(), row.id).await,
            ));
        }
        cards
    };
    assert_eq!(
        cards,
        vec![
            ("oracle-1".into(), Zone::Considering, 1, Finish::Nonfoil, 0),
            ("oracle-1".into(), Zone::Mainboard, 1, Finish::Nonfoil, 1),
            ("oracle-2".into(), Zone::Mainboard, 2, Finish::Foil, 2),
            (
                "oracle-plains".into(),
                Zone::Mainboard,
                5,
                Finish::Nonfoil,
                0
            ),
            (
                "oracle-test-commander".into(),
                Zone::Commander,
                1,
                Finish::Nonfoil,
                1
            ),
        ]
    );

    // One item per card in the precon's printing and finish, held by the
    // deck and returning to the chosen location when released.
    let items: Vec<Item> = sqlx::query!(
        r#"SELECT ci.scryfall_id AS "printing!", ci.quantity AS "quantity!", ci.finish AS "finish!",
                  ci.location_id, da.source_location_id
           FROM collection_items ci JOIN deck_allocations da ON da.collection_item_id = ci.id
           ORDER BY ci.scryfall_id"#
    )
    .fetch_all(app.db())
    .await
    .unwrap()
    .into_iter()
    .map(|row| {
        (
            row.printing,
            row.quantity,
            row.finish,
            row.location_id,
            row.source_location_id,
        )
    })
    .collect();
    assert_eq!(
        items,
        vec![
            (
                "scryfall-printing-2".into(),
                2,
                "foil".into(),
                None,
                Some(shelf.0)
            ),
            (
                "scryfall-printing-3".into(),
                1,
                "nonfoil".into(),
                None,
                Some(shelf.0)
            ),
            (
                "scryfall-printing-test-commander".into(),
                1,
                "nonfoil".into(),
                None,
                Some(shelf.0)
            ),
        ]
    );
    assert_eq!(
        count(&app, "SELECT count(*) FROM collection_items").await,
        3
    );
}

#[tokio::test]
async fn graphql_imports_a_precon_and_refuses_list_locations_without_writing() {
    let (app, server) = app_with_mtgjson().await;
    stub_precon(&server).await;
    let wants = location(app.db(), "Wants", "list").await;
    let mutation = "mutation($input: ImportCommanderPreconInput!) {
        importCommanderPrecon(input: $input) {
          deck { name format cardCount }
          unresolved
          addedToCollection
        }
      }";

    let refused = app
        .gql(
            mutation,
            json!({"input": {
                "preconId": PRECON,
                "addToCollection": true,
                "locationId": manavault_core::graphql::global_id(
                    manavault_core::graphql::NodeKind::Location,
                    wants.0
                )
            }}),
        )
        .await;
    assert!(
        error_message(&refused).starts_with("List locations hold wanted cards"),
        "{refused}"
    );
    assert_eq!(count(&app, "SELECT count(*) FROM decks").await, 0);

    let data = app
        .gql_data(
            mutation,
            json!({"input": {"preconId": PRECON, "name": "  My Kitties  "}}),
        )
        .await;
    assert_eq!(
        data["importCommanderPrecon"],
        json!({
            "deck": {"name": "My Kitties", "format": "commander", "cardCount": 9},
            "unresolved": ["Missing Card"],
            "addedToCollection": 0
        })
    );
    assert_eq!(
        count(&app, "SELECT count(*) FROM collection_items").await,
        0
    );
}
