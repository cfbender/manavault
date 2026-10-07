//! Scryfall catalog tests: bulk imports, syncs, and the Scryfall workers.

use std::time::{Duration, Instant};

use lotus::scryfall::ScryfallCard;
use serde_json::{Value, json};
use sqlx::Row as _;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::bulk::tests::{gzip_jsonl, gzip_lines};
use super::import::{self, ImportError, ImportOptions, ImportSummary, OracleTags};
use super::sync::{self, SyncError, SyncOptions, SyncRecord, SyncStatus};
use super::worker;
use crate::jobs::Worker as _;
use crate::test_support::{TestApp, fixtures};

fn merge(mut base: Value, overrides: Value) -> Value {
    if let (Some(base), Value::Object(overrides)) = (base.as_object_mut(), overrides) {
        base.extend(overrides);
    }
    base
}

fn renamed_lotus() -> Value {
    fixtures::card(json!({
        "name": "Black Lotus Updated",
        "prices": {"usd": "1.00"},
        "rulings_uri": "https://api.scryfall.com/cards/oracle-1/rulings-updated"
    }))
}

/// Scryfall's `reversible_card` layout: the name is "A // A", and the oracle
/// id and type/cost fields live only on the faces.
fn reversible_lotus() -> Value {
    let lotus = fixtures::black_lotus();
    let face: serde_json::Map<String, Value> = [
        "oracle_id",
        "name",
        "type_line",
        "mana_cost",
        "cmc",
        "oracle_text",
    ]
    .iter()
    .map(|key| ((*key).to_owned(), lotus[*key].clone()))
    .collect();
    let mut card = lotus;
    if let Some(map) = card.as_object_mut() {
        for key in ["oracle_id", "type_line", "mana_cost", "cmc", "oracle_text"] {
            map.remove(key);
        }
    }
    merge(
        card,
        json!({
            "id": "scryfall-reversible-1", "name": "Black Lotus // Black Lotus",
            "layout": "reversible_card", "set": "leb", "set_name": "Limited Edition Beta",
            "collector_number": "351", "card_faces": [face.clone(), face]
        }),
    )
}

fn scryfall_tag(attrs: Value) -> Value {
    merge(
        json!({
            "object": "tag", "id": "tag-default", "slug": "default", "label": "Default",
            "type": "function", "description": null, "parent_ids": [], "child_ids": [],
            "aliases": [], "taggings": []
        }),
        attrs,
    )
}

fn cards(values: &[Value]) -> Vec<ScryfallCard> {
    values
        .iter()
        .map(|value| serde_json::from_value(value.clone()).unwrap())
        .collect()
}

async fn import(app: &TestApp, values: &[Value]) -> ImportSummary {
    import::import_cards(app.db(), cards(values)).await.unwrap()
}

async fn import_with_tags(app: &TestApp, values: &[Value], tags: Vec<Value>) -> ImportSummary {
    import::import_cards_with(
        app.db(),
        cards(values),
        ImportOptions {
            oracle_tags: OracleTags::Replace(tags),
            ..ImportOptions::default()
        },
    )
    .await
    .unwrap()
}

async fn count(app: &TestApp, table: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
        .fetch_one(app.db())
        .await
        .unwrap()
}

async fn card_column<T>(app: &TestApp, oracle_id: &str, column: &str) -> T
where
    T: for<'r> sqlx::Decode<'r, sqlx::Sqlite> + sqlx::Type<sqlx::Sqlite> + Send + Unpin,
{
    // NUMERIC columns store integral reals as integers.
    let column = match column {
        "cmc" | "edhrec_saltiness" => format!("CAST({column} AS REAL)"),
        other => other.to_owned(),
    };
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {column} FROM scryfall_cards WHERE oracle_id = ?1"
    )))
    .bind(oracle_id)
    .fetch_one(app.db())
    .await
    .unwrap()
}

async fn printing_column<T>(app: &TestApp, scryfall_id: &str, column: &str) -> T
where
    T: for<'r> sqlx::Decode<'r, sqlx::Sqlite> + sqlx::Type<sqlx::Sqlite> + Send + Unpin,
{
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {column} FROM scryfall_printings WHERE scryfall_id = ?1"
    )))
    .bind(scryfall_id)
    .fetch_one(app.db())
    .await
    .unwrap()
}

async fn exists(app: &TestApp, table: &str, column: &str, id: &str) -> bool {
    let found: Option<i64> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT 1 FROM {table} WHERE {column} = ?1"
    )))
    .bind(id)
    .fetch_optional(app.db())
    .await
    .unwrap();
    found.is_some()
}

fn themes(json: &str) -> Vec<String> {
    serde_json::from_str(json).unwrap()
}

// ---- imports ----

#[tokio::test]
async fn import_stores_identities_and_printings_and_updates_on_rerun() {
    let app = TestApp::new().await;
    let card = merge(
        fixtures::black_lotus(),
        json!({"illustration_id": "illustration-top-level", "tcgplayer_id": 1234}),
    );
    let summary = import(&app, &[card]).await;
    assert_eq!((summary.cards_count, summary.printings_count), (1, 1));

    let row = sqlx::query("SELECT name, color_identity, game_changer, edhrec_rank, rulings_uri, normalized_name, deck_category, deck_themes, oracle_tags FROM scryfall_cards WHERE oracle_id = 'oracle-1'")
        .fetch_one(app.db())
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>("name"), "Black Lotus");
    assert_eq!(row.get::<String, _>("color_identity"), "[]");
    assert!(!row.get::<bool, _>("game_changer"));
    assert_eq!(row.get::<Option<i64>, _>("edhrec_rank"), Some(1));
    assert_eq!(
        row.get::<Option<String>, _>("rulings_uri").as_deref(),
        Some("https://api.scryfall.com/cards/oracle-1/rulings")
    );
    assert_eq!(row.get::<String, _>("normalized_name"), "black lotus");
    assert_eq!(row.get::<String, _>("deck_category"), "other");
    assert_eq!(row.get::<String, _>("deck_themes"), r#"["artifact"]"#);
    assert_eq!(row.get::<String, _>("oracle_tags"), "[]");

    let row = sqlx::query("SELECT oracle_id, set_code, collector_number, illustration_id, released_at, tcgplayer_id, tcgplayer_etched_id, prices FROM scryfall_printings WHERE scryfall_id = 'scryfall-printing-1'")
        .fetch_one(app.db())
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>("oracle_id"), "oracle-1");
    assert_eq!(row.get::<String, _>("set_code"), "lea");
    assert_eq!(row.get::<String, _>("collector_number"), "232");
    assert_eq!(
        row.get::<Option<String>, _>("illustration_id").as_deref(),
        Some("illustration-top-level")
    );
    assert_eq!(
        row.get::<Option<String>, _>("released_at").as_deref(),
        Some("1993-08-05")
    );
    assert_eq!(row.get::<Option<i64>, _>("tcgplayer_id"), Some(1234));
    assert_eq!(row.get::<Option<i64>, _>("tcgplayer_etched_id"), None);

    let rerun = merge(
        renamed_lotus(),
        json!({"game_changer": true, "illustration_id": "illustration-updated", "tcgplayer_etched_id": 5678}),
    );
    let summary = import(&app, &[rerun]).await;
    assert_eq!((summary.cards_count, summary.printings_count), (1, 1));
    assert_eq!(count(&app, "scryfall_cards").await, 1);
    assert_eq!(count(&app, "scryfall_printings").await, 1);
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "name").await,
        "Black Lotus Updated"
    );
    assert!(card_column::<bool>(&app, "oracle-1", "game_changer").await);
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "rulings_uri").await,
        "https://api.scryfall.com/cards/oracle-1/rulings-updated"
    );
    let prices: String = printing_column(&app, "scryfall-printing-1", "prices").await;
    assert_eq!(
        serde_json::from_str::<Value>(&prices).unwrap(),
        json!({"usd": "1.00"})
    );
    assert_eq!(
        printing_column::<String>(&app, "scryfall-printing-1", "illustration_id").await,
        "illustration-updated"
    );
    assert_eq!(
        printing_column::<Option<i64>>(&app, "scryfall-printing-1", "tcgplayer_id").await,
        None
    );
    assert_eq!(
        printing_column::<Option<i64>>(&app, "scryfall-printing-1", "tcgplayer_etched_id").await,
        Some(5678)
    );
}

#[tokio::test]
async fn import_uses_the_first_face_illustration_when_the_top_level_is_absent() {
    let app = TestApp::new().await;
    let card = fixtures::card(json!({"card_faces": [
        {"name": "a", "illustration_id": "front-illustration"},
        {"name": "b", "illustration_id": "back-illustration"}
    ]}));
    import(&app, &[card]).await;
    assert_eq!(
        printing_column::<String>(&app, "scryfall-printing-1", "illustration_id").await,
        "front-illustration"
    );
}

#[tokio::test]
async fn import_takes_a_reversible_cards_identity_from_its_first_face() {
    let app = TestApp::new().await;
    let summary = import(&app, &[reversible_lotus()]).await;
    assert_eq!((summary.cards_count, summary.printings_count), (1, 1));
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "name").await,
        "Black Lotus"
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "type_line").await,
        "Artifact"
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "mana_cost").await,
        "{0}"
    );
    assert_eq!(
        printing_column::<String>(&app, "scryfall-reversible-1", "oracle_id").await,
        "oracle-1"
    );
    assert_eq!(
        printing_column::<String>(&app, "scryfall-reversible-1", "collector_number").await,
        "351"
    );
}

