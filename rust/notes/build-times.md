# Build times

Measured in an orb with 8 cores and 15 GB RAM (`nproc` = 8), Rust 1.99.0,
cargo's default job count, the workspace at three points:

- **Before**: `rust/.cargo/config.toml` had `[build] incremental = false`; one
  `manavault-server` crate (about 80k lines with tests); system linker
  (`cc` → GNU ld); full debug info.
- **Settings**: incremental on, mold through `scripts/linker.sh`,
  `debug = "line-tables-only"` for workspace crates and `debug = 0` for
  dependencies (commit 246720f).
- **Split**: the same settings with `manavault-server` split into domain
  crates (commit 00b47b0).

Each run: `cargo clean`, then `cargo build --workspace` (cold), a one-line
edit (`std::hint::black_box(n)` added to `trade/matcher.rs`) then
`cargo build --workspace`, twice; then the same for `cargo check --workspace`
and `cargo test --workspace --no-run`; then a cold
`cargo build --release --bin manavault` (no incremental, as in Docker and CI).

| Step (8 cores)             | Before | Settings |  Split |
| -------------------------- | -----: | -------: | -----: |
| Cold dev build             |  92.1s |    90.3s |  80.5s |
| One-line edit, then build  |  64.2s |    17.5s |   9.1s |
| Second edit, then build    |  63.3s |    15.9s |   9.1s |
| Edit, then check           |  25.2s |     5.4s |   2.6s |
| Edit, then `test --no-run` |  81.1s |    17.0s |  14.1s |
| Cold release build         | 223.6s |   213.5s | 227.2s |
| `target/` after the run    |   6.2G |     8.5G |   9.6G |

The edit lands in `manavault-trade` after the split, so the build recompiles
trade, ai, share, and the server. Where the edit sits matters; with the same
settings, before (one crate) and after the split:

| One-line edit in (8 cores)                | Build, one crate | Build, split | Check, one crate | Check, split |
| ----------------------------------------- | ---------------: | -----------: | ---------------: | -----------: |
| `db/migrate.rs` (manavault-core)          |            16.3s |        14.5s |             5.8s |         6.2s |
| `catalog/edhrec.rs` (manavault-catalog)   |            19.1s |        15.4s |             6.9s |         6.1s |
| `decks/records.rs` (manavault-collection) |            15.7s |        12.9s |             5.5s |         5.3s |
| `web/request_id.rs` (manavault-server)    |            21.3s |         6.8s |             5.2s |         0.7s |

Takeaways:

- Incremental compilation is most of the win (64s → 16–18s per edit; check
  25s → 5s). mold and the smaller debug info shave the link.
- The split helps most for edits near the top of the graph (server, share,
  ai, trade): only those crates rebuild. An edit in `manavault-core` still
  re-checks every crate above it, so it saves little; incremental reuse keeps
  that from being a full rebuild.
- The cold release build does not change (213–227s, within noise): it is
  bound by the dependency tree and by the longest chain of workspace crates,
  and release builds stay non-incremental.
- Incremental caches cost disk (about 3 GB more after this run). `mise run
rust:sweep` drops incremental caches untouched for three days; `cargo clean`
  resets everything.

## Where it is configured

- `rust/.cargo/config.toml`: no `incremental` setting (cargo's default: on for
  dev and test, off for release); `linker = "scripts/linker.sh"` for
  x86_64 and aarch64 Linux.
- `rust/scripts/linker.sh`: `cc -fuse-ld=mold`, else `cc -fuse-ld=lld`, else
  plain `cc`. `.agents/setup` installs mold.
- `rust/Cargo.toml`: `[profile.dev] debug = "line-tables-only"` and
  `[profile.dev.package."*"] debug = 0`.
- `CARGO_INCREMENTAL=0`: CI's Rust job (`.github/workflows/quality.yml`) and
  the Docker backend stage. The orb setup prebuild keeps incremental on so the
  first edit after setup reuses it.

## Crate split

See `rust/README.md` ("Crates") for the graph. Boundaries follow the module
dependencies that existed; where two modules depended on each other they stay
in one crate (collection and decks), and the few upward references were moved
down:

- `Config` held `DeckIntelUrls` and the EDHREC base URL (defined in
  deck_intel and catalog); both now live in `manavault-core::config` and are
  re-exported from their old paths.
- The 302 `redirect` helper moved from the server's auth controller to
  `manavault-core::web` (sessions use it); the `POST /api/graphql` handler,
  which needs the owner schema, moved into the server's router.
- Share and trade page routes are generic over the router state
  (`AppState: FromRef<S>`) instead of naming the server's `WebState`.
- The owner schema root types (`Query`, `Mutation`, `Node`) stay in the
  server, which needs `#![recursion_limit = "256"]` for their layout once the
  merged types come from other crates.

Tests stayed next to their code. Each crate takes `manavault-server` as a
dev-dependency for the test app (full schema, routes, and job registry), so
its tests link a second copy of the crate under test; they exchange only
`AppState`, JSON, and database rows with it. The one test that needed a
worker of its own crate (the share preview render queue, whose completion
channel is a static) drains the queue with that crate's worker directly.
`manavault_core::testing` (temporary directories, a schema-less
`TestState`, shared return-path cases) serves core's own tests. Both test
helpers compile in every build rather than behind a feature, so test and dev
builds share one build of each crate.

## CI and image builds

The Quality workflow's Rust job used to build every dependency three times
(an online `cargo check` for the query metadata, clippy and tests, then a
release build), and the Container workflow rebuilt every dependency in
release mode on each run because BuildKit cache mounts do not survive
between GitHub runners. Run 37652986055 (cache invalidated by the build
settings change) took 11m18s for the Rust job; image builds took about 8m.

Now:

- `mise run rust:ci` compiles the workspace once per profile: clippy runs
  with the query macros online, which checks queries against
  `rust/migrations` and rewrites `rust/.sqlx` (a diff fails the job), then
  `cargo test` builds against that metadata. The release build moved out of
  Quality; the Container workflow already does it.
- `Swatinem/rust-cache` uses one shared key and only saves on pushes to main
  and manual runs, so pull requests restore main's cache without evicting it.
  Quality now also runs on pushes to main to keep that cache warm.
- The Dockerfile compiles dependencies with cargo-chef in their own layer,
  which `cache-to: type=gha,mode=max` keeps until `Cargo.lock` or a
  `Cargo.toml` changes.

Local measurements (8-core orb, CARGO_INCREMENTAL=0):

| Build | Time |
| --- | --- |
| `rust:ci`, cold | about 2m20s (clippy 65s, test build 74s) |
| image, cold | 4m54s (cargo chef cook 106s, workspace release build 164s) |
| image, one `.rs` file changed | 2m51s (cook layer cached; workspace release build 165s) |

The floor of a code-only image build is the release compile of the
workspace crates, mostly `manavault-server`. More codegen units made it
slower (64 units: 198s against 168s for the default 16).
