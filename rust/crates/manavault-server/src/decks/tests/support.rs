//! Fixtures and helpers shared by the deck tests
//! (`test/support/manavault/catalog_test_support.ex`).

use lotus::{Finish, OracleId, ScryfallId};
use serde_json::{Value, json};

use crate::decks::cards::{self, CardRef, DeckCardChanges, NewDeckCard};
use crate::decks::model::{CollectionItemId, DeckCardId, DeckCardRow, DeckId, DeckRow, LocationId};
use crate::decks::records::{self, DeckChanges};
use crate::graphql::{NodeKind, global_id};
use crate::test_support::TestApp;
use crate::test_support::fixtures::{self, merge};

/// `slug/1`.
pub fn slug(value: &str) -> String {
    let lower = value.to_lowercase();
    let mut out = String::new();
    let mut dash = false;
    for c in lower.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            dash = false;
        } else if !dash {
            out.push('-');
            dash = true;
        }
    }
    out.trim_matches('-').to_owned()
}

/// `legality_card/4`.
pub fn legality_card(name: &str, colors: &[&str], legalities: Value, overrides: Value) -> Value {
    let slug = slug(name);
    let mut card = merge(
        merge(
            fixtures::time_walk(),
            json!({
                "id": format!("scryfall-printing-{slug}"),
                "oracle_id": format!("oracle-{slug}"),
                "name": name,
                "type_line": "Instant",
                "colors": colors,
                "color_identity": colors,
                "set": "tst",
                "set_name": "Test Set",
                "collector_number": slug,
                "lang": "en",
                "finishes": ["nonfoil"],
                "prices": {},
                "released_at": "2026-01-01"
            }),
        ),
        json!({}),
    );
    card["legalities"] = legalities;
    merge(card, overrides)
}

/// `legality_commander_card/3`.
pub fn legality_commander_card(name: &str, colors: &[&str], overrides: Value) -> Value {
    legality_card(
        name,
        colors,
        json!({"commander": "legal"}),
        merge(
            json!({"type_line": "Legendary Creature — Human"}),
            overrides,
        ),
    )
}

/// `legal_plains/0`.
pub fn legal_plains() -> Value {
    merge(
        fixtures::plains(),
        json!({"legalities": {"commander": "legal"}}),
    )
}

/// A minimal catalog card with one printing (the web tests' inline maps).
pub fn simple_card(
    id: &str,
    oracle_id: &str,
    name: &str,
    type_line: &str,
    overrides: Value,
) -> Value {
    merge(
        json!({
            "id": id,
            "oracle_id": oracle_id,
            "name": name,
            "type_line": type_line,
            "collector_number": "1",
            "set": "tst",
            "set_name": "Test Set",
            "lang": "en",
            "image_uris": {},
            "finishes": ["nonfoil"],
            "legalities": {}
        }),
        overrides,
    )
}

/// `Catalog.create_deck/1` with a name and optional format and status.
pub async fn create_deck(
    app: &TestApp,
    name: &str,
    format: Option<&str>,
    status: Option<&str>,
) -> DeckRow {
    records::create_deck(
        app.db(),
        &DeckChanges {
            name: Some(Some(name.to_owned())),
            format: format.map(|format| Some(format.to_owned())),
            status: status.map(|status| Some(status.to_owned())),
            ..DeckChanges::default()
        },
    )
    .await
    .unwrap()
}

/// Updates deck fields.
pub async fn update_deck(app: &TestApp, deck: DeckId, changes: DeckChanges) -> DeckRow {
    records::update_deck(app.db(), deck, &changes)
        .await
        .unwrap()
}

/// Archives (or otherwise sets the status of) a deck.
pub async fn set_status(app: &TestApp, deck: DeckId, status: &str) -> DeckRow {
    update_deck(
        app,
        deck,
        DeckChanges {
            status: Some(Some(status.to_owned())),
            ..DeckChanges::default()
        },
    )
    .await
}

/// Add-card attributes by name.
pub fn by_name(name: &str, quantity: i64, zone: &str) -> NewDeckCard {
    NewDeckCard {
        card: CardRef::Name(name.to_owned()),
        changes: DeckCardChanges {
            quantity: Some(Some(quantity)),
            zone: Some(Some(zone.to_owned())),
            ..DeckCardChanges::default()
        },
    }
}

/// Add-card attributes by oracle id.
pub fn by_oracle(oracle_id: &str, quantity: i64, zone: &str) -> NewDeckCard {
    NewDeckCard {
        card: CardRef::Oracle(OracleId::new(oracle_id)),
        changes: DeckCardChanges {
            quantity: Some(Some(quantity)),
            zone: Some(Some(zone.to_owned())),
            ..DeckCardChanges::default()
        },
    }
}

/// `add_deck_card!/4`.
pub async fn add_card(
    app: &TestApp,
    deck: DeckId,
    name: &str,
    quantity: i64,
    zone: &str,
) -> DeckCardRow {
    cards::add_card_to_deck(app.db(), deck, &by_name(name, quantity, zone))
        .await
        .unwrap()
}

/// Adds a card with a preferred printing.
pub async fn add_printing(
    app: &TestApp,
    deck: DeckId,
    name: &str,
    quantity: i64,
    printing: &str,
) -> DeckCardRow {
    let mut new = by_name(name, quantity, "mainboard");
    new.changes.preferred_printing_id = Some(Some(ScryfallId::new(printing)));
    cards::add_card_to_deck(app.db(), deck, &new).await.unwrap()
}

