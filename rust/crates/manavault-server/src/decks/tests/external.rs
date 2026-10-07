//! `deck_external_source_test.exs` (domain and GraphQL), against a wiremock
//! Archidekt API. lotus differences: Archidekt zones come from the primary
//! category with the deck's `includedInDeck` flags (the payloads here carry
//! no category metadata, so `Maybeboard`/`Sideboard` are excluded as in
//! Elixir), and a failed first link leaves the deck unlinked.

use lotus::{Finish, Zone};
use serde_json::{Value, json};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::support::*;
use crate::decks::DeckError;
use crate::decks::external::{self, SyncError};
use crate::decks::model::{DeckId, ExternalSource};
use crate::decks::records;
use crate::test_support::TestApp;
use crate::test_support::fixtures::{black_lotus, black_lotus_beta, time_walk};

const URL: &str = "https://archidekt.com/decks/123456/my-deck";

async fn app_with_archidekt() -> (TestApp, MockServer) {
    let server = MockServer::start().await;
    let base = format!("{}/api/decks/", server.uri());
    let moxfield = format!("{}/moxfield/", server.uri());
    let app = TestApp::with_config(|config| {
        config.platform_urls.archidekt_api = base;
        config.platform_urls.moxfield_api = moxfield;
    })
    .await;
    app.import_cards(&[black_lotus(), black_lotus_beta(), time_walk()])
        .await;
    (app, server)
}

fn entry(name: &str, uid: &str, quantity: i64, categories: &[&str], modifier: &str) -> Value {
    json!({
        "quantity": quantity,
        "modifier": modifier,
        "categories": categories,
        "card": {"uid": uid, "oracleCard": {"name": name}}
    })
}

async fn stub(server: &MockServer, cards: Vec<Value>) {
    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/api/decks/123456/"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"name": "Remote", "cards": cards})),
        )
        .mount(server)
        .await;
}

async fn stub_status(server: &MockServer, status: u16) {
    server.reset().await;
    Mock::given(method("GET"))
        .and(path("/api/decks/123456/"))
        .respond_with(ResponseTemplate::new(status).set_body_string("nope"))
        .mount(server)
        .await;
}

#[test]
fn parse_url_canonicalizes_moxfield_and_archidekt_links() {
    let link =
        external::parse_url("https://www.moxfield.com/decks/mAAm0BWxF0OZ0TTF3FsHqg?x=1").unwrap();
    assert_eq!(link.source, ExternalSource::Moxfield);
    assert_eq!(link.id, "mAAm0BWxF0OZ0TTF3FsHqg");
    assert_eq!(
        link.url,
        "https://moxfield.com/decks/mAAm0BWxF0OZ0TTF3FsHqg"
    );
    let link = external::parse_url(&format!(" {URL} ")).unwrap();
    assert_eq!(
        (link.source, link.id.as_str()),
        (ExternalSource::Archidekt, "123456")
    );
    assert_eq!(link.url, "https://archidekt.com/decks/123456");
    for bad in [
        "https://tappedout.net/x",
        "https://moxfield.com/u/me",
        "not a url",
        "",
        "https://example.com/share/decks/AbCdEfGhIjKlMnOpQrStUvWx",
    ] {
        assert!(
            matches!(
                external::parse_url(bad),
                Err(DeckError::Code("invalid_external_url"))
            ),
            "{bad}"
        );
    }
}

#[tokio::test]
async fn link_imports_resolving_printings_and_summing_split_entries() {
    let (app, server) = app_with_archidekt().await;
    stub(
        &server,
        vec![
            entry(
                "Black Lotus",
                "scryfall-printing-3",
                1,
                &["Commander"],
                "Foil",
            ),
            entry("Time Walk", "scryfall-printing-2", 2, &[], "Normal"),
            entry("Time Walk", "scryfall-printing-2", 1, &[], "Normal"),
            entry("Unknown Card", "missing-printing", 1, &[], "Normal"),
        ],
    )
    .await;
    let deck = create_deck(&app, "Linked", None, None).await;
    let synced = external::link(&app.state, deck.id, URL).await.unwrap();
    assert_eq!(synced.unresolved, vec!["Unknown Card"]);
    assert_eq!(synced.deck.external_source, Some(ExternalSource::Archidekt));
    assert_eq!(
        synced.deck.external_url.as_deref(),
        Some("https://archidekt.com/decks/123456")
    );
    assert!(synced.deck.external_synced_at.is_some());
    assert_eq!(synced.deck.external_sync_error, None);
    let cards: Vec<(String, Zone, u32, Finish, Option<String>)> = deck_cards(&app, deck.id)
        .await
        .into_iter()
        .map(|row| {
            (
                row.oracle_id.to_string(),
                row.zone,
                row.quantity.get(),
                row.finish,
                row.preferred_printing_id.map(|id| id.to_string()),
            )
        })
        .collect();
    assert_eq!(
        cards,
        vec![
            (
                "oracle-1".into(),
                Zone::Commander,
                1,
                Finish::Foil,
                Some("scryfall-printing-3".into())
            ),
            (
                "oracle-2".into(),
                Zone::Mainboard,
                3,
                Finish::Nonfoil,
                Some("scryfall-printing-2".into())
            ),
        ]
    );
}

