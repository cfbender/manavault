//! Applies the migrations a database is missing, recording them in
//! `schema_migrations` with the same versions and `inserted_at` format
//! earlier releases recorded, so installs of any older release upgrade in
//! place.
//!
//! The SQL files in `rust/migrations` (embedded at build time) were
//! originally generated from the earlier backend's migration SQL log (see
//! `rust/notes/migrations.md`); new schema changes are new files. The
//! migrations that read or wrote data in code are implemented here
//! ([`data_step`]).
//!
//! Pending migrations run oldest first, each in its own transaction, and
//! versions recorded in `schema_migrations` that this build does not know (a
//! database from a newer release) are left alone.

use std::collections::{BTreeMap, HashMap, HashSet};

use sqlx::{AssertSqlSafe, Connection, Row, SqliteConnection, SqlitePool};
use time::OffsetDateTime;
use time::macros::format_description;

#[allow(clippy::unreadable_literal)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/migrations.rs"));
}
pub use generated::MIGRATIONS;

/// The `schema_migrations` table, as earlier releases created it.
const SCHEMA_MIGRATIONS: &str = r#"CREATE TABLE IF NOT EXISTS "schema_migrations" ("version" INTEGER PRIMARY KEY, "inserted_at" TEXT)"#;

/// Errors while migrating.
#[derive(Debug, thiserror::Error)]
pub enum MigrateError {
    /// A migration failed; it was rolled back and later ones did not run.
    #[error("migration {version} ({name}) failed: {source}")]
    Migration {
        version: i64,
        name: &'static str,
        source: sqlx::Error,
    },
    /// Reading or creating `schema_migrations` failed.
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

/// Versions of migrations that were deleted after release and whose tables
/// a later migration dropped. Older installs still have their rows in
/// `schema_migrations`; they are known, never applied, and not reported as
/// newer than this build. Commit 6f75f86 (2026-06-22, "delete scanner and
/// pivot to better import") removed all three files, and
/// `20260622000001_drop_scanner_tables` drops their tables. No other
/// migration file was ever deleted from the history.
pub const RETIRED: [(i64, &str); 3] = [
    (20_260_104_000_000, "create_scan_sessions"),
    (20_260_104_000_001, "drop_scan_candidates"),
    (20_260_621_000_002, "create_scryfall_printing_art_hashes"),
];

/// What [`run`] did.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Outcome {
    /// Versions applied by this run, oldest first.
    pub applied: Vec<i64>,
    /// Versions recorded in the database that this build does not know.
    pub unknown: Vec<i64>,
}

/// Every migration version this build knows.
pub fn versions() -> impl Iterator<Item = i64> {
    MIGRATIONS.iter().map(|(version, _, _)| *version)
}

/// Versions recorded in `schema_migrations`; empty when the table is missing.
pub async fn applied_versions(conn: &mut SqliteConnection) -> Result<HashSet<i64>, sqlx::Error> {
    let has_table: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .fetch_optional(&mut *conn)
    .await?;
    if has_table.is_none() {
        return Ok(HashSet::new());
    }
    Ok(sqlx::query_scalar("SELECT version FROM schema_migrations")
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .collect())
}

/// Whether any known migration is missing from the database.
pub async fn pending(pool: &SqlitePool) -> Result<bool, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    let applied = applied_versions(&mut conn).await?;
    Ok(versions().any(|version| !applied.contains(&version)))
}

/// Runs every pending migration, oldest first.
pub async fn run(pool: &SqlitePool) -> Result<Outcome, MigrateError> {
    let mut conn = pool.acquire().await?;
    sqlx::raw_sql(SCHEMA_MIGRATIONS).execute(&mut *conn).await?;
    let recorded = applied_versions(&mut conn).await?;

    let mut outcome = Outcome::default();
    for &(version, name, sql) in MIGRATIONS {
        if recorded.contains(&version) {
            continue;
        }
        tracing::info!("== Running {version} {name}");
        apply(&mut conn, version, sql)
            .await
            .map_err(|source| MigrateError::Migration {
                version,
                name,
                source,
            })?;
        outcome.applied.push(version);
    }
    let known: HashSet<i64> = versions()
        .chain(RETIRED.iter().map(|(version, _)| *version))
        .collect();
    let mut unknown: Vec<i64> = recorded.difference(&known).copied().collect();
    unknown.sort_unstable();
    outcome.unknown = unknown;
    Ok(outcome)
}

