//! Collection tests: items, locations, auto-sort, bulk clean, imports (CSV
//! parsing is tested in `import::parse`), and the collection GraphQL fields
//! (items, queries, the item selector, bulk updates, locations and imports,
//! allocation decks, and the home summary).
//!
//! Decks and allocations are inserted with SQL.

mod auto_sort;
mod bulk_clean;
mod import;
mod items;
mod locations;
mod schema;

use async_graphql::{ID, MaybeUndefined};
use serde_json::{Value, json};

use crate::collection::changes::{self, ItemChanges};
use crate::collection::filters::ItemFilters;
use crate::collection::item::CollectionItem;
use crate::collection::location::{self, LocationChanges, LocationRecord};
use crate::collection::queries::{self, Page};
use crate::test_app::TestApp;
use manavault_catalog::testing::fixtures::merge;
use manavault_core::graphql::{NodeKind, global_id};

/// Item attributes for [`create_item`].
#[derive(Default)]
pub(crate) struct Attrs {
    pub quantity: Option<i64>,
    pub finish: Option<&'static str>,
    pub condition: Option<&'static str>,
    pub language: Option<&'static str>,
    pub location_id: Option<i64>,
    pub purchase_price_cents: Option<i64>,
    pub for_trade: Option<bool>,
    pub for_trade_quantity: Option<i64>,
    pub notes: Option<&'static str>,
}

fn maybe<T>(value: Option<T>) -> MaybeUndefined<T> {
    value.map_or(MaybeUndefined::Undefined, MaybeUndefined::Value)
}

impl Attrs {
    pub(crate) fn changes(self, scryfall_id: &str) -> ItemChanges {
        ItemChanges {
            scryfall_id: MaybeUndefined::Value(scryfall_id.to_owned()),
            quantity: maybe(self.quantity),
            condition: maybe(self.condition.map(str::to_owned)),
            language: maybe(self.language.map(str::to_owned)),
            finish: maybe(self.finish.map(str::to_owned)),
            location_id: maybe(self.location_id),
            notes: maybe(self.notes.map(str::to_owned)),
            purchase_price_cents: maybe(self.purchase_price_cents),
            for_trade: maybe(self.for_trade),
            for_trade_quantity: maybe(self.for_trade_quantity),
        }
    }
}

/// `Catalog.create_collection_item/1`, asserting success.
pub(crate) async fn create_item(app: &TestApp, scryfall_id: &str, attrs: Attrs) -> CollectionItem {
    changes::create(app.db(), &app.state.prices, attrs.changes(scryfall_id))
        .await
        .unwrap()
}

/// `Catalog.create_location/1`, asserting success.
pub(crate) async fn create_location(app: &TestApp, name: &str, kind: &str) -> LocationRecord {
    location::create(
        app.db(),
        LocationChanges {
            name: MaybeUndefined::Value(name.to_owned()),
            kind: MaybeUndefined::Value(kind.to_owned()),
            ..LocationChanges::default()
        },
    )
    .await
    .unwrap()
}

/// Inserts a deck (`status`), returning its id.
pub(crate) async fn insert_deck(app: &TestApp, name: &str, status: &str) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO decks (name, status, inserted_at, updated_at) VALUES (?1, ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z') RETURNING id",
    )
    .bind(name)
    .bind(status)
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// Adds the item's card to the deck and allocates `quantity` copies of the
/// item to it (`allocate_collection_item_to_deck_card/2`).
pub(crate) async fn allocate(app: &TestApp, deck_id: i64, item_id: i64, quantity: i64) {
    let oracle_id: String = sqlx::query_scalar(
        "SELECT p.oracle_id FROM collection_items AS i JOIN scryfall_printings AS p ON p.scryfall_id = i.scryfall_id WHERE i.id = ?1",
    )
    .bind(item_id)
    .fetch_one(app.db())
    .await
    .unwrap();
    let deck_card_id: i64 = sqlx::query_scalar(
        "INSERT INTO deck_cards (deck_id, oracle_id, quantity, inserted_at, updated_at) VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z') RETURNING id",
    )
    .bind(deck_id)
    .bind(oracle_id)
    .bind(quantity)
    .fetch_one(app.db())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO deck_allocations (deck_card_id, collection_item_id, quantity, inserted_at, updated_at) VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
    )
    .bind(deck_card_id)
    .bind(item_id)
    .bind(quantity)
    .execute(app.db())
    .await
    .unwrap();
}

