# AGENTS.md

## Project Structure

This is an Elixir/Phoenix LiveView application named `manavault`.

- `lib/manavault/` — core application/domain code, including the catalog context.
- `lib/manavault_web/` — Phoenix web layer: router, controllers, LiveViews, components, and templates.
- `config/` — Phoenix, runtime, database, asset, and environment configuration.
- `priv/repo/` — Ecto migrations and repository-related files.
- `assets/` — frontend assets built with Tailwind and esbuild.
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

Useful production/container commands are documented in `README.md`.

## Development Notes

- Follow existing Phoenix context and LiveView patterns.
- Keep changes small and focused.
- Run the narrowest relevant tests before reporting completion.
- Update documentation when project structure, setup, or runtime behavior changes.