#[tokio::test]
async fn import_keeps_the_canonical_card_whichever_order_a_reversible_printing_arrives() {
    for order in [
        [reversible_lotus(), fixtures::black_lotus()],
        [fixtures::black_lotus(), reversible_lotus()],
    ] {
        let app = TestApp::new().await;
        import(&app, &order).await;
        assert_eq!(
            card_column::<String>(&app, "oracle-1", "name").await,
            "Black Lotus"
        );
        assert_eq!(
            card_column::<String>(&app, "oracle-1", "type_line").await,
            "Artifact"
        );
        assert_eq!(count(&app, "scryfall_printings").await, 2);
    }
}

#[tokio::test]
async fn import_excludes_memorabilia_and_token_set_cards_that_are_not_tokens() {
    let app = TestApp::new().await;
    let memorabilia = fixtures::card(json!({
        "id": "scryfall-memorabilia", "set": "alea", "set_name": "Alpha Art Series", "set_type": "memorabilia"
    }));
    let emblem = fixtures::card(json!({
        "id": "scryfall-emblem", "oracle_id": "oracle-emblem", "name": "Lotus Emblem", "layout": "emblem",
        "set": "tlea", "set_name": "Alpha Tokens", "set_type": "token"
    }));
    let summary = import(&app, &[fixtures::black_lotus(), memorabilia, emblem]).await;
    assert_eq!(
        (
            summary.cards_count,
            summary.printings_count,
            summary.source_count
        ),
        (2, 2, 3)
    );
    assert!(
        exists(
            &app,
            "scryfall_printings",
            "scryfall_id",
            "scryfall-printing-1"
        )
        .await
    );
    assert!(
        !exists(
            &app,
            "scryfall_printings",
            "scryfall_id",
            "scryfall-memorabilia"
        )
        .await
    );
    assert!(exists(&app, "scryfall_printings", "scryfall_id", "scryfall-emblem").await);
    assert_eq!(
        card_column::<String>(&app, "oracle-emblem", "layout").await,
        "emblem"
    );
}

#[tokio::test]
async fn import_keeps_bare_card_helper_tokens_but_not_inserts_or_counter_cards() {
    let app = TestApp::new().await;
    let bare = |id: &str, overrides: Value| {
        merge(
            fixtures::card(json!({
                "id": id, "oracle_id": format!("oracle-{id}"), "type_line": "Card", "layout": "token",
                "set": "tlea", "set_name": "Alpha Tokens", "set_type": "token"
            })),
            overrides,
        )
    };
    let adventure = bare("on-an-adventure", json!({"name": "On an Adventure"}));
    let day_night = bare(
        "day-night",
        json!({"name": "Day // Night", "type_line": "Card // Card", "layout": "double_faced_token"}),
    );
    let excluded = [
        bare(
            "decklist",
            json!({"name": "Aeo Paquette Decklist", "set": "wc04", "set_type": "memorabilia"}),
        ),
        bare(
            "booster-blitz",
            json!({"name": "Booster Blitz", "set": "mone", "set_type": "minigame"}),
        ),
        bare("checklist", json!({"name": "Innistrad Checklist"})),
        bare(
            "substitute",
            json!({"name": "Double-Faced Substitute Card", "layout": "normal"}),
        ),
        bare(
            "poison",
            json!({"name": "Poison Counter", "layout": "normal"}),
        ),
        bare(
            "red-mana",
            json!({"name": "Red Mana", "layout": "normal", "set": "sld", "set_type": "box"}),
        ),
    ];
    let mut all = vec![adventure, day_night];
    all.extend(excluded.iter().cloned());
    let summary = import(&app, &all).await;
    assert_eq!(
        (
            summary.cards_count,
            summary.printings_count,
            summary.source_count
        ),
        (2, 2, 8)
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-on-an-adventure", "layout").await,
        "token"
    );
    assert!(exists(&app, "scryfall_printings", "scryfall_id", "day-night").await);
    for card in excluded {
        let id = card["id"].as_str().unwrap();
        assert!(
            !exists(&app, "scryfall_printings", "scryfall_id", id).await,
            "{id}"
        );
    }
}

#[tokio::test]
async fn import_keeps_tokens_records_layouts_and_links_producers_to_tokens() {
    let app = TestApp::new().await;
    let producer = fixtures::card(json!({"layout": "normal", "all_parts": [
        {"component": "combo_piece", "id": "scryfall-printing-1", "name": "Black Lotus"},
        {"component": "token", "id": "scryfall-treasure-token", "name": "Treasure"},
        {"component": "token", "id": "scryfall-missing-token", "name": "Missing"}
    ]}));
    let token = fixtures::card(json!({
        "id": "scryfall-treasure-token", "oracle_id": "oracle-treasure", "name": "Treasure",
        "type_line": "Token Artifact — Treasure", "layout": "token", "set": "tlea",
        "set_name": "Alpha Tokens", "set_type": "token",
        "all_parts": [
            {"component": "token", "id": "scryfall-treasure-token", "name": "Treasure"},
            {"component": "combo_piece", "id": "scryfall-printing-1", "name": "Black Lotus"}
        ]
    }));
    let summary = import(&app, &[producer.clone(), token]).await;
    assert_eq!((summary.cards_count, summary.printings_count), (2, 2));
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "layout").await,
        "normal"
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-treasure", "layout").await,
        "token"
    );

    // Links only point from producers to tokens, never the other way round.
    let links: Vec<(String, String)> = sqlx::query_as(
        "SELECT scryfall_id, token_scryfall_id FROM scryfall_card_tokens ORDER BY token_scryfall_id",
    )
    .fetch_all(app.db())
    .await
    .unwrap();
    assert_eq!(
        links,
        vec![
            (
                "scryfall-printing-1".to_owned(),
                "scryfall-missing-token".to_owned()
            ),
            (
                "scryfall-printing-1".to_owned(),
                "scryfall-treasure-token".to_owned()
            ),
        ]
    );

    // A rerun that drops a link removes it.
    import(&app, &[merge(producer, json!({"all_parts": []}))]).await;
    assert_eq!(count(&app, "scryfall_card_tokens").await, 0);
}

#[tokio::test]
async fn import_only_writes_rows_whose_stored_data_changed() {
    let app = TestApp::new().await;
    let producer = fixtures::card(json!({"all_parts": [
        {"component": "token", "id": "scryfall-treasure-token", "name": "Treasure"},
        {"component": "token", "id": "scryfall-clue-token", "name": "Clue"}
    ]}));
    let walk = fixtures::time_walk();
    let summary = import(&app, &[producer.clone(), walk.clone()]).await;
    assert_eq!(
        (summary.written_cards_count, summary.written_printings_count),
        (2, 2)
    );
    assert_eq!(summary.committed_batches, 1);

    // An identical rerun reads but never writes, so it never takes the lock.
    let summary = import(&app, &[producer.clone(), walk.clone()]).await;
    assert_eq!((summary.cards_count, summary.printings_count), (2, 2));
    assert_eq!(
        (summary.written_cards_count, summary.written_printings_count),
        (0, 0)
    );
    assert_eq!((summary.committed_batches, summary.relinked_count), (0, 0));

    // A price change rewrites that printing only; its card and links are untouched.
    let mut repriced = producer.clone();
    repriced["prices"]["usd"] = json!("99.00");
    let summary = import(&app, &[repriced.clone(), walk.clone()]).await;
    assert_eq!(
        (summary.written_cards_count, summary.written_printings_count),
        (0, 1)
    );
    assert_eq!(summary.relinked_count, 0);
    let prices: String = printing_column(&app, "scryfall-printing-1", "prices").await;
    assert_eq!(
        serde_json::from_str::<Value>(&prices).unwrap(),
        json!({"usd": "99.00"})
    );

    // Dropping a token link relinks that printing without touching card rows.
    let unlinked = merge(
        repriced,
        json!({"all_parts": [producer["all_parts"][0].clone()]}),
    );
    let summary = import(&app, &[unlinked.clone(), walk.clone()]).await;
    assert_eq!(
        (summary.written_cards_count, summary.written_printings_count),
        (0, 0)
    );
    assert_eq!((summary.relinked_count, summary.committed_batches), (1, 1));
    let tokens: Vec<String> =
        sqlx::query_scalar("SELECT token_scryfall_id FROM scryfall_card_tokens")
            .fetch_all(app.db())
            .await
            .unwrap();
    assert_eq!(tokens, vec!["scryfall-treasure-token"]);

    // Oracle-level changes rewrite the card only.
    let summary = import(&app, &[merge(unlinked, json!({"edhrec_rank": 7})), walk]).await;
    assert_eq!(
        (summary.written_cards_count, summary.written_printings_count),
        (1, 0)
    );
    assert_eq!(card_column::<i64>(&app, "oracle-1", "edhrec_rank").await, 7);
}

#[tokio::test]
async fn import_ignores_rulings_uri_and_other_columns_in_the_diff() {
    let app = TestApp::new().await;
    import(&app, &[fixtures::black_lotus()]).await;
    sqlx::query("UPDATE scryfall_cards SET edhrec_saltiness = 2.5, edhrec_commander_rank = 3")
        .execute(app.db())
        .await
        .unwrap();
    let other_printing =
        fixtures::card(json!({"rulings_uri": "https://api.scryfall.com/cards/other/rulings"}));
    let summary = import(&app, &[other_printing]).await;
    assert_eq!(summary.written_cards_count, 0);
    // Columns the import does not own survive a card rewrite.
    import(&app, &[renamed_lotus()]).await;
    assert_eq!(
        card_column::<f64>(&app, "oracle-1", "edhrec_saltiness").await,
        2.5
    );
    assert_eq!(
        card_column::<i64>(&app, "oracle-1", "edhrec_commander_rank").await,
        3
    );
}

