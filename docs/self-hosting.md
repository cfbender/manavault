# Self-Hosting ManaVault

ManaVault runs as a single Phoenix release backed by SQLite and local files. No
Postgres, Redis, object storage, or hosted service is required.

## Container Image

The production image is published to GitHub Container Registry:

```sh
docker pull ghcr.io/cfbender/manavault:<version>
```

Use a concrete release tag for deployments. `latest` follows the default branch
and is useful for testing only.

## Quick Container Run

Generate a Phoenix secret and an owner password hash from a local checkout:

```sh
mise exec -- mix phx.gen.secret
mise exec -- mix manavault.auth.hash 'change-me'
```

Run with a mounted `/data` volume:

```sh
mkdir -p data

docker run -d \
  --name manavault \
  --restart unless-stopped \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE='paste-generated-secret' \
  -e MANAVAULT_ADMIN_PASSWORD_HASH='paste-generated-password-hash' \
  -e PHX_HOST=localhost \
  ghcr.io/cfbender/manavault:<version>
```

Health check:

```sh
curl http://localhost:4000/health
# {"status":"ok"}
```

First boot runs pending Ecto migrations and schedules Scryfall syncs. Card
searches and import matching become useful after the bulk catalog sync succeeds.
The catalog uses Scryfall's public bulk-data endpoint, and the catalog plus
symbol/set icon assets refresh daily while the app is running.

## Docker Compose

Example `docker-compose.yml`:

```yaml
services:
  manavault:
    image: ghcr.io/cfbender/manavault:<version>
    container_name: manavault
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./data:/data
    environment:
      SECRET_KEY_BASE: ${SECRET_KEY_BASE}
      PHX_HOST: ${PHX_HOST:-localhost}
      MANAVAULT_ADMIN_PASSWORD_HASH: ${MANAVAULT_ADMIN_PASSWORD_HASH}
```

Generate both required secrets once, put them in `.env`, then start the stack:

```sh
printf 'SECRET_KEY_BASE=%s\n' "$(mise exec -- mix phx.gen.secret)" > .env
printf 'MANAVAULT_ADMIN_PASSWORD_HASH=%s\n' "$(mise exec -- mix manavault.auth.hash 'change-me')" >> .env
printf 'PHX_HOST=localhost\n' >> .env
docker compose up -d
```

Build and run a local image:

```sh
docker build -t manavault .

docker run --rm \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE="$(mise exec -- mix phx.gen.secret)" \
  -e MANAVAULT_ADMIN_PASSWORD_HASH="$(mise exec -- mix manavault.auth.hash 'change-me')" \
  -e PHX_HOST=localhost \
  manavault
```

## Authentication and Reverse Proxies

ManaVault handles owner authentication with a single password hash, so
Traefik/Authelia middleware is not required. Built-in auth is enabled by default:
set `MANAVAULT_ADMIN_PASSWORD_HASH`, or explicitly opt out with
`MANAVAULT_AUTH_DISABLED=true`.

Keep static assets and public share links public at the proxy. ManaVault protects
private app routes and `/api/graphql` with its own session cookie.

The login endpoint enforces failed-password defenses before checking the password
hash:

- 5 failures per client IP per 15-minute window by default
- 30 failures globally per 15-minute window by default
- permanent client IP block after 30 cumulative failed password checks by default

Permanent means no automatic expiry. To unblock a client, delete its row from
`auth_client_failures` in the ManaVault SQLite database.

A minimal Traefik config can stay simple:

```yaml
labels:
  traefik.enable: "true"
  traefik.http.services.manavault.loadbalancer.server.port: 4000
  traefik.http.routers.manavault.tls.certresolver: prod
  traefik.http.routers.manavault.rule: Host(`${MANAVAULT_HOST}`)
  traefik.http.routers.manavault.middlewares: hsts-header
```

## Runtime Data Layout

Production mutable application data defaults under `/data`:

- `/data/manavault.db` - SQLite database
- `/data/cache/scryfall` - Scryfall cache; this can be regenerated
- `/data/backups` - ManaVault backup artifacts
- `/data/restores` - staged restore artifacts

On container boot, the entrypoint creates these directories, makes the mounted
data directory writable by the application user, and the release runs pending
Ecto migrations.

