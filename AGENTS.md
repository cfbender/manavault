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
- I AM THE ONLY USER. Do not worry about backwards compatibility, or deleting any code or paths that someone may be using. This app is unreleased and under heavy development.
