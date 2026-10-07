//! A database from the v1.0.0 release, upgraded at startup and served
//! through the owner schema. (`manavault_core::db::tests` checks the
//! migrations themselves.)
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::panic
)]

use manavault_server::test_support::TestApp;

/// A database from the v1.0.0 release (its own 34 migrations), filled with
/// owner data through SQL in v1.0.0's column formats; dumped with
/// `sqlite3 .dump`.
const V1_0_0_DUMP: &str = include_str!("../../manavault-core/tests/fixtures/manavault-v1.0.0.sql");

async fn load_dump(pool: &sqlx::SqlitePool, dump: &str) {
    // The dump creates SQLite's own `sqlite_sequence` table, which cannot be
    // created by hand; its rows are restored through the AUTOINCREMENT tables.
    let statements: String = dump
        .lines()
        .filter(|line| !line.starts_with("CREATE TABLE sqlite_sequence"))
        .collect::<Vec<_>>()
        .join("\n");
    sqlx::raw_sql(sqlx::AssertSqlSafe(statements))
        .execute(pool)
        .await
        .expect("load dump");
}

#[tokio::test]
async fn the_server_serves_an_upgraded_v1_0_0_database() {
    let app =
        TestApp::with_database(|pool| Box::pin(async move { load_dump(&pool, V1_0_0_DUMP).await }))
            .await;
    let data = app
        .gql_data(
            "{ homeSummary { collectionCount locationCount deckCount }
               decks(first: 5) { edges { node { name status cardCount deckCards(first: 10) { edges { node { quantity zone card { name } } } } } } } }",
            serde_json::json!({}),
        )
        .await;
    assert_eq!(
        data["homeSummary"],
        serde_json::json!({"collectionCount": 11, "locationCount": 2, "deckCount": 2})
    );
    let deck = data["decks"]["edges"]
        .as_array()
        .expect("decks")
        .iter()
        .map(|edge| &edge["node"])
        .find(|deck| deck["name"] == "Mono-Red Lotus")
        .expect("upgraded deck");
    assert_eq!(deck["name"], "Mono-Red Lotus");
    let zones: Vec<&str> = deck["deckCards"]["edges"]
        .as_array()
        .expect("cards")
        .iter()
        .filter_map(|edge| edge["node"]["zone"].as_str())
        .collect();
    assert!(
        zones.contains(&"commander") && zones.contains(&"considering"),
        "{zones:?}"
    );
}
