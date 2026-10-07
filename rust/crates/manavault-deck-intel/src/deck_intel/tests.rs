//! GraphQL-level tests of deck EDHREC suggestions, Recommander, Commander
//! Spellbook combos, buylists, disassembly, and bulk and pull-list
//! allocation.

use manavault_allocation::{
    CollectionItemId, DeckCardId, DeckId, LocationKind, Quantity, allocate,
};
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::test_app::TestApp;
use manavault_catalog::testing::fixtures;
use manavault_core::graphql::{NodeKind, global_id};

// --- Fixtures -------------------------------------------------------------------

async fn app_with(server: &MockServer) -> TestApp {
    let base = server.uri();
    TestApp::with_config(|config| {
        config.edhrec_json_base_url = base.clone();
        config.deck_intel.edhrec_recs = format!("{base}/recs");
        config.deck_intel.recommander = format!("{base}/recommander");
        config.deck_intel.commander_spellbook = format!("{base}/spellbook?limit=1000");
    })
    .await
}

async fn deck(app: &TestApp, name: &str, status: &str) -> DeckId {
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO decks (name, format, status, inserted_at, updated_at)
         VALUES (?1, 'commander', ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
         RETURNING id",
    )
    .bind(name)
    .bind(status)
    .fetch_one(app.db())
    .await
    .unwrap();
    DeckId(id)
}

async fn add_card(
    app: &TestApp,
    deck: DeckId,
    oracle_id: &str,
    quantity: i64,
    zone: &str,
    printing: Option<&str>,
    finish: &str,
) -> DeckCardId {
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO deck_cards
           (deck_id, oracle_id, preferred_printing_id, quantity, zone, finish, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
         RETURNING id",
    )
    .bind(deck.0)
    .bind(oracle_id)
    .bind(printing)
    .bind(quantity)
    .bind(zone)
    .bind(finish)
    .fetch_one(app.db())
    .await
    .unwrap();
    DeckCardId(id)
}

async fn item(
    app: &TestApp,
    scryfall_id: &str,
    quantity: i64,
    finish: &str,
    location_id: Option<i64>,
) -> CollectionItemId {
    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO collection_items
           (scryfall_id, quantity, finish, location_id, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
         RETURNING id",
    )
    .bind(scryfall_id)
    .bind(quantity)
    .bind(finish)
    .bind(location_id)
    .fetch_one(app.db())
    .await
    .unwrap();
    CollectionItemId(id)
}

