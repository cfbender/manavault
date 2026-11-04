//! Commander precons from Moxfield: the list and importing one, against a
//! wiremock Moxfield API.

use lotus::{Finish, Zone};
use serde_json::{Value, json};
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::decks::precons::{self, PreconImport};
use crate::test_app::TestApp;
use crate::testing::*;
use manavault_catalog::testing::fixtures::{
    black_lotus, black_lotus_beta, legal_commander_card, plains, time_walk,
};

const PRECON: &str = "Precon_Deck-1";

/// A collection item: printing, quantity, finish, location, and its
/// allocation's source location.
type Item = (String, i64, String, Option<i64>, Option<i64>);

async fn app_with_moxfield() -> (TestApp, MockServer) {
    let server = MockServer::start().await;
    let uri = server.uri();
    let app = TestApp::with_config(|config| {
        config.platform_urls.moxfield_api = format!("{uri}/v3/decks/all/");
        config.platform_urls.moxfield_deck_search = format!("{uri}/v2/decks/search-sfw");
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
    (app, server)
}

fn summary(id: &str, name: &str, colors: &[&str], created: &str) -> Value {
    json!({
        "publicId": id,
        "name": name,
        "format": "commander",
        "colorIdentity": colors,
        "createdAtUtc": created
    })
}

fn moxfield_card(name: &str, printing: &str, quantity: i64, finish: &str) -> Value {
    json!({
        "quantity": quantity,
        "finish": finish,
        "card": {"name": name, "scryfall_id": printing}
    })
}

/// A precon with a commander, a main deck (basic lands included), a
/// sideboard card, and a card the catalog lacks.
async fn stub_precon(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path(format!("/v3/decks/all/{PRECON}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "name": "Kitty Committee (Test Commander Precon Decklist)",
            "boards": {
                "commanders": {"count": 1, "cards": {
                    "a": moxfield_card("Test Commander", "scryfall-printing-test-commander", 1, "nonFoil")
                }},
                "mainboard": {"count": 9, "cards": {
                    "b": moxfield_card("Black Lotus", "scryfall-printing-3", 1, "nonFoil"),
                    "c": moxfield_card("Time Walk", "scryfall-printing-2", 2, "foil"),
                    "d": moxfield_card("Plains", "scryfall-printing-basic-plains", 5, "nonFoil"),
                    "e": moxfield_card("Missing Card", "missing-printing", 1, "nonFoil")
                }},
                "sideboard": {"count": 1, "cards": {
                    "f": moxfield_card("Black Lotus", "scryfall-printing-1", 1, "nonFoil")
                }}
            }
        })))
        .mount(server)
        .await;
}

async fn count(app: &TestApp, sql: &'static str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(app.db()).await.unwrap()
}

#[test]
fn split_name_reads_the_product_from_moxfield_names() {
    assert_eq!(
        precons::split_name("Subjective Reality (Commander 2018 Precon Decklist)"),
        ("Subjective Reality".into(), Some("Commander 2018".into()))
    );
    assert_eq!(
        precons::split_name(
            "Tyranid Swarm (Warhammer 40,000 Commander Collector's Edition Precon Decklist)"
        ),
        (
            "Tyranid Swarm".into(),
            Some("Warhammer 40,000 Commander Collector's Edition".into())
        )
    );
    assert_eq!(
        precons::split_name(" Just a deck (v2) "),
        ("Just a deck (v2)".into(), None)
    );
}

#[tokio::test]
async fn list_reads_every_page_newest_first_and_caches_it() {
    let (app, server) = app_with_moxfield().await;
    for (page, total, decks) in [
        (
            "1",
            2,
            vec![summary(
                "older-deck",
                "Nature of the Beast (Commander 2013 Precon Decklist)",
                &["G", "R", "W"],
                "2024-01-01T00:00:00Z",
            )],
        ),
        (
            "2",
            2,
            vec![summary(
                "newer-deck",
                "Legends' Legacy (Dominaria United Commander Precon Decklist)",
                &["B", "R", "W"],
                "2025-06-01T00:00:00Z",
            )],
        ),
    ] {
        Mock::given(method("GET"))
            .and(path("/v2/decks/search-sfw"))
            .and(query_param("authorUserNames", "WizardsOfTheCoast"))
            .and(query_param("fmt", "commander"))
            .and(query_param("pageNumber", page))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({"totalPages": total, "data": decks})),
            )
            .expect(1)
            .mount(&server)
            .await;
    }

    let listed = precons::list(&app.state).await.unwrap();
    let summary: Vec<(&str, &str, Option<&str>, Vec<&str>)> = listed
        .iter()
        .map(|precon| {
            (
                precon.id.as_str(),
                precon.name.as_str(),
                precon.product.as_deref(),
                precon.color_identity.iter().map(String::as_str).collect(),
            )
        })
        .collect();
    assert_eq!(
        summary,
        vec![
            (
                "newer-deck",
                "Legends' Legacy",
                Some("Dominaria United Commander"),
                vec!["W", "B", "R"]
            ),
            (
                "older-deck",
                "Nature of the Beast",
                Some("Commander 2013"),
                vec!["W", "R", "G"]
            ),
        ]
    );
    assert_eq!(listed[0].url, "https://moxfield.com/decks/newer-deck");
    // Served from the cache: each page was requested once (`expect(1)`).
    assert_eq!(precons::list(&app.state).await.unwrap(), listed);
}

#[tokio::test]
async fn import_adds_the_cards_to_the_collection_and_allocates_them() {
    let (app, server) = app_with_moxfield().await;
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
    let (app, server) = app_with_moxfield().await;
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
