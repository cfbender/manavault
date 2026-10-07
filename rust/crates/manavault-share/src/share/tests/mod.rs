//! Share tests: the public schema's wants, binder, and deck shares, the
//! public access mutation guard, and the preview artifact cache. The share
//! routes (protection, pages, `/api/v1`, the lotus client round trip) are
//! served by `manavault-server` and tested there.

mod artifact_cache;
mod graphql;

use manavault_core::testing::body_text;
use serde_json::Value;

use crate::test_app::TestApp;

pub(super) const T: &str = "2026-01-01T00:00:00Z";

pub(super) async fn insert_deck(app: &TestApp, name: &str, format: &str, status: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO decks (name, format, status, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4) RETURNING id",
    )
    .bind(name)
    .bind(format)
    .bind(status)
    .bind(T)
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// A deck card row; returns its id.
pub(super) async fn add_card(
    app: &TestApp,
    deck_id: i64,
    oracle_id: &str,
    quantity: i64,
    zone: &str,
    finish: &str,
    preferred_printing: Option<&str>,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO deck_cards (deck_id, oracle_id, quantity, zone, finish, preferred_printing_id,
           inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7) RETURNING id",
    )
    .bind(deck_id)
    .bind(oracle_id)
    .bind(quantity)
    .bind(zone)
    .bind(finish)
    .bind(preferred_printing)
    .bind(T)
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// `Catalog.ensure_deck_share_token/1`.
pub(super) async fn share(app: &TestApp, deck_id: i64) -> String {
    manavault_collection::decks::records::ensure_share_token(
        app.db(),
        manavault_collection::decks::DeckId(deck_id),
    )
    .await
    .unwrap()
    .share_token
    .unwrap()
}

/// A public query that must answer 200; returns the JSON body.
pub(super) async fn public(app: &TestApp, query: &str, variables: Value) -> Value {
    let request = async_graphql::Request::new(query)
        .variables(async_graphql::Variables::from_json(variables));
    let response = crate::share::http::execute(&app.state, request).await;
    let status = response.status().as_u16();
    let body = body_text(response).await;
    assert_eq!(status, 200, "{body}");
    serde_json::from_str(&body).unwrap()
}

/// Like [`public`], failing on GraphQL errors; returns `data`.
pub(super) async fn public_data(app: &TestApp, query: &str, variables: Value) -> Value {
    let response = public(app, query, variables).await;
    assert!(response.get("errors").is_none(), "errors: {response}");
    response["data"].clone()
}