async fn location(app: &TestApp, name: &str, kind: LocationKind) -> i64 {
    let kind = match kind {
        LocationKind::Binder => "binder",
        LocationKind::List => "list",
        _ => "box",
    };
    sqlx::query_scalar::<_, i64>(
        "INSERT INTO locations (name, kind, inserted_at, updated_at)
         VALUES (?1, ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z') RETURNING id",
    )
    .bind(name)
    .bind(kind)
    .fetch_one(app.db())
    .await
    .unwrap()
}

fn one() -> Quantity {
    Quantity::new(1).unwrap()
}

fn deck_gid(id: DeckId) -> String {
    global_id(NodeKind::Deck, id.0).to_string()
}

fn error_message(response: &Value) -> String {
    response["errors"][0]["message"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

async fn requests_to(server: &MockServer, path_: &str) -> Vec<Value> {
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|request| request.url.path() == path_)
        .map(|request| serde_json::from_slice(&request.body).unwrap_or(Value::Null))
        .collect()
}

async fn request_paths(server: &MockServer) -> Vec<String> {
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|request| request.url.path().to_owned())
        .collect()
}

// --- EDHREC ---------------------------------------------------------------------

const DECK_EDHREC: &str = r"
query DeckEdhrec($id: ID!, $commanderName: String, $commanderTheme: String) {
  deckEdhrec(id: $id, commanderName: $commanderName, commanderTheme: $commanderTheme) {
    commanderNames
    more
    recommendations {
      name oracleId primaryType score salt edhrecUrl card { oracleId name }
      collectionStatus { state required owned allocated available allocatedElsewhere missing deckZone }
    }
    cuts { name oracleId collectionStatus { state missing deckZone } }
    commanderPages {
      name title description url rank deckCount salt avgPrice colorIdentity similar
      themes { name slug count }
      stats { label value }
      sections {
        header tag
        cards {
          name oracleId synergy inclusion numDecks potentialDecks url card { oracleId }
          collectionStatus { state missing deckZone }
        }
      }
    }
  }
}";

async fn mock_recs(server: &MockServer, body: Value) {
    Mock::given(method("POST"))
        .and(path("/recs"))
        .respond_with(ResponseTemplate::new(200).set_body_json(body))
        .mount(server)
        .await;
}

#[tokio::test]
async fn deck_edhrec_returns_recs_cuts_commander_pages_and_collection_status() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[
        fixtures::black_lotus(),
        fixtures::time_walk(),
        fixtures::plains(),
    ])
    .await;
    item(&app, "scryfall-printing-2", 1, "foil", None).await;
    let d = deck(&app, "EDHREC Test", "brewing").await;
    add_card(
        &app,
        d,
        "oracle-1",
        1,
        "commander",
        Some("scryfall-printing-1"),
        "nonfoil",
    )
    .await;
    add_card(&app, d, "oracle-plains", 2, "mainboard", None, "nonfoil").await;

    mock_recs(
        &server,
        json!({
            "commanders": [{"name": "Black Lotus"}],
            "inRecs": [{"name": "Time Walk", "oracle_id": "oracle-2", "primary_type": "Sorcery", "score": 88, "salt": 0.25}],
            "outRecs": [{"name": "Black Lotus", "oracle_id": "oracle-1", "primary_type": "Artifact", "score": 12, "salt": 1.2}],
            "more": true
        }),
    )
    .await;
    Mock::given(method("GET"))
        .and(path("/pages/commanders/black-lotus/power.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "title": "Black Lotus (Commander)",
            "avg_price": 100_000.0,
            "num_decks_avg": 123,
            "similar": ["Time Walk"],
            "panels": {"taglinks": [{"value": "Power", "slug": "power", "count": 7}]},
            "container": {
                "description": "Popular decks and cards for Black Lotus",
                "json_dict": {
                    "card": {"name": "Black Lotus", "rank": 1, "num_decks": 123, "color_identity": []},
                    "cardlists": [{
                        "header": "High Synergy Cards",
                        "tag": "highsynergycards",
                        "cardviews": [
                            {"id": "scryfall-printing-2", "name": "Time Walk", "synergy": 0.5, "inclusion": 77, "num_decks": 77, "potential_decks": 123, "url": "/cards/time-walk"},
                            {"id": "scryfall-printing-1", "name": "Black Lotus", "synergy": 0.75, "inclusion": 99, "num_decks": 99, "potential_decks": 123, "url": "/cards/black-lotus"}
                        ]
                    }]
                }
            }
        })))
        .mount(&server)
        .await;

    let data = app
        .gql_data(
            DECK_EDHREC,
            json!({"id": deck_gid(d), "commanderName": "Black Lotus", "commanderTheme": "power"}),
        )
        .await;

    let payloads = requests_to(&server, "/recs").await;
    assert_eq!(payloads.len(), 1, "one recs request expected");
    let payload = &payloads[0];
    assert_eq!(payload["commanders"], json!(["Black Lotus"]));
    assert_eq!(
        payload["cards"],
        json!(["1x Black Lotus (LEA) 232", "2x Plains"])
    );
    assert_eq!(payload["name"], json!(""));
    assert_eq!(
        payload["options"],
        json!({"excludeLands": false, "offset": 0})
    );

    let edhrec = &data["deckEdhrec"];
    assert_eq!(edhrec["commanderNames"], json!(["Black Lotus"]));
    assert_eq!(edhrec["more"], json!(true));
    assert_eq!(
        edhrec["recommendations"],
        json!([{
            "name": "Time Walk", "oracleId": "oracle-2", "primaryType": "Sorcery",
            "score": 88.0, "salt": 0.25, "edhrecUrl": "https://edhrec.com/cards/time-walk",
            "card": {"oracleId": "oracle-2", "name": "Time Walk"},
            "collectionStatus": {"state": "available", "required": 1, "owned": 1, "allocated": 0,
                                 "available": 1, "allocatedElsewhere": 0, "missing": 0, "deckZone": null}
        }])
    );
    assert_eq!(
        edhrec["cuts"],
        json!([{"name": "Black Lotus", "oracleId": "oracle-1",
                "collectionStatus": {"state": "allocated", "missing": 1, "deckZone": "commander"}}])
    );
    assert_eq!(
        edhrec["commanderPages"],
        json!([{
            "name": "Black Lotus",
            "title": "Black Lotus (Commander)",
            "description": "Popular decks and cards for Black Lotus",
            "url": "https://edhrec.com/commanders/black-lotus/power",
            "rank": 1, "deckCount": 123, "salt": null, "avgPrice": 100_000.0,
            "colorIdentity": [], "similar": ["Time Walk"],
            "themes": [{"name": "Power", "slug": "power", "count": 7}],
            "stats": [{"label": "Average price", "value": "$100000"}, {"label": "Average decks", "value": "123"}],
            "sections": [{
                "header": "High Synergy Cards", "tag": "highsynergycards",
                "cards": [
                    {"name": "Time Walk", "oracleId": "oracle-2", "synergy": 0.5, "inclusion": 77, "numDecks": 77,
                     "potentialDecks": 123, "url": "https://edhrec.com/cards/time-walk", "card": {"oracleId": "oracle-2"},
                     "collectionStatus": {"state": "available", "missing": 0, "deckZone": null}},
                    {"name": "Black Lotus", "oracleId": "oracle-1", "synergy": 0.75, "inclusion": 99, "numDecks": 99,
                     "potentialDecks": 123, "url": "https://edhrec.com/cards/black-lotus", "card": {"oracleId": "oracle-1"},
                     "collectionStatus": {"state": "allocated", "missing": 1, "deckZone": "commander"}}
                ]
            }]
        }])
    );
}

#[tokio::test]
async fn deck_edhrec_status_checks_considering_zone_deck_cards() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[
        fixtures::black_lotus(),
        fixtures::time_walk(),
        fixtures::plains(),
    ])
    .await;
    let d = deck(&app, "EDHREC Zones", "brewing").await;
    add_card(
        &app,
        d,
        "oracle-1",
        1,
        "commander",
        Some("scryfall-printing-1"),
        "nonfoil",
    )
    .await;
    add_card(
        &app,
        d,
        "oracle-2",
        1,
        "considering",
        Some("scryfall-printing-2"),
        "nonfoil",
    )
    .await;
    add_card(&app, d, "oracle-plains", 1, "considering", None, "nonfoil").await;
    mock_recs(
        &server,
        json!({
            "commanders": [{"name": "Black Lotus"}],
            "inRecs": [{"name": "Time Walk", "oracle_id": "oracle-2"}, {"name": "Plains", "oracle_id": "oracle-plains"}],
            "outRecs": []
        }),
    )
    .await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({})))
        .mount(&server)
        .await;

    let data = app.gql_data(DECK_EDHREC, json!({"id": deck_gid(d)})).await;
    let statuses: Vec<(Value, Value)> = data["deckEdhrec"]["recommendations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|rec| {
            (
                rec["name"].clone(),
                rec["collectionStatus"]["deckZone"].clone(),
            )
        })
        .collect();
    assert_eq!(
        statuses,
        [
            (json!("Time Walk"), json!("considering")),
            (json!("Plains"), json!("considering"))
        ]
    );
    for rec in data["deckEdhrec"]["recommendations"].as_array().unwrap() {
        assert_eq!(rec["collectionStatus"]["state"], json!("allocated"));
    }
    // Without a theme the default page is fetched; an empty page still shows.
    assert_eq!(
        data["deckEdhrec"]["commanderPages"][0]["url"],
        json!("https://edhrec.com/commanders/black-lotus")
    );
    assert_eq!(
        data["deckEdhrec"]["commanderPages"][0]["description"],
        json!("EDHREC commander data")
    );
}