/// Sets a column of an item directly (`Repo.update_all`).
pub(crate) async fn set_item_column(app: &TestApp, item_id: i64, column: &str, value: &str) {
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "UPDATE collection_items SET {column} = ?1 WHERE id = ?2"
    )))
    .bind(value)
    .bind(item_id)
    .execute(app.db())
    .await
    .unwrap();
}

/// Ids of the first ten listed items (`collection_item_ids/1`).
pub(crate) async fn item_ids(app: &TestApp, filters: &ItemFilters) -> Vec<i64> {
    list(
        app,
        filters,
        Page {
            limit: 10,
            ..Page::default()
        },
    )
    .await
}

pub(crate) async fn list(app: &TestApp, filters: &ItemFilters, page: Page) -> Vec<i64> {
    queries::list_items(app.db(), filters, page)
        .await
        .unwrap()
        .iter()
        .map(|item| item.record.id)
        .collect()
}

/// Ids matching a search term.
pub(crate) async fn search_ids(app: &TestApp, q: &str) -> Vec<i64> {
    item_ids(app, &ItemFilters::search(q)).await
}

/// Copies matching the filters (`count_collection_items/1`).
pub(crate) async fn count(app: &TestApp, filters: &ItemFilters) -> i64 {
    queries::totals(app.db(), filters).await.unwrap().quantity
}

/// Reloads an item.
pub(crate) async fn reload(app: &TestApp, id: i64) -> Option<CollectionItem> {
    CollectionItem::load(app.db(), id).await.unwrap()
}

pub(crate) fn gid(kind: NodeKind, id: impl std::fmt::Display) -> String {
    let ID(id) = global_id(kind, id);
    id
}

/// `CatalogTestSupport.reversible_lotus/0`.
pub(crate) fn reversible_lotus() -> Value {
    use manavault_catalog::testing::fixtures::black_lotus;
    let lotus = black_lotus();
    let face = json!({
        "oracle_id": lotus["oracle_id"],
        "name": lotus["name"],
        "type_line": lotus["type_line"],
        "mana_cost": lotus["mana_cost"],
        "cmc": lotus["cmc"],
        "oracle_text": lotus["oracle_text"],
    });
    let mut card = merge(
        lotus,
        json!({
            "id": "scryfall-reversible-1",
            "name": "Black Lotus // Black Lotus",
            "layout": "reversible_card",
            "set": "leb",
            "set_name": "Limited Edition Beta",
            "collector_number": "351",
            "card_faces": [face.clone(), face],
        }),
    );
    if let Some(map) = card.as_object_mut() {
        for key in ["oracle_id", "type_line", "mana_cost", "cmc", "oracle_text"] {
            map.remove(key);
        }
    }
    card
}

/// `CollectionTest.test_card/6`.
pub(crate) fn test_card(
    slug: &str,
    name: &str,
    type_line: &str,
    colors: &[&str],
    rarity: &str,
    price: &str,
) -> Value {
    json!({
        "id": format!("scryfall-{slug}"),
        "oracle_id": format!("oracle-{slug}"),
        "name": name,
        "type_line": type_line,
        "oracle_text": "",
        "mana_cost": "",
        "cmc": 0.0,
        "colors": colors,
        "color_identity": colors,
        "legalities": {},
        "set": "tst",
        "set_name": "Test Set",
        "collector_number": slug,
        "lang": "en",
        "rarity": rarity,
        "finishes": ["nonfoil"],
        "prices": {"usd": price},
        "released_at": "2026-01-01"
    })
}

/// A minimal card printing for schema tests.
pub(crate) fn simple_card(id: &str, oracle_id: &str, name: &str, extra: Value) -> Value {
    merge(
        json!({
            "id": id,
            "oracle_id": oracle_id,
            "name": name,
            "type_line": "Artifact",
            "collector_number": "1",
            "set": "tst",
            "set_name": "Test Set",
            "lang": "en",
            "image_uris": {},
            "finishes": ["nonfoil"],
            "legalities": {}
        }),
        extra,
    )
}
