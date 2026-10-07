//! Share tests, ported from `public_graphql_protection_test.exs`,
//! `public_share_cache_test.exs`, `public_wants_share_test.exs`,
//! `public_binder_share_test.exs`, `public_access_mutation_guard_test.exs`,
//! the public parts of `schema/deck_detail_and_share_test.exs`, the share
//! deck parts of `controllers/app_controller_test.exs`,
//! `deck_share_preview_artifact_cache_test.exs`, and
//! `controllers/api/v1/deck_controller_test.exs`, plus a lotus
//! `DecklistClient` round trip against this server.

mod api_v1;
mod artifact_cache;
mod graphql;
mod lotus_client;
mod pages;
mod protection;

use axum::body::Body;
use axum::http::{HeaderMap, Request};
use serde_json::{Value, json};

use crate::test_support::TestApp;

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
    crate::decks::records::ensure_share_token(app.db(), crate::decks::DeckId(deck_id))
        .await
        .unwrap()
        .share_token
        .unwrap()
}

/// Inserts `count` bare catalog cards named `<prefix> Card <n>`; returns
/// their oracle ids.
pub(super) async fn insert_bulk_cards(app: &TestApp, prefix: &str, count: usize) -> Vec<String> {
    let mut ids = Vec::with_capacity(count);
    let mut tx = app.db().begin().await.unwrap();
    for index in 1..=count {
        let oracle_id = format!("{prefix}-card-{index}");
        sqlx::query(
            "INSERT INTO scryfall_cards (oracle_id, name, inserted_at, updated_at)
             VALUES (?1, ?2, ?3, ?3)",
        )
        .bind(&oracle_id)
        .bind(format!("{prefix} Card {index:04}"))
        .bind(T)
        .execute(&mut *tx)
        .await
        .unwrap();
        ids.push(oracle_id);
    }
    tx.commit().await.unwrap();
    ids
}

/// A response: status, headers, body bytes.
pub(super) struct Sent {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl Sent {
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    pub fn json(&self) -> Value {
        serde_json::from_slice(&self.body).unwrap()
    }

    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|value| value.to_str().ok())
    }
}

pub(super) async fn send(app: &TestApp, request: Request<Body>) -> Sent {
    let response = app.request(request).await;
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec();
    Sent {
        status,
        headers,
        body,
    }
}

pub(super) async fn get(app: &TestApp, path: &str) -> Sent {
    send(app, Request::get(path).body(Body::empty()).unwrap()).await
}

/// `POST /share/graphql` with a JSON body.
pub(super) async fn post_graphql(app: &TestApp, body: &Value) -> Sent {
    send(
        app,
        Request::post("/share/graphql")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap(),
    )
    .await
}

/// A public query that must answer 200; returns the JSON body.
pub(super) async fn public(app: &TestApp, query: &str, variables: Value) -> Value {
    let sent = post_graphql(app, &json!({"query": query, "variables": variables})).await;
    assert_eq!(sent.status, 200, "{}", sent.text());
    sent.json()
}

/// Like [`public`], failing on GraphQL errors; returns `data`.
pub(super) async fn public_data(app: &TestApp, query: &str, variables: Value) -> Value {
    let response = public(app, query, variables).await;
    assert!(response.get("errors").is_none(), "errors: {response}");
    response["data"].clone()
}
