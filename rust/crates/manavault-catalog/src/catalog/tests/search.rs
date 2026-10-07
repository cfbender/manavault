//! `search_cards`: query syntax, shared scalar predicates, name search, and
//! token scopes.

use serde_json::json;

use super::{insert_collection_item, link_token};
use crate::catalog::card::Card;
use crate::catalog::search::cards::{SearchOptions, Sort, TokenScope, search_cards};
use crate::catalog::search::cards_by_name;
use crate::catalog::search::printings::{PrintingFilters, search_printings};
use crate::test_app::TestApp;
use crate::testing::fixtures::{
    black_lotus, black_lotus_beta, card, legal_commander_card, merge, plains, time_walk,
};

async fn names(app: &TestApp, term: &str, options: SearchOptions) -> Vec<String> {
    search_cards(app.db(), term, options)
        .await
        .unwrap()
        .iter()
        .map(|card| card.name.clone())
        .collect()
}

fn sorted(field: &str, direction: &str) -> SearchOptions {
    SearchOptions {
        sort: Sort::parse(Some(field), Some(direction)),
        ..SearchOptions::default()
    }
}

async fn search(app: &TestApp, term: &str) -> Vec<Card> {
    search_cards(app.db(), term, SearchOptions::default())
        .await
        .unwrap()
}

fn set_codes(card: &Card) -> Vec<String> {
    card.printings
        .as_ref()
        .unwrap()
        .iter()
        .map(|printing| printing.set_code.clone())
        .collect()
}

#[tokio::test]
async fn matches_names_with_or_without_diacritics() {
    let app = TestApp::new().await;
    let oin = merge(
        time_walk(),
        json!({"id": "scryfall-oin-the-brave", "oracle_id": "oracle-oin-the-brave", "name": "Óin the Brave", "collector_number": "12"}),
    );
    app.import_cards(&[oin]).await;
    for query in [
        "Óin the Brave",
        "Oin the brave",
        "\"Óin the Brave\"",
        "\"Oin the brave\"",
    ] {
        assert_eq!(
            names(&app, query, SearchOptions::default()).await,
            ["Óin the Brave"],
            "{query}"
        );
    }
}

#[tokio::test]
async fn matches_scryfall_flavor_names() {
    let app = TestApp::new().await;
    let homeward = merge(
        time_walk(),
        json!({"id": "scryfall-homeward-path", "oracle_id": "oracle-homeward-path", "name": "Homeward Path", "flavor_name": "Pelican Town", "collector_number": "1"}),
    );
    app.import_cards(&[homeward]).await;
    for query in ["Pelican Town", "\"Pelican Town\"", "name:\"Pelican Town\""] {
        assert_eq!(
            names(&app, query, SearchOptions::default()).await,
            ["Homeward Path"],
            "{query}"
        );
    }
    let printings = search_printings(
        app.db(),
        &PrintingFilters {
            name: "Pelican Town".to_owned(),
            ..PrintingFilters::default()
        },
        50,
    )
    .await
    .unwrap();
    assert_eq!(printings.len(), 1);
    assert_eq!(printings[0].scryfall_id.as_str(), "scryfall-homeward-path");
    assert_eq!(printings[0].card.as_ref().unwrap().name, "Homeward Path");
}

#[tokio::test]
async fn sorts_by_name_and_offsets_the_window() {
    let app = TestApp::new().await;
    app.import_cards(&[time_walk(), black_lotus(), plains()])
        .await;
    assert_eq!(
        names(&app, "cmc>=0", SearchOptions::default()).await,
        ["Black Lotus", "Plains", "Time Walk"]
    );
    let window = SearchOptions {
        limit: 2,
        offset: 1,
        ..SearchOptions::default()
    };
    assert_eq!(names(&app, "cmc>=0", window).await, ["Plains", "Time Walk"]);
    let past_end = SearchOptions {
        limit: 2,
        offset: 10,
        ..SearchOptions::default()
    };
    assert_eq!(names(&app, "cmc>=0", past_end).await.len(), 0);
}