#[tokio::test]
async fn import_skips_oracle_tag_columns_in_the_diff_when_tags_are_not_replaced() {
    let app = TestApp::new().await;
    let skip = || ImportOptions {
        oracle_tags: OracleTags::Skip,
        ..ImportOptions::default()
    };
    import::import_cards_with(app.db(), cards(&[fixtures::black_lotus()]), skip())
        .await
        .unwrap();
    sqlx::query(r#"UPDATE scryfall_cards SET oracle_tags = '["ramp"]', deck_category = 'ramp'"#)
        .execute(app.db())
        .await
        .unwrap();
    let summary = import::import_cards_with(app.db(), cards(&[fixtures::black_lotus()]), skip())
        .await
        .unwrap();
    assert_eq!(
        (summary.written_cards_count, summary.committed_batches),
        (0, 0)
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "deck_category").await,
        "ramp"
    );

    // A real change under Skip still leaves the tag columns alone.
    import::import_cards_with(app.db(), cards(&[renamed_lotus()]), skip())
        .await
        .unwrap();
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "deck_category").await,
        "ramp"
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "name").await,
        "Black Lotus Updated"
    );
}

#[tokio::test]
async fn import_releases_the_write_lock_between_batches() {
    let app = TestApp::new().await;
    let cards: Vec<Value> = (1..=205)
        .map(|index| {
            merge(
                fixtures::time_walk(),
                json!({"id": format!("scryfall-batched-{index}"), "oracle_id": format!("oracle-batched-{index}"),
                       "name": format!("Batched Card {index}"), "collector_number": index.to_string()}),
            )
        })
        .collect();
    let started = Instant::now();
    let summary = import(&app, &cards).await;
    assert_eq!((summary.cards_count, summary.printings_count), (205, 205));
    assert_eq!(summary.committed_batches, 2);
    // The second BEGIN waits out the commit gap after the first commit.
    assert!(started.elapsed() >= Duration::from_millis(75));
    assert_eq!(count(&app, "scryfall_cards").await, 205);
    assert_eq!(count(&app, "scryfall_printings").await, 205);
}

#[tokio::test]
async fn import_rolls_back_every_write_in_a_failed_batch() {
    let app = TestApp::new().await;
    sqlx::raw_sql(
        "CREATE TRIGGER fail_catalog_batch BEFORE INSERT ON scryfall_printings
         WHEN NEW.scryfall_id = 'scryfall-atomic-batch'
         BEGIN SELECT RAISE(ABORT, 'catalog batch test failure'); END",
    )
    .execute(app.db())
    .await
    .unwrap();
    let card = merge(
        fixtures::time_walk(),
        json!({"id": "scryfall-atomic-batch", "oracle_id": "oracle-atomic-batch", "name": "Atomic Batch Card"}),
    );
    let error = import::import_cards(app.db(), cards(&[card]))
        .await
        .unwrap_err();
    assert!(matches!(error, ImportError::Db(_)));
    assert!(error.to_string().contains("catalog batch test failure"));
    assert!(!exists(&app, "scryfall_cards", "oracle_id", "oracle-atomic-batch").await);
}

#[tokio::test]
async fn import_stores_selected_oracle_tags_and_derives_deck_grouping() {
    let app = TestApp::new().await;
    let tags = vec![
        scryfall_tag(
            json!({"id": "tag-ramp", "slug": "ramp", "label": "Ramp", "type": "function",
            "taggings": [{"oracle_id": "oracle-1", "weight": 0.93, "annotation": "fast mana"}]}),
        ),
        scryfall_tag(
            json!({"id": "tag-removal", "slug": "spot-removal", "label": "Spot Removal", "type": "oracle",
            "taggings": [{"oracle_id": "oracle-2", "weight": 0.81, "annotation": "answers a permanent"}]}),
        ),
        scryfall_tag(
            json!({"id": "tag-art", "slug": "flower", "label": "Flower", "type": "artwork",
            "taggings": [{"illustration_id": "illustration-1", "weight": 0.99, "annotation": "visible in the art"}]}),
        ),
    ];
    let summary = import_with_tags(
        &app,
        &[fixtures::black_lotus(), fixtures::time_walk()],
        tags,
    )
    .await;
    assert_eq!((summary.cards_count, summary.printings_count), (2, 2));

    assert_eq!(
        card_column::<String>(&app, "oracle-1", "deck_category").await,
        "ramp"
    );
    let lotus_tags: Value =
        serde_json::from_str(&card_column::<String>(&app, "oracle-1", "oracle_tags").await)
            .unwrap();
    assert_eq!(
        lotus_tags,
        json!([{"id": "tag-ramp", "slug": "ramp", "label": "Ramp", "weight": 0.93, "annotation": "fast mana"}])
    );
    let lotus_themes = themes(&card_column::<String>(&app, "oracle-1", "deck_themes").await);
    assert!(lotus_themes.contains(&"ramp".to_owned()));
    assert!(lotus_themes.contains(&"artifact".to_owned()));
    assert!(!lotus_themes.contains(&"flower".to_owned()));

    assert_eq!(
        card_column::<String>(&app, "oracle-2", "deck_category").await,
        "targeted_disruption"
    );
    let walk_tags: Value =
        serde_json::from_str(&card_column::<String>(&app, "oracle-2", "oracle_tags").await)
            .unwrap();
    assert_eq!(
        walk_tags,
        json!([{"id": "tag-removal", "slug": "spot-removal", "label": "Spot Removal", "weight": 0.81, "annotation": "answers a permanent"}])
    );
    let walk_themes = themes(&card_column::<String>(&app, "oracle-2", "deck_themes").await);
    assert_eq!(walk_themes, vec!["removal", "sorcery"]);
}

#[tokio::test]
async fn import_derives_themes_from_inherited_tag_parents() {
    let app = TestApp::new().await;
    let weftwalking = fixtures::card(json!({
        "id": "scryfall-weftwalking", "oracle_id": "oracle-weftwalking", "name": "Weftwalking",
        "type_line": "Enchantment"
    }));
    let tags = vec![
        scryfall_tag(
            json!({"id": "tag-card-advantage", "slug": "card-advantage", "label": "card advantage", "type": "oracle"}),
        ),
        scryfall_tag(
            json!({"id": "tag-draw", "slug": "draw", "label": "draw", "type": "oracle", "parent_ids": ["tag-card-advantage"]}),
        ),
        scryfall_tag(
            json!({"id": "tag-burst-draw", "slug": "burst-draw", "label": "burst draw", "type": "oracle",
            "parent_ids": ["tag-draw"], "taggings": [{"oracle_id": "oracle-weftwalking", "weight": "median"}]}),
        ),
        scryfall_tag(
            json!({"id": "tag-recursion", "slug": "recursion", "label": "recursion", "type": "oracle"}),
        ),
        scryfall_tag(
            json!({"id": "tag-restock", "slug": "restock", "label": "restock", "type": "oracle", "parent_ids": ["tag-recursion"]}),
        ),
        scryfall_tag(
            json!({"id": "tag-restock-all", "slug": "restock-all", "label": "restock-all", "type": "oracle",
            "parent_ids": ["tag-restock"], "taggings": [{"oracle_id": "oracle-weftwalking", "weight": "median"}]}),
        ),
    ];
    import_with_tags(&app, &[weftwalking], tags).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-weftwalking", "deck_category").await,
        "card_advantage"
    );
    assert_eq!(
        themes(&card_column::<String>(&app, "oracle-weftwalking", "deck_themes").await),
        vec!["card_advantage", "recursion", "enchantment"]
    );
    let slugs: Vec<String> = serde_json::from_str::<Vec<Value>>(
        &card_column::<String>(&app, "oracle-weftwalking", "oracle_tags").await,
    )
    .unwrap()
    .into_iter()
    .map(|tag| tag["slug"].as_str().unwrap().to_owned())
    .collect();
    assert_eq!(slugs, vec!["burst-draw", "restock-all"]);
}

fn instant(id: &str, name: &str) -> Value {
    merge(
        fixtures::time_walk(),
        json!({"id": format!("scryfall-{id}"), "oracle_id": format!("oracle-{id}"), "name": name,
               "type_line": "Instant", "collector_number": id}),
    )
}

fn function_tag(id: &str, slug: &str, parents: &[&str], oracle_ids: &[&str]) -> Value {
    scryfall_tag(json!({
        "id": id, "slug": slug, "label": slug, "type": "function", "parent_ids": parents,
        "taggings": oracle_ids.iter().map(|oracle_id| json!({"oracle_id": oracle_id, "weight": "median"})).collect::<Vec<_>>()
    }))
}

