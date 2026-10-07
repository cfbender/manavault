//! Catalog tests, ported from `test/manavault/catalog_test.exs` (card parts),
//! `test/manavault/catalog/{search,edhrec}/*`, `price_fallback_consistency_test.exs`,
//! `card_name_suggestions_test.exs`, and the card parts of
//! `test/manavault_web/schema/*`.

mod edhrec;
mod prices;
mod rulings;
mod schema;
mod search;
mod suggestions;

use serde_json::Value;

use crate::test_support::TestApp;

/// Records a producer → token link (`scryfall_card_tokens`), which the full
/// Scryfall import writes from `all_parts`.
pub(crate) async fn link_token(app: &TestApp, producer: &str, token: &str) {
    sqlx::query("INSERT OR IGNORE INTO scryfall_card_tokens (scryfall_id, token_scryfall_id) VALUES (?1, ?2)")
        .bind(producer)
        .bind(token)
        .execute(app.db())
        .await
        .unwrap();
}

/// Inserts a location and returns its id.
pub(crate) async fn insert_location(app: &TestApp, name: &str, kind: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO locations (name, kind, inserted_at, updated_at) VALUES (?1, ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z') RETURNING id",
    )
    .bind(name)
    .bind(kind)
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// Inserts a collection item and returns its id.
pub(crate) async fn insert_collection_item(
    app: &TestApp,
    scryfall_id: &str,
    quantity: i64,
    location_id: Option<i64>,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO collection_items (scryfall_id, quantity, location_id, inserted_at, updated_at) VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z') RETURNING id",
    )
    .bind(scryfall_id)
    .bind(quantity)
    .bind(location_id)
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// The `node.name` of each edge of a connection.
pub(crate) fn edge_names(connection: &Value) -> Vec<String> {
    connection["edges"]
        .as_array()
        .unwrap()
        .iter()
        .map(|edge| edge["node"]["name"].as_str().unwrap().to_owned())
        .collect()
}