#[tokio::test]
async fn link_falls_back_to_name_resolution() {
    let (app, server) = app_with_archidekt().await;
    stub(
        &server,
        vec![entry("Black Lotus", "not-in-catalog", 1, &[], "Normal")],
    )
    .await;
    let deck = create_deck(&app, "Linked", None, None).await;
    let synced = external::link(&app.state, deck.id, URL).await.unwrap();
    assert_eq!(synced.unresolved.len(), 0);
    let cards = deck_cards(&app, deck.id).await;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].oracle_id.as_str(), "oracle-1");
    assert_eq!(cards[0].preferred_printing_id, None);
}

#[tokio::test]
async fn resync_updates_quantities_moves_zones_removes_cards_and_keeps_allocations() {
    let (app, server) = app_with_archidekt().await;
    let binder = location(&app, "Binder", "binder").await;
    let item = collection_item(
        &app,
        "scryfall-printing-1",
        4,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    stub(
        &server,
        vec![
            entry("Black Lotus", "scryfall-printing-1", 3, &[], "Normal"),
            entry("Time Walk", "scryfall-printing-2", 1, &[], "Normal"),
        ],
    )
    .await;
    let deck = create_deck(&app, "Linked", None, None).await;
    external::link(&app.state, deck.id, URL).await.unwrap();
    let initial = deck_cards(&app, deck.id).await;
    let (lotus, walk) = (initial[0].clone(), initial[1].clone());
    allocate(&app, lotus.id, item, 3).await;

    stub(
        &server,
        vec![
            entry("Black Lotus", "scryfall-printing-3", 2, &[], "Normal"),
            entry(
                "Time Walk",
                "scryfall-printing-2",
                1,
                &["Maybeboard"],
                "Normal",
            ),
        ],
    )
    .await;
    let synced = external::sync(&app.state, deck.id).await.unwrap();
    assert_eq!(synced.unresolved.len(), 0);
    let cards = deck_cards(&app, deck.id).await;
    assert_eq!(cards[0].id, lotus.id);
    assert_eq!(cards[0].quantity.get(), 2);
    assert_eq!(
        cards[0]
            .preferred_printing_id
            .as_ref()
            .map(lotus::ScryfallId::as_str),
        Some("scryfall-printing-1"),
        "the printing stays pinned to the allocated copy"
    );
    assert_eq!((cards[1].id, cards[1].zone), (walk.id, Zone::Considering));
    let allocations = all_allocations(&app).await;
    assert_eq!(allocations.len(), 1);
    assert_eq!(allocations[0].2, 2);
    assert_eq!(location_quantity(&app, binder).await, 2);

    stub(
        &server,
        vec![entry("Time Walk", "scryfall-printing-2", 1, &[], "Normal")],
    )
    .await;
    external::sync(&app.state, deck.id).await.unwrap();
    let cards = deck_cards(&app, deck.id).await;
    assert_eq!(cards.len(), 1);
    assert_eq!(
        (cards[0].oracle_id.as_str(), cards[0].zone),
        ("oracle-2", Zone::Mainboard)
    );
    assert_eq!(all_allocations(&app).await.len(), 0);
    assert_eq!(location_quantity(&app, binder).await, 4);
}

#[tokio::test]
async fn fetch_failures_are_recorded_and_leave_the_decklist_alone() {
    let (app, server) = app_with_archidekt().await;
    stub(
        &server,
        vec![entry(
            "Black Lotus",
            "scryfall-printing-1",
            1,
            &[],
            "Normal",
        )],
    )
    .await;
    let deck = create_deck(&app, "Linked", None, None).await;
    external::link(&app.state, deck.id, URL).await.unwrap();

    stub_status(&server, 404).await;
    let error = external::sync(&app.state, deck.id).await.unwrap_err();
    assert!(matches!(
        error,
        SyncError::Fetch(lotus::decklist::FetchError::NotFound)
    ));
    let row = records::get_deck(app.db(), deck.id).await.unwrap();
    assert_eq!(
        row.external_sync_error.as_deref(),
        Some("The deck was not found; it may be private or deleted.")
    );
    assert_eq!(deck_cards(&app, deck.id).await.len(), 1);

    // lotus reports 401 like 403.
    stub_status(&server, 401).await;
    let error = external::sync(&app.state, deck.id).await.unwrap_err();
    assert_eq!(
        error.graphql_message().as_deref(),
        Some("The deck site refused the request (HTTP 403). Try again later.")
    );
    stub_status(&server, 500).await;
    let error = external::sync(&app.state, deck.id).await.unwrap_err();
    assert_eq!(error.failure_message(), "The deck site returned HTTP 500.");
}

#[tokio::test]
async fn unsupported_links_and_archived_decks_are_rejected() {
    let (app, _server) = app_with_archidekt().await;
    let deck = create_deck(&app, "Linked", None, None).await;
    let error = external::link(&app.state, deck.id, "https://example.com/decks/1")
        .await
        .unwrap_err();
    assert!(matches!(
        error,
        SyncError::Deck(DeckError::Code("invalid_external_url"))
    ));
    assert!(
        records::get_deck(app.db(), deck.id)
            .await
            .unwrap()
            .external_source
            .is_none()
    );
    set_status(&app, deck.id, "archived").await;
    let error = external::link(&app.state, deck.id, URL).await.unwrap_err();
    assert!(matches!(error, SyncError::Deck(DeckError::DeckArchived)));
}

#[tokio::test]
async fn linked_decks_reject_decklist_edits_until_unlinked() {
    let (app, server) = app_with_archidekt().await;
    let binder = location(&app, "Binder", "binder").await;
    let item = collection_item(
        &app,
        "scryfall-printing-1",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    stub(
        &server,
        vec![entry(
            "Black Lotus",
            "scryfall-printing-1",
            1,
            &[],
            "Normal",
        )],
    )
    .await;
    let deck = create_deck(&app, "Linked", None, None).await;
    external::link(&app.state, deck.id, URL).await.unwrap();
    let lotus = deck_cards(&app, deck.id).await.remove(0);
    let linked = |result: Result<_, DeckError>| matches!(result, Err(DeckError::DeckLinked));
    assert!(linked(
        crate::decks::cards::add_card_to_deck(
            app.db(),
            deck.id,
            &by_name("Time Walk", 1, "mainboard")
        )
        .await
        .map(|_| ())
    ));
    assert!(linked(
        crate::decks::decklist::import_decklist(app.db(), deck.id, "1 Time Walk", false, None)
            .await
            .map(|_| ())
    ));
    assert!(linked(
        crate::decks::cards::update_deck_card(
            app.db(),
            lotus.id,
            &crate::decks::cards::DeckCardChanges {
                quantity: Some(Some(2)),
                ..Default::default()
            }
        )
        .await
        .map(|_| ())
    ));
    assert!(linked(
        crate::decks::cards::delete_deck_card(app.db(), lotus.id)
            .await
            .map(|_| ())
    ));
    assert!(linked(
        crate::decks::cards::set_commander(app.db(), lotus.id)
            .await
            .map(|_| ())
    ));
    // Allocation flows still work on linked decks.
    allocate(&app, lotus.id, item, 1).await;

    let unlinked = external::unlink(app.db(), deck.id).await.unwrap();
    assert!(unlinked.external_source.is_none());
    add_card(&app, deck.id, "Time Walk", 1, "mainboard").await;
    assert!(matches!(
        external::unlink(app.db(), deck.id).await,
        Err(DeckError::Code("deck_not_linked"))
    ));
    assert!(matches!(
        external::sync(&app.state, deck.id).await,
        Err(SyncError::Deck(DeckError::Code("deck_not_linked")))
    ));
}

#[tokio::test]
async fn sync_all_syncs_linked_non_archived_decks_only() {
    let (app, server) = app_with_archidekt().await;
    stub(
        &server,
        vec![entry(
            "Black Lotus",
            "scryfall-printing-1",
            1,
            &[],
            "Normal",
        )],
    )
    .await;
    let linked = create_deck(&app, "Linked", None, None).await;
    external::link(&app.state, linked.id, URL).await.unwrap();
    let archived = create_deck(&app, "Archived", None, None).await;
    external::link(&app.state, archived.id, URL).await.unwrap();
    set_status(&app, archived.id, "archived").await;
    create_deck(&app, "Plain", None, None).await;
    let results = external::sync_all(&app.state).await.unwrap();
    let ids: Vec<DeckId> = results.iter().map(|(id, _)| *id).collect();
    assert_eq!(ids, vec![linked.id]);
    assert!(results[0].1.is_ok());
}

#[tokio::test]
async fn the_worker_is_registered_hourly() {
    assert!(
        crate::app::crontab()
            .iter()
            .any(|entry| entry.expression == "0 * * * *" && entry.worker == external::WORKER)
    );
    assert!(
        crate::app::workers()
            .iter()
            .any(|worker| worker.name() == external::WORKER)
    );
}

// --- test/manavault_web/schema/deck_external_source_test.exs ---

const LINK: &str = "mutation Link($id: ID!, $url: String!) {
  linkDeckExternalSource(id: $id, url: $url) {
    unresolved
    deck { id cardCount externalSource externalUrl externalSyncedAt externalSyncError }
  }
}";
const SYNC: &str = "mutation Sync($id: ID!) {
  syncDeckExternalSource(id: $id) { unresolved deck { cardCount externalSyncError } }
}";
const UNLINK: &str = "mutation Unlink($id: ID!) {
  unlinkDeckExternalSource(id: $id) { deck { cardCount externalSource externalUrl } }
}";
const ADD: &str = "mutation AddCard($deckId: ID!, $input: DeckCardInput!) {
  addDeckCard(deckId: $deckId, input: $input) { deckCard { id } }
}";

