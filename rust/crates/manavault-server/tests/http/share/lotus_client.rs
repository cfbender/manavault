//! lotus's ManaVault `DecklistClient`/`DeckPager` (what the-gathering and
//! remote ManaVault instances use) against this server's `/share/graphql`,
//! over real HTTP on a random local port.

use std::net::SocketAddr;

use lotus::decklist::{Allowlist, DeckLink, DecklistClient, Source};
use lotus::{Color, Finish, ScryfallId, Zone};

use super::{T, add_card, insert_bulk_cards, insert_deck, share};
use manavault_catalog::testing::fixtures;
use manavault_server::test_support::TestApp;
use manavault_trade::trade::share::ShareKind;

/// Serves the app's router on `127.0.0.1:<random>`; returns the origin.
async fn serve(app: &TestApp) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = app.router();
    tokio::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .unwrap();
    });
    format!("http://{address}")
}

fn client() -> DecklistClient {
    DecklistClient::builder("manavault-test")
        .allowlist(Allowlist::parse(["127.0.0.0/8"]))
        .build()
        .unwrap()
}

async fn fetch(origin: &str, path: &str) -> lotus::decklist::Decklist {
    let link = DeckLink::parse(&format!("{origin}{path}")).unwrap();
    client().fetch(&link).await.unwrap()
}

#[tokio::test]
async fn lotus_fetches_a_paginated_shared_deck() {
    let app = TestApp::new().await;
    app.import_cards(&[
        fixtures::legal_commander_card(),
        fixtures::black_lotus(),
        fixtures::time_walk(),
    ])
    .await;
    let deck = insert_deck(&app, "Lotus Pager", "commander", "active").await;
    add_card(
        &app,
        deck,
        "oracle-test-commander",
        1,
        "commander",
        "nonfoil",
        Some("scryfall-printing-test-commander"),
    )
    .await;
    // No preferred printing: the newest printing stands in.
    add_card(&app, deck, "oracle-1", 1, "mainboard", "foil", None).await;
    add_card(
        &app,
        deck,
        "oracle-2",
        3,
        "considering",
        "etched",
        Some("scryfall-printing-2"),
    )
    .await;
    for oracle_id in insert_bulk_cards(&app, "pager", 600).await {
        add_card(&app, deck, &oracle_id, 1, "mainboard", "nonfoil", None).await;
    }
    let token = share(&app, deck).await;
    let origin = serve(&app).await;

    let list = fetch(&origin, &format!("/share/decks/{token}")).await;
    assert_eq!(list.source, Source::ManaVault);
    assert_eq!(list.id, token);
    assert_eq!(list.url, format!("{origin}/share/decks/{token}"));
    assert_eq!(list.name.as_deref(), Some("Lotus Pager"));
    assert_eq!(list.card_count, Some(602));
    assert_eq!(list.commanders, vec!["Test Commander".to_owned()]);
    assert_eq!(list.color_identity, vec![Color::W]);
    // 603 cards: two pages of at most 500.
    assert_eq!(list.entries.len(), 603);
    let names: std::collections::HashSet<&str> = list
        .entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect();
    assert_eq!(names.len(), 603);

    let find = |name: &str| {
        list.entries
            .iter()
            .find(|entry| entry.name == name)
            .unwrap()
    };
    let commander = find("Test Commander");
    assert_eq!(commander.zone, Zone::Commander);
    assert_eq!(
        commander.scryfall_id,
        Some(ScryfallId::new("scryfall-printing-test-commander"))
    );
    let lotus = find("Black Lotus");
    assert_eq!(lotus.zone, Zone::Mainboard);
    assert_eq!(lotus.finish, Finish::Foil);
    assert_eq!(
        lotus.scryfall_id,
        Some(ScryfallId::new("scryfall-printing-1"))
    );
    let walk = find("Time Walk");
    assert_eq!(walk.zone, Zone::Considering);
    assert_eq!(walk.finish, Finish::Etched);
    assert_eq!(walk.quantity.as_i64(), 3);
    let bulk = find("pager Card 0600");
    assert_eq!(bulk.zone, Zone::Mainboard);
    assert_eq!(bulk.finish, Finish::Nonfoil);
    assert_eq!(bulk.scryfall_id, None);
    assert_eq!(list.playable().count(), 602);

    // A revoked share reads as not found.
    manavault_collection::decks::records::disable_sharing(
        app.db(),
        manavault_collection::decks::DeckId(deck),
    )
    .await
    .unwrap();
    let link = DeckLink::parse(&format!("{origin}/share/decks/{token}")).unwrap();
    assert_eq!(
        client().fetch(&link).await.unwrap_err(),
        lotus::decklist::FetchError::NotFound
    );
}

#[tokio::test]
async fn lotus_fetches_a_shared_want_list_and_trade_binder() {
    let app = TestApp::new().await;
    app.import_cards(&[
        fixtures::black_lotus(),
        fixtures::black_lotus_beta(),
        fixtures::time_walk(),
    ])
    .await;
    let pool = app.db();
    manavault_trade::trade::want::create_by_name(pool, "Time Walk", Some(2))
        .await
        .unwrap();
    manavault_trade::trade::want::create_by_printing(pool, "scryfall-printing-3", Some(1))
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO collection_items (scryfall_id, quantity, for_trade, for_trade_quantity,
           finish, inserted_at, updated_at)
         VALUES ('scryfall-printing-2', 2, 1, 1, 'foil', ?1, ?1)",
    )
    .bind(T)
    .execute(pool)
    .await
    .unwrap();
    let wants = manavault_trade::trade::share::ensure_token(pool, ShareKind::Wants)
        .await
        .unwrap();
    let binder = manavault_trade::trade::share::ensure_token(pool, ShareKind::Binder)
        .await
        .unwrap();
    let origin = serve(&app).await;

    let list = fetch(&origin, &format!("/share/wants/{wants}")).await;
    assert_eq!(list.name.as_deref(), Some("Shared wants"));
    assert_eq!(list.entries.len(), 2);
    let walk = list.entries.iter().find(|e| e.name == "Time Walk").unwrap();
    assert_eq!(walk.quantity.as_i64(), 2);
    assert_eq!(walk.set_code, None);
    let lotus = list
        .entries
        .iter()
        .find(|e| e.name == "Black Lotus")
        .unwrap();
    assert_eq!(lotus.set_code.as_deref(), Some("leb"));
    assert_eq!(lotus.collector_number.as_deref(), Some("233"));

    let list = fetch(&origin, &format!("/share/binder/{binder}")).await;
    assert_eq!(list.name.as_deref(), Some("Trade binder"));
    assert_eq!(list.entries.len(), 1);
    let entry = &list.entries[0];
    assert_eq!(entry.name, "Time Walk");
    assert_eq!(entry.quantity.as_i64(), 1);
    assert_eq!(entry.finish, Finish::Foil);
    assert_eq!(entry.set_code.as_deref(), Some("lea"));
    assert_eq!(entry.collector_number.as_deref(), Some("84"));
    assert_eq!(entry.zone, Zone::Mainboard);
}