#[tokio::test]
async fn import_scores_category_by_tag_count_before_priority() {
    let app = TestApp::new().await;
    let card = instant("path-to-exile", "Path to Exile");
    let o = ["oracle-path-to-exile"];
    let tags = vec![
        function_tag("tag-ramp", "ramp", &[], &[]),
        function_tag("tag-land-ramp", "land-ramp", &["tag-ramp"], &o),
        function_tag("tag-removal", "removal", &[], &[]),
        function_tag(
            "tag-removal-creature",
            "removal-creature",
            &["tag-removal"],
            &o,
        ),
        function_tag("tag-removal-exile", "removal-exile", &["tag-removal"], &o),
        function_tag("tag-spot-removal", "spot-removal", &["tag-removal"], &o),
        function_tag("tag-tutor", "tutor", &[], &[]),
        function_tag(
            "tag-tutor-land-basic",
            "tutor-land-basic",
            &["tag-tutor"],
            &o,
        ),
        function_tag(
            "tag-tutor-land-to-battlefield",
            "tutor-land-to-battlefield",
            &["tag-tutor"],
            &o,
        ),
    ];
    import_with_tags(&app, &[card], tags).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-path-to-exile", "deck_category").await,
        "targeted_disruption"
    );
    assert_eq!(
        themes(&card_column::<String>(&app, "oracle-path-to-exile", "deck_themes").await),
        vec!["removal", "ramp", "tutor", "instant"]
    );
}

#[tokio::test]
async fn import_uses_category_priority_only_to_break_ties() {
    let app = TestApp::new().await;
    let card = instant("even-ramp-removal", "Even Ramp Removal");
    let o = ["oracle-even-ramp-removal"];
    let tags = vec![
        function_tag("tag-land-ramp", "land-ramp", &[], &o),
        function_tag("tag-spot-removal", "spot-removal", &[], &o),
    ];
    import_with_tags(&app, &[card], tags).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-even-ramp-removal", "deck_category").await,
        "ramp"
    );
    assert_eq!(
        themes(&card_column::<String>(&app, "oracle-even-ramp-removal", "deck_themes").await),
        vec!["ramp", "removal", "instant"]
    );
}

#[tokio::test]
async fn import_categorizes_single_card_disruption_beyond_spot_removal() {
    let app = TestApp::new().await;
    let wasteland = merge(
        fixtures::plains(),
        json!({"id": "scryfall-wasteland", "oracle_id": "oracle-wasteland", "name": "Wasteland", "collector_number": "wasteland"}),
    );
    let counterspell = instant("counterspell", "Counterspell");
    let maneuver = instant("flawless-maneuver", "Flawless Maneuver");
    let boots = fixtures::card(json!({
        "id": "scryfall-swiftfoot-boots", "oracle_id": "oracle-swiftfoot-boots", "name": "Swiftfoot Boots",
        "type_line": "Artifact — Equipment", "collector_number": "swiftfoot-boots"
    }));
    let tags = vec![
        function_tag(
            "tag-spot-removal",
            "spot-removal",
            &[],
            &["oracle-wasteland"],
        ),
        function_tag(
            "tag-counterspell",
            "counterspell",
            &[],
            &["oracle-counterspell"],
        ),
        function_tag("tag-protection", "protection", &[], &[]),
        function_tag(
            "tag-protects-creature",
            "protects-creature",
            &["tag-protection"],
            &["oracle-flawless-maneuver", "oracle-swiftfoot-boots"],
        ),
    ];
    let summary = import_with_tags(&app, &[wasteland, counterspell, maneuver, boots], tags).await;
    assert_eq!(summary.cards_count, 4);
    for (oracle_id, category, first) in [
        ("oracle-wasteland", "targeted_disruption", "removal"),
        ("oracle-counterspell", "targeted_disruption", "counterspell"),
        (
            "oracle-flawless-maneuver",
            "targeted_disruption",
            "protection",
        ),
    ] {
        assert_eq!(
            card_column::<String>(&app, oracle_id, "deck_category").await,
            category
        );
        assert_eq!(
            themes(&card_column::<String>(&app, oracle_id, "deck_themes").await)[0],
            first
        );
    }
    assert_eq!(
        card_column::<String>(&app, "oracle-swiftfoot-boots", "deck_category").await,
        "other"
    );
    assert!(
        themes(&card_column::<String>(&app, "oracle-swiftfoot-boots", "deck_themes").await)
            .contains(&"protection".to_owned())
    );
}

#[tokio::test]
async fn import_lets_functional_tags_categorize_utility_lands() {
    let app = TestApp::new().await;
    let grove = merge(
        fixtures::plains(),
        json!({"id": "scryfall-waterlogged-grove", "oracle_id": "oracle-waterlogged-grove", "name": "Waterlogged Grove", "collector_number": "waterlogged-grove"}),
    );
    let tags = vec![
        function_tag("tag-card-draw", "card-draw", &[], &[]),
        function_tag(
            "tag-pure-draw",
            "pure-draw",
            &["tag-card-draw"],
            &["oracle-waterlogged-grove"],
        ),
    ];
    import_with_tags(&app, &[grove], tags).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-waterlogged-grove", "deck_category").await,
        "card_advantage"
    );
    assert_eq!(
        themes(&card_column::<String>(&app, "oracle-waterlogged-grove", "deck_themes").await),
        vec!["card_advantage", "land"]
    );
}

#[tokio::test]
async fn import_ignores_hand_neutral_card_draw_unless_hand_positive() {
    let app = TestApp::new().await;
    let thicket = merge(
        fixtures::plains(),
        json!({"id": "scryfall-sheltered-thicket", "oracle_id": "oracle-sheltered-thicket", "name": "Sheltered Thicket",
               "type_line": "Land — Mountain Forest", "collector_number": "169"}),
    );
    let wisdom = instant("accumulate-wisdom", "Accumulate Wisdom");
    let tags = vec![
        function_tag("tag-card-draw", "card-draw", &[], &[]),
        function_tag("tag-hand-neutral", "hand-neutral", &[], &[]),
        function_tag("tag-hand-positive", "hand-positive", &[], &[]),
        function_tag(
            "tag-cycling",
            "cycling",
            &["tag-card-draw", "tag-hand-neutral"],
            &["oracle-sheltered-thicket"],
        ),
        function_tag(
            "tag-accumulate-wisdom",
            "accumulate-wisdom",
            &["tag-card-draw", "tag-hand-neutral", "tag-hand-positive"],
            &["oracle-accumulate-wisdom"],
        ),
    ];
    import_with_tags(&app, &[thicket, wisdom], tags).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-sheltered-thicket", "deck_category").await,
        "lands"
    );
    assert_eq!(
        themes(&card_column::<String>(&app, "oracle-sheltered-thicket", "deck_themes").await),
        vec!["land"]
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-accumulate-wisdom", "deck_category").await,
        "card_advantage"
    );
    assert_eq!(
        themes(&card_column::<String>(&app, "oracle-accumulate-wisdom", "deck_themes").await),
        vec!["card_advantage", "instant"]
    );
}

#[tokio::test]
async fn import_categorizes_mass_disruption_beyond_board_wipes() {
    let app = TestApp::new().await;
    let typed = |id: &str, type_line: &str| {
        merge(
            fixtures::time_walk(),
            json!({"id": format!("scryfall-{id}"), "oracle_id": format!("oracle-{id}"), "name": id,
                   "type_line": type_line, "collector_number": id}),
        )
    };
    let tags = vec![
        function_tag("tag-fog", "fog", &[], &["oracle-fog"]),
        function_tag("tag-pillowfort", "pillowfort", &[], &[]),
        function_tag(
            "tag-tax-attack",
            "tax-attack",
            &["tag-pillowfort"],
            &["oracle-propaganda"],
        ),
        function_tag(
            "tag-graveyard-hate",
            "graveyard-hate",
            &[],
            &["oracle-rest-in-peace"],
        ),
        function_tag(
            "tag-pseudo-fog",
            "pseudo-fog",
            &[],
            &["oracle-disrupt-decorum"],
        ),
    ];
    import_with_tags(
        &app,
        &[
            typed("fog", "Instant"),
            typed("propaganda", "Enchantment"),
            typed("disrupt-decorum", "Sorcery"),
            typed("rest-in-peace", "Enchantment"),
        ],
        tags,
    )
    .await;
    for (oracle_id, first) in [
        ("oracle-fog", "fog"),
        ("oracle-propaganda", "pillowfort"),
        ("oracle-disrupt-decorum", "fog"),
        ("oracle-rest-in-peace", "graveyard_hate"),
    ] {
        assert_eq!(
            card_column::<String>(&app, oracle_id, "deck_category").await,
            "mass_disruption"
        );
        assert_eq!(
            themes(&card_column::<String>(&app, oracle_id, "deck_themes").await)[0],
            first
        );
    }
}

#[tokio::test]
async fn import_prioritizes_mass_disruption_over_targeted_disruption() {
    let app = TestApp::new().await;
    let wrath = merge(
        fixtures::time_walk(),
        json!({"id": "scryfall-board-wipe", "oracle_id": "oracle-board-wipe", "name": "Wrath of Test"}),
    );
    let o = ["oracle-board-wipe"];
    let tags = vec![
        function_tag("tag-board-wipe", "board-wipe", &[], &o),
        function_tag("tag-removal", "spot-removal", &[], &o),
        function_tag("tag-discard", "discard", &[], &o),
        function_tag("tag-graveyard-hate", "graveyard-hate", &[], &o),
    ];
    import_with_tags(&app, &[wrath], tags).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-board-wipe", "deck_category").await,
        "mass_disruption"
    );
    let themes = themes(&card_column::<String>(&app, "oracle-board-wipe", "deck_themes").await);
    assert_eq!(themes[0], "board_wipe");
    assert!(themes.contains(&"removal".to_owned()));
    assert!(themes.contains(&"sorcery".to_owned()));
}

