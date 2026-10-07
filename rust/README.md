# Rust backend

A port of ManaVault's Elixir/Phoenix backend (`lib/`) to Rust. It serves the
same GraphQL schemas, HTTP routes, sessions, and background jobs over the same
SQLite database, so the React frontend in `assets/react` and databases created
by the Elixir app work unchanged.

## Crates

- `manavault-server`: the backend (`manavault` binary). Axum for HTTP,
  async-graphql for the GraphQL APIs, sqlx for SQLite, and
  [lotus](https://github.com/cfbender/lotus) for the Magic domain types,
  Scryfall parsing, and decklist sources shared with the-gathering.
- `manavault-allocation`: reserving physical collection copies for deck cards
  (allocate, deallocate, status), with the allocation invariants in types.

## Commands

Run from the repository root:

```sh
mise install rust sqlite
mise run rust:check          # cargo fmt --check, clippy -D warnings, cargo test
mise run rust:dev            # serve the dev database on $PORT (default 4000)
mise run rust:sqlx-prepare   # after a migration: ecto.dump + regenerate .sqlx
mise run rust:sqlx-metadata  # after a query change: regenerate .sqlx from structure.sql
```

`manavault hash-password <password>` prints a `MANAVAULT_ADMIN_PASSWORD_HASH`
value, and `manavault sdl` prints the owner GraphQL schema. Maintenance
commands mirror the mix tasks and read the same environment as the server:

- `manavault unban CLIENT_ID | --all` clears permanent login bans.
- `manavault backup [-o DIR] [--data-dir DIR] [--database PATH]` writes a
  backup zip (default `DATA_DIR/backups`).
- `manavault restore PATH [--data-dir DIR] [--database PATH]` restores one;
  stop the server first. A cloud restore staged from Settings is applied
  automatically at the next start, before the database opens.

Backup zips are interchangeable with the Elixir app's.

## Configuration

The binary reads the same environment variables as `config/runtime.exs`
(`PORT`, `DATA_DIR`, `DATABASE_PATH`, `SECRET_KEY_BASE`, `PHX_HOST`,
`MANAVAULT_ADMIN_PASSWORD_HASH`, `MANAVAULT_AUTH_DISABLED`, ...).
`MANAVAULT_ENV` (`prod` by default, or `dev`/`test`) plays the role of
`MIX_ENV`. Because sessions, CSRF tokens, and stored credentials use Plug's
and `Manavault.Encrypted.Binary`'s formats, switching a deployment between the
two backends with the same `SECRET_KEY_BASE` keeps users signed in and keeps
saved API keys readable.

## Schema and query checking

The Ecto migrations remain the only schema definition. `mix ecto.dump` writes
`priv/repo/structure.sql`, which is used three ways:

- **New databases.** The server embeds it and creates the schema from it when
  the database is empty. An existing database must already contain every
  migration listed in it.
- **sqlx query macros.** `rust:sqlx-metadata` loads it into
  `target/schema.db`, compiles every `query!` against it, and records the
  results in `.sqlx/`. Normal builds read `.sqlx/` (`SQLX_OFFLINE=true` in
  `.cargo/config.toml`), so they never need a database.
- **Tests.** Each test loads it into a fresh database file.

## Conventions

- Workspace lints forbid `unsafe` and deny `unwrap`, `expect`, `panic!`,
  indexing, and `as` casts outside tests. Restructure with types, `Option`,
  `?`, `get`, and `TryFrom` instead of allowing them.
- Make invalid states unrepresentable: lotus ids and `Quantity`, enums for
  fixed-vocabulary columns, proof types such as `AllocatableDeckCard`.
- Static SQL uses the checked macros (`sqlx::query!`, `query_as!`,
  `query_scalar!`); dynamic filters use `QueryBuilder`.
- Port behavior from the Elixir code and its tests. Where the Elixir code has
  a bug, fix it here, document it at the item, and list it below.
- GraphQL types, fields, arguments, nullability, and error messages match the
  Absinthe schema. `python3 rust/scripts/sdl_diff.py` compares
  `mix absinthe.schema.sdl` output with `manavault sdl`.