#[tokio::test]
async fn sorts_by_mana_value_color_and_type() {
    let app = TestApp::new().await;
    app.import_cards(&[time_walk(), black_lotus(), plains()])
        .await;
    assert_eq!(
        names(&app, "cmc>=0", sorted("mana_value", "asc")).await,
        ["Black Lotus", "Plains", "Time Walk"]
    );
    assert_eq!(
        names(&app, "cmc>=0", sorted("mana_value", "desc")).await,
        ["Time Walk", "Black Lotus", "Plains"]
    );
    // Black Lotus has no colors; Time Walk ["U"] sorts before Plains ["W"].
    assert_eq!(
        names(&app, "cmc>=0", sorted("color", "asc")).await,
        ["Black Lotus", "Time Walk", "Plains"]
    );
    assert_eq!(
        names(&app, "cmc>=0", sorted("type", "asc")).await,
        ["Black Lotus", "Plains", "Time Walk"]
    );
}

#[tokio::test]
async fn sorts_by_release_rarity_and_price_across_printings() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), black_lotus_beta(), legal_commander_card()])
        .await;
    assert_eq!(
        names(&app, "cmc>=0", sorted("released", "asc")).await,
        ["Black Lotus", "Test Commander"]
    );
    assert_eq!(
        names(&app, "cmc>=0", sorted("released", "desc")).await,
        ["Test Commander", "Black Lotus"]
    );

    let app = TestApp::new().await;
    let mythic = merge(legal_commander_card(), json!({"rarity": "mythic"}));
    app.import_cards(&[plains(), black_lotus(), mythic]).await;
    assert_eq!(
        names(&app, "cmc>=0", sorted("rarity", "asc")).await,
        ["Plains", "Black Lotus", "Test Commander"]
    );
    assert_eq!(
        names(&app, "cmc>=0", sorted("rarity", "desc")).await,
        ["Test Commander", "Black Lotus", "Plains"]
    );

    let app = TestApp::new().await;
    app.import_cards(&[time_walk(), black_lotus(), plains()])
        .await;
    assert_eq!(
        names(&app, "usd>=1", sorted("price", "desc")).await,
        ["Black Lotus", "Time Walk"]
    );
    assert_eq!(
        names(&app, "usd>=1", sorted("price", "asc")).await,
        ["Time Walk", "Black Lotus"]
    );
}

#[tokio::test]
async fn unknown_sorts_fall_back_to_name() {
    let app = TestApp::new().await;
    app.import_cards(&[time_walk(), black_lotus(), plains()])
        .await;
    assert_eq!(
        names(&app, "cmc>=0", sorted("bogus", "sideways")).await,
        ["Black Lotus", "Plains", "Time Walk"]
    );
    // An unknown field keeps a valid direction.
    assert_eq!(
        names(&app, "cmc>=0", sorted("bogus", "desc")).await,
        ["Time Walk", "Plains", "Black Lotus"]
    );
    assert_eq!(
        Sort::parse(Some(" Mana_Value "), Some(" DESC ")),
        Sort {
            field: crate::catalog::search::cards::SortField::ManaValue,
            descending: true
        }
    );
}

#[tokio::test]
async fn surfaces_matching_printings_first_then_earliest() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), black_lotus_beta()]).await;
    let cards = search(&app, "lotus").await;
    assert_eq!(set_codes(&cards[0]), ["lea", "leb"]);
    let cards = search(&app, "lotus set:leb").await;
    assert_eq!(set_codes(&cards[0]), ["leb", "lea"]);

    let app = TestApp::new().await;
    let cheap_alpha = merge(black_lotus(), json!({"prices": {"usd": "1.00"}}));
    let pricey_beta = merge(black_lotus_beta(), json!({"prices": {"usd": "5.00"}}));
    let pricey_unlimited = merge(
        black_lotus_beta(),
        json!({"id": "scryfall-printing-2ed", "set": "2ed", "set_name": "Unlimited Edition", "released_at": "1993-12-01", "prices": {"usd": "10.00"}}),
    );
    app.import_cards(&[cheap_alpha, pricey_beta, pricey_unlimited])
        .await;
    let cards = search(&app, "set:leb usd>=3").await;
    assert_eq!(set_codes(&cards[0]), ["leb", "lea", "2ed"]);
    let cards = search(&app, "usd>=3").await;
    assert_eq!(set_codes(&cards[0]), ["leb", "2ed", "lea"]);
}

