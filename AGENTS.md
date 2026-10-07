# AGENTS.md

## Project Structure

`manavault` is a Rust backend with a Vite/React frontend. The original Elixir/Phoenix app stays in the repo as the behavioral reference and as the owner of the Ecto migrations.

- `rust/` — the server: Cargo workspace with `manavault-server` (binary `manavault`: axum, async-graphql, sqlx/SQLite, background jobs) and `manavault-allocation`. Read `rust/README.md` and `rust/notes/*.md`.
- `lib/manavault/`, `lib/manavault_web/` — Elixir reference implementation (domain contexts, Phoenix router/controllers, Absinthe schema).
- `config/` — Phoenix configuration; the Rust server reads the same environment variables (`rust/crates/manavault-server/src/config.rs`, `MANAVAULT_ENV` in place of `MIX_ENV`).
- `priv/repo/` — Ecto migrations and `structure.sql` (`mix ecto.dump`), which the Rust server embeds to create new databases and to check sqlx queries.
- `priv/static/` — static files served by the backend; `priv/static/assets` is the built frontend (Tailwind CSS and the Vite bundle).
- `assets/` — frontend assets built with Tailwind and Vite, including the React app in `assets/react`.
- `test/` — ExUnit tests for the Elixir reference; Rust tests live under `rust/crates/`.
- `scripts/dev-rust.sh` — development stack: Rust server, Vite dev server, and Tailwind watcher.
- `data/` — runtime data directory used by the app/container.
- `Dockerfile` and `docker-entrypoint.sh` — production container build (frontend, Rust release binary, Debian runtime) and startup flow.
- `mise.toml` — pinned local toolchain (Rust, sqlite, Tailwind, Node/aube, Elixir) and tasks.

## Common Commands

Run commands through `mise` to use the pinned toolchain:

```sh
mise install
mise run setup            # mix setup (deps, dev database, assets) + Rust prebuild
mise run dev              # Rust server on $PORT (default 4000) + Vite on 5173 + Tailwind watch
mise run rust:check       # cargo fmt --check, clippy -D warnings, tests (all --locked)
mise run rust:test
mise run rust:build       # release binary at rust/target/release/manavault
mise run rust:assets      # production frontend build into priv/static/assets
mise exec -- mix test     # Elixir reference tests
mise run dev:elixir       # Phoenix reference server (mix phx.server)
```

Before starting either backend (`mise run dev`, `mise run rust:dev`, or `mise exec -- mix phx.server`), check whether port 4000 (or your `$PORT`) is already listening, for example:

```sh
ss -ltnp 'sport = :4000'
```

If anything is already listening on that port, do not start another server; reuse the existing one. In orbs, the review service from `.amp/services.yaml` runs the Rust stack with the backend on 31397 and Vite on 5173.

The Ecto migrations remain the only schema definition. After creating a new Ecto migration, run it before reporting the change complete:

```sh
mise exec -- mix ecto.migrate
```

Then refresh `priv/repo/structure.sql` and the Rust query metadata with `mise run rust:sqlx-prepare`. Run `mise run rust:check` after changing anything under `rust/`.

Useful production/container commands are documented in `README.md`.

## Development Notes

- Follow existing Rust module, GraphQL schema, and React component patterns; keep GraphQL parity with the Absinthe schema in `lib/`.
- Keep changes small and focused.
- Run the narrowest relevant tests before reporting completion.
- Update documentation when project structure, setup, or runtime behavior changes.
- Use `mise exec -- aube` instead of invoking `aube` directly or using npm for JS package and task commands. Fresh orbs do not expose aube directly on `PATH`.

## Git Commit Policy

- Every Git commit must use a Conventional Commits message.
- Commit as the current thread's user using their configured Git identity.
- Never add `Co-authored-by` trailers or credit Amp, an AI agent, or another co-author.
- When the user asks to commit and push, verify the commit has no co-authorship trailers, then push the current branch and confirm it matches its upstream.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.48.0 -->

<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

Use Backlog only for sizeable implementation work that is worth documenting because it benefits from durable planning, decisions, progress tracking, or handoff notes. Do not run `backlog instructions overview` or any other Backlog command automatically at the start of a request. Skip Backlog for questions, explanations, operational actions, commits and pushes, quick fixes, and small mechanical, configuration, or documentation changes.

When work genuinely warrants Backlog, run `mise exec -- backlog instructions overview`, search for an existing task first, and then read only the relevant task instructions. The Backlog CLI is managed by mise and may not be directly available on `PATH`, especially during first-time orb setup.

Before task lifecycle actions, read the matching detailed guide:

- `mise exec -- backlog instructions task-creation` before creating or splitting tasks
- `mise exec -- backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `mise exec -- backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `mise exec -- backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use `mise exec -- backlog` so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD GUIDELINES END -->