#[tokio::test]
async fn import_derives_land_grouping_from_the_type_line_without_tags() {
    let app = TestApp::new().await;
    import(&app, &[fixtures::plains()]).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-plains", "oracle_tags").await,
        "[]"
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-plains", "deck_category").await,
        "lands"
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-plains", "deck_themes").await,
        r#"["land"]"#
    );
}

#[tokio::test]
async fn import_replaces_stale_oracle_tag_data_on_rerun() {
    let app = TestApp::new().await;
    let ramp = vec![function_tag("tag-ramp", "ramp", &[], &["oracle-1"])];
    let draw = vec![scryfall_tag(
        json!({"id": "tag-draw", "slug": "card-draw", "label": "Card Draw",
        "taggings": [{"oracle_id": "oracle-1", "weight": 0.75}]}),
    )];
    import_with_tags(&app, &[fixtures::black_lotus()], ramp).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "deck_category").await,
        "ramp"
    );
    import_with_tags(&app, &[renamed_lotus()], draw).await;
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "name").await,
        "Black Lotus Updated"
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "deck_category").await,
        "card_advantage"
    );
    let tags: Vec<Value> =
        serde_json::from_str(&card_column::<String>(&app, "oracle-1", "oracle_tags").await)
            .unwrap();
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0]["id"], "tag-draw");
    assert_eq!(tags[0]["weight"], 0.75);
    let themes = themes(&card_column::<String>(&app, "oracle-1", "deck_themes").await);
    assert!(themes.contains(&"card_advantage".to_owned()));
    assert!(!themes.contains(&"ramp".to_owned()));
}

#[tokio::test]
async fn import_writes_more_than_one_batch_of_rows() {
    let app = TestApp::new().await;
    let cards: Vec<Value> = (1..=600)
        .map(|index| {
            fixtures::card(json!({"id": format!("batch-printing-{index}"), "oracle_id": format!("batch-oracle-{index}"),
                "name": format!("Batch Lotus {index}"), "collector_number": index.to_string()}))
        })
        .collect();
    let summary = import(&app, &cards).await;
    assert_eq!((summary.cards_count, summary.printings_count), (600, 600));
    assert_eq!(count(&app, "scryfall_cards").await, 600);
    assert_eq!(
        printing_column::<String>(&app, "batch-printing-600", "collector_number").await,
        "600"
    );
}

#[tokio::test]
async fn stored_rows_from_both_backends_compare_equal() {
    // A card row with an integral mana value is stored as NUMERIC 0; the
    // diff must read it back as the same value, or every import rewrites it.
    let app = TestApp::new().await;
    import(&app, &[fixtures::black_lotus(), fixtures::plains()]).await;
    let cmc: Option<f64> = card_column(&app, "oracle-1", "cmc").await;
    assert_eq!(cmc, Some(0.0));
    let summary = import(&app, &[fixtures::black_lotus(), fixtures::plains()]).await;
    assert_eq!(summary.committed_batches, 0);
}

// ---- syncs ----

struct Feed {
    server: MockServer,
}

impl Feed {
    async fn new() -> Self {
        Self {
            server: MockServer::start().await,
        }
    }

    fn url(&self, route: &str) -> String {
        format!("{}{route}", self.server.uri())
    }

    async fn body(&self, route: &str, body: Vec<u8>) {
        Mock::given(method("GET"))
            .and(path(route))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body))
            .mount(&self.server)
            .await;
    }

    async fn json(&self, route: &str, body: Value) {
        Mock::given(method("GET"))
            .and(path(route))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&self.server)
            .await;
    }

    /// Metadata at `/metadata` pointing at gzipped JSON Lines of `records`.
    async fn cards(&self, records: &[Value]) {
        self.json(
            "/metadata",
            json!({"jsonl_download_uri": self.url("/cards.jsonl.gz")}),
        )
        .await;
        self.body("/cards.jsonl.gz", gzip_jsonl(records)).await;
    }

    fn options(&self) -> SyncOptions {
        SyncOptions {
            bulk_url: self.url("/metadata"),
            oracle_tags_bulk_url: None,
            saltiness_url: None,
            commander_ranks_url: None,
            commander_ranks_pages_base_url: self.url("/pages/"),
            commander_ranks_page_delay: Duration::ZERO,
        }
    }
}

#[allow(clippy::panic)]
async fn sync_ok(app: &TestApp, options: &SyncOptions) -> SyncRecord {
    match sync::run(&app.state, options).await {
        Ok(record) => record,
        Err(error) => panic!("sync failed: {error}"),
    }
}

#[allow(clippy::panic)]
async fn sync_failed(app: &TestApp, options: &SyncOptions) -> SyncRecord {
    match sync::run(&app.state, options).await {
        Err(SyncError::Failed(record)) => *record,
        other => panic!("expected a failed sync, got {other:?}"),
    }
}

#[tokio::test]
async fn sync_downloads_bulk_metadata_and_records_success() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    feed.cards(&[fixtures::black_lotus()]).await;
    let record = sync_ok(&app, &feed.options()).await;
    assert_eq!(record.status, SyncStatus::Succeeded);
    assert_eq!((record.cards_count, record.printings_count), (1, 1));
    assert_eq!(record.bulk_uri, Some(feed.url("/cards.jsonl.gz")));
    assert_eq!(record.bulk_type, sync::BULK_TYPE);
    assert!(record.completed_at.is_some());
    assert_eq!(sync::latest(app.db()).await.unwrap(), Some(record));
    assert_eq!(count(&app, "scryfall_cards").await, 1);
    assert_eq!(count(&app, "scryfall_printings").await, 1);
    // The downloaded bulk file is removed afterwards.
    let leftovers = std::fs::read_dir(&app.state.config.scryfall_cache_dir)
        .unwrap()
        .filter(|entry| entry.as_ref().is_ok_and(|entry| entry.path().is_file()))
        .count();
    assert_eq!(leftovers, 0);
}

#[tokio::test]
async fn sync_imports_current_gzip_json_lines_cards() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    let hobbit = |id: &str, oracle_id: &str, name: &str, number: &str| {
        fixtures::card(
            json!({"id": id, "oracle_id": oracle_id, "name": name, "set": "hob",
            "set_name": "The Hobbit", "collector_number": number, "released_at": "2026-08-14"}),
        )
    };
    let splendor = merge(
        hobbit(
            "42a1986c-9585-4544-b5a7-bee4be5c4506",
            "c01aeaa5-1d3b-4493-9575-30175dcd780d",
            "Gleaming Splendor",
            "275",
        ),
        json!({"promo_types": ["surgefoil", "universesbeyond"]}),
    );
    let dog = hobbit(
        "d1a1e520-1fe2-4529-8afb-c187bb80da3c",
        "6f83da19-fd89-44ec-88f3-0c3fddfbd1b2",
        "Long-Bodied Grey Dog",
        "1",
    );
    feed.cards(&[splendor, dog]).await;
    let record = sync_ok(&app, &feed.options()).await;
    assert_eq!((record.cards_count, record.printings_count), (2, 2));
    assert_eq!(
        card_column::<String>(&app, "c01aeaa5-1d3b-4493-9575-30175dcd780d", "name").await,
        "Gleaming Splendor"
    );
    assert_eq!(
        printing_column::<String>(&app, "42a1986c-9585-4544-b5a7-bee4be5c4506", "promo_types")
            .await,
        r#"["surgefoil","universesbeyond"]"#
    );
}

async fn insert_references(app: &TestApp, scryfall_id: &str) -> (i64, i64) {
    let item: i64 = sqlx::query_scalar(
        "INSERT INTO collection_items (scryfall_id, quantity, inserted_at, updated_at) VALUES (?1, 1, 'now', 'now') RETURNING id",
    )
    .bind(scryfall_id)
    .fetch_one(app.db())
    .await
    .unwrap();
    let deck: i64 = sqlx::query_scalar(
        "INSERT INTO decks (name, inserted_at, updated_at) VALUES ('Paper Sync', 'now', 'now') RETURNING id",
    )
    .fetch_one(app.db())
    .await
    .unwrap();
    let deck_card: i64 = sqlx::query_scalar(
        "INSERT INTO deck_cards (deck_id, oracle_id, preferred_printing_id, inserted_at, updated_at) VALUES (?1, 'oracle-1', ?2, 'now', 'now') RETURNING id",
    )
    .bind(deck)
    .bind(scryfall_id)
    .fetch_one(app.db())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO deck_allocations (deck_card_id, collection_item_id, inserted_at, updated_at) VALUES (?1, ?2, 'now', 'now')",
    )
    .bind(deck_card)
    .bind(item)
    .execute(app.db())
    .await
    .unwrap();
    (item, deck_card)
}

async fn insert_want(app: &TestApp, printing: &str, quantity: i64) {
    sqlx::query(
        "INSERT INTO trade_wants (oracle_id, preferred_printing_id, quantity, inserted_at, updated_at) VALUES ('oracle-1', ?1, ?2, 'now', 'now')",
    )
    .bind(printing)
    .bind(quantity)
    .execute(app.db())
    .await
    .unwrap();
}