#[tokio::test]
async fn search_results_carry_owned_counts() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), black_lotus_beta()]).await;
    insert_collection_item(&app, "scryfall-printing-3", 2, None).await;
    let list = super::insert_location(&app, "Wishlist", "list").await;
    insert_collection_item(&app, "scryfall-printing-3", 5, Some(list)).await;
    let cards = search(&app, "lotus").await;
    let counts: Vec<(String, i64)> = cards[0]
        .printings
        .as_ref()
        .unwrap()
        .iter()
        .map(|printing| (printing.scryfall_id.to_string(), printing.owned_count))
        .collect();
    assert_eq!(
        counts,
        [
            ("scryfall-printing-1".to_owned(), 0),
            ("scryfall-printing-3".to_owned(), 2)
        ]
    );
}

#[tokio::test]
async fn shared_scalar_predicates_filter_cards() {
    let app = TestApp::new().await;
    let base = json!({
        "type_line": "Artifact", "lang": "en", "image_uris": {}, "finishes": ["nonfoil"], "legalities": {}
    });
    let alpha = merge(
        base.clone(),
        json!({"id": "scryfall-shared-a", "oracle_id": "oracle-shared-a", "name": "Shared Alpha", "cmc": 1.0, "rarity": "rare", "released_at": "2020-06-01", "collector_number": "1", "set": "sha", "set_name": "Shared Set"}),
    );
    let beta = merge(
        base,
        json!({"id": "scryfall-shared-b", "oracle_id": "oracle-shared-b", "name": "Shared Beta", "cmc": 4.0, "rarity": "common", "released_at": "2010-01-01", "collector_number": "2", "set": "shb", "set_name": "Shared Set B"}),
    );
    app.import_cards(&[alpha, beta]).await;
    for (query, expected) in [
        ("mv=1", "Shared Alpha"),
        ("mv>=3", "Shared Beta"),
        ("rarity:rare", "Shared Alpha"),
        ("r>u", "Shared Alpha"),
        ("year>=2015", "Shared Alpha"),
        ("date<2015-01-01", "Shared Beta"),
        ("mv:odd", "Shared Alpha"),
        ("mv:even", "Shared Beta"),
        ("set:shb", "Shared Beta"),
        ("cn>1", "Shared Beta"),
        ("-set:shb", "Shared Alpha"),
    ] {
        assert_eq!(
            names(&app, query, SearchOptions::default()).await,
            [expected],
            "{query}"
        );
    }
    // "Shared Set" is a substring of both set names.
    assert_eq!(
        names(&app, "set:\"shared set\"", SearchOptions::default()).await,
        ["Shared Alpha", "Shared Beta"]
    );
    assert_eq!(
        names(&app, "date<2015-02-30", SearchOptions::default())
            .await
            .len(),
        0
    );
    assert_eq!(
        names(&app, "o:/regex/", SearchOptions::default())
            .await
            .len(),
        0
    );
    assert_eq!(
        names(&app, "artist:someone", SearchOptions::default())
            .await
            .len(),
        0
    );
}

