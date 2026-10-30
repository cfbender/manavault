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
        // As on Scryfall, `c:` means at least these colors and `id:` fits
        // within this identity; `=` is exact.
        ("c:u", vec!["Gold Card", "Time Walk"]),
        ("c=u", vec!["Time Walk"]),
        (
            "id:wu",
            vec!["Black Lotus", "Gold Card", "Plains", "Time Walk"],
        ),
        ("id=wu", vec!["Gold Card"]),
        ("c>=wu", vec!["Gold Card"]),
        ("c<=u", vec!["Black Lotus", "Plains", "Time Walk"]),
        ("c:m", vec!["Gold Card"]),
        ("c:colorless", vec!["Black Lotus", "Plains"]),
        ("id:w", vec!["Black Lotus", "Plains"]),
        ("id=w", vec!["Plains"]),
        ("id>w", vec!["Gold Card"]),
        ("c:2", vec!["Gold Card"]),
        ("c!=u", vec!["Black Lotus", "Gold Card", "Plains"]),
        ("c:blue", vec!["Gold Card", "Time Walk"]),
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

/// A printing with only the fields the reference-syntax test sets.
fn printing(fields: serde_json::Value) -> serde_json::Value {
    merge(
        json!({
            "lang": "en", "games": ["paper"], "finishes": ["nonfoil"], "image_uris": {},
            "legalities": {}, "colors": [], "color_identity": [], "collector_number": "1",
            "rarity": "common", "frame": "2015", "border_color": "black"
        }),
        fields,
    )
}