#[tokio::test]
async fn graphql_links_blocks_edits_resyncs_and_unlinks() {
    let (app, server) = app_with_archidekt().await;
    let deck = create_deck(&app, "Linked API", None, None).await;
    let id = deck_gid(deck.id);
    stub(
        &server,
        vec![
            entry(
                "Black Lotus",
                "unknown-Black Lotus",
                1,
                &["Commander"],
                "Normal",
            ),
            entry("Time Walk", "unknown-Time Walk", 2, &[], "Normal"),
        ],
    )
    .await;
    let data = app.gql_data(LINK, json!({"id": id, "url": URL})).await;
    let link = &data["linkDeckExternalSource"];
    assert_eq!(link["unresolved"], json!([]));
    assert_eq!(link["deck"]["id"], json!(id));
    assert_eq!(link["deck"]["cardCount"], json!(3));
    assert_eq!(link["deck"]["externalSource"], json!("archidekt"));
    assert_eq!(
        link["deck"]["externalUrl"],
        json!("https://archidekt.com/decks/123456")
    );
    assert!(link["deck"]["externalSyncedAt"].is_string());
    assert_eq!(link["deck"]["externalSyncError"], Value::Null);

    let response = app
        .gql(ADD, json!({"deckId": id, "input": {"name": "Time Walk"}}))
        .await;
    assert_eq!(response["data"]["addDeckCard"], Value::Null);
    assert!(error_message(&response).contains("linked to an external deck"));

    stub(
        &server,
        vec![entry("Time Walk", "unknown-Time Walk", 1, &[], "Normal")],
    )
    .await;
    let data = app.gql_data(SYNC, json!({"id": id})).await;
    assert_eq!(
        data["syncDeckExternalSource"],
        json!({"unresolved": [], "deck": {"cardCount": 1, "externalSyncError": null}})
    );
    let data = app.gql_data(UNLINK, json!({"id": id})).await;
    assert_eq!(
        data["unlinkDeckExternalSource"]["deck"],
        json!({"cardCount": 1, "externalSource": null, "externalUrl": null})
    );
    let data = app
        .gql_data(ADD, json!({"deckId": id, "input": {"name": "Black Lotus"}}))
        .await;
    assert!(data["addDeckCard"]["deckCard"]["id"].is_string());
}

#[tokio::test]
async fn graphql_rejects_unsupported_links_and_failed_fetches() {
    let (app, server) = app_with_archidekt().await;
    let deck = create_deck(&app, "Linked API", None, None).await;
    let id = deck_gid(deck.id);
    let response = app
        .gql(LINK, json!({"id": id, "url": "https://tappedout.net/x"}))
        .await;
    assert_eq!(response["data"]["linkDeckExternalSource"], Value::Null);
    assert_eq!(
        error_message(&response),
        "Enter a Moxfield or Archidekt deck link."
    );

    stub_status(&server, 404).await;
    let response = app.gql(LINK, json!({"id": id, "url": URL})).await;
    assert_eq!(response["data"]["linkDeckExternalSource"], Value::Null);
    assert_eq!(
        error_message(&response),
        "That deck was not found; it may be private or deleted."
    );
    let response = app.gql(SYNC, json!({"id": id})).await;
    assert_eq!(response["data"]["syncDeckExternalSource"], Value::Null);
    assert!(error_message(&response).contains("not linked"));
}
