# Migrations on boot

The server applies pending database migrations at startup (`db::prepare` →
`db::migrate::run`), so a database from any earlier release upgrades in place.

## How

- `mise run rust:migrations` runs `mix ecto.migrate --log-migrations-sql` on a
  fresh test database and `rust/scripts/dump-migrations.py` writes one
  `rust/migrations/<version>_<name>.sql` per Ecto migration (74). `build.rs`
  embeds them as `db::migrate::MIGRATIONS`.
- `run` creates `schema_migrations` if missing, applies each missing version
  oldest first, and records it with Ecto's `inserted_at` format (naive UTC
  seconds). A migration containing `PRAGMA foreign_keys = OFF` runs statement
  by statement (the pragma is a no-op inside a transaction); the others run in
  `BEGIN IMMEDIATE` and roll back on failure, stopping the boot.
- Versions in `schema_migrations` that the build does not know (a newer
  release's database) are ignored with a warning, as `Ecto.Migrator` ignores
  them; downgrades are not supported.
- The dump keeps only SQL a migration runs unconditionally (DDL, raw
  `execute`). Statements Ecto built from Elixir values and SELECTs are dropped;
  the script fails unless the migration is listed as a data step. The seven
  data steps are ported in `db::migrate::data_step`:
  - `CreateDefaultDeckTags` (seed the four starter tags),
  - `BackfillDeckDefaultTags`,
  - `MergeDeckZonesIntoConsidering`,
  - `AddNormalizedCardNames` / `AddNormalizedFlavorNames` (`lotus::normalize_name`,
    identical to the migrations' `normalize_name/1`),
  - `DeleteCardsWithoutPrintings`,
  - `DeallocateConsideringDeckCards`.
- Pre-migration backup: unchanged from the Elixir release
  (`Manavault.Backup.MigrationBackup`): in production, when the database has
  `schema_migrations` and is missing a known version, a
  `backups/manavault-pre_migration-<timestamp>.zip` is written before migrating,
  unless `MANAVAULT_SKIP_MIGRATION_BACKUP` is set.

## Verified

- `db::tests::migrations_produce_the_committed_structure_sql`: a fresh
  database migrated by Rust has the same tables, indexes, and triggers as
  `structure.sql` (whitespace-normalized).
- `db::tests::upgrades_a_v1_0_0_database_with_data`: a v1.0.0 database
  (`tests/fixtures/manavault-v1.0.0.sql`: schema from the v1.0.0 release's own
  `mix ecto.migrate`, 34 migrations; locations, collection items, two decks with
  sideboard/maybeboard rows and allocations, tags, an orphan card, diacritic
  names, backup settings) migrates through the 40 newer versions; every data
  step's effect is asserted. The same fixture migrated by the current Elixir app
  gives identical results except for the bug below.
- `the_server_serves_an_upgraded_v1_0_0_database`: GraphQL on the upgraded file.
- Fully migrated database: no-op (no rows or data steps re-run). Unknown newer
  version: kept and reported. Failed migration: rolled back, nothing recorded.

## Elixir bugs not copied

- `DeallocateConsideringDeckCards` read each item's quantity once up front, so
  two partial releases of one item split from the original quantity and
  created copies (the v1.0.0 fixture: 6 Bolts became 9 under Elixir), and the
  split-off item dropped `purchase_price_cents`. The Rust step keeps a running
  quantity and copies the purchase price, like
  `AllocationItems.restore_from_deck!/3`.