/// Copies reserved by any other deck count against a suggested card. Earlier
/// releases only counted active decks here, although allocated copies
/// have left their location whatever the deck's status.
#[tokio::test]
async fn deck_edhrec_counts_copies_allocated_to_other_decks() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[fixtures::black_lotus(), fixtures::time_walk()])
        .await;
    let copies = item(&app, "scryfall-printing-2", 3, "foil", None).await;
    let active = deck(&app, "Other", "active").await;
    let active_walk = add_card(&app, active, "oracle-2", 1, "mainboard", None, "foil").await;
    allocate(app.db(), active_walk, copies, one())
        .await
        .unwrap();
    let brewing = deck(&app, "Brewing", "brewing").await;
    let brewing_walk = add_card(&app, brewing, "oracle-2", 1, "mainboard", None, "foil").await;
    allocate(app.db(), brewing_walk, copies, one())
        .await
        .unwrap();

    let d = deck(&app, "Viewed", "brewing").await;
    add_card(
        &app,
        d,
        "oracle-1",
        1,
        "commander",
        Some("scryfall-printing-1"),
        "nonfoil",
    )
    .await;
    mock_recs(
        &server,
        json!({"commanders": [], "inRecs": [{"name": "Time Walk", "oracle_id": "oracle-2"}], "outRecs": [], "more": false}),
    )
    .await;

    let data = app.gql_data(DECK_EDHREC, json!({"id": deck_gid(d)})).await;
    let status = &data["deckEdhrec"]["recommendations"][0]["collectionStatus"];
    assert_eq!(status["state"], json!("available"));
    assert_eq!(status["owned"], json!(3));
    assert_eq!(status["allocatedElsewhere"], json!(2));
    assert_eq!(status["available"], json!(1));
    assert_eq!(data["deckEdhrec"]["more"], json!(false));
    assert_eq!(data["deckEdhrec"]["commanderPages"], json!([]));
}

#[tokio::test]
async fn deck_edhrec_fetches_the_pair_page_and_each_partner_page() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    let partner = |name: &str, id: &str| {
        fixtures::merge(
            fixtures::legal_commander_card(),
            json!({"id": format!("scryfall-{id}"), "oracle_id": format!("oracle-{id}"), "name": name,
                   "oracle_text": "Partner (You can have two commanders if both have partner.)"}),
        )
    };
    app.import_cards(&[
        partner("Zeta Partner", "zeta"),
        partner("Alpha Partner", "alpha"),
        fixtures::plains(),
    ])
    .await;
    let d = deck(&app, "Partner EDHREC", "brewing").await;
    add_card(&app, d, "oracle-zeta", 1, "commander", None, "nonfoil").await;
    add_card(&app, d, "oracle-alpha", 1, "commander", None, "nonfoil").await;
    add_card(&app, d, "oracle-plains", 98, "mainboard", None, "nonfoil").await;
    mock_recs(
        &server,
        json!({"commanders": [{"name": "Zeta Partner"}, {"name": "Alpha Partner"}], "inRecs": [], "outRecs": [], "more": false}),
    )
    .await;
    for (slug, name) in [
        (
            "alpha-partner-zeta-partner",
            "Alpha Partner // Zeta Partner",
        ),
        ("zeta-partner", "Zeta Partner"),
    ] {
        Mock::given(method("GET"))
            .and(path(format!("/pages/commanders/{slug}.json")))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                json!({"container": {"json_dict": {"card": {"name": name}, "cardlists": []}}}),
            ))
            .mount(&server)
            .await;
    }
    // A non-canonical slug answers with a redirect, which is followed once.
    Mock::given(method("GET"))
        .and(path("/pages/commanders/alpha-partner.json"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"redirect": "/commanders/alpha-partner-canonical"})),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/pages/commanders/alpha-partner-canonical.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            json!({"container": {"json_dict": {"card": {"name": "Alpha Partner"}}}}),
        ))
        .mount(&server)
        .await;

    let data = app.gql_data(DECK_EDHREC, json!({"id": deck_gid(d)})).await;
    assert_eq!(
        data["deckEdhrec"]["commanderNames"],
        json!(["Zeta Partner", "Alpha Partner"])
    );
    let pages: Vec<(Value, Value)> = data["deckEdhrec"]["commanderPages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|page| (page["name"].clone(), page["url"].clone()))
        .collect();
    assert_eq!(
        pages,
        [
            (
                json!("Alpha Partner // Zeta Partner"),
                json!("https://edhrec.com/commanders/alpha-partner-zeta-partner")
            ),
            (
                json!("Zeta Partner"),
                json!("https://edhrec.com/commanders/zeta-partner")
            ),
            (
                json!("Alpha Partner"),
                json!("https://edhrec.com/commanders/alpha-partner")
            ),
        ]
    );
    let page_requests: Vec<String> = request_paths(&server)
        .await
        .into_iter()
        .filter(|p| p.starts_with("/pages/"))
        .collect();
    assert_eq!(
        page_requests,
        [
            "/pages/commanders/alpha-partner-zeta-partner.json",
            "/pages/commanders/zeta-partner.json",
            "/pages/commanders/alpha-partner.json",
            "/pages/commanders/alpha-partner-canonical.json",
        ]
    );
}