/// `schema_migrations.inserted_at` as earlier releases recorded it: naive
/// UTC seconds.
fn migration_inserted_at() -> String {
    naive_now()
}

/// The current UTC time as ISO 8601 seconds without the `Z`, the format
/// migrations of earlier releases wrote timestamps in.
fn naive_now() -> String {
    OffsetDateTime::now_utc()
        .format(format_description!(
            "[year]-[month]-[day]T[hour]:[minute]:[second]"
        ))
        .unwrap_or_default()
}

async fn apply(conn: &mut SqliteConnection, version: i64, sql: &str) -> Result<(), sqlx::Error> {
    let inserted_at = migration_inserted_at();
    // `PRAGMA foreign_keys` is a no-op inside a transaction, so migrations that
    // rebuild tables (outside a DDL transaction) run statement by
    // statement. None of ManaVault's 74 migrations do today.
    if sql.contains("PRAGMA foreign_keys = OFF") {
        sqlx::raw_sql(AssertSqlSafe(sql.to_owned()))
            .execute(&mut *conn)
            .await?;
        data_step(&mut *conn, version).await?;
        record(&mut *conn, version, &inserted_at).await
    } else {
        let mut tx = conn.begin_with("BEGIN IMMEDIATE").await?;
        sqlx::raw_sql(AssertSqlSafe(sql.to_owned()))
            .execute(&mut *tx)
            .await?;
        data_step(&mut tx, version).await?;
        record(&mut tx, version, &inserted_at).await?;
        tx.commit().await
    }
}

async fn record(
    conn: &mut SqliteConnection,
    version: i64,
    inserted_at: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO schema_migrations (version, inserted_at) VALUES (?1, ?2)")
        .bind(version)
        .bind(inserted_at)
        .execute(conn)
        .await
        .map(|_| ())
}

/// The data changes migrations make in code rather than SQL. Queries are built at
/// runtime (not the checked macros) because they target the schema as of
/// their migration, not the current one.
async fn data_step(conn: &mut SqliteConnection, version: i64) -> Result<(), sqlx::Error> {
    match version {
        20_260_708_000_002 => seed_default_deck_tags(conn).await,
        20_260_708_000_003 => backfill_deck_default_tags(conn).await,
        20_260_802_120_000 => merge_deck_zones_into_considering(conn).await,
        20_260_808_000_000 => normalize_card_names(conn).await,
        20_260_809_000_000 => delete_cards_without_printings(conn).await,
        20_260_815_000_000 => normalize_flavor_names(conn).await,
        20_261_005_000_000 => deallocate_considering_deck_cards(conn).await,
        _ => Ok(()),
    }
}

