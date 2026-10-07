//! Trade tests: list sources, the matcher, collection check, and deck diff,
//! wants and shares, the trade GraphQL fields (deck diff ids, the schema's
//! domain contract, deck sharing), and public wants and binder shares. The
//! share pages are served by `manavault-server` and tested there.

mod list_source;
mod lists;
mod remote;
mod schema;
mod shares;
mod wants;

use serde_json::{Value, json};

use crate::test_app::TestApp;
use manavault_catalog::testing::fixtures;

const T: &str = "2026-01-01T00:00:00Z";

/// An app with `black_lotus`, `black_lotus_beta`, and `time_walk` imported.
pub(crate) async fn app_with_cards() -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(&[
        fixtures::black_lotus(),
        fixtures::black_lotus_beta(),
        fixtures::time_walk(),
    ])
    .await;
    app
}

/// The minimal test card the trade tests import (`card/2` helpers).
pub(crate) fn card(oracle_id: &str, name: &str) -> Value {
    json!({
        "id": format!("scryfall-{oracle_id}"),
        "oracle_id": oracle_id,
        "name": name,
        "finishes": ["nonfoil"],
        "type_line": "Instant",
        "color_identity": [],
        "set": "tst",
        "set_name": "Test Set",
        "collector_number": oracle_id,
        "lang": "en",
        "image_uris": {"normal": format!("https://example.test/{oracle_id}.jpg")}
    })
}

/// A basic land test card.
pub(crate) fn basic_card(oracle_id: &str, name: &str) -> Value {
    fixtures::merge(
        card(oracle_id, name),
        json!({"type_line": format!("Basic Land — {name}")}),
    )
}

/// A collection item; `for_trade` is the for-trade quantity.
pub(crate) struct Item<'a> {
    pub scryfall_id: &'a str,
    pub quantity: i64,
    pub for_trade: i64,
    pub condition: &'a str,
    pub finish: &'a str,
    pub location_id: Option<i64>,
}

impl<'a> Item<'a> {
    pub fn new(scryfall_id: &'a str, quantity: i64) -> Self {
        Self {
            scryfall_id,
            quantity,
            for_trade: 0,
            condition: "near_mint",
            finish: "nonfoil",
            location_id: None,
        }
    }

    pub fn for_trade(mut self, quantity: i64) -> Self {
        self.for_trade = quantity;
        self
    }

    pub fn condition(mut self, condition: &'a str) -> Self {
        self.condition = condition;
        self
    }

    pub fn finish(mut self, finish: &'a str) -> Self {
        self.finish = finish;
        self
    }

    pub fn location(mut self, location_id: i64) -> Self {
        self.location_id = Some(location_id);
        self
    }

    pub async fn insert(self, app: &TestApp) -> i64 {
        sqlx::query_scalar(
            "INSERT INTO collection_items (scryfall_id, quantity, for_trade, for_trade_quantity,
               condition, finish, location_id, inserted_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING id",
        )
        .bind(self.scryfall_id)
        .bind(self.quantity)
        .bind(self.for_trade > 0)
        .bind(self.for_trade)
        .bind(self.condition)
        .bind(self.finish)
        .bind(self.location_id)
        .bind(T)
        .fetch_one(app.db())
        .await
        .unwrap()
    }
}

pub(crate) async fn insert_location(app: &TestApp, name: &str, kind: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO locations (name, kind, inserted_at, updated_at) VALUES (?1, ?2, ?3, ?3) RETURNING id",
    )
    .bind(name)
    .bind(kind)
    .bind(T)
    .fetch_one(app.db())
    .await
    .unwrap()
}

pub(crate) async fn insert_deck(app: &TestApp, name: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO decks (name, inserted_at, updated_at) VALUES (?1, ?2, ?2) RETURNING id",
    )
    .bind(name)
    .bind(T)
    .fetch_one(app.db())
    .await
    .unwrap()
}

pub(crate) async fn share_deck(app: &TestApp, deck_id: i64) -> String {
    let token = crate::trade::share::generate_token();
    sqlx::query("UPDATE decks SET share_token = ?1 WHERE id = ?2")
        .bind(&token)
        .bind(deck_id)
        .execute(app.db())
        .await
        .unwrap();
    token
}

/// Adds a card to a deck zone, bumping an existing row like
/// `Catalog.add_card_to_deck/2`; returns the deck card id.
pub(crate) async fn add_deck_card(
    app: &TestApp,
    deck_id: i64,
    oracle_id: &str,
    quantity: i64,
    zone: &str,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO deck_cards (deck_id, oracle_id, quantity, zone, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT (deck_id, oracle_id, zone) DO UPDATE SET quantity = quantity + excluded.quantity
         RETURNING id",
    )
    .bind(deck_id)
    .bind(oracle_id)
    .bind(quantity)
    .bind(zone)
    .bind(T)
    .fetch_one(app.db())
    .await
    .unwrap()
}

pub(crate) async fn allocate(app: &TestApp, deck_card_id: i64, item_id: i64, quantity: i64) {
    sqlx::query(
        "INSERT INTO deck_allocations (deck_card_id, collection_item_id, quantity, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
    )
    .bind(deck_card_id)
    .bind(item_id)
    .bind(quantity)
    .bind(T)
    .execute(app.db())
    .await
    .unwrap();
}

/// The first GraphQL error message of a response.
pub(crate) fn error_message(response: &Value) -> String {
    response["errors"][0]["message"]
        .as_str()
        .expect("an error")
        .to_owned()
}