#[tokio::test]
async fn deck_edhrec_errors_use_the_documented_messages() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[fixtures::black_lotus(), fixtures::plains()])
        .await;
    let no_commander = deck(&app, "No Commander", "brewing").await;
    add_card(
        &app,
        no_commander,
        "oracle-plains",
        1,
        "mainboard",
        None,
        "nonfoil",
    )
    .await;
    let response = app
        .gql(DECK_EDHREC, json!({"id": deck_gid(no_commander)}))
        .await;
    assert_eq!(error_message(&response), "EDHREC requires a commander.");
    assert_eq!(requests_to(&server, "/recs").await.len(), 0);

    let d = deck(&app, "Failing", "brewing").await;
    add_card(&app, d, "oracle-1", 1, "commander", None, "nonfoil").await;
    Mock::given(method("POST"))
        .and(path("/recs"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;
    let response = app.gql(DECK_EDHREC, json!({"id": deck_gid(d)})).await;
    assert_eq!(error_message(&response), "EDHREC returned HTTP 503.");

    let response = app
        .gql(DECK_EDHREC, json!({"id": deck_gid(DeckId(9999))}))
        .await;
    assert_eq!(error_message(&response), "Deck was not found.");
}

// --- Recommander ------------------------------------------------------------------

const DECK_RECOMMANDER: &str = r"
query DeckRecommander($id: ID!) {
  deckRecommander(id: $id) {
    commanders { name oracleId url }
    recommendations {
      name oracleId rank score card { oracleId }
      collectionStatus { state owned deckZone }
    }
  }
}";

#[tokio::test]
async fn deck_recommander_ranks_recommendations_with_collection_status() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[
        fixtures::black_lotus(),
        fixtures::time_walk(),
        fixtures::plains(),
    ])
    .await;
    item(&app, "scryfall-printing-2", 1, "foil", None).await;
    let d = deck(&app, "Recommander Test", "brewing").await;
    add_card(
        &app,
        d,
        "oracle-1",
        1,
        "commander",
        Some("scryfall-printing-1"),
        "nonfoil",
    )
    .await;
    add_card(&app, d, "oracle-plains", 2, "mainboard", None, "nonfoil").await;
    add_card(&app, d, "oracle-2", 1, "considering", None, "nonfoil").await;
    Mock::given(method("POST"))
        .and(path("/recommander"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "result_code": "success",
            "data": {"recommendations": [
                {"oracle_id": "oracle-plains", "name": "Plains", "score": 0.71},
                {"oracle_id": "oracle-2", "name": "Time Walk", "score": 0.9987}
            ]}
        })))
        .mount(&server)
        .await;

    let data = app
        .gql_data(DECK_RECOMMANDER, json!({"id": deck_gid(d)}))
        .await;
    assert_eq!(
        requests_to(&server, "/recommander").await,
        [
            json!({"card_format": "oracle_id", "commander": "oracle-1", "partner": null, "deck": ["oracle-plains"]})
        ]
    );
    assert_eq!(
        data["deckRecommander"],
        json!({
            "commanders": [{"name": "Black Lotus", "oracleId": "oracle-1", "url": "https://recommander.cards/card/oracle-1"}],
            "recommendations": [
                {"name": "Time Walk", "oracleId": "oracle-2", "rank": 1, "score": 0.9987, "card": {"oracleId": "oracle-2"},
                 "collectionStatus": {"state": "allocated", "owned": 1, "deckZone": "considering"}},
                {"name": "Plains", "oracleId": "oracle-plains", "rank": 2, "score": 0.71, "card": {"oracleId": "oracle-plains"},
                 "collectionStatus": {"state": "allocated", "owned": 0, "deckZone": "mainboard"}}
            ]
        })
    );
}

/// Scores keep every bit of the JSON number, as Jason parses it: the default
/// best-effort float parsing of `serde_json` read `0.9985702037811279` as
/// `0.998570203781128` (found by the parity harness against the live API;
/// fixed with the `float_roundtrip` feature of `serde_json`).
#[tokio::test]
async fn deck_recommander_scores_parse_exactly() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[fixtures::black_lotus(), fixtures::time_walk()])
        .await;
    let d = deck(&app, "Exact Scores", "brewing").await;
    add_card(&app, d, "oracle-1", 1, "commander", None, "nonfoil").await;
    Mock::given(method("POST"))
        .and(path("/recommander"))
        .respond_with(ResponseTemplate::new(200).set_body_raw(
            r#"{"result_code": "success", "data": {"recommendations": [
                {"oracle_id": "oracle-2", "name": "Time Walk", "score": 0.9985702037811279}
            ]}}"#,
            "application/json",
        ))
        .mount(&server)
        .await;
    let data = app
        .gql_data(DECK_RECOMMANDER, json!({"id": deck_gid(d)}))
        .await;
    assert_eq!(
        data["deckRecommander"]["recommendations"][0]["score"],
        json!(0.998_570_203_781_127_9)
    );
}

#[tokio::test]
async fn deck_recommander_sends_partners_and_requires_a_commander() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[
        fixtures::black_lotus(),
        fixtures::time_walk(),
        fixtures::plains(),
    ])
    .await;
    let lonely = deck(&app, "No Commander", "brewing").await;
    add_card(
        &app,
        lonely,
        "oracle-plains",
        1,
        "mainboard",
        None,
        "nonfoil",
    )
    .await;
    let response = app
        .gql(DECK_RECOMMANDER, json!({"id": deck_gid(lonely)}))
        .await;
    assert_eq!(
        error_message(&response),
        "Recommander requires a commander."
    );
    assert_eq!(request_paths(&server).await.len(), 0);

    let d = deck(&app, "Partners", "brewing").await;
    add_card(&app, d, "oracle-2", 1, "commander", None, "nonfoil").await;
    add_card(&app, d, "oracle-1", 1, "commander", None, "nonfoil").await;
    Mock::given(method("POST"))
        .and(path("/recommander"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"result_code": "success", "data": {}})),
        )
        .mount(&server)
        .await;
    let data = app
        .gql_data(DECK_RECOMMANDER, json!({"id": deck_gid(d)}))
        .await;
    assert_eq!(
        requests_to(&server, "/recommander").await,
        [
            json!({"card_format": "oracle_id", "commander": "oracle-1", "partner": "oracle-2", "deck": []})
        ]
    );
    assert_eq!(
        data["deckRecommander"]["commanders"],
        json!([
            {"name": "Black Lotus", "oracleId": "oracle-1", "url": "https://recommander.cards/card/oracle-1"},
            {"name": "Time Walk", "oracleId": "oracle-2", "url": "https://recommander.cards/card/oracle-2"}
        ])
    );
    assert_eq!(data["deckRecommander"]["recommendations"], json!([]));

    add_card(&app, d, "oracle-plains", 1, "commander", None, "nonfoil").await;
    let response = app.gql(DECK_RECOMMANDER, json!({"id": deck_gid(d)})).await;
    assert_eq!(
        error_message(&response),
        "Recommander supports a commander and at most one partner."
    );
}