/// `CreateDefaultDeckTags`: the four starter tags.
async fn seed_default_deck_tags(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    let now = naive_now();
    for (position, (name, color)) in [
        ("Ramp", "#22C55E"),
        ("Draw", "#3B82F6"),
        ("Interact", "#EF4444"),
        ("Plan", "#A855F7"),
    ]
    .into_iter()
    .enumerate()
    {
        sqlx::query(
            "INSERT INTO default_deck_tags (name, position, color, inserted_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        )
        .bind(name)
        .bind(i64::try_from(position).unwrap_or(0))
        .bind(color)
        .bind(&now)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// `BackfillDeckDefaultTags`: every deck without tags gets a copy of the
/// default tags.
async fn backfill_deck_default_tags(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    let now = naive_now();
    let defaults = sqlx::query(
        "SELECT name, color, target_count, position FROM default_deck_tags ORDER BY position",
    )
    .fetch_all(&mut *conn)
    .await?;
    let decks: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM decks WHERE id NOT IN (SELECT DISTINCT deck_id FROM deck_tags) ORDER BY id",
    )
    .fetch_all(&mut *conn)
    .await?;
    for deck_id in decks {
        for tag in &defaults {
            sqlx::query(
                "INSERT INTO deck_tags (deck_id, name, color, target_count, position, inserted_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            )
            .bind(deck_id)
            .bind(tag.try_get::<String, _>("name")?)
            .bind(tag.try_get::<String, _>("color")?)
            .bind(tag.try_get::<Option<i64>, _>("target_count")?)
            .bind(tag.try_get::<i64, _>("position")?)
            .bind(&now)
            .execute(&mut *conn)
            .await?;
        }
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct ZoneRow {
    id: i64,
    quantity: i64,
    proxy_quantity: i64,
    tag: Option<String>,
    preferred_printing_id: Option<String>,
}

/// `MergeDeckZonesIntoConsidering`: a deck's `sideboard` and `maybeboard`
/// rows for one card merge into the lowest-id row (quantities and proxies
/// summed, tag `consider_cutting` > `getting` > none, the keeper's preferred
/// printing unless it has none, the keeper's finish), the losers'
/// allocations move onto the keeper (merging quantities when the keeper
/// already holds that collection item), the losers are deleted, and every
/// remaining `sideboard`/`maybeboard` row becomes `considering`.
async fn merge_deck_zones_into_considering(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    let now = naive_now();
    let rows = sqlx::query(
        "SELECT id, deck_id, oracle_id, quantity, proxy_quantity, tag, preferred_printing_id
         FROM deck_cards WHERE zone IN ('sideboard', 'maybeboard') ORDER BY id",
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut groups: BTreeMap<(i64, String), Vec<ZoneRow>> = BTreeMap::new();
    for row in rows {
        groups
            .entry((row.try_get("deck_id")?, row.try_get("oracle_id")?))
            .or_default()
            .push(ZoneRow {
                id: row.try_get("id")?,
                quantity: row.try_get("quantity")?,
                proxy_quantity: row.try_get("proxy_quantity")?,
                tag: row.try_get("tag")?,
                preferred_printing_id: row.try_get("preferred_printing_id")?,
            });
    }
    for group in groups.into_values() {
        let Some((keeper, losers)) = group.split_first() else {
            continue;
        };
        if losers.is_empty() {
            continue;
        }
        let quantity: i64 = group.iter().map(|row| row.quantity).sum();
        let proxy_quantity: i64 = group.iter().map(|row| row.proxy_quantity).sum();
        let tags: Vec<Option<&str>> = group.iter().map(|row| row.tag.as_deref()).collect();
        let tag = if tags.contains(&Some("consider_cutting")) {
            Some("consider_cutting")
        } else if tags.contains(&Some("getting")) {
            Some("getting")
        } else {
            None
        };
        let preferred_printing_id = keeper.preferred_printing_id.clone().or_else(|| {
            losers
                .iter()
                .find_map(|row| row.preferred_printing_id.clone())
        });

        let mut index: HashMap<i64, (i64, i64)> = HashMap::new();
        for allocation in sqlx::query(
            "SELECT id, collection_item_id, quantity FROM deck_allocations WHERE deck_card_id = ?1 ORDER BY id",
        )
        .bind(keeper.id)
        .fetch_all(&mut *conn)
        .await?
        {
            index.insert(
                allocation.try_get("collection_item_id")?,
                (allocation.try_get("id")?, allocation.try_get("quantity")?),
            );
        }
        for loser in losers {
            let allocations = sqlx::query(
                "SELECT id, collection_item_id, quantity FROM deck_allocations WHERE deck_card_id = ?1 ORDER BY id",
            )
            .bind(loser.id)
            .fetch_all(&mut *conn)
            .await?;
            for allocation in allocations {
                let id: i64 = allocation.try_get("id")?;
                let item_id: i64 = allocation.try_get("collection_item_id")?;
                let allocated: i64 = allocation.try_get("quantity")?;
                if let Some((existing_id, existing_quantity)) = index.get(&item_id).copied() {
                    let merged = existing_quantity + allocated;
                    sqlx::query(
                        "UPDATE deck_allocations SET quantity = ?1, updated_at = ?2 WHERE id = ?3",
                    )
                    .bind(merged)
                    .bind(&now)
                    .bind(existing_id)
                    .execute(&mut *conn)
                    .await?;
                    sqlx::query("DELETE FROM deck_allocations WHERE id = ?1")
                        .bind(id)
                        .execute(&mut *conn)
                        .await?;
                    index.insert(item_id, (existing_id, merged));
                } else {
                    sqlx::query(
                        "UPDATE deck_allocations SET deck_card_id = ?1, updated_at = ?2 WHERE id = ?3",
                    )
                    .bind(keeper.id)
                    .bind(&now)
                    .bind(id)
                    .execute(&mut *conn)
                    .await?;
                    index.insert(item_id, (id, allocated));
                }
            }
        }
        sqlx::query(
            "UPDATE deck_cards SET quantity = ?1, proxy_quantity = ?2, tag = ?3, preferred_printing_id = ?4, updated_at = ?5 WHERE id = ?6",
        )
        .bind(quantity)
        .bind(proxy_quantity)
        .bind(tag)
        .bind(preferred_printing_id)
        .bind(&now)
        .bind(keeper.id)
        .execute(&mut *conn)
        .await?;
        for loser in losers {
            sqlx::query("DELETE FROM deck_cards WHERE id = ?1")
                .bind(loser.id)
                .execute(&mut *conn)
                .await?;
        }
    }
    sqlx::query(
        "UPDATE deck_cards SET zone = 'considering' WHERE zone IN ('sideboard', 'maybeboard')",
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// `AddNormalizedCardNames`: `normalized_name` for every card. The
/// migration's `normalize_name/1` (NFD, drop marks, lowercase, drop apostrophes, squash
/// whitespace, trim) is [`lotus::normalize_name`].
async fn normalize_card_names(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    let cards: Vec<(String, String)> = sqlx::query_as("SELECT oracle_id, name FROM scryfall_cards")
        .fetch_all(&mut *conn)
        .await?;
    for (oracle_id, name) in cards {
        sqlx::query("UPDATE scryfall_cards SET normalized_name = ?1 WHERE oracle_id = ?2")
            .bind(lotus::normalize_name(&name))
            .bind(oracle_id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

/// `DeleteCardsWithoutPrintings`: cards with no printing, and their deck
/// cards, are deleted.
async fn delete_cards_without_printings(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    const ORPHANS: &str = "SELECT card.oracle_id FROM scryfall_cards AS card
         LEFT JOIN scryfall_printings AS printing ON printing.oracle_id = card.oracle_id
         WHERE printing.scryfall_id IS NULL";
    sqlx::raw_sql(AssertSqlSafe(format!(
        "DELETE FROM deck_cards WHERE oracle_id IN ({ORPHANS});
         DELETE FROM scryfall_cards WHERE oracle_id IN ({ORPHANS});"
    )))
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// `AddNormalizedFlavorNames`: `normalized_flavor_name` for every printing
/// with a flavor name.
async fn normalize_flavor_names(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    let printings: Vec<(String, String)> = sqlx::query_as(
        "SELECT scryfall_id, flavor_name FROM scryfall_printings WHERE flavor_name IS NOT NULL",
    )
    .fetch_all(&mut *conn)
    .await?;
    for (scryfall_id, flavor_name) in printings {
        sqlx::query(
            "UPDATE scryfall_printings SET normalized_flavor_name = ?1 WHERE scryfall_id = ?2",
        )
        .bind(lotus::normalize_name(&flavor_name))
        .bind(scryfall_id)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// `DeallocateConsideringDeckCards`: every allocation on a considering deck
/// card is released back to its source location (splitting the item when
/// only part of it was allocated), and considering cards lose their proxies.
///
/// Two bugs of the original migration are not copied: it read every item's quantity
/// once up front, so two partial allocations of the same item each split from
/// the original quantity and created copies; and the split-off item dropped
/// `purchase_price_cents`. This keeps a running quantity per item and copies
/// the purchase price, as `AllocationItems.restore_from_deck!/3` does.
async fn deallocate_considering_deck_cards(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    let now = crate::timefmt::now();
    let allocations = sqlx::query(
        "SELECT a.id, a.quantity, a.source_location_id, ci.id AS item_id
         FROM deck_allocations AS a
         JOIN deck_cards AS dc ON dc.id = a.deck_card_id
         JOIN collection_items AS ci ON ci.id = a.collection_item_id
         WHERE dc.zone = 'considering' ORDER BY a.id",
    )
    .fetch_all(&mut *conn)
    .await?;
    for allocation in allocations {
        let id: i64 = allocation.try_get("id")?;
        let quantity: i64 = allocation.try_get("quantity")?;
        let source: Option<i64> = allocation.try_get("source_location_id")?;
        let item_id: i64 = allocation.try_get("item_id")?;
        let item = sqlx::query(
            "SELECT quantity, for_trade_quantity, scryfall_id, condition, language, finish, notes, purchase_price_cents
             FROM collection_items WHERE id = ?1",
        )
        .bind(item_id)
        .fetch_one(&mut *conn)
        .await?;
        let item_quantity: i64 = item.try_get("quantity")?;
        if item_quantity > quantity {
            let remaining = item_quantity - quantity;
            let for_trade_quantity = item
                .try_get::<Option<i64>, _>("for_trade_quantity")?
                .unwrap_or(0)
                .min(remaining);
            sqlx::query(
                "UPDATE collection_items SET quantity = ?1, for_trade_quantity = ?2, for_trade = ?3, updated_at = ?4 WHERE id = ?5",
            )
            .bind(remaining)
            .bind(for_trade_quantity)
            .bind(i64::from(for_trade_quantity > 0))
            .bind(&now)
            .bind(item_id)
            .execute(&mut *conn)
            .await?;
            sqlx::query(
                "INSERT INTO collection_items (scryfall_id, quantity, condition, language, finish, notes, purchase_price_cents,
                   location_id, location_changed_at, for_trade, for_trade_quantity, inserted_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CASE WHEN ?8 IS NULL THEN NULL ELSE ?9 END, 0, 0, ?9, ?9)",
            )
            .bind(item.try_get::<String, _>("scryfall_id")?)
            .bind(quantity)
            .bind(item.try_get::<String, _>("condition")?)
            .bind(item.try_get::<String, _>("language")?)
            .bind(item.try_get::<String, _>("finish")?)
            .bind(item.try_get::<Option<String>, _>("notes")?)
            .bind(item.try_get::<Option<i64>, _>("purchase_price_cents")?)
            .bind(source)
            .bind(&now)
            .execute(&mut *conn)
            .await?;
        } else {
            sqlx::query(
                "UPDATE collection_items SET location_id = ?1,
                   location_changed_at = CASE WHEN ?1 IS NULL THEN location_changed_at ELSE ?2 END,
                   updated_at = ?2 WHERE id = ?3",
            )
            .bind(source)
            .bind(&now)
            .bind(item_id)
            .execute(&mut *conn)
            .await?;
        }
        sqlx::query("DELETE FROM deck_allocations WHERE id = ?1")
            .bind(id)
            .execute(&mut *conn)
            .await?;
    }
    sqlx::query(
        "UPDATE deck_cards SET proxy_quantity = 0, updated_at = ?1 WHERE zone = 'considering' AND proxy_quantity > 0",
    )
    .bind(&now)
    .execute(&mut *conn)
    .await?;
    Ok(())
}
