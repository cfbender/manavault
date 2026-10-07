//! Test database and fixtures. Mirrors `Manavault.CatalogTestFixtures`.

use std::str::FromStr;

use manavault_allocation::{
    CollectionItemId, DeckCardId, DeckCardTag, DeckId, DeckStatus, LocationId, LocationKind,
    Quantity, Zone,
};
use mtg_core::{Finish, ScryfallId};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{AssertSqlSafe, SqlitePool};

pub type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

/// Schema dumped from the Ecto migrations by `mix ecto.dump`.
const SCHEMA: &str = include_str!("../../../../../priv/repo/structure.sql");

pub const BLACK_LOTUS: &str = "oracle-1";
pub const TIME_WALK: &str = "oracle-2";
pub const PLAINS: &str = "oracle-plains";
pub const LOTUS_ALPHA: &str = "scryfall-printing-1";
pub const LOTUS_BETA: &str = "scryfall-printing-3";
pub const TIME_WALK_ALPHA: &str = "scryfall-printing-2";

/// A fresh in-memory database with the full schema and the fixture cards.
pub async fn db() -> TestResult<SqlitePool> {
    let options = SqliteConnectOptions::from_str("sqlite::memory:")?.foreign_keys(true);
    // One connection: each in-memory connection is a separate database.
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .min_connections(1)
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(options)
        .await?;

    // The dump includes SQLite's internal tables, which cannot be created.
    let schema: String = SCHEMA
        .lines()
        .filter(|line| !line.starts_with("CREATE TABLE sqlite_"))
        .collect::<Vec<_>>()
        .join("\n");
    sqlx::raw_sql(AssertSqlSafe(schema)).execute(&pool).await?;

    card(&pool, BLACK_LOTUS, "Black Lotus", "Artifact").await?;
    card(&pool, TIME_WALK, "Time Walk", "Sorcery").await?;
    card(&pool, PLAINS, "Plains", "Basic Land — Plains").await?;
    printing(&pool, LOTUS_ALPHA, BLACK_LOTUS, "lea", "232").await?;
    printing(&pool, LOTUS_BETA, BLACK_LOTUS, "leb", "233").await?;
    printing(&pool, TIME_WALK_ALPHA, TIME_WALK, "lea", "84").await?;
    printing(
        &pool,
        "scryfall-printing-basic-plains",
        PLAINS,
        "lea",
        "250",
    )
    .await?;

    Ok(pool)
}

pub fn qty(n: u32) -> TestResult<Quantity> {
    Ok(Quantity::new(n).ok_or("test quantities must be positive")?)
}