#[tokio::test]
async fn deck_recommander_api_errors_map_to_friendly_messages() {
    let cases = [
        (
            ResponseTemplate::new(429),
            "Recommander is rate limiting requests; try again in a minute.",
        ),
        (
            ResponseTemplate::new(503)
                .set_body_json(json!({"result_code": "error_booting", "error": {"messages": []}})),
            "Recommander is starting up; try again in a moment.",
        ),
        (
            ResponseTemplate::new(200).set_body_json(
                json!({"result_code": "error_unknown", "error": {"messages": ["boom"]}}),
            ),
            "Recommander error: boom",
        ),
        (
            ResponseTemplate::new(500).set_body_string("oops"),
            "Recommander returned HTTP 500.",
        ),
        (
            ResponseTemplate::new(200).set_body_json(json!([])),
            "Recommander returned an unexpected response.",
        ),
    ];
    for (template, message) in cases {
        let server = MockServer::start().await;
        let app = app_with(&server).await;
        app.import_cards(&[fixtures::black_lotus()]).await;
        let d = deck(&app, "Recommander Errors", "brewing").await;
        add_card(&app, d, "oracle-1", 1, "commander", None, "nonfoil").await;
        Mock::given(method("POST"))
            .and(path("/recommander"))
            .respond_with(template)
            .mount(&server)
            .await;
        let response = app.gql(DECK_RECOMMANDER, json!({"id": deck_gid(d)})).await;
        assert_eq!(error_message(&response), message);
    }
}

// --- Commander Spellbook -------------------------------------------------------------

const DECK_COMBOS: &str = r"
query DeckCombos($id: ID!) {
  deckCombos(id: $id) {
    id url cards { name quantity imageUrl } produces description manaNeeded prerequisites notes
  }
}";

#[tokio::test]
async fn deck_combos_submit_commander_and_mainboard_cards() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[
        fixtures::black_lotus(),
        fixtures::time_walk(),
        fixtures::plains(),
    ])
    .await;
    let d = deck(&app, "Combo Test", "brewing").await;
    add_card(&app, d, "oracle-1", 1, "commander", None, "nonfoil").await;
    add_card(&app, d, "oracle-2", 2, "mainboard", None, "nonfoil").await;
    add_card(&app, d, "oracle-plains", 1, "considering", None, "nonfoil").await;
    Mock::given(method("POST"))
        .and(path("/spellbook"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "results": {"included": [{
                "id": "1-2",
                "uses": [
                    {"card": {"name": "Black Lotus", "imageUriFrontSmall": "https://example.test/lotus.jpg"}, "quantity": 1},
                    {"card": {"name": "Time Walk"}, "quantity": 2}
                ],
                "produces": [{"feature": {"name": "Infinite turns"}}],
                "description": "Cast Time Walk.\nRepeat.",
                "manaNeeded": "{1}{U}",
                "easyPrerequisites": "Black Lotus is untapped.",
                "notablePrerequisites": "Your library has cards.\nYou can cast Time Walk.",
                "notes": "Keep priority."
            }]}
        })))
        .mount(&server)
        .await;

    let data = app.gql_data(DECK_COMBOS, json!({"id": deck_gid(d)})).await;
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1, "one request expected");
    let request = &requests[0];
    assert_eq!(request.url.query(), Some("limit=1000"));
    assert_eq!(
        serde_json::from_slice::<Value>(&request.body).unwrap(),
        json!({"commanders": [{"card": "Black Lotus", "quantity": 1}], "main": [{"card": "Time Walk", "quantity": 2}]})
    );
    assert_eq!(
        data["deckCombos"],
        json!([{
            "id": "1-2",
            "url": "https://commanderspellbook.com/combo/1-2",
            "cards": [
                {"name": "Black Lotus", "quantity": 1, "imageUrl": "https://example.test/lotus.jpg"},
                {"name": "Time Walk", "quantity": 2, "imageUrl": null}
            ],
            "produces": ["Infinite turns"],
            "description": "Cast Time Walk.\nRepeat.",
            "manaNeeded": "{1}{U}",
            "prerequisites": ["Black Lotus is untapped.", "Your library has cards.", "You can cast Time Walk."],
            "notes": "Keep priority."
        }])
    );
}

#[tokio::test]
async fn deck_combos_skip_empty_decks_and_reject_unexpected_responses() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[fixtures::black_lotus()]).await;
    let empty = deck(&app, "Empty", "brewing").await;
    let data = app
        .gql_data(DECK_COMBOS, json!({"id": deck_gid(empty)}))
        .await;
    assert_eq!(data["deckCombos"], json!([]));
    assert_eq!(request_paths(&server).await.len(), 0);

    let d = deck(&app, "Malformed", "brewing").await;
    add_card(&app, d, "oracle-1", 1, "mainboard", None, "nonfoil").await;
    Mock::given(method("POST"))
        .and(path("/spellbook"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({})))
        .mount(&server)
        .await;
    let response = app.gql(DECK_COMBOS, json!({"id": deck_gid(d)})).await;
    assert_eq!(
        error_message(&response),
        "Commander Spellbook returned an unexpected response."
    );
}

#[tokio::test]
async fn deck_combos_report_http_failures() {
    let server = MockServer::start().await;
    let app = app_with(&server).await;
    app.import_cards(&[fixtures::black_lotus()]).await;
    let d = deck(&app, "Down", "brewing").await;
    add_card(&app, d, "oracle-1", 1, "mainboard", None, "nonfoil").await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(502))
        .mount(&server)
        .await;
    let response = app.gql(DECK_COMBOS, json!({"id": deck_gid(d)})).await;
    assert_eq!(
        error_message(&response),
        "Commander Spellbook returned HTTP 502."
    );

    let unreachable = TestApp::new().await;
    unreachable.import_cards(&[fixtures::black_lotus()]).await;
    let d = deck(&unreachable, "Offline", "brewing").await;
    add_card(&unreachable, d, "oracle-1", 1, "mainboard", None, "nonfoil").await;
    let response = unreachable
        .gql(DECK_COMBOS, json!({"id": deck_gid(d)}))
        .await;
    assert_eq!(
        error_message(&response),
        "Could not reach Commander Spellbook. Try again in a moment."
    );
}

// --- Buylist --------------------------------------------------------------------------

