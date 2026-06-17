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
- For horizontal rows that mix `.input`, `.select`, `.btn`, and custom controls such as card-name autocomplete, wrap the row/form in `.control-toolbar`. Core `.input` wrappers use `.fieldset` padding/margins, while autocomplete renders a bare input; the toolbar utility normalizes height and bottom alignment.
- I AM THE ONLY USER. Do not worry about backwards compatibility, or deleting any code or paths that someone may be using. This app is unreleased and under heavy development.
