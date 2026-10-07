use std::collections::BTreeMap;

use sqlx::SqlitePool;

use super::*;
use crate::test_support::TempDir;

/// A ManaVault v1.0.0 database (34 Ecto migrations) created by the Elixir
/// v1.0.0 release with `mix ecto.migrate`, then filled with owner data
/// through SQL in v1.0.0's column formats; dumped with `sqlite3 .dump`.
const V1_0_0_DUMP: &str = include_str!("../../tests/fixtures/manavault-v1.0.0.sql");

async fn pool_at(dir: &TempDir) -> SqlitePool {
    connect(&dir.path().join("manavault.db"), 2)
        .await
        .expect("open database")
}

async fn load_dump(pool: &SqlitePool, dump: &str) {
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

async fn applied(pool: &SqlitePool) -> Vec<i64> {
    sqlx::query_scalar("SELECT version FROM schema_migrations ORDER BY version")
        .fetch_all(pool)
        .await
        .expect("versions")
}

/// `name -> sql` for every table, index, trigger, and view, whitespace-normalized.
async fn schema(pool: &SqlitePool) -> BTreeMap<String, String> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .expect("schema");
    rows.into_iter()
        .map(|(name, sql)| {
            let sql = sql
                .unwrap_or_default()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            (name, sql)
        })
        .collect()
}

#[tokio::test]
async fn a_new_database_gets_every_migration_and_the_starter_tags() {
    let dir = TempDir::new();
    let pool = pool_at(&dir).await;
    let outcome = prepare(&pool).await.expect("migrate");
    assert_eq!(outcome.applied.len(), migrate::MIGRATIONS.len());
    assert_eq!(migrate::MIGRATIONS.len(), 74);
    assert_eq!(
        applied(&pool).await,
        migrate::versions().collect::<Vec<_>>()
    );
    let inserted_at: String =
        sqlx::query_scalar("SELECT inserted_at FROM schema_migrations LIMIT 1")
            .fetch_one(&pool)
            .await
            .expect("inserted_at");
    // Ecto's format: naive UTC seconds.
    assert_eq!(inserted_at.len(), 19, "{inserted_at}");
    assert!(!inserted_at.ends_with('Z'));
    let tags: Vec<String> =
        sqlx::query_scalar("SELECT name FROM default_deck_tags ORDER BY position")
            .fetch_all(&pool)
            .await
            .expect("tags");
    assert_eq!(tags, ["Ramp", "Draw", "Interact", "Plan"]);
}

#[tokio::test]
async fn migrations_produce_the_committed_structure_sql() {
    let dir = TempDir::new();
    let migrated = pool_at(&dir).await;
    prepare(&migrated).await.expect("migrate");

    let other = TempDir::new();
    let dumped = pool_at(&other).await;
    let structure = include_str!("../../../../../priv/repo/structure.sql");
    load_dump(
        &dumped,
        &structure
            .lines()
            .filter(|line| !line.starts_with("CREATE TABLE sqlite_"))
            .collect::<Vec<_>>()
            .join("\n"),
    )
    .await;
    assert_eq!(schema(&migrated).await, schema(&dumped).await);
}