const DECK_BUYLIST: &str = r"
query DeckBuylist($id: ID!, $printingMode: String, $assumeNoOwned: Boolean, $includeConsidering: Boolean, $includeBasicLands: Boolean) {
  deckBuylist(id: $id, printingMode: $printingMode, assumeNoOwned: $assumeNoOwned, includeConsidering: $includeConsidering, includeBasicLands: $includeBasicLands) {
    cardName quantity missing unavailable reason finish printing { setCode collectorNumber }
    setCode collectorNumber language unitPriceCents totalPriceCents unitPriceText totalPriceText
  }
}";

const DECK_BUYLIST_EXPORT: &str = r"
query DeckBuylistExport($id: ID!, $format: String, $printingMode: String, $assumeNoOwned: Boolean) {
  deckBuylistExport(id: $id, format: $format, printingMode: $printingMode, assumeNoOwned: $assumeNoOwned)
}";

#[tokio::test]
async fn deck_buylist_distinguishes_missing_from_unavailable_and_exports() {
    let app = TestApp::new().await;
    let cheap_beta = fixtures::merge(
        fixtures::black_lotus_beta(),
        json!({"prices": {"usd": "10.00"}}),
    );
    app.import_cards(&[fixtures::black_lotus(), cheap_beta])
        .await;
    item(&app, "scryfall-printing-1", 1, "nonfoil", None).await;
    let unavailable = item(&app, "scryfall-printing-3", 1, "nonfoil", None).await;
    let target = deck(&app, "Target", "active").await;
    let other = deck(&app, "Other", "active").await;
    add_card(
        &app,
        target,
        "oracle-1",
        3,
        "mainboard",
        Some("scryfall-printing-1"),
        "nonfoil",
    )
    .await;
    let other_lotus = add_card(&app, other, "oracle-1", 1, "mainboard", None, "nonfoil").await;
    allocate(app.db(), other_lotus, unavailable, one())
        .await
        .unwrap();
    let id = deck_gid(target);

    let data = app
        .gql_data(DECK_BUYLIST, json!({"id": id, "printingMode": "cheapest"}))
        .await;
    assert_eq!(
        data["deckBuylist"],
        json!([{
            "cardName": "Black Lotus", "quantity": 2, "missing": 1, "unavailable": 1,
            "reason": "missing and unavailable", "finish": "nonfoil",
            "printing": {"setCode": "leb", "collectorNumber": "233"},
            "setCode": "leb", "collectorNumber": "233", "language": "en",
            "unitPriceCents": 1000, "totalPriceCents": 2000, "unitPriceText": "$10", "totalPriceText": "$20"
        }])
    );

    let data = app
        .gql_data(DECK_BUYLIST, json!({"id": id, "printingMode": "exact"}))
        .await;
    assert_eq!(data["deckBuylist"][0]["setCode"], json!("lea"));
    assert_eq!(data["deckBuylist"][0]["collectorNumber"], json!("232"));
    assert_eq!(data["deckBuylist"][0]["totalPriceCents"], json!(20_000_000));

    let data = app
        .gql_data(
            DECK_BUYLIST,
            json!({"id": id, "printingMode": "cheapest", "assumeNoOwned": true}),
        )
        .await;
    let entry = &data["deckBuylist"][0];
    assert_eq!(
        (
            &entry["quantity"],
            &entry["missing"],
            &entry["unavailable"],
            &entry["reason"]
        ),
        (&json!(3), &json!(3), &json!(0), &json!("missing"))
    );
    assert_eq!(entry["totalPriceCents"], json!(3000));

    // Without a printing mode no printing is named, but the cheapest priced
    // printing still gives an estimate.
    let data = app.gql_data(DECK_BUYLIST, json!({"id": id})).await;
    let entry = &data["deckBuylist"][0];
    assert_eq!(
        (
            &entry["setCode"],
            &entry["collectorNumber"],
            &entry["printing"]
        ),
        (&Value::Null, &Value::Null, &Value::Null)
    );
    assert_eq!(entry["unitPriceCents"], json!(1000));

    let export = |format: Option<&str>, mode: Option<&str>, assume: bool| json!({"id": id, "format": format, "printingMode": mode, "assumeNoOwned": assume});
    let text = |data: Value| data["deckBuylistExport"].as_str().unwrap().to_owned();
    assert_eq!(
        text(
            app.gql_data(
                DECK_BUYLIST_EXPORT,
                export(Some("text"), Some("cheapest"), true)
            )
            .await
        ),
        "3 Black Lotus (LEB 233)"
    );
    assert_eq!(
        text(
            app.gql_data(DECK_BUYLIST_EXPORT, export(None, Some("cheapest"), false))
                .await
        ),
        "2 Black Lotus (LEB 233)"
    );
    assert_eq!(
        text(
            app.gql_data(DECK_BUYLIST_EXPORT, export(None, None, false))
                .await
        ),
        "2 Black Lotus"
    );
    let csv = text(
        app.gql_data(
            DECK_BUYLIST_EXPORT,
            export(Some("csv"), Some("cheapest"), false),
        )
        .await,
    );
    assert_eq!(
        csv,
        "Quantity,Card,Set,Collector Number,Finish,Language,Reason,Unit Price,Total Price\n\
         2,Black Lotus,leb,233,nonfoil,en,missing and unavailable,$10,$20"
    );
    assert_eq!(
        text(
            app.gql_data(DECK_BUYLIST_EXPORT, export(Some("pdf"), None, false))
                .await
        ),
        ""
    );
}

