# Infra notes

Tooling, orb setup, services, CI, the container image, and docs for running
the Rust backend. No Rust sources were changed.

## What changed

| Area | Before (Elixir) | Now |
| --- | --- | --- |
| `mise.toml` | `dev` = `mix phx.server` | `dev` / `rust:serve` = `scripts/dev-rust.sh`; `dev:elixir` = `mix phx.server`; new `rust:build`, `rust:assets`, `rust:prebuild`; `rust:check` uses `--workspace`/`--all` and `--locked` everywhere (also `rust:sqlx-metadata`); Tailwind standalone CLI pinned as `github:tailwindlabs/tailwindcss` 4.3.0 |
| `scripts/dev-rust.sh` | Phoenix watchers (`aube run dev`, tailwind) | builds, then runs `manavault serve` (MANAVAULT_ENV=dev, MANAVAULT_ROOT=repo), `aube run dev` (Vite 5173 → `$PORT`), and `tailwindcss --watch=always`; exits and stops the process trees of the others when any exits or on INT/TERM; re-execs under `mise exec` when tools are not on PATH |
| `.agents/setup` / `resume` | Elixir + Node | also installs rust, sqlite, tailwind via mise; builds assets if `mix setup` did not; runs `mise run rust:prebuild` (debug server + test binaries); checks `manavault_dev.db`; resume also checks `cargo` and `rust/target/debug/manavault` |
| `.amp/services.yaml` | `PORT=31397 mise exec -- mix phx.server` | `PORT=31397 mise exec -- scripts/dev-rust.sh`, portal on 5173, `health: /health` |
| CI `quality.yml` rust job | online `cargo check` + `rust:check` | `Swatinem/rust-cache` v2.9.2 (SHA-pinned); `rust:sqlx-metadata` + fail on any `rust/.sqlx` diff; `rust:check`; `rust:build` |
| `Dockerfile` | Elixir release on Alpine | `frontend` (node 22 trixie-slim + pinned aube + pinned Tailwind CLI: CSS, Vite build, gzip siblings), `backend` (rust 1.99.0 slim-trixie, `cargo build --release --locked`, SQLX_OFFLINE, cache mounts), Go `/health` checker, static musl `resvg`, `runner` = debian trixie-slim with ca-certificates, fonts-dejavu-core, tini |
| `docker-entrypoint.sh` | `su-exec app` | `setpriv --reuid=app --regid=app --init-groups`, `HOME=/home/app`; runs as is when started with `--user` |
| Docs | Phoenix | README dev/production, AGENTS.md, rust/README.md, docs/development.md, docs/self-hosting.md |

`rust/.cargo/config.toml` gained `[build] incremental = false` (orb disk; one
setting for every caller). Not Rust source.

## Image facts

- `/app/bin/manavault` (CMD `serve`), `/app/priv/static`, `MANAVAULT_ENV=prod`,
  `MANAVAULT_ROOT=/app`, `MANAVAULT_STATIC_DIR=/app/priv/static`, `PORT=4000`,
  `DATA_DIR=/data`, `DATABASE_PATH=/data/manavault.db`, `VOLUME /data`,
  `EXPOSE 4000`, `MANAVAULT_ASSET_VERSION` build arg (container.yml passes the SHA).
- `structure.sql` and `token_backs.json` are embedded in the binary
  (`include_str!`), so only `priv/static` ships.
- Healthcheck: `/usr/local/bin/manavault-healthcheck` now does `GET /health`
  (was a TCP dial). The server shuts down gracefully on SIGTERM (what
  `docker stop` sends) and SIGINT; tini forwards both.
- The app user's uid changes (Alpine `adduser -S` vs Debian `useradd
  --system`); the entrypoint already re-chowns a volume not owned by `app`.
- 239 MB on disk / 62 MB compressed.

## Verified in this orb

- `mise run rust:check`: fmt clean, clippy clean, 682 + 28 + 13 + 4 + 1 doc tests pass.
- `mise run rust:sqlx-metadata` reproduces the committed `.sqlx` byte for byte.
- `mise run rust:build` (release) and `mise run rust:assets`.
- Rust dev server on a copy of the main checkout's `manavault_dev.db`
  (`MANAVAULT_ENV=dev`): `/health`, `/` (200, shell loads via Vite),
  `POST /api/graphql` with CSRF token + session cookie (data), without token
  ("Invalid CSRF token"), built CSS/JS served.
- `scripts/dev-rust.sh`: through Vite 5173: `/health`, `/`, GraphQL,
  `/@vite/client`, `/assets/react/src/main.tsx`, `/assets/css/app.css`;
  exits and leaves no processes behind on TERM, INT, or when the backend dies.
- `.agents/setup` ran end to end in the worktree (idempotent rerun);
  `.agents/resume` passes; `bash -n` on all scripts.
- `docker build` + run: `/health`, `/` (prod shell), static files with gzip,
  GraphQL with CSRF, healthcheck `healthy`, `hash-password`, `backup` via the
  binary, graceful stop. hadolint: only pin-version warnings (DL3008/DL3018,
  matching the old file); it cannot parse the `COPY <<EOF` heredoc.

## Not done / for the integrator

- `amp orb services ensure` was not run (per instructions).
- `.amp/services.yaml` has no opt-in services, so the Elixir backend is not
  declared (its Vite watcher would also need 5173); the file documents a
  one-off `amp orb service start` command instead.
- No separate frontend CI job: the Elixir `precommit` job already runs
  `aube run test:react`, `typecheck`, and `aube run build`. If that job is
  removed with the Elixir app, move those steps (and Tailwind) to a new job.
- `assets/css/app.css` still `@source`s `lib/manavault_web/controllers` (and a
  `components/layouts` dir that no longer exists); the Rust shell/login HTML
  lives in `rust/crates/manavault-server/src/web/`. Classes used only there
  would be purged. The image copies `lib/manavault_web/controllers` so the CSS
  matches the Elixir build today; switch the `@source` when `lib/` goes.
- Rust-side observations (not changed, other engineers' code):
  - Fixed after review: ANSI colours only on a TTY; the server crate's
    version tracks the app version (1.4.3, bumped by `scripts/bump.sh`), so
    the asset-version fallback matches Elixir; SIGTERM shuts down gracefully,
    so `STOPSIGNAL SIGINT` was dropped.
  - Upgrades: the Rust server refuses databases missing migrations, so
    existing installs must pass through the last Elixir image first
    (documented in README/self-hosting).
