# Rust workspace (spike)

An experiment in porting ManaVault's backend to Rust for compile-time type
safety. It is not wired into the running app; the Elixir backend is still the
source of truth. Tracked in Backlog as TASK-92.

## Crates

- `mtg-core`: Magic types meant to be shared with the-gathering, such as
  Scryfall ids, finishes, and conditions. The `sqlx` feature lets them be
  stored in SQLite columns.
- `manavault-allocation`: deck allocation (allocate, deallocate, and
  single-card status), ported from `Manavault.Catalog.Decks.DeckCardAllocation`,
  `AllocationItems`, and `AllocationStatus`.

## Commands

Run these from the repository root:

```sh
mise install rust sqlite
mise run rust:check          # cargo fmt --check, clippy -D warnings, cargo test
mise run rust:sqlx-prepare   # after a migration or a query change
```

## Schema and query checking

The Ecto migrations remain the only schema definition. `mix ecto.dump` writes
`priv/repo/structure.sql`, and two things read that file:

- **sqlx query macros.** `rust:sqlx-prepare` loads the dump into
  `target/schema.db`, compiles every query against it, and records the results
  in `.sqlx/`. Normal builds read `.sqlx/` (`SQLX_OFFLINE=true` in
  `.cargo/config.toml`), so they never need a database.
- **Integration tests.** Each test loads the dump into a fresh in-memory
  database.

CI recompiles the queries against `structure.sql` and then runs
`rust:check`. A query that no longer matches the schema, or a query whose
`.sqlx/` entry is missing, fails the build.

## Guardrails

Workspace lints forbid `unsafe` and deny `unwrap`, `expect`, `panic!`,
indexing, and `as` casts outside tests. Tests may use `expect`.

The domain model rejects bad data where it enters:

- Text columns with fixed values decode into enums.
- `Quantity` cannot be zero or negative.
- Inserting an allocation requires an `AllocatableDeckCard`. The only way to
  get one is `DeckCard::allocatable`, which checks the deck's archive status
  and the card's zone.
