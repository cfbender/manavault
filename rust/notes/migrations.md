# Migrations on boot

The server applies pending database migrations at startup (`db::prepare` →
`db::migrate::run`), so a database from any earlier release upgrades in place.

## How

- The 74 files in `rust/migrations` were generated once from the Ecto
  migrations' logged SQL (`mix ecto.migrate --log-migrations-sql` and
  `rust/scripts/dump-migrations.py`, both removed with the Elixir app in the
  next commit; see git history at b2b70d5) and are now the schema source. New
  schema changes are new SQL files (`mise run rust:new-migration -- <name>`),
  followed by `mise run rust:sqlx-prepare`, which regenerates `rust/schema.sql`
  and `rust/.sqlx` from the migrations. `build.rs` embeds the files as
  `db::migrate::MIGRATIONS`.
- `run` creates `schema_migrations` if missing, applies each missing version
  oldest first, and records it with Ecto's `inserted_at` format (naive UTC
  seconds). A migration containing `PRAGMA foreign_keys = OFF` runs statement
  by statement (the pragma is a no-op inside a transaction); the others run in
  `BEGIN IMMEDIATE` and roll back on failure, stopping the boot.
- Retired versions (`db::migrate::RETIRED`): 20260104000000
  `create_scan_sessions`, 20260104000001 `drop_scan_candidates`, and
  20260621000002 `create_scryfall_printing_art_hashes` were deleted in commit
  6f75f86 (2026-06-22) and their tables dropped by
  `20260622000001_drop_scanner_tables`. Installs from before that still have
  their rows; they count as known and never warn. They are the only migration
  files ever deleted (`git log --diff-filter=D -- priv/repo/migrations`).
- Versions in `schema_migrations` that the build does not know (a newer
  release's database) are ignored with a warning, as `Ecto.Migrator` ignores
  them; downgrades are not supported.
- The generator kept only SQL a migration runs unconditionally (DDL, raw
  `execute`). Statements Ecto built from Elixir values and SELECTs were
  dropped (the script failed unless the migration was listed as a data step).
  The seven data steps are ported in `db::migrate::data_step`:
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
  database migrated by Rust has the same tables, indexes, and triggers as the
  committed schema (first the `mix ecto.dump` output, now `rust/schema.sql`;
  whitespace-normalized). The first `rust/schema.sql` generated from the
  migrations differed from the last `mix ecto.dump` only in whitespace before
  three statements' semicolons and the `sqlite_stat1` table (ANALYZE output,
  now omitted).
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
