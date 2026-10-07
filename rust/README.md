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
  (allocate, deallocate, statuses, bulk and pull-list allocation, collection
  adds, proxies, disassembly, buylist needs), with the allocation invariants
  in types.

## Commands

Run from the repository root:

```sh
mise install rust sqlite github:tailwindlabs/tailwindcss
mise run rust:check          # cargo fmt --check, clippy -D warnings, cargo test (all --locked)
mise run rust:test           # cargo test only
mise run dev                 # server + Vite (5173) + Tailwind watch: scripts/dev-rust.sh
mise run rust:dev            # only the server, on the dev database and $PORT (default 4000)
mise run rust:build          # release binary: target/release/manavault
mise run rust:assets         # production frontend build into priv/static/assets
mise run rust:prebuild       # compile server and test binaries (orb setup runs this)
mise run rust:sqlx-prepare   # after a migration: ecto.dump + regenerate .sqlx
mise run rust:sqlx-metadata  # after a query change: regenerate .sqlx from structure.sql
```

In development (`MANAVAULT_ENV=dev`) the HTML shell loads the React app from
the Vite dev server when the request is local or comes through Vite's proxy
(`x-manavault-vite-proxy`), so browse through Vite on 5173 or set
`MANAVAULT_VITE_DISABLED=true` to serve the built bundle from
`priv/static/assets`. The server serves static files from
`MANAVAULT_STATIC_DIR` (default `$MANAVAULT_ROOT/priv/static`).

The production image (`Dockerfile`) builds the frontend, builds this binary
with `cargo build --release --locked` (offline sqlx metadata), and runs it on
slim Debian; see `docs/self-hosting.md`. CI (`.github/workflows/quality.yml`)
regenerates `.sqlx` against `structure.sql` and fails when it differs from the
committed metadata, then runs `rust:check` and `rust:build`.

`manavault hash-password <password>` prints a `MANAVAULT_ADMIN_PASSWORD_HASH`
value, `manavault sdl` prints the owner GraphQL schema, and
`manavault sdl --public` the public share schema (`/share/graphql`).
Maintenance commands mirror the mix tasks and read the same environment as the server:

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

The Ecto migrations remain the schema definition. `mise run rust:migrations`
turns each one into `rust/migrations/<version>_<name>.sql`
(`rust/scripts/dump-migrations.py`), which the server embeds and applies on
boot (`db::migrate`): pending versions run oldest first in `BEGIN IMMEDIATE`
transactions and are recorded in `schema_migrations` like Ecto records them,
so new and old databases (any earlier release) reach the same schema. The few
migrations that computed data in Elixir are ported as `data_step`s. Before
migrating a production database the server writes a pre-migration backup.
`mix ecto.dump` writes `priv/repo/structure.sql`, which is used by:

- **sqlx query macros.** `rust:sqlx-metadata` loads it into
  `target/schema.db`, compiles every `query!` against it, and records the
  results in `.sqlx/`. Normal builds read `.sqlx/` (`SQLX_OFFLINE=true` in
  `.cargo/config.toml`), so they never need a database.
- **Tests.** `db::tests` checks that the migrations produce exactly this
  schema and that a v1.0.0 database with data upgrades intact.

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
  `mix absinthe.schema.sdl` output with `manavault sdl` (and the public
  share schema's with `manavault sdl --public`).