/// Inserts a location.
pub async fn location(app: &TestApp, name: &str, kind: &str) -> LocationId {
    sqlx::query_scalar!(
        r#"INSERT INTO locations (name, kind, inserted_at, updated_at)
           VALUES (?1, ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
           RETURNING id AS "id!: LocationId""#,
        name,
        kind
    )
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// Inserts a collection item (`Catalog.create_collection_item/1`).
pub async fn collection_item(
    app: &TestApp,
    scryfall_id: &str,
    quantity: i64,
    finish: Finish,
    location: Option<LocationId>,
) -> CollectionItemId {
    sqlx::query_scalar!(
        r#"INSERT INTO collection_items (scryfall_id, quantity, condition, language, finish, location_id,
                                         for_trade, for_trade_quantity, inserted_at, updated_at)
           VALUES (?1, ?2, 'near_mint', 'en', ?3, ?4, 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
           RETURNING id AS "id!: CollectionItemId""#,
        scryfall_id,
        quantity,
        finish,
        location
    )
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// `Catalog.allocate_collection_item_to_deck_card/3`, through the
/// allocation crate.
pub async fn allocate(app: &TestApp, deck_card: DeckCardId, item: CollectionItemId, quantity: u32) {
    manavault_allocation::allocate(
        app.db(),
        deck_card,
        item,
        lotus::Quantity::new(quantity).unwrap(),
    )
    .await
    .unwrap();
}

/// Total reserved copies of a deck card.
pub async fn allocated_quantity(app: &TestApp, deck_card: DeckCardId) -> i64 {
    sqlx::query_scalar!(
        r#"SELECT COALESCE(SUM(quantity), 0) AS "total!: i64" FROM deck_allocations WHERE deck_card_id = ?1"#,
        deck_card
    )
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// Every reservation (deck card, item, quantity).
pub async fn all_allocations(app: &TestApp) -> Vec<(i64, i64, i64)> {
    sqlx::query!(
        r#"SELECT deck_card_id AS "deck_card_id!", collection_item_id AS "item!", quantity AS "quantity!"
           FROM deck_allocations ORDER BY id"#
    )
    .fetch_all(app.db())
    .await
    .unwrap()
    .into_iter()
    .map(|row| (row.deck_card_id, row.item, row.quantity))
    .collect()
}

/// A collection item's location.
pub async fn item_location(app: &TestApp, item: CollectionItemId) -> Option<i64> {
    sqlx::query_scalar!(
        "SELECT location_id FROM collection_items WHERE id = ?1",
        item
    )
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// Copies stored in a location (`binder_quantity/1`).
pub async fn location_quantity(app: &TestApp, location: LocationId) -> i64 {
    sqlx::query_scalar!(
        r#"SELECT COALESCE(SUM(quantity), 0) AS "total!: i64" FROM collection_items WHERE location_id = ?1"#,
        location
    )
    .fetch_one(app.db())
    .await
    .unwrap()
}

/// A deck's cards ordered by oracle id.
pub async fn deck_cards(app: &TestApp, deck: DeckId) -> Vec<DeckCardRow> {
    crate::deck_card_row_query!("WHERE dc.deck_id = ?1 ORDER BY dc.oracle_id", deck)
        .fetch_all(app.db())
        .await
        .unwrap()
}

/// One deck card, if it still exists.
pub async fn deck_card(app: &TestApp, id: DeckCardId) -> Option<DeckCardRow> {
    crate::decks::model::load_deck_card(app.db(), id)
        .await
        .unwrap()
}

/// The deck's cards with catalog data, in deck order.
pub async fn contents(app: &TestApp, deck: DeckId) -> std::sync::Arc<crate::decks::DeckContents> {
    crate::decks::contents::load_deck_contents(app.db(), deck)
        .await
        .unwrap()
}

/// Card names of a deck in deck order.
pub async fn card_names(app: &TestApp, deck: DeckId) -> Vec<String> {
    contents(app, deck)
        .await
        .cards
        .iter()
        .map(|card| card.card.name.clone())
        .collect()
}

/// The deck's legality.
pub async fn legality(app: &TestApp, deck: DeckId) -> crate::decks::legality::DeckLegality {
    let row = records::get_deck(app.db(), deck).await.unwrap();
    contents(app, deck).await.legality(row.format)
}

/// Codes of a legality's issues.
pub fn codes(legality: &crate::decks::legality::DeckLegality) -> Vec<&'static str> {
    legality.issues.iter().map(|issue| issue.code).collect()
}

/// `issue_by_code/2`.
pub fn issue<'a>(
    legality: &'a crate::decks::legality::DeckLegality,
    code: &str,
) -> &'a crate::decks::legality::LegalityIssue {
    legality
        .issues
        .iter()
        .find(|issue| issue.code == code)
        .unwrap()
}

/// The global id of a deck.
pub fn deck_gid(id: DeckId) -> String {
    global_id(NodeKind::Deck, id.0).to_string()
}

/// The global id of a deck card.
pub fn card_gid(id: DeckCardId) -> String {
    global_id(NodeKind::DeckCard, id.0).to_string()
}

/// The first GraphQL error message.
pub fn error_message(response: &Value) -> String {
    response["errors"][0]["message"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

/// Clears the default tags so tag tests start tag-less.
pub async fn clear_default_tags(app: &TestApp) {
    crate::decks::tags::replace_default_deck_tags(app.db(), &[])
        .await
        .unwrap();
}