#[tokio::test]
async fn color_text_and_flag_predicates() {
    let app = TestApp::new().await;
    let gold = merge(
        time_walk(),
        json!({"id": "scryfall-gold", "oracle_id": "oracle-gold", "name": "Gold Card", "colors": ["W", "U"], "color_identity": ["W", "U"], "collector_number": "9", "finishes": ["nonfoil", "foil"], "lang": "en", "type_line": "Creature — Human", "oracle_text": "Vigilance", "mana_cost": "{W}{U}"}),
    );
    app.import_cards(&[time_walk(), black_lotus(), plains(), gold])
        .await;
    let all = SearchOptions::default();
    for (query, expected) in [
        // `:` compares colors exactly, as in earlier releases.
        ("c:u", vec!["Time Walk"]),
        ("c=u", vec!["Time Walk"]),
        ("c>=wu", vec!["Gold Card"]),
        ("c<=u", vec!["Black Lotus", "Plains", "Time Walk"]),
        ("c:m", vec!["Gold Card"]),
        ("c:colorless", vec!["Black Lotus", "Plains"]),
        ("id:w", vec!["Plains"]),
        ("id>w", vec!["Gold Card"]),
        ("c:2", vec!["Gold Card"]),
        ("c!=u", vec!["Black Lotus", "Gold Card", "Plains"]),
        ("c:blue", vec!["Time Walk"]),
        ("t:creature", vec!["Gold Card"]),
        ("is:creature", vec!["Gold Card"]),
        ("-t:land cmc=0", vec!["Black Lotus"]),
        ("o:\"extra turn\"", vec!["Time Walk"]),
        ("m:{u}", vec!["Gold Card", "Time Walk"]),
        ("m:{1}", vec!["Time Walk"]),
        ("is:foil", vec!["Gold Card", "Time Walk"]),
        ("not:foil", vec!["Black Lotus", "Plains"]),
        ("is:multicolor", vec!["Gold Card"]),
        ("lang:ja", vec!["Time Walk"]),
        ("lang!=ja", vec!["Black Lotus", "Gold Card", "Plains"]),
        ("!\"black lotus\"", vec!["Black Lotus"]),
        ("!black", vec![]),
        ("walk or plains", vec!["Plains", "Time Walk"]),
        ("(lotus", vec![]),
        ("usd>=100000", vec!["Black Lotus"]),
        // Missing prices compare as 0.
        ("usd<1", vec!["Plains"]),
        ("usd>=5 usd<=5", vec!["Gold Card", "Time Walk"]),
    ] {
        assert_eq!(names(&app, query, all).await, expected, "{query}");
    }
    // An unparseable query matches its whole text as a name.
    let paren = merge(
        black_lotus(),
        json!({"id": "scryfall-paren", "oracle_id": "oracle-paren", "name": "(Paren", "collector_number": "77"}),
    );
    app.import_cards(&[paren]).await;
    assert_eq!(names(&app, "(paren", all).await, ["(Paren"]);
}

