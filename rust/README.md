# Rust backend

ManaVault's server. It serves the owner and public-share GraphQL APIs, the
HTML shell and static files, sessions, and background jobs over one SQLite
database, for the React frontend in `assets/react`.

## Crates

The server is split into domain crates so an edit recompiles one crate and
independent crates build in parallel (`notes/build-times.md`). Each crate
re-exports the modules of the crates below it under their old paths, so code
keeps writing `crate::catalog::...` or `crate::state::AppState`.

```diagram
manavault-server (binary `manavault`: owner schema, routes, job registry, CLI)
 ├─ manavault-share       public share schema, share pages, preview images
 │   └─ manavault-ai      AI deck analysis and questions
 │       └─ manavault-trade        trade binder, wants, list matching, shared lists
 ├─ manavault-deck-intel  allocation views, buylists, EDHREC and combo recommendations
 │   └─ manavault-collection       collection, locations, imports/exports, decks
 │       └─ manavault-catalog      Scryfall catalog and search, tokens, assets, prices
 ├─ manavault-system      local and cloud backups, scanner bundles
 └─ manavault-core        config, database and migrations, AppState, jobs,
                          GraphQL primitives, auth, settings, sessions and web helpers
manavault-allocation      reserving collection copies for deck cards
```

- Axum serves HTTP, async-graphql the GraphQL APIs, sqlx talks to SQLite, and
  [lotus](https://github.com/cfbender/lotus) supplies the Magic domain types,
  Scryfall parsing, and decklist sources shared with the-gathering.
- `manavault-allocation` reserves physical collection copies for deck cards
  (allocate, deallocate, statuses, bulk and pull-list allocation, collection
  adds, proxies, disassembly, buylist needs), with the allocation invariants
  in types.
- Collection and decks share a crate because their GraphQL types point at each
  other (a collection item lists its decks; a deck card lists its items). The
  job framework lives in `manavault-core` because `AppState` holds the queue
  and workers receive `AppState`; each worker lives in its domain crate and
  `manavault-server::app::workers` registers them.
- Tests: a crate's tests use `manavault-server`'s test app (a dev-dependency
  with the `test-support` feature), so they run against the full schema and
  routes. That links a second copy of the crate under test, so tests pass
  `AppState` and plain data across, never this crate's own types, statics, or
  workers (see `share/tests/artifact_cache.rs`). `manavault-core`'s own tests
  that need its types use `manavault_core::testing::TestState`.

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
mise run rust:new-migration -- <name>  # new rust/migrations/<timestamp>_<name>.sql
mise run rust:sqlx-prepare   # after a migration or query change: rust/schema.sql + .sqlx
mise run rust:sweep          # drop incremental caches untouched for 3 days (disk)
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
regenerates `schema.sql` and `.sqlx` from the migrations and fails when they
differ from the committed files, then runs `rust:check` and `rust:build`.

`manavault hash-password <password>` prints a `MANAVAULT_ADMIN_PASSWORD_HASH`
value, `manavault sdl` prints the owner GraphQL schema, and
`manavault sdl --public` the public share schema (`/share/graphql`).
Maintenance commands read the same environment as the server:

- `manavault migrate` creates or migrates the configured database and exits.
- `manavault unban CLIENT_ID | --all` clears permanent login bans.
- `manavault backup [-o DIR] [--data-dir DIR] [--database PATH]` writes a
  backup zip (default `DATA_DIR/backups`).
- `manavault restore PATH [--data-dir DIR] [--database PATH]` restores one;
  stop the server first. A cloud restore staged from Settings is applied
  automatically at the next start, before the database opens.

## Configuration

The binary reads its configuration from the environment (`PORT`, `DATA_DIR`,
`DATABASE_PATH`, `SECRET_KEY_BASE`, `PHX_HOST`,
`MANAVAULT_ADMIN_PASSWORD_HASH`, `MANAVAULT_AUTH_DISABLED`, ...; see
`crates/manavault-core/src/config.rs` and `docs/self-hosting.md`).
`MANAVAULT_ENV` (`prod` by default, or `dev`/`test`) selects the defaults.
Sessions, CSRF tokens, and stored credentials keep the formats earlier
releases wrote, so upgrading with the same `SECRET_KEY_BASE` keeps users signed
in and saved API keys readable.

## Schema and migrations

`migrations/<version>_<name>.sql` is the schema definition. `build.rs` embeds
the files and the server applies pending ones on boot (`db::migrate`): oldest
first, each in a `BEGIN IMMEDIATE` transaction (statement by statement when it
turns `PRAGMA foreign_keys` off), recorded in `schema_migrations` with the
versions every earlier release used, so a database from any release upgrades in
place. Migrations that must compute data have a `data_step` in
`db::migrate`. Before migrating a production database the server writes a
pre-migration backup. Versions the build does not know (a newer release's
database) are ignored with a warning.

`schema.sql` is the schema the migrations produce (`mise run rust:schema`):

- **sqlx query macros.** `rust:sqlx-prepare` applies the migrations to
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
- Keep the GraphQL schema compatible with the frontend's operations
  (`assets/react/src/gql`). `python3 rust/scripts/sdl_diff.py old.graphql
new.graphql` compares two schemas (for example `manavault sdl` before and
  after a change) structurally.
- `rust/notes/*.md` records how each area was ported from the original
  backend, the deliberate behavior differences, and the bugs fixed on the way.
  `rust/scripts/parity` replays the frontend's operations against the original
  backend and this one and diffs the responses (see `rust/notes/parity.md`).