#[tokio::test]
async fn sync_keeps_only_paper_printings_and_moves_references_to_another_printing() {
    let app = TestApp::new().await;
    let digital = fixtures::card(json!({"games": ["arena"]}));
    let paper = fixtures::card(
        json!({"id": "scryfall-paper-lotus", "set": "pap", "set_name": "Paper Set", "collector_number": "1"}),
    );
    import(&app, &[digital.clone(), paper.clone()]).await;
    let (item, deck_card) = insert_references(&app, "scryfall-printing-1").await;
    insert_want(&app, "scryfall-printing-1", 2).await;
    insert_want(&app, "scryfall-paper-lotus", 3).await;
    sqlx::query("INSERT INTO locations (name, inserted_at, updated_at, cover_scryfall_id) VALUES ('Box', 'now', 'now', 'scryfall-printing-1')")
        .execute(app.db())
        .await
        .unwrap();

    let feed = Feed::new().await;
    let arena_only = fixtures::card(
        json!({"id": "arena-only", "oracle_id": "arena-only-oracle", "games": ["arena"]}),
    );
    feed.cards(&[paper, arena_only]).await;
    let record = sync_ok(&app, &feed.options()).await;
    assert_eq!((record.cards_count, record.printings_count), (1, 1));

    assert!(
        !exists(
            &app,
            "scryfall_printings",
            "scryfall_id",
            "scryfall-printing-1"
        )
        .await
    );
    assert!(!exists(&app, "scryfall_printings", "scryfall_id", "arena-only").await);
    let moved: String =
        sqlx::query_scalar("SELECT scryfall_id FROM collection_items WHERE id = ?1")
            .bind(item)
            .fetch_one(app.db())
            .await
            .unwrap();
    assert_eq!(moved, "scryfall-paper-lotus");
    let preferred: String =
        sqlx::query_scalar("SELECT preferred_printing_id FROM deck_cards WHERE id = ?1")
            .bind(deck_card)
            .fetch_one(app.db())
            .await
            .unwrap();
    assert_eq!(preferred, "scryfall-paper-lotus");
    assert_eq!(count(&app, "deck_allocations").await, 1);
    let cover: String = sqlx::query_scalar("SELECT cover_scryfall_id FROM locations")
        .fetch_one(app.db())
        .await
        .unwrap();
    assert_eq!(cover, "scryfall-paper-lotus");
    let wants: Vec<(Option<String>, i64)> =
        sqlx::query_as("SELECT preferred_printing_id, quantity FROM trade_wants")
            .fetch_all(app.db())
            .await
            .unwrap();
    assert_eq!(wants, vec![(Some("scryfall-paper-lotus".to_owned()), 5)]);
}

#[tokio::test]
async fn reconcile_prefers_same_language_and_finish_and_folds_wants_without_replacement() {
    let app = TestApp::new().await;
    // Stale foil English printing; candidates: newest Japanese, older English
    // nonfoil, English foil. The English foil wins.
    let stale = fixtures::card(json!({"id": "stale", "finishes": ["foil"], "games": ["arena"]}));
    let ja = fixtures::card(
        json!({"id": "ja", "lang": "ja", "finishes": ["foil"], "released_at": "2020-01-01", "collector_number": "1"}),
    );
    let en_nonfoil = fixtures::card(
        json!({"id": "en-nonfoil", "finishes": ["nonfoil"], "released_at": "2019-01-01", "collector_number": "2"}),
    );
    let en_foil = fixtures::card(
        json!({"id": "en-foil", "finishes": ["foil"], "released_at": "2018-01-01", "collector_number": "3"}),
    );
    // A second card whose only printing goes away entirely.
    let gone = merge(fixtures::time_walk(), json!({"games": ["arena"]}));
    import(
        &app,
        &[stale, ja.clone(), en_nonfoil.clone(), en_foil.clone(), gone],
    )
    .await;
    let (item, _) = insert_references(&app, "stale").await;
    sqlx::query("INSERT INTO trade_wants (oracle_id, preferred_printing_id, quantity, inserted_at, updated_at) VALUES ('oracle-2', 'scryfall-printing-2', 4, 'now', 'now'), ('oracle-2', NULL, 1, 'now', 'now')")
        .execute(app.db())
        .await
        .unwrap();

    let feed = Feed::new().await;
    let paper = |card: Value| merge(card, json!({"games": ["paper"]}));
    feed.cards(&[paper(ja), paper(en_nonfoil), paper(en_foil)])
        .await;
    sync_ok(&app, &feed.options()).await;

    let moved: String =
        sqlx::query_scalar("SELECT scryfall_id FROM collection_items WHERE id = ?1")
            .bind(item)
            .fetch_one(app.db())
            .await
            .unwrap();
    assert_eq!(moved, "en-foil");
    // Time Walk lost its only printing, so the card and its wants are gone.
    assert!(!exists(&app, "scryfall_cards", "oracle_id", "oracle-2").await);
    assert_eq!(count(&app, "trade_wants").await, 0);
}

#[tokio::test]
async fn reconcile_moves_wants_onto_the_replacement_beside_generic_wants() {
    let app = TestApp::new().await;
    let lotus = fixtures::black_lotus();
    let digital =
        fixtures::card(json!({"id": "digital", "games": ["arena"], "collector_number": "9"}));
    import(&app, &[lotus.clone(), digital]).await;
    insert_want(&app, "digital", 2).await;
    sqlx::query("INSERT INTO trade_wants (oracle_id, preferred_printing_id, quantity, inserted_at, updated_at) VALUES ('oracle-1', NULL, 1, 'now', 'now')")
        .execute(app.db())
        .await
        .unwrap();
    let feed = Feed::new().await;
    feed.cards(&[lotus]).await;
    sync_ok(&app, &feed.options()).await;
    let wants: Vec<(Option<String>, i64)> = sqlx::query_as(
        "SELECT preferred_printing_id, quantity FROM trade_wants ORDER BY preferred_printing_id",
    )
    .fetch_all(app.db())
    .await
    .unwrap();
    assert_eq!(
        wants,
        vec![(None, 1), (Some("scryfall-printing-1".to_owned()), 2)]
    );
}

#[tokio::test]
async fn sync_reconciles_more_than_one_stale_batch_and_is_retry_safe() {
    let app = TestApp::new().await;
    let stale: Vec<Value> = (1..=201)
        .map(|index| fixtures::card(json!({"id": format!("stale-lotus-{index}"), "collector_number": index.to_string()})))
        .collect();
    let replacement = fixtures::card(
        json!({"id": "current-lotus", "collector_number": "current", "released_at": "2026-09-20"}),
    );
    assert_eq!(import(&app, &stale).await.printings_count, 201);
    let feed = Feed::new().await;
    feed.cards(&[replacement]).await;
    let record = sync_ok(&app, &feed.options()).await;
    assert_eq!(record.printings_count, 1);
    assert_eq!(count(&app, "scryfall_printings").await, 1);
    assert!(exists(&app, "scryfall_printings", "scryfall_id", "current-lotus").await);
    let record = sync_ok(&app, &feed.options()).await;
    assert_eq!(
        (record.status, record.printings_count),
        (SyncStatus::Succeeded, 1)
    );
    assert_eq!(count(&app, "scryfall_printings").await, 1);
}

#[tokio::test]
async fn sync_deletes_cards_left_without_paper_printings() {
    let app = TestApp::new().await;
    let digital = fixtures::card(
        json!({"id": "digital-only-printing", "oracle_id": "digital-only-oracle",
        "name": "Digital Only Card", "games": ["arena"]}),
    );
    import(&app, &[digital]).await;
    let deck: i64 = sqlx::query_scalar("INSERT INTO decks (name, inserted_at, updated_at) VALUES ('Digital', 'now', 'now') RETURNING id")
        .fetch_one(app.db())
        .await
        .unwrap();
    sqlx::query("INSERT INTO deck_cards (deck_id, oracle_id, inserted_at, updated_at) VALUES (?1, 'digital-only-oracle', 'now', 'now')")
        .bind(deck)
        .execute(app.db())
        .await
        .unwrap();
    let feed = Feed::new().await;
    feed.cards(&[fixtures::black_lotus()]).await;
    sync_ok(&app, &feed.options()).await;
    assert!(
        !exists(
            &app,
            "scryfall_printings",
            "scryfall_id",
            "digital-only-printing"
        )
        .await
    );
    assert!(!exists(&app, "scryfall_cards", "oracle_id", "digital-only-oracle").await);
    assert_eq!(count(&app, "deck_cards").await, 0);
}

#[tokio::test]
async fn sync_deletes_existing_memorabilia_and_token_set_printings() {
    let app = TestApp::new().await;
    let memorabilia = fixtures::card(
        json!({"id": "existing-memorabilia", "set": "alea", "set_name": "Alpha Art Series"}),
    );
    let token = fixtures::card(
        json!({"id": "existing-token", "oracle_id": "existing-token-oracle",
        "name": "Black Lotus Token", "set": "tlea", "set_name": "Alpha Tokens"}),
    );
    assert_eq!(
        import(
            &app,
            &[fixtures::black_lotus(), memorabilia.clone(), token.clone()]
        )
        .await
        .printings_count,
        3
    );
    let feed = Feed::new().await;
    feed.cards(&[
        fixtures::black_lotus(),
        merge(memorabilia, json!({"set_type": "memorabilia"})),
        merge(token, json!({"set_type": "token"})),
    ])
    .await;
    let record = sync_ok(&app, &feed.options()).await;
    assert_eq!((record.cards_count, record.printings_count), (1, 1));
    assert!(
        exists(
            &app,
            "scryfall_printings",
            "scryfall_id",
            "scryfall-printing-1"
        )
        .await
    );
    assert!(
        !exists(
            &app,
            "scryfall_printings",
            "scryfall_id",
            "existing-memorabilia"
        )
        .await
    );
    assert!(!exists(&app, "scryfall_printings", "scryfall_id", "existing-token").await);
}

