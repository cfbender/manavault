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
- Use aube instead of npm for anything JS packaging related

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.48.0 -->

<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:

- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD GUIDELINES END -->