#[tokio::test]
async fn deck_buylist_zones_getting_tags_and_basic_lands() {
    let app = TestApp::new().await;
    let card = |id: &str, name: &str, number: &str| {
        json!({"id": format!("scryfall-{id}"), "oracle_id": format!("oracle-{id}"), "name": name,
               "type_line": "Artifact", "collector_number": number, "set": "zon", "set_name": "Zone Set",
               "lang": "en", "image_uris": {}, "finishes": ["nonfoil"], "legalities": {}})
    };
    app.import_cards(&[
        card("zone-mainboard", "Mainboard Zone Card", "1"),
        card("zone-commander", "Commander Zone Card", "2"),
        card("zone-getting", "Getting Tagged Card", "3"),
        card("zone-considering-a", "Considering Zone Card A", "4"),
        card("zone-considering-b", "Considering Zone Card B", "5"),
        fixtures::plains(),
    ])
    .await;
    let d = deck(&app, "Zone Deck", "brewing").await;
    add_card(
        &app,
        d,
        "oracle-zone-mainboard",
        2,
        "mainboard",
        None,
        "nonfoil",
    )
    .await;
    add_card(
        &app,
        d,
        "oracle-zone-commander",
        1,
        "commander",
        None,
        "nonfoil",
    )
    .await;
    let getting = add_card(
        &app,
        d,
        "oracle-zone-getting",
        1,
        "mainboard",
        None,
        "nonfoil",
    )
    .await;
    sqlx::query("UPDATE deck_cards SET tag = 'getting' WHERE id = ?1")
        .bind(getting.0)
        .execute(app.db())
        .await
        .unwrap();
    add_card(
        &app,
        d,
        "oracle-zone-considering-a",
        1,
        "considering",
        None,
        "nonfoil",
    )
    .await;
    add_card(
        &app,
        d,
        "oracle-zone-considering-b",
        1,
        "considering",
        None,
        "nonfoil",
    )
    .await;
    add_card(&app, d, "oracle-plains", 4, "mainboard", None, "nonfoil").await;

    let names = |data: Value| -> Vec<String> {
        data["deckBuylist"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["cardName"].as_str().unwrap().to_owned())
            .collect()
    };
    let id = deck_gid(d);
    assert_eq!(
        names(
            app.gql_data(DECK_BUYLIST, json!({"id": id, "assumeNoOwned": true}))
                .await
        ),
        ["Commander Zone Card", "Mainboard Zone Card"]
    );
    assert_eq!(
        names(
            app.gql_data(
                DECK_BUYLIST,
                json!({"id": id, "assumeNoOwned": true, "includeConsidering": true})
            )
            .await
        ),
        [
            "Commander Zone Card",
            "Considering Zone Card A",
            "Considering Zone Card B",
            "Mainboard Zone Card"
        ]
    );
    assert_eq!(
        names(
            app.gql_data(
                DECK_BUYLIST,
                json!({"id": id, "assumeNoOwned": true, "includeBasicLands": true})
            )
            .await
        ),
        ["Commander Zone Card", "Mainboard Zone Card", "Plains"]
    );
    // Owned or not, basic lands count as allocated.
    assert_eq!(
        names(
            app.gql_data(DECK_BUYLIST, json!({"id": id, "includeBasicLands": true}))
                .await
        ),
        ["Commander Zone Card", "Mainboard Zone Card"]
    );
}

// --- Disassembly ----------------------------------------------------------------------

const DISASSEMBLY_FIELDS: &str = "disassemblyResult { checkedCount movedCount skippedCount dryRun
  moves { collectionItemId cardName cardId imageUrl quantity finish fromLocationId fromLocationName toLocationId toLocationName } }";