#[tokio::test]
async fn sync_only_runs_the_paper_reconciliation_once() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    feed.cards(&[fixtures::black_lotus()]).await;
    sync_ok(&app, &feed.options()).await;
    let digital = fixtures::card(json!({"id": "digital-after-paper-migration",
        "oracle_id": "digital-after-paper-migration-oracle", "games": ["arena"]}));
    import(&app, &[digital]).await;
    sync_ok(&app, &feed.options()).await;
    assert!(
        exists(
            &app,
            "scryfall_printings",
            "scryfall_id",
            "digital-after-paper-migration"
        )
        .await
    );
}

#[tokio::test]
async fn sync_imports_oracle_tags_bulk_data_and_attaches_deck_grouping() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    feed.cards(&[fixtures::black_lotus()]).await;
    feed.json(
        "/oracle-tags-metadata",
        json!({"jsonl_download_uri": feed.url("/oracle-tags.jsonl.gz")}),
    )
    .await;
    feed.body(
        "/oracle-tags.jsonl.gz",
        gzip_jsonl(&[scryfall_tag(
            json!({"id": "tag-ramp", "slug": "ramp", "label": "Ramp",
            "taggings": [{"oracle_id": "oracle-1", "weight": 0.88}]}),
        )]),
    )
    .await;
    let mut options = feed.options();
    options.oracle_tags_bulk_url = Some(feed.url("/oracle-tags-metadata"));
    let record = sync_ok(&app, &options).await;
    assert_eq!((record.cards_count, record.printings_count), (1, 1));
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "deck_category").await,
        "ramp"
    );
    let tags: Vec<Value> =
        serde_json::from_str(&card_column::<String>(&app, "oracle-1", "oracle_tags").await)
            .unwrap();
    assert_eq!(tags[0]["slug"], "ramp");
    assert_eq!(tags[0]["weight"], 0.88);
    assert!(
        themes(&card_column::<String>(&app, "oracle-1", "deck_themes").await)
            .contains(&"ramp".to_owned())
    );
}

#[tokio::test]
async fn sync_preserves_existing_tags_when_oracle_tags_data_is_invalid() {
    let app = TestApp::new().await;
    import_with_tags(
        &app,
        &[fixtures::black_lotus()],
        vec![function_tag("tag-ramp", "ramp", &[], &["oracle-1"])],
    )
    .await;
    let feed = Feed::new().await;
    feed.cards(&[renamed_lotus()]).await;
    feed.json(
        "/oracle-tags-metadata",
        json!({"jsonl_download_uri": feed.url("/oracle-tags.jsonl.gz")}),
    )
    .await;
    feed.body(
        "/oracle-tags.jsonl.gz",
        gzip_lines(&["<!DOCTYPE html>".to_owned()]),
    )
    .await;
    let mut options = feed.options();
    options.oracle_tags_bulk_url = Some(feed.url("/oracle-tags-metadata"));
    let record = sync_ok(&app, &options).await;
    assert_eq!((record.status, record.error), (SyncStatus::Succeeded, None));
    // The card was rewritten (renamed) but kept its tags.
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "name").await,
        "Black Lotus Updated"
    );
    assert_eq!(
        card_column::<String>(&app, "oracle-1", "deck_category").await,
        "ramp"
    );
    assert!(
        card_column::<String>(&app, "oracle-1", "oracle_tags")
            .await
            .contains("\"ramp\"")
    );
}

#[tokio::test]
async fn sync_imports_nullable_saltiness_by_scryfall_oracle_id() {
    let app = TestApp::new().await;
    let unscored = fixtures::card(
        json!({"id": "scryfall-unscored", "oracle_id": "oracle-unscored", "name": "Unscored Card"}),
    );
    import(&app, &[fixtures::black_lotus(), unscored.clone()]).await;
    sqlx::query(
        "UPDATE scryfall_cards SET edhrec_saltiness = 3.5 WHERE oracle_id = 'oracle-unscored'",
    )
    .execute(app.db())
    .await
    .unwrap();
    let feed = Feed::new().await;
    feed.cards(&[fixtures::black_lotus(), unscored]).await;
    let payload = json!({"meta": {"date": "2026-08-13"}, "data": {
        "Black Lotus": [{"edhrecSaltiness": 1.25, "identifiers": {"scryfallOracleId": "oracle-1"}}],
        "Unscored Card": [{"edhrecSaltiness": null, "identifiers": {"scryfallOracleId": "oracle-unscored"}}],
        "Unknown Card": [{"edhrecSaltiness": 4.0, "identifiers": {"scryfallOracleId": "oracle-not-in-catalog"}}]
    }});
    feed.body("/AtomicCards.json.gz", gzip_lines(&[payload.to_string()]))
        .await;
    let mut options = feed.options();
    options.saltiness_url = Some(feed.url("/AtomicCards.json.gz"));
    sync_ok(&app, &options).await;
    assert_eq!(
        card_column::<Option<f64>>(&app, "oracle-1", "edhrec_saltiness").await,
        Some(1.25)
    );
    assert_eq!(
        card_column::<Option<f64>>(&app, "oracle-unscored", "edhrec_saltiness").await,
        None
    );
}

#[tokio::test]
async fn sync_preserves_saltiness_when_mtgjson_data_is_invalid() {
    let app = TestApp::new().await;
    import(&app, &[fixtures::black_lotus()]).await;
    sqlx::query("UPDATE scryfall_cards SET edhrec_saltiness = 2.5")
        .execute(app.db())
        .await
        .unwrap();
    let feed = Feed::new().await;
    feed.cards(&[fixtures::black_lotus()]).await;
    feed.body("/AtomicCards.json.gz", b"not gzip".to_vec())
        .await;
    let mut options = feed.options();
    options.saltiness_url = Some(feed.url("/AtomicCards.json.gz"));
    let record = sync_ok(&app, &options).await;
    assert_eq!((record.status, record.error), (SyncStatus::Succeeded, None));
    assert_eq!(
        card_column::<f64>(&app, "oracle-1", "edhrec_saltiness").await,
        2.5
    );
}

#[tokio::test]
async fn sync_imports_paginated_commander_ranks_by_printing_id() {
    let app = TestApp::new().await;
    let ranked = fixtures::card(
        json!({"name": "Ranked Commander", "type_line": "Legendary Creature — Wizard"}),
    );
    let stale = fixtures::card(
        json!({"id": "scryfall-stale-commander", "oracle_id": "oracle-stale-commander",
        "name": "Stale Commander", "type_line": "Legendary Creature — Wizard"}),
    );
    import(&app, &[ranked.clone(), stale.clone()]).await;
    sqlx::query("UPDATE scryfall_cards SET edhrec_commander_rank = 99 WHERE oracle_id = 'oracle-stale-commander'")
        .execute(app.db())
        .await
        .unwrap();
    let feed = Feed::new().await;
    feed.cards(&[ranked, stale]).await;
    feed.json(
        "/pages/commanders/year.json",
        json!({"container": {"json_dict": {"cardlists": [{
            "cardviews": [{"id": "scryfall-stale-commander", "rank": 13, "is_partner": true}],
            "more": "commanders/year-1.json"
        }]}}}),
    )
    .await;
    feed.json(
        "/pages/commanders/year-1.json",
        json!({"cardviews": [{"id": "scryfall-printing-1", "rank": 12}]}),
    )
    .await;
    let mut options = feed.options();
    options.commander_ranks_url = Some(feed.url("/pages/commanders/year.json"));
    sync_ok(&app, &options).await;
    assert_eq!(
        card_column::<Option<i64>>(&app, "oracle-1", "edhrec_commander_rank").await,
        Some(12)
    );
    assert_eq!(
        card_column::<Option<i64>>(&app, "oracle-stale-commander", "edhrec_commander_rank").await,
        None
    );
}

#[tokio::test]
async fn sync_preserves_commander_ranks_when_edhrec_is_unavailable() {
    let app = TestApp::new().await;
    import(&app, &[fixtures::black_lotus()]).await;
    sqlx::query("UPDATE scryfall_cards SET edhrec_commander_rank = 7")
        .execute(app.db())
        .await
        .unwrap();
    let feed = Feed::new().await;
    feed.cards(&[fixtures::black_lotus()]).await;
    Mock::given(method("GET"))
        .and(path("/ranks.json"))
        .respond_with(ResponseTemplate::new(504))
        .mount(&feed.server)
        .await;
    let mut options = feed.options();
    options.commander_ranks_url = Some(feed.url("/ranks.json"));
    let record = sync_ok(&app, &options).await;
    assert_eq!((record.status, record.error), (SyncStatus::Succeeded, None));
    assert_eq!(
        card_column::<i64>(&app, "oracle-1", "edhrec_commander_rank").await,
        7
    );
}

#[tokio::test]
async fn sync_rejects_former_json_array_bulk_metadata() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    feed.json(
        "/metadata",
        json!({"download_uri": feed.url("/default-cards.json")}),
    )
    .await;
    Mock::given(method("GET"))
        .and(path("/default-cards.json"))
        .respond_with(ResponseTemplate::new(200))
        .expect(0)
        .mount(&feed.server)
        .await;
    let record = sync_failed(&app, &feed.options()).await;
    assert_eq!(record.status, SyncStatus::Failed);
    assert_eq!(
        record.error.as_deref(),
        Some("Scryfall bulk metadata did not include jsonl_download_uri")
    );
    assert_eq!(count(&app, "scryfall_cards").await, 0);
}