#[tokio::test]
async fn a_fully_migrated_database_is_left_alone() {
    let dir = TempDir::new();
    let pool = pool_at(&dir).await;
    prepare(&pool).await.expect("migrate");
    let before: Vec<(i64, String)> =
        sqlx::query_as("SELECT version, inserted_at FROM schema_migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .expect("rows");
    let outcome = prepare(&pool).await.expect("second run");
    assert_eq!(outcome, migrate::Outcome::default());
    let after: Vec<(i64, String)> =
        sqlx::query_as("SELECT version, inserted_at FROM schema_migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .expect("rows");
    assert_eq!(before, after);
    let tags: i64 = sqlx::query_scalar("SELECT count(*) FROM default_deck_tags")
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(tags, 4, "data steps do not run again");
}

/// `Ecto.Migrator` ignores versions it has no file for (a database from a
/// newer release): pending known migrations still run and the unknown row
/// stays. The server starts and reports the unknown versions.
#[tokio::test]
async fn unknown_newer_versions_are_kept_and_reported() {
    let dir = TempDir::new();
    let pool = pool_at(&dir).await;
    prepare(&pool).await.expect("migrate");
    let last = migrate::versions().last().expect("migrations");
    sqlx::query(
        "INSERT INTO schema_migrations (version, inserted_at) VALUES (?1, '2099-01-01T00:00:00')",
    )
    .bind(30_000_101_000_000_i64)
    .execute(&pool)
    .await
    .expect("future version");
    sqlx::query("DELETE FROM schema_migrations WHERE version = ?1")
        .bind(last)
        .execute(&pool)
        .await
        .expect("forget one");
    // The forgotten migration adds columns that exist; re-running it fails
    // like Ecto would, so restore it and only check the unknown version.
    sqlx::query(
        "INSERT INTO schema_migrations (version, inserted_at) VALUES (?1, '2026-01-01T00:00:00')",
    )
    .bind(last)
    .execute(&pool)
    .await
    .expect("restore");
    let outcome = prepare(&pool).await.expect("starts");
    assert_eq!(outcome.applied, Vec::<i64>::new());
    assert_eq!(outcome.unknown, vec![30_000_101_000_000]);
    assert!(applied(&pool).await.contains(&30_000_101_000_000));
}

#[tokio::test]
async fn a_failed_migration_rolls_back_and_stops() {
    let dir = TempDir::new();
    let pool = pool_at(&dir).await;
    // A table the first migration creates already exists, so it fails.
    sqlx::raw_sql(r#"CREATE TABLE "scryfall_cards" ("x" TEXT)"#)
        .execute(&pool)
        .await
        .expect("conflict");
    let error = prepare(&pool).await.expect_err("fails");
    assert!(error.to_string().contains("20260101000000"), "{error}");
    assert_eq!(applied(&pool).await, Vec::<i64>::new());
}

async fn scalar_i64(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_owned()))
        .fetch_one(pool)
        .await
        .map_err(|error| format!("{sql}: {error}"))
        .expect("query")
}

/// Boots the server on the v1.0.0 database: the 40 newer migrations apply,
/// their data steps run, and the owner's data survives.
#[tokio::test]
async fn upgrades_a_v1_0_0_database_with_data() {
    let dir = TempDir::new();
    let pool = pool_at(&dir).await;
    load_dump(&pool, V1_0_0_DUMP).await;
    let before = applied(&pool).await;
    assert_eq!(before.len(), 34);
    assert_eq!(before.last(), Some(&20_260_708_000_003));

    let outcome = prepare(&pool).await.expect("migrate");
    assert_eq!(outcome.applied.len(), 40);
    assert_eq!(
        applied(&pool).await,
        migrate::versions().collect::<Vec<_>>()
    );

    // Collection and locations survive; new columns get their defaults.
    assert_eq!(scalar_i64(&pool, "SELECT count(*) FROM locations").await, 2);
    assert_eq!(
        scalar_i64(&pool, "SELECT count(*) FROM collection_items").await,
        7,
        "two partial releases split the Bolt item"
    );
    assert_eq!(
        scalar_i64(&pool, "SELECT sum(quantity) FROM collection_items").await,
        11
    );
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT purchase_price_cents FROM collection_items WHERE notes = 'graded'"
        )
        .await,
        1234
    );
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT count(*) FROM collection_items WHERE for_trade_quantity <> 0"
        )
        .await,
        0
    );

    // MergeDeckZonesIntoConsidering: the sideboard and maybeboard rows for one
    // card merged into the lower-id row with summed quantities, the stronger
    // tag, and both allocations (one collection item's merged).
    let merged: (i64, i64, i64, Option<String>, String) = sqlx::query_as(
        "SELECT id, quantity, proxy_quantity, tag, zone FROM deck_cards WHERE oracle_id = 'oracle-bolt'",
    )
    .fetch_one(&pool)
    .await
    .expect("one merged row");
    assert_eq!(merged.0, 3, "the lower-id row is kept");
    assert_eq!(merged.1, 3);
    assert_eq!(merged.2, 0, "considering cards lose their proxies");
    assert_eq!(merged.3.as_deref(), Some("consider_cutting"));
    assert_eq!(merged.4, "considering");
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT count(*) FROM deck_cards WHERE zone IN ('sideboard','maybeboard')"
        )
        .await,
        0
    );
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT count(*) FROM deck_cards WHERE zone = 'considering'"
        )
        .await,
        3
    );

    // DeallocateConsideringDeckCards: considering cards hold no copies or
    // proxies. The Bolt item (6 copies; 3 allocated to deck 1's merged row
    // and 2 to deck 2) is split back into its source binder twice without
    // creating copies (the Elixir step split both from the original 6 and
    // ended with 9); the fully allocated Counterspell returns to its box.
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT count(*) FROM deck_allocations a JOIN deck_cards dc ON dc.id = a.deck_card_id WHERE dc.zone = 'considering'"
        )
        .await,
        0
    );
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT count(*) FROM deck_cards WHERE zone = 'considering' AND proxy_quantity > 0"
        )
        .await,
        0
    );
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT sum(quantity) FROM collection_items WHERE scryfall_id = 'print-bolt'"
        )
        .await,
        6,
        "no copies created or lost"
    );
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT count(*) FROM collection_items WHERE scryfall_id = 'print-bolt' AND purchase_price_cents = 50"
        )
        .await,
        3,
        "the split-off copies keep their purchase price"
    );
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT location_id FROM collection_items WHERE scryfall_id = 'print-counterspell'"
        )
        .await,
        1
    );

    // The mainboard commander and its allocation are untouched.
    assert_eq!(
        scalar_i64(&pool, "SELECT count(*) FROM deck_allocations").await,
        1
    );
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT quantity FROM deck_cards WHERE zone = 'commander'"
        )
        .await,
        1
    );

    // AddNormalizedCardNames / AddNormalizedFlavorNames.
    let names: Vec<(String, String)> = sqlx::query_as(
        "SELECT name, normalized_name FROM scryfall_cards WHERE name IN ('Lim-Dûl''s Vault', 'Æther Vial') ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .expect("names");
    assert_eq!(
        names,
        vec![
            ("Lim-Dûl's Vault".to_owned(), "lim-duls vault".to_owned()),
            ("Æther Vial".to_owned(), "æther vial".to_owned()),
        ]
    );
    let flavor: Option<String> = sqlx::query_scalar(
        "SELECT normalized_flavor_name FROM scryfall_printings WHERE scryfall_id = 'print-bolt'",
    )
    .fetch_one(&pool)
    .await
    .expect("flavor");
    assert_eq!(flavor.as_deref(), Some("kilns ritual"));

    // DeleteCardsWithoutPrintings: the orphan card and its deck card are gone.
    assert_eq!(
        scalar_i64(
            &pool,
            "SELECT count(*) FROM scryfall_cards WHERE oracle_id = 'oracle-orphan'"
        )
        .await,
        0
    );

    // Deck tags, deck settings, and encrypted backup credentials survive.
    assert_eq!(
        scalar_i64(&pool, "SELECT count(*) FROM deck_tags WHERE deck_id = 1").await,
        4
    );
    let deck: (String, String, Option<String>) =
        sqlx::query_as("SELECT name, status, share_token FROM decks WHERE id = 1")
            .fetch_one(&pool)
            .await
            .expect("deck");
    assert_eq!(deck.0, "Mono-Red Lotus");
    assert_eq!(deck.1, "active");
    assert_eq!(deck.2.as_deref(), Some("abcdefghijklmnopqrstuvwx"));
    let secret: Option<String> =
        sqlx::query_scalar("SELECT s3_secret_access_key FROM backup_settings WHERE id = 1")
            .fetch_one(&pool)
            .await
            .expect("settings");
    assert_eq!(secret.as_deref(), Some("legacy-plaintext-secret"));

    pool.close().await;
}

#[tokio::test]
async fn the_server_serves_an_upgraded_v1_0_0_database() {
    let app = crate::test_support::TestApp::with_database(|pool| {
        Box::pin(async move { load_dump(&pool, V1_0_0_DUMP).await })
    })
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