#[tokio::test]
async fn allocated_flag_checks_deck_allocations() {
    let app = TestApp::new().await;
    app.import_cards(&[time_walk(), black_lotus()]).await;
    let item = insert_collection_item(&app, "scryfall-printing-1", 1, None).await;
    let deck: i64 = sqlx::query_scalar("INSERT INTO decks (name, inserted_at, updated_at) VALUES ('D', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z') RETURNING id")
        .fetch_one(app.db())
        .await
        .unwrap();
    let deck_card: i64 = sqlx::query_scalar("INSERT INTO deck_cards (deck_id, oracle_id, inserted_at, updated_at) VALUES (?1, 'oracle-1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z') RETURNING id")
        .bind(deck)
        .fetch_one(app.db())
        .await
        .unwrap();
    sqlx::query("INSERT INTO deck_allocations (deck_card_id, collection_item_id, inserted_at, updated_at) VALUES (?1, ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
        .bind(deck_card)
        .bind(item)
        .execute(app.db())
        .await
        .unwrap();
    assert_eq!(
        names(&app, "is:allocated", SearchOptions::default()).await,
        ["Black Lotus"]
    );
    assert_eq!(
        names(&app, "is:unallocated", SearchOptions::default()).await,
        ["Time Walk"]
    );
}

#[tokio::test]
async fn token_scope_excludes_includes_or_restricts_to_tokens() {
    let app = TestApp::new().await;
    let treasure = json!({
        "id": "token-treasure-tlea", "oracle_id": "oracle-treasure", "name": "Treasure",
        "type_line": "Token Artifact — Treasure", "layout": "token", "set": "tlea",
        "set_name": "Alpha Tokens", "set_type": "token", "collector_number": "1", "lang": "en",
        "finishes": ["nonfoil", "foil"], "released_at": "1993-08-05"
    });
    let soldier = merge(
        treasure.clone(),
        json!({"id": "token-soldier-tlea", "oracle_id": "oracle-soldier", "name": "Soldier", "type_line": "Token Creature — Soldier", "collector_number": "2"}),
    );
    app.import_cards(&[black_lotus(), treasure, soldier]).await;
    let scope = |tokens| SearchOptions {
        tokens,
        ..SearchOptions::default()
    };
    assert_eq!(
        names(&app, "", scope(TokenScope::Exclude)).await,
        ["Black Lotus"]
    );
    assert_eq!(
        names(&app, "", scope(TokenScope::Include)).await,
        ["Black Lotus", "Soldier", "Treasure"]
    );
    assert_eq!(
        names(&app, "", scope(TokenScope::Only)).await,
        ["Soldier", "Treasure"]
    );
    link_token(&app, "scryfall-printing-1", "token-treasure-tlea").await;
}

async fn import_named(app: &TestApp, oracle_id: &str, name: &str, extra: serde_json::Value) {
    let card = merge(
        merge(
            time_walk(),
            json!({"id": format!("scryfall-{oracle_id}"), "oracle_id": oracle_id, "name": name, "collector_number": oracle_id}),
        ),
        extra,
    );
    app.import_cards(&[card]).await;
}

#[tokio::test]
async fn cards_by_name_matches_diacritics_faces_and_flavor_names() {
    let app = TestApp::new().await;
    import_named(&app, "oracle-oin-the-brave", "Óin the Brave", json!({})).await;
    let find = |name: &'static str| {
        let pool = app.db().clone();
        async move {
            cards_by_name::find(&pool, name)
                .await
                .unwrap()
                .map(|card| card.name)
        }
    };
    assert_eq!(
        find("Óin the Brave").await.as_deref(),
        Some("Óin the Brave")
    );
    assert_eq!(
        find("Oin the brave").await.as_deref(),
        Some("Óin the Brave")
    );
    assert_eq!(
        find("  ÓIN THE BRAVE  ").await.as_deref(),
        Some("Óin the Brave")
    );
    assert_eq!(find("Oin").await, None);
    assert_eq!(find("").await, None);

    import_named(
        &app,
        "oracle-bala-ged",
        "Bala Ged Recovery // Bala Ged Sanctuary",
        json!({}),
    )
    .await;
    for name in [
        "Bala Ged Recovery",
        "Bala Ged Recovery // Bala Ged Sanctuary",
        "Bala Ged Recovery / Bala Ged Sanctuary",
    ] {
        let found = cards_by_name::find(app.db(), name).await.unwrap().unwrap();
        assert_eq!(found.name, "Bala Ged Recovery // Bala Ged Sanctuary");
    }

    import_named(&app, "oracle-fire", "Fire", json!({})).await;
    import_named(&app, "oracle-fire-ice", "Fire // Ice", json!({})).await;
    let fire = cards_by_name::find(app.db(), "Fire")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(fire.oracle_id.as_str(), "oracle-fire");

    import_named(
        &app,
        "oracle-homeward-path",
        "Homeward Path",
        json!({"flavor_name": "Pelican Town"}),
    )
    .await;
    let found = cards_by_name::find(app.db(), "Pelican Town")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(found.oracle_id.as_str(), "oracle-homeward-path");
    import_named(&app, "oracle-pelican-town", "Pelican Town", json!({})).await;
    let found = cards_by_name::find(app.db(), "Pelican Town")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(found.oracle_id.as_str(), "oracle-pelican-town");

    app.import_cards(&[black_lotus()]).await;
    let batch = cards_by_name::by_names(
        app.db(),
        &[
            "Oin the brave",
            "bLACK loTUS",
            "Bala Ged Recovery",
            "Not A Card",
        ],
    )
    .await
    .unwrap();
    assert_eq!(
        batch[&cards_by_name::key("Oin the brave")].name,
        "Óin the Brave"
    );
    assert_eq!(
        batch[&cards_by_name::key("bLACK loTUS")].name,
        "Black Lotus"
    );
    assert_eq!(
        batch[&cards_by_name::key("Bala Ged Recovery")].name,
        "Bala Ged Recovery // Bala Ged Sanctuary"
    );
    assert_eq!(batch.len(), 4);
}

#[tokio::test]
async fn card_name_lookups_skip_tokens() {
    let app = TestApp::new().await;
    let token = card(
        json!({"id": "token-lotus", "oracle_id": "oracle-token-lotus", "layout": "token", "name": "Lotus Token", "set_type": "token"}),
    );
    app.import_cards(&[token]).await;
    assert!(
        cards_by_name::find(app.db(), "Lotus Token")
            .await
            .unwrap()
            .is_none()
    );
}