The local-data model is intentionally simple: back up the mounted `/data`
directory and you have the application state that matters. The Scryfall cache is
disposable and does not need to be preserved.

## Manual Backups

Create a backup zip:

```sh
mise exec -- mix manavault.backup
```

By default the artifact is written to `<DATA_DIR>/backups` or, in local
development, beside the configured SQLite database. The artifact contains:

- `manavault.db` - a consistent SQLite snapshot created with `VACUUM INTO`
- `manifest.json` - backup metadata

For a container using the documented bind mount, you can also back up the whole
host data directory while the container is stopped:

```sh
tar -czf manavault-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz data
```

## Restore

Restore a ManaVault backup zip with the app stopped:

```sh
mise exec -- mix manavault.restore /path/to/manavault-manual-20260617T120000Z.zip
```

The restore replaces the configured SQLite database and restored local files.
Before it overwrites anything, it saves the existing database and local files
under `<DATA_DIR>/backups/pre-restore-<timestamp>`.

For a release/container restore, stop the running container, restore into the
mounted host `data` directory with the same command from a local checkout, then
start the container again. Alternatively, extract a full-directory tar backup
over the stopped host `data` directory.

## Cloud Backups

Cloud backups are configured from **Settings -> Cloud backups** in the app.
Supported providers:

- Google Drive
- S3-compatible buckets, including Cloudflare R2 with region `auto`

Scheduled backups use a five-field CRON expression evaluated in UTC. A cloud
restore downloads the selected artifact to `<DATA_DIR>/restores/pending.zip`;
restart ManaVault to apply it before the database starts.

## Migration Safety

When a release starts with pending database migrations, ManaVault first creates a
pre-migration backup in `/data/backups`. If this backup fails, startup fails
instead of running migrations without a recoverable snapshot.

Set `MANAVAULT_SKIP_MIGRATION_BACKUP=true` only when you have already made an
external backup.

## Production Environment Variables

Required:

- `SECRET_KEY_BASE` - Phoenix secret key base. Generate with
  `mise exec -- mix phx.gen.secret`.

Common optional values:

- `PORT` - HTTP port inside the container. Defaults to `4000`.
- `PHX_HOST` - host used for generated URLs. Defaults to `example.com` in
  Phoenix production config; set to your deployment host.
- `MANAVAULT_ADMIN_PASSWORD_HASH` - owner password hash for built-in login.
  Generate with `mise exec -- mix manavault.auth.hash 'your-password'`.
- `MANAVAULT_AUTH_DISABLED` - set to `true` only when another layer already
  protects ManaVault and you want to opt out of built-in auth.
- `MANAVAULT_AUTH_MAX_ATTEMPTS_PER_IP` - failed login attempts allowed per
  client IP during the rate-limit window. Defaults to `5`.
- `MANAVAULT_AUTH_MAX_ATTEMPTS_GLOBAL` - failed login attempts allowed across all
  clients during the rate-limit window. Defaults to `30`.
- `MANAVAULT_AUTH_PERMANENT_BAN_AFTER_FAILURES` - cumulative failed login
  attempts from one client IP before ManaVault permanently blocks that client.
  Defaults to `30`.
- `MANAVAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS` - failed login rate-limit window.
  Defaults to `900`.
- `DATA_DIR` - mutable data root. Defaults to `/data`.
- `DATABASE_PATH` - SQLite database path. Defaults to `/data/manavault.db`.
- `POOL_SIZE` - Ecto pool size. Defaults to `5`.
- `MANAVAULT_ASSET_VERSION` - cache-busting version used by the HTML shell, PWA
  manifest, and service worker. Published GitHub container builds set this to the
  commit SHA automatically. Defaults to the application version when unset.
- `MANAVAULT_SKIP_MIGRATION_BACKUP` - set to `true` to skip automatic
  pre-migration backup creation. Use only after creating an external backup.

## GHCR Publishing

The container workflow publishes `ghcr.io/cfbender/manavault` on pushes to
`main` and on version tags matching `v*.*.*`.

Expected tags:

- `latest` from the default branch
- branch tags from branch pushes
- `<major>.<minor>.<patch>` and `<major>.<minor>` from tag
  `v<major>.<minor>.<patch>`
- `v<major>.<minor>.<patch>` from the raw tag ref
