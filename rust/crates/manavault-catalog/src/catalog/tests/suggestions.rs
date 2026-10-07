//! Card name suggestions.

use serde_json::{Value, json};

use crate::catalog::invalidate_after_import;
use crate::catalog::search::suggestions::suggest_card_names;
use crate::test_support::TestApp;

fn card(id: &str, oracle_id: &str, name: &str, cn: &str) -> Value {
    json!({
        "id": id, "oracle_id": oracle_id, "name": name, "type_line": "Creature",
        "collector_number": cn, "set": "sug", "set_name": "Suggestion Set", "lang": "en",
        "image_uris": {}, "finishes": ["nonfoil"], "legalities": {}
    })
}

async fn app() -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(&[
        card(
            "scryfall-lightning-bolt",
            "oracle-lightning-bolt",
            "Lightning Bolt",
            "1",
        ),
        card(
            "scryfall-serra-angel",
            "oracle-serra-angel",
            "Serra Angel",
            "2",
        ),
    ])
    .await;
    app
}

async fn import(app: &TestApp, cards: &[Value]) {
    app.import_cards(cards).await;
    invalidate_after_import(&app.state).await;
}

async fn suggest(app: &TestApp, term: &str) -> Vec<String> {
    suggest_card_names(&app.state, term, 5).await.unwrap()
}

#[tokio::test]
async fn fuzzy_matching_resolves_typos() {
    let app = app().await;
    assert_eq!(suggest(&app, "lightning bilt").await, ["Lightning Bolt"]);
    assert_eq!(suggest(&app, "lightnig bolt").await, ["Lightning Bolt"]);
    assert_eq!(suggest(&app, "serra angle").await, ["Serra Angel"]);
    assert_eq!(suggest(&app, "sera angel").await, ["Serra Angel"]);
    assert_eq!(suggest(&app, "ligtnign botl").await, ["Lightning Bolt"]);
    assert_eq!(suggest(&app, "  ").await.len(), 0);
}

#[tokio::test]
async fn token_typo_scoring_ranks_the_intended_name_first() {
    let app = app().await;
    import(
        &app,
        &[card(
            "scryfall-ball-lightning",
            "oracle-ball-lightning",
            "Ball Lightning",
            "3",
        )],
    )
    .await;
    assert_eq!(
        suggest(&app, "ligtnign botl")
            .await
            .first()
            .map(String::as_str),
        Some("Lightning Bolt")
    );
}

#[tokio::test]
async fn exact_and_prefix_matches() {
    let app = app().await;
    assert_eq!(suggest(&app, "lightning bolt").await, ["Lightning Bolt"]);
    assert_eq!(
        suggest(&app, "light").await.first().map(String::as_str),
        Some("Lightning Bolt")
    );
}

#[tokio::test]
async fn stopword_terms_surface_the_exact_card() {
    let app = app().await;
    import(
        &app,
        &[
            card(
                "scryfall-mask-of-memory",
                "oracle-mask-of-memory",
                "Mask of Memory",
                "20",
            ),
            card(
                "scryfall-agent-of-masks",
                "oracle-agent-of-masks",
                "Agent of Masks",
                "21",
            ),
            card(
                "scryfall-aegis-of-the-meek",
                "oracle-aegis-of-the-meek",
                "Aegis of the Meek",
                "22",
            ),
        ],
    )
    .await;
    assert_eq!(suggest(&app, "mask of memory").await, ["Mask of Memory"]);
    assert_eq!(
        suggest(&app, "mask of mem")
            .await
            .first()
            .map(String::as_str),
        Some("Mask of Memory")
    );
    assert_eq!(
        suggest(&app, "mask of memroy")
            .await
            .first()
            .map(String::as_str),
        Some("Mask of Memory")
    );
}

#[tokio::test]
async fn apostrophes_and_diacritics_are_ignored() {
    let app = app().await;
    import(
        &app,
        &[
            card(
                "scryfall-aurelias-fury",
                "oracle-aurelias-fury",
                "Aurelia's Fury",
                "10",
            ),
            card(
                "scryfall-aurelias-vindicator",
                "oracle-aurelias-vindicator",
                "Aurelia's Vindicator",
                "11",
            ),
            card(
                "scryfall-oin-the-brave",
                "oracle-oin-the-brave",
                "Óin the Brave",
                "12",
            ),
        ],
    )
    .await;
    for term in ["aurelia's", "aurelia\u{2019}s", "aurelias"] {
        assert_eq!(
            suggest(&app, term).await.first().map(String::as_str),
            Some("Aurelia's Fury"),
            "{term}"
        );
    }
    assert_eq!(suggest(&app, "Óin the Brave").await, ["Óin the Brave"]);
    assert_eq!(suggest(&app, "Oin the brave").await, ["Óin the Brave"]);
}

#[tokio::test]
async fn flavor_names_suggest_the_canonical_card() {
    let app = app().await;
    let mut homeward = card(
        "scryfall-homeward-path",
        "oracle-homeward-path",
        "Homeward Path",
        "13",
    );
    homeward["flavor_name"] = json!("Pelican Town");
    import(&app, &[homeward]).await;
    assert_eq!(suggest(&app, "Pelican Town").await, ["Homeward Path"]);
}

#[tokio::test]
async fn the_index_is_rebuilt_only_after_invalidation() {
    let app = app().await;
    assert_eq!(suggest(&app, "serra").await, ["Serra Angel"]);
    app.import_cards(&[card(
        "scryfall-serra-avatar",
        "oracle-serra-avatar",
        "Serra Avatar",
        "4",
    )])
    .await;
    assert_eq!(suggest(&app, "serra").await, ["Serra Angel"]);
    invalidate_after_import(&app.state).await;
    assert_eq!(
        suggest(&app, "serra").await,
        ["Serra Angel", "Serra Avatar"]
    );
    assert_eq!(
        suggest_card_names(&app.state, "serra", 1).await.unwrap(),
        ["Serra Angel"]
    );
    // `Enum.take/2` with a negative count takes from the end.
    assert_eq!(
        suggest_card_names(&app.state, "serra", -1).await.unwrap(),
        ["Serra Avatar"]
    );
}
