# AGENTS.md

## Project Structure

This is an Elixir/Phoenix application with a Vite/React frontend named `manavault`.

- `lib/manavault/` — core application/domain code, including the catalog context.
- `lib/manavault_web/` — Phoenix web layer: router, controllers, GraphQL schema, and server-rendered shell templates.
- `config/` — Phoenix, runtime, database, asset, and environment configuration.
- `priv/repo/` — Ecto migrations and repository-related files.
- `assets/` — frontend assets built with Tailwind and Vite, including the React app in `assets/react`.
- `test/` — ExUnit tests and test support.
- `data/` — runtime data directory used by the app/container.
- `Dockerfile` and `docker-entrypoint.sh` — production container build and startup flow.
- `mise.toml` — pinned local toolchain, including Elixir.

## Common Commands

Run commands through `mise` to use the pinned toolchain:

```sh
mise install
mise exec -- mix setup
mise exec -- mix phx.server
mise exec -- mix test
```

Before starting the Phoenix server, check whether port 4000 is already listening, for example:

```sh
ss -ltnp 'sport = :4000'
```

If anything is already listening on port 4000, do not run `mise exec -- mix phx.server`; reuse the existing server.

After creating a new Ecto migration, run it before reporting the change complete:

```sh
mise exec -- mix ecto.migrate
```

Useful production/container commands are documented in `README.md`.

## Development Notes

- Follow existing Phoenix context, GraphQL schema, and React component patterns.
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