/// The keywords of <https://scryfall.com/docs/syntax>, over a small catalog
/// where each query picks out cards a near miss would get wrong.
#[tokio::test]
async fn scryfall_reference_syntax_filters_cards() {
    let app = TestApp::new().await;
    let serra = json!({
        "oracle_id": "oracle-serra", "name": "Serra Angel", "type_line": "Creature — Angel",
        "mana_cost": "{3}{W}{W}", "cmc": 5.0, "colors": ["W"], "color_identity": ["W"],
        "power": "4", "toughness": "4", "keywords": ["Flying", "Vigilance"],
        "oracle_text": "Flying, vigilance", "rarity": "uncommon",
        "legalities": {"modern": "legal", "commander": "legal"}
    });
    let serra_alpha = printing(merge(
        serra.clone(),
        json!({"id": "serra-lea", "set": "lea", "set_type": "core", "released_at": "1993-08-05",
               "artist": "Douglas Shuler", "illustration_id": "art-serra-1", "frame": "1993",
               "flavor_text": "Born with wings of light.", "prices": {"usd": "50.00"}}),
    ));
    let serra_m10 = printing(merge(
        serra,
        json!({"id": "serra-m10", "set": "m10", "set_type": "core", "released_at": "2009-07-17",
               "artist": "Greg Staples", "illustration_id": "art-serra-2", "frame": "2003",
               "reprint": true, "prices": {"usd": "0.25", "eur": "0.30"}}),
    ));
    let chancery = printing(json!({
        "id": "chancery-rav", "oracle_id": "oracle-chancery", "name": "Azorius Chancery",
        "type_line": "Land", "color_identity": ["W", "U"], "produced_mana": ["W", "U"],
        "oracle_text": "Azorius Chancery enters tapped.\nWhen Azorius Chancery enters, return a land you control to its owner's hand.\n{T}: Add {W}{U}.",
        "set": "rav", "released_at": "2005-10-07", "watermark": "azorius",
        "legalities": {"commander": "legal", "pauper": "legal"}
    }));
    let finks = printing(json!({
        "id": "finks-shm", "oracle_id": "oracle-finks", "name": "Kitchen Finks",
        "type_line": "Creature — Ouphe", "mana_cost": "{1}{G/W}{G/W}", "cmc": 3.0,
        "colors": ["G", "W"], "color_identity": ["G", "W"], "power": "3", "toughness": "2",
        "keywords": ["Persist"],
        "oracle_text": "When Kitchen Finks enters, you gain 2 life.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)",
        "set": "shm", "released_at": "2008-05-02", "legalities": {"modern": "legal", "legacy": "banned"}
    }));
    let delver = printing(json!({
        "id": "delver-isd", "oracle_id": "oracle-delver", "name": "Delver of Secrets // Insectile Aberration",
        "layout": "transform", "type_line": "Creature — Human Wizard // Creature — Human Insect",
        "cmc": 1.0, "colors": ["U"], "color_identity": ["U"], "set": "isd", "released_at": "2011-09-30",
        "games": ["paper", "mtgo"],
        "card_faces": [
            {"name": "Delver of Secrets", "mana_cost": "{U}", "type_line": "Creature — Human Wizard",
             "oracle_text": "At the beginning of your upkeep, look at the top card of your library.",
             "power": "1", "toughness": "1"},
            {"name": "Insectile Aberration", "mana_cost": "", "type_line": "Creature — Human Insect",
             "oracle_text": "Flying", "power": "3", "toughness": "2", "color_indicator": ["U"]}
        ]
    }));
    let bolt = printing(json!({
        "id": "bolt-2ed", "oracle_id": "oracle-bolt", "name": "Lightning Bolt", "type_line": "Instant",
        "mana_cost": "{R}", "cmc": 1.0, "colors": ["R"], "color_identity": ["R"],
        "oracle_text": "Lightning Bolt deals 3 damage to any target.", "set": "2ed",
        "released_at": "1993-12-01", "frame": "1993", "border_color": "white",
        "games": ["paper", "arena"], "edhrec_rank": 5, "legalities": {"vintage": "legal"}
    }));
    app.import_cards(&[serra_alpha, serra_m10, chancery, finks, delver, bolt])
        .await;
    sqlx::query(
        "INSERT INTO scryfall_sets (code, block_code, parent_set_code) VALUES
         ('rav', 'rav', NULL), ('gpt', 'rav', NULL), ('isd', 'isd', NULL), ('tisd', NULL, 'isd')",
    )
    .execute(app.db())
    .await
    .unwrap();

    let (serra, chancery, finks, delver, bolt) = (
        "Serra Angel",
        "Azorius Chancery",
        "Kitchen Finks",
        "Delver of Secrets // Insectile Aberration",
        "Lightning Bolt",
    );
    let cases: Vec<(&str, Vec<&str>)> = vec![
        // Colors and identity, with nicknames.
        ("id:azorius", vec![chancery, delver, serra]),
        ("id=azorius", vec![chancery]),
        ("c:w t:creature", vec![finks, serra]),
        ("id<=esper t:land", vec![chancery]),
        ("c>=selesnya", vec![finks]),
        ("produces:w", vec![chancery]),
        ("produces=w", vec![]),
        // Stats, compared with numbers or each other; faces count.
        ("pow>tou", vec![finks]),
        ("pt=8", vec![serra]),
        ("pow=1", vec![delver]),
        // Keywords by full name only.
        ("kw:flying", vec![serra]),
        ("kw:fly", vec![]),
        // Mana symbols, hybrid in either order, and devotion.
        ("m:{w/g}", vec![finks]),
        ("m:3W", vec![serra]),
        ("m=3WW", vec![serra]),
        ("m=3W", vec![]),
        ("m<=4WWW", vec![serra]),
        ("devotion:WW", vec![finks, serra]),
        // Oracle text with ~, regexes, flavor, artist, watermark.
        ("o:\"~ enters tapped\"", vec![chancery]),
        ("o:/^when .* you gain/", vec![finks]),
        ("name:/^serra/", vec![serra]),
        ("o:/(unclosed/", vec![]),
        ("ft:wings", vec![serra]),
        ("a:shuler", vec![serra]),
        ("wm:azorius", vec![chancery]),
        ("has:watermark", vec![chancery]),
        // Legality.
        ("f:modern", vec![finks, serra]),
        ("banned:legacy", vec![finks]),
        ("edhrec<10", vec![bolt]),
        // Flags: layouts, derived flags, aliases, not:.
        ("is:transform", vec![delver]),
        ("has:indicator", vec![delver]),
        ("is:karoo", vec![chancery]),
        ("is:frenchvanilla", vec![serra]),
        ("is:hybrid", vec![finks]),
        ("is:spell -t:creature", vec![bolt]),
        ("not:spell", vec![chancery]),
        ("-not:spell t:instant", vec![bolt]),
        // Printing history.
        ("is:reprint", vec![serra]),
        ("new:art e:m10", vec![serra]),
        ("new:rarity e:m10", vec![]),
        ("in:lea in:m10", vec![serra]),
        ("in:arena", vec![bolt]),
        ("prints>=2", vec![serra]),
        ("is:unique t:land", vec![chancery]),
        ("cheapest:usd e:m10", vec![serra]),
        ("cheapest:usd e:lea", vec![]),
        ("eur>0.2", vec![serra]),
        // Dates by year, set code, and now.
        ("year<=1994", vec![bolt, serra]),
        ("date>rav", vec![delver, finks, serra]),
        ("date<=2005-10-07 t:land", vec![chancery]),
        ("date>now", vec![]),
        // Games, frames, borders, set types, blocks, groups, languages.
        ("game:mtgo", vec![delver]),
        ("is:old", vec![bolt, serra]),
        ("frame:2003", vec![serra]),
        ("border:white", vec![bolt]),
        ("st:core", vec![serra]),
        ("b:gpt", vec![chancery]),
        ("g:tisd", vec![delver]),
        ("lang:english t:land", vec![chancery]),
        ("lang:any t:land", vec![chancery]),
        ("lang:ja", vec![]),
        // Display keywords keep results; unstored data matches nothing.
        (
            "t:land unique:prints display:grid prefer:newest include:extras",
            vec![chancery],
        ),
        ("t:land ++", vec![chancery]),
        ("cube:vintage", vec![]),
        ("art:squirrel", vec![]),
    ];
    for (query, expected) in cases {
        assert_eq!(
            names(&app, query, SearchOptions::default()).await,
            expected,
            "{query}"
        );
    }
    assert_eq!(
        names(
            &app,
            "t:creature order:cmc direction:desc",
            SearchOptions::default()
        )
        .await,
        [serra, finks, delver]
    );
}