#[tokio::test]
async fn sync_validates_json_lines_before_committing_any_batch() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    let mut lines: Vec<String> = (1..=200)
        .map(|index| {
            fixtures::card(json!({"id": format!("scryfall-valid-{index}"), "oracle_id": format!("oracle-valid-{index}"),
                "name": format!("Valid Card {index}")}))
            .to_string()
        })
        .collect();
    lines.push("{not-json".to_owned());
    feed.json(
        "/metadata",
        json!({"jsonl_download_uri": feed.url("/cards.jsonl.gz")}),
    )
    .await;
    feed.body("/cards.jsonl.gz", gzip_lines(&lines)).await;
    let record = sync_failed(&app, &feed.options()).await;
    assert!(
        record
            .error
            .as_deref()
            .unwrap()
            .contains("Invalid Scryfall JSON Lines record"),
        "{:?}",
        record.error
    );
    assert_eq!(count(&app, "scryfall_cards").await, 0);
    assert_eq!(count(&app, "scryfall_printings").await, 0);
}

#[tokio::test]
async fn sync_records_failures_without_importing_partial_data() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    Mock::given(method("GET"))
        .and(path("/metadata"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&feed.server)
        .await;
    let record = sync_failed(&app, &feed.options()).await;
    assert_eq!(
        record.error.as_deref(),
        Some("Scryfall request failed with HTTP 500")
    );
    assert_eq!(record.status, SyncStatus::Failed);
    assert!(record.completed_at.is_some());
    assert_eq!(count(&app, "scryfall_cards").await, 0);
}

#[tokio::test]
async fn sync_skips_undecodable_records_and_keeps_cards_with_unknown_vocabulary() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    let odd = fixtures::card(
        json!({"id": "odd", "oracle_id": "oracle-odd", "name": "Odd",
        "legalities": {"vintage": "legal", "future": "suspended"}}),
    );
    feed.cards(&[
        fixtures::black_lotus(),
        json!({"object": "card", "name": "No id"}),
        odd,
    ])
    .await;
    let record = sync_ok(&app, &feed.options()).await;
    assert_eq!(record.printings_count, 2);
    assert_eq!(
        card_column::<String>(&app, "oracle-odd", "legalities").await,
        r#"{"vintage":"legal"}"#
    );
}

// ---- workers ----

#[tokio::test]
async fn manual_reloads_enqueue_unique_forced_jobs() {
    let app = TestApp::new().await;
    let data = app
        .gql_data(
            "mutation { reloadScryfallCatalog { reloadResult { status message } } reloadScryfallAssets { reloadResult { status message } } }",
            json!({}),
        )
        .await;
    assert_eq!(
        data,
        json!({
            "reloadScryfallCatalog": {"reloadResult": {"status": "queued", "message": "Scryfall catalog reload queued."}},
            "reloadScryfallAssets": {"reloadResult": {"status": "queued", "message": "Scryfall symbol and set icon reload queued."}}
        })
    );
    let jobs: Vec<(String, String, String, i64)> =
        sqlx::query_as("SELECT worker, queue, args, max_attempts FROM oban_jobs ORDER BY id")
            .fetch_all(app.db())
            .await
            .unwrap();
    assert_eq!(
        jobs,
        vec![
            (
                worker::NAME.to_owned(),
                "catalog".to_owned(),
                r#"{"force":true}"#.to_owned(),
                3
            ),
            (
                crate::scryfall_assets::worker::NAME.to_owned(),
                "catalog".to_owned(),
                r#"{"force":true}"#.to_owned(),
                3
            ),
        ]
    );
    // A second reload returns the queued job instead of adding one.
    let first = worker::enqueue_forced(&app.state.jobs, app.db(), worker::NAME)
        .await
        .unwrap();
    let again = worker::enqueue_forced(&app.state.jobs, app.db(), worker::NAME)
        .await
        .unwrap();
    assert_eq!(first, again);
    assert_eq!(count(&app, "oban_jobs").await, 2);
}

#[tokio::test]
async fn a_forced_reload_upgrades_a_queued_periodic_job() {
    let app = TestApp::new().await;
    let periodic = app
        .state
        .jobs
        .enqueue(worker::NAME, json!({}))
        .await
        .unwrap();
    let forced = worker::enqueue_forced(&app.state.jobs, app.db(), worker::NAME)
        .await
        .unwrap();
    assert_eq!(periodic, forced);
    let args: String = sqlx::query_scalar("SELECT args FROM oban_jobs WHERE id = ?1")
        .bind(forced)
        .fetch_one(app.db())
        .await
        .unwrap();
    assert_eq!(args, r#"{"force":true}"#);
}

#[tokio::test]
async fn periodic_catalog_jobs_skip_a_fresh_successful_sync() {
    let app = TestApp::new().await;
    let now = crate::timefmt::now();
    sqlx::query("INSERT INTO scryfall_syncs (status, bulk_type, started_at, completed_at, inserted_at, updated_at) VALUES ('succeeded', ?1, ?2, ?2, ?2, ?2)")
        .bind(sync::BULK_TYPE)
        .bind(&now)
        .execute(app.db())
        .await
        .unwrap();
    let job = crate::jobs::Job {
        id: 1,
        worker: worker::NAME.to_owned(),
        args: json!({}),
        attempt: 1,
        max_attempts: 3,
    };
    assert!(matches!(
        worker::ScryfallCatalogWorker
            .perform(&app.state, &job)
            .await,
        crate::jobs::Outcome::Done
    ));
}

#[test]
fn syncs_from_older_importers_or_over_a_day_old_are_stale() {
    let now = time::OffsetDateTime::now_utc()
        .replace_nanosecond(0)
        .unwrap();
    let fresh = SyncRecord {
        id: 1,
        status: SyncStatus::Succeeded,
        bulk_type: sync::BULK_TYPE.to_owned(),
        bulk_uri: None,
        started_at: crate::timefmt::utc_seconds(now),
        completed_at: Some(crate::timefmt::utc_seconds(now)),
        cards_count: 0,
        printings_count: 0,
        error: None,
    };
    assert!(!worker::stale(Some(&fresh), now));
    let older = SyncRecord {
        bulk_type: "default_cards_paper_v2".to_owned(),
        ..fresh.clone()
    };
    assert!(worker::stale(Some(&older), now));
    let day_old = now - Duration::from_secs(24 * 3600);
    let at = |time| SyncRecord {
        completed_at: Some(crate::timefmt::utc_seconds(time)),
        ..fresh.clone()
    };
    assert!(worker::stale(Some(&at(day_old)), now));
    assert!(!worker::stale(
        Some(&at(day_old + Duration::from_secs(60))),
        now
    ));
    let failed = SyncRecord {
        status: SyncStatus::Failed,
        ..fresh.clone()
    };
    assert!(worker::stale(Some(&failed), now));
    assert!(worker::stale(None, now));
    assert!(worker::forced(&json!({"force": true})));
    assert!(!worker::forced(&json!({"force": false})));
    assert!(!worker::forced(&json!({})));
}

#[test]
fn crontab_matches_the_oban_config() {
    let entries: Vec<(&str, &str)> = crate::app::crontab()
        .iter()
        .map(|entry| (entry.expression, entry.worker))
        .collect();
    for expected in [
        ("@reboot", "Manavault.Catalog.ScryfallCatalogWorker"),
        ("@daily", "Manavault.Catalog.ScryfallCatalogWorker"),
        ("@reboot", "Manavault.Catalog.ScryfallAssetsWorker"),
        ("@daily", "Manavault.Catalog.ScryfallAssetsWorker"),
        ("@reboot", "Manavault.Pricing.VendorSyncWorker"),
        ("*/30 * * * *", "Manavault.Pricing.VendorSyncWorker"),
    ] {
        assert!(entries.contains(&expected), "{expected:?}");
    }
}

/// The shared global test log hub.
fn test_log_hub() -> &'static crate::logs::LogHub {
    crate::test_support::log_hub()
}

#[tokio::test]
async fn sync_emits_info_progress_logs() {
    let app = TestApp::new().await;
    let feed = Feed::new().await;
    feed.cards(&[fixtures::black_lotus()]).await;
    let hub = test_log_hub();
    let mut events = hub.subscribe();
    let record = sync_ok(&app, &feed.options()).await;
    assert_eq!((record.cards_count, record.printings_count), (1, 1));
    let mut log = String::new();
    loop {
        match events.try_recv() {
            Ok(event) => {
                log.push_str(&event.message);
                log.push('\n');
            }
            Err(tokio::sync::broadcast::error::TryRecvError::Lagged(_)) => {}
            Err(_) => break,
        }
    }
    for expected in [
        "Scryfall catalog sync started sync_id=",
        "Scryfall catalog sync fetching default-cards metadata",
        "Scryfall catalog sync downloaded default-cards bulk",
        "Scryfall catalog sync decoded default-cards bulk",
        "Scryfall catalog import progress source_cards=1/1 cards=1 printings=1",
        "Scryfall catalog import completed source_cards=1 cards=1 printings=1",
        "Scryfall catalog sync succeeded",
    ] {
        assert!(log.contains(expected), "missing {expected:?} in\n{log}");
    }
}
