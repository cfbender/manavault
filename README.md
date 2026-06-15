# Manavault

Phoenix LiveView application generated with SQLite.

## Requirements

- [mise](https://mise.jdx.dev/) with the project toolchain from `mise.toml`
- SQLite support from the generated Phoenix dependencies

Install the pinned Elixir toolchain:

```sh
mise install
```

## Local development

Set up dependencies, the local SQLite database, and assets:

```sh
mise exec -- mix setup
```

Start Phoenix:

```sh
mise exec -- mix phx.server
```

Then visit <http://localhost:4000>.

Health check:

```sh
curl http://localhost:4000/health
# {"status":"ok"}
```

## Runtime data layout

Production mutable application data defaults under `/data`:

- `/data/manavault.db` — SQLite database
- `/data/uploads/scans` — scan uploads
- `/data/cache/scryfall` — Scryfall cache
- `/data/backups` — backups

On container boot, the entrypoint creates these directories, makes the mounted data directory writable by the application user, and the release runs Ecto migrations.

## Docker

Build the single-container image:

```sh
docker build -t manavault .
```

Generate a secret for production cookies:

```sh
mise exec -- mix phx.gen.secret
```

Run with a mounted `/data` volume:

```sh
docker run --rm \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE="$(mise exec -- mix phx.gen.secret)" \
  -e PHX_HOST=localhost \
  manavault
```

Health check:

```sh
curl http://localhost:4000/health
```

### Production environment variables

Required:

- `SECRET_KEY_BASE` — Phoenix secret key base. Generate with `mise exec -- mix phx.gen.secret`.

Common optional values:

- `PORT` — HTTP port inside the container. Defaults to `4000`.
- `PHX_HOST` — host used for generated URLs. Defaults to `example.com` in Phoenix production config; set to your deployment host.
- `DATA_DIR` — mutable data root. Defaults to `/data`.
- `DATABASE_PATH` — SQLite database path. Defaults to `/data/manavault.db`.
- `POOL_SIZE` — Ecto pool size. Defaults to `5`.

No Postgres or external service is required by the generated application.