#[tokio::test]
async fn deck_disassembly_previews_then_restores_and_archives() {
    let app = TestApp::new().await;
    app.import_cards(&[fixtures::time_walk(), fixtures::black_lotus()])
        .await;
    let binder = location(&app, "Trade Binder", LocationKind::Binder).await;
    let walk_item = item(&app, "scryfall-printing-2", 1, "foil", Some(binder)).await;
    let lotus_item = item(&app, "scryfall-printing-1", 1, "nonfoil", Some(binder)).await;
    let d = deck(&app, "Powered", "brewing").await;
    let walk = add_card(&app, d, "oracle-2", 2, "mainboard", None, "foil").await;
    let lotus = add_card(&app, d, "oracle-1", 1, "mainboard", None, "nonfoil").await;
    let walk_allocation = allocate(app.db(), walk, walk_item, one()).await.unwrap();
    let lotus_allocation = allocate(app.db(), lotus, lotus_item, one()).await.unwrap();

    let preview = app
        .gql_data(
            &format!("mutation($id: ID!) {{ previewDeckDisassembly(id: $id) {{ {DISASSEMBLY_FIELDS} }} }}"),
            json!({"id": deck_gid(d)}),
        )
        .await;
    let expected_move = |item: CollectionItemId,
                         name: &str,
                         card: &str,
                         image: Value,
                         finish: &str| {
        json!({
            "collectionItemId": item.0.to_string(), "cardName": name, "cardId": card, "imageUrl": image,
            "quantity": 1, "finish": finish, "fromLocationId": d.0.to_string(), "fromLocationName": "Powered",
            "toLocationId": binder.to_string(), "toLocationName": "Trade Binder"
        })
    };
    let moves = json!([
        expected_move(
            lotus_allocation.collection_item_id,
            "Black Lotus",
            "oracle-1",
            json!("https://example.test/black-lotus.jpg"),
            "nonfoil"
        ),
        expected_move(
            walk_allocation.collection_item_id,
            "Time Walk",
            "oracle-2",
            Value::Null,
            "foil"
        ),
    ]);
    assert_eq!(
        preview["previewDeckDisassembly"]["disassemblyResult"],
        json!({"checkedCount": 3, "movedCount": 2, "skippedCount": 1, "dryRun": true, "moves": moves})
    );
    let status: String = sqlx::query_scalar("SELECT status FROM decks WHERE id = ?1")
        .bind(d.0)
        .fetch_one(app.db())
        .await
        .unwrap();
    assert_eq!(status, "brewing");

    let applied = app
        .gql_data(
            &format!(
                "mutation($id: ID!) {{ disassembleDeck(id: $id) {{ {DISASSEMBLY_FIELDS} }} }}"
            ),
            json!({"id": deck_gid(d)}),
        )
        .await;
    assert_eq!(
        applied["disassembleDeck"]["disassemblyResult"],
        json!({"checkedCount": 3, "movedCount": 2, "skippedCount": 1, "dryRun": false, "moves": moves})
    );
    let status: String = sqlx::query_scalar("SELECT status FROM decks WHERE id = ?1")
        .bind(d.0)
        .fetch_one(app.db())
        .await
        .unwrap();
    assert_eq!(status, "archived");
    let filed: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM collection_items WHERE location_id = ?1")
            .bind(binder)
            .fetch_one(app.db())
            .await
            .unwrap();
    assert_eq!(filed, 2);

    let response = app
        .gql(
            &format!(
                "mutation($id: ID!) {{ disassembleDeck(id: $id) {{ {DISASSEMBLY_FIELDS} }} }}"
            ),
            json!({"id": global_id(NodeKind::DeckCard, 1).to_string()}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "Expected deck ID, got deck card ID"
    );
}

// --- Bulk and pull-list allocation -------------------------------------------------------

const BULK_ALLOCATE: &str = r"
mutation BulkAllocateDeck($id: ID!, $mode: String!) {
  bulkAllocateDeck(id: $id, mode: $mode) { allocationResult { allocated cards skipped } }
}";

#[tokio::test]
async fn bulk_allocate_deck_over_graphql() {
    let app = TestApp::new().await;
    app.import_cards(&[fixtures::black_lotus()]).await;
    item(&app, "scryfall-printing-1", 2, "nonfoil", None).await;
    let d = deck(&app, "Bulk Allocation Deck", "brewing").await;
    add_card(
        &app,
        d,
        "oracle-1",
        2,
        "mainboard",
        Some("scryfall-printing-1"),
        "nonfoil",
    )
    .await;

    let data = app
        .gql_data(
            BULK_ALLOCATE,
            json!({"id": deck_gid(d), "mode": "exact_printings"}),
        )
        .await;
    assert_eq!(
        data["bulkAllocateDeck"]["allocationResult"],
        json!({"allocated": 2, "cards": 1, "skipped": 0})
    );
    let data = app
        .gql_data(
            BULK_ALLOCATE,
            json!({"id": deck_gid(d), "mode": "matching_printings"}),
        )
        .await;
    assert_eq!(
        data["bulkAllocateDeck"]["allocationResult"],
        json!({"allocated": 0, "cards": 0, "skipped": 0})
    );

    let response = app
        .gql(
            BULK_ALLOCATE,
            json!({"id": deck_gid(d), "mode": "everything"}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "Could not add collection item to deck."
    );
    sqlx::query("UPDATE decks SET status = 'archived' WHERE id = ?1")
        .bind(d.0)
        .execute(app.db())
        .await
        .unwrap();
    let response = app
        .gql(
            BULK_ALLOCATE,
            json!({"id": deck_gid(d), "mode": "exact_printings"}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "Unarchive this deck before changing allocations."
    );
}

mod pull_list {
    use async_graphql::{Context, EmptySubscription, ID, InputObject, Object, Schema};

    use pretty_assertions::assert_eq;

    use super::*;
    use crate::deck_intel::schema::{
        AllocateDeckPullListPayload, PullListEntryArgs, allocate_deck_pull_list,
    };

    /// Stand-in for the deck engineer's input type.
    #[derive(InputObject)]
    #[graphql(name = "DeckPullListEntryInput")]
    struct EntryInput {
        deck_card_id: ID,
        collection_item_id: ID,
        quantity: Option<i64>,
    }

    struct Query;

    #[Object]
    impl Query {
        async fn ok(&self) -> bool {
            true
        }
    }

    struct Mutation;

    #[Object]
    impl Mutation {
        async fn allocate_deck_pull_list(
            &self,
            ctx: &Context<'_>,
            deck_id: ID,
            entries: Vec<EntryInput>,
        ) -> manavault_core::graphql::Result<Option<AllocateDeckPullListPayload>> {
            let entries: Vec<PullListEntryArgs> = entries
                .into_iter()
                .map(|entry| PullListEntryArgs {
                    deck_card_id: entry.deck_card_id,
                    collection_item_id: entry.collection_item_id,
                    quantity: entry.quantity,
                })
                .collect();
            allocate_deck_pull_list(ctx, &deck_id, &entries).await
        }
    }

    const PULL_LIST: &str = r"
    mutation AllocateDeckPullList($deckId: ID!, $entries: [DeckPullListEntryInput!]!) {
      allocateDeckPullList(deckId: $deckId, entries: $entries) { allocationResult { allocated cards skipped } }
    }";

    #[tokio::test]
    async fn allocate_deck_pull_list_resolver_body() {
        let app = TestApp::new().await;
        let schema = Schema::build(Query, Mutation, EmptySubscription)
            .data(app.state.clone())
            .finish();
        let run = |variables: Value| {
            let schema = schema.clone();
            async move {
                let request = async_graphql::Request::new(PULL_LIST)
                    .variables(async_graphql::Variables::from_json(variables));
                serde_json::to_value(schema.execute(request).await).unwrap()
            }
        };
        app.import_cards(&[fixtures::black_lotus()]).await;
        let copies = item(&app, "scryfall-printing-1", 2, "nonfoil", None).await;
        let d = deck(&app, "Pull List Deck", "brewing").await;
        let card = add_card(
            &app,
            d,
            "oracle-1",
            2,
            "mainboard",
            Some("scryfall-printing-1"),
            "nonfoil",
        )
        .await;
        let entry = |quantity: Value| {
            json!({
                "deckCardId": global_id(NodeKind::DeckCard, card.0).to_string(),
                "collectionItemId": global_id(NodeKind::CollectionItem, copies.0).to_string(),
                "quantity": quantity
            })
        };

        let response = run(json!({"deckId": deck_gid(d), "entries": [entry(json!(0))]})).await;
        assert_eq!(
            error_message(&response),
            "Could not add collection item to deck."
        );

        let response = run(json!({"deckId": deck_gid(d), "entries": [entry(json!(2))]})).await;
        assert_eq!(
            response["data"]["allocateDeckPullList"]["allocationResult"],
            json!({"allocated": 2, "cards": 1, "skipped": 0})
        );
        assert_eq!(
            manavault_allocation::allocation_status(app.db(), card)
                .await
                .unwrap()
                .allocated,
            2
        );

        let response = run(json!({"deckId": deck_gid(d), "entries": [entry(Value::Null)]})).await;
        assert_eq!(
            response["data"]["allocateDeckPullList"]["allocationResult"],
            json!({"allocated": 0, "cards": 0, "skipped": 1})
        );
    }
}