async fn card(pool: &SqlitePool, oracle_id: &str, name: &str, type_line: &str) -> TestResult {
    sqlx::query!(
        "INSERT INTO scryfall_cards (oracle_id, name, type_line, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        oracle_id,
        name,
        type_line
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn printing(
    pool: &SqlitePool,
    scryfall_id: &str,
    oracle_id: &str,
    set_code: &str,
    collector_number: &str,
) -> TestResult {
    sqlx::query!(
        "INSERT INTO scryfall_printings
           (scryfall_id, oracle_id, set_code, collector_number, lang, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'en', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
        scryfall_id,
        oracle_id,
        set_code,
        collector_number
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn location(pool: &SqlitePool, name: &str, kind: LocationKind) -> TestResult<LocationId> {
    Ok(sqlx::query_scalar!(
        r#"INSERT INTO locations (name, kind, inserted_at, updated_at)
           VALUES (?1, ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
           RETURNING id AS "id!: LocationId""#,
        name,
        kind
    )
    .fetch_one(pool)
    .await?)
}

pub async fn deck(pool: &SqlitePool, name: &str, status: DeckStatus) -> TestResult<DeckId> {
    Ok(sqlx::query_scalar!(
        r#"INSERT INTO decks (name, status, inserted_at, updated_at)
           VALUES (?1, ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
           RETURNING id AS "id!: DeckId""#,
        name,
        status
    )
    .fetch_one(pool)
    .await?)
}

pub async fn set_deck_status(pool: &SqlitePool, id: DeckId, status: DeckStatus) -> TestResult {
    sqlx::query!("UPDATE decks SET status = ?2 WHERE id = ?1", id, status)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn deck_card(
    pool: &SqlitePool,
    deck_id: DeckId,
    oracle_id: &str,
    quantity: u32,
    zone: Zone,
) -> TestResult<DeckCardId> {
    Ok(sqlx::query_scalar!(
        r#"INSERT INTO deck_cards (deck_id, oracle_id, quantity, zone, inserted_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
           RETURNING id AS "id!: DeckCardId""#,
        deck_id,
        oracle_id,
        quantity,
        zone
    )
    .fetch_one(pool)
    .await?)
}

pub async fn set_preferred_printing(
    pool: &SqlitePool,
    id: DeckCardId,
    printing: &str,
) -> TestResult {
    sqlx::query!(
        "UPDATE deck_cards SET preferred_printing_id = ?2 WHERE id = ?1",
        id,
        printing
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_proxy_quantity(pool: &SqlitePool, id: DeckCardId, proxies: u32) -> TestResult {
    sqlx::query!(
        "UPDATE deck_cards SET proxy_quantity = ?2 WHERE id = ?1",
        id,
        proxies
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_tag(pool: &SqlitePool, id: DeckCardId, tag: DeckCardTag) -> TestResult {
    sqlx::query!("UPDATE deck_cards SET tag = ?2 WHERE id = ?1", id, tag)
        .execute(pool)
        .await?;
    Ok(())
}

pub struct NewItem<'a> {
    pub scryfall_id: &'a str,
    pub quantity: u32,
    pub finish: Finish,
    pub location_id: Option<LocationId>,
    pub notes: Option<&'a str>,
    pub purchase_price_cents: Option<i64>,
    pub for_trade_quantity: u32,
}

impl<'a> NewItem<'a> {
    pub fn new(scryfall_id: &'a str, quantity: u32, location_id: Option<LocationId>) -> Self {
        Self {
            scryfall_id,
            quantity,
            finish: Finish::Nonfoil,
            location_id,
            notes: None,
            purchase_price_cents: None,
            for_trade_quantity: 0,
        }
    }
}

pub async fn item(pool: &SqlitePool, new: NewItem<'_>) -> TestResult<CollectionItemId> {
    let for_trade = new.for_trade_quantity > 0;
    Ok(sqlx::query_scalar!(
        r#"INSERT INTO collection_items
             (scryfall_id, quantity, finish, location_id, notes, purchase_price_cents,
              for_trade, for_trade_quantity, inserted_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
           RETURNING id AS "id!: CollectionItemId""#,
        new.scryfall_id,
        new.quantity,
        new.finish,
        new.location_id,
        new.notes,
        new.purchase_price_cents,
        for_trade,
        new.for_trade_quantity
    )
    .fetch_one(pool)
    .await?)
}

#[derive(Debug, PartialEq, Eq)]
pub struct ItemRow {
    pub quantity: u32,
    pub location_id: Option<LocationId>,
    pub finish: Finish,
    pub notes: Option<String>,
    pub purchase_price_cents: Option<i64>,
    pub for_trade: bool,
    pub for_trade_quantity: u32,
    pub location_changed_at: Option<String>,
}

pub async fn item_row(pool: &SqlitePool, id: CollectionItemId) -> TestResult<ItemRow> {
    Ok(sqlx::query_as!(
        ItemRow,
        r#"SELECT
             quantity AS "quantity: u32",
             location_id AS "location_id: LocationId",
             finish AS "finish: Finish",
             notes,
             purchase_price_cents,
             for_trade AS "for_trade: bool",
             for_trade_quantity AS "for_trade_quantity: u32",
             location_changed_at
           FROM collection_items WHERE id = ?1"#,
        id
    )
    .fetch_one(pool)
    .await?)
}

/// Ids of every collection item stored in `location_id` (`None` = not in any
/// location, which includes allocated copies).
pub async fn items_in(
    pool: &SqlitePool,
    location_id: Option<LocationId>,
) -> TestResult<Vec<CollectionItemId>> {
    Ok(sqlx::query_scalar!(
        r#"SELECT id AS "id!: CollectionItemId" FROM collection_items
           WHERE location_id IS ?1 ORDER BY id"#,
        location_id
    )
    .fetch_all(pool)
    .await?)
}

#[derive(Debug, PartialEq, Eq)]
pub struct DeckCardRow {
    pub preferred_printing_id: Option<ScryfallId>,
    pub finish: Finish,
    pub tag: Option<DeckCardTag>,
}

pub async fn deck_card_row(pool: &SqlitePool, id: DeckCardId) -> TestResult<DeckCardRow> {
    Ok(sqlx::query_as!(
        DeckCardRow,
        r#"SELECT
             preferred_printing_id AS "preferred_printing_id: ScryfallId",
             finish AS "finish: Finish",
             tag AS "tag: DeckCardTag"
           FROM deck_cards WHERE id = ?1"#,
        id
    )
    .fetch_one(pool)
    .await?)
}

pub async fn allocation_count(pool: &SqlitePool) -> TestResult<i64> {
    Ok(sqlx::query_scalar!("SELECT COUNT(*) FROM deck_allocations")
        .fetch_one(pool)
        .await?)
}
