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

### Diagnosing a stalled catalog sync

Oban's Lifeline checks once a minute for jobs left `executing` for over an hour
after a crash, restart, or failed database acknowledgement. It requeues jobs
with attempts remaining and discards exhausted jobs, allowing the next scheduled
or manual reload to enqueue again. The one-hour threshold must stay above every
worker timeout; current workers run for at most 30 minutes.

`Exqlite.Error: Database busy` while updating `oban_jobs` means a job could not
record its result. A backup worker error alone does not establish that the
catalog sync failed. To check, run these read-only queries against the live
SQLite database (default `/data/manavault.db`):

```sql
SELECT id, worker, state, attempt, max_attempts, attempted_at, errors
FROM oban_jobs
WHERE worker IN ('Manavault.Catalog.ScryfallCatalogWorker',
                 'Manavault.Backup.CloudBackupWorker')
ORDER BY id DESC LIMIT 20;

SELECT id, status, started_at, completed_at, printings_count, error
FROM scryfall_syncs ORDER BY id DESC LIMIT 10;

SELECT scryfall_id, set_code, collector_number, updated_at
FROM scryfall_printings WHERE set_code = 'sld' AND collector_number = '2618';
```

An old `executing` catalog job can block both scheduled and forced reloads
because sync jobs are unique across all incomplete states. Lifeline recovers
existing orphans too, on its next check once they exceed the threshold. Recovery
does not remove the underlying SQLite write contention; repeated busy errors
still need investigation of the overlapping writes.

The recurring saltiness and commander-rank refreshes commit updates in batches
of at most 200 cards, then clear values absent from the new feed in equally
bounded batches. Other writers can acquire the lock between statements. Values
become visible incrementally rather than as one atomic refresh; a failure keeps
completed batches, and retrying completes the refresh without first blanking the
whole table. The one-time paper-printing reconciliation still uses a single
transaction to keep collection, deck, and trade references consistent.

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
    healthcheck:
      test: ["CMD", "/usr/local/bin/manavault-healthcheck"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3
```

The image already includes this healthcheck. If your compose file or deployment
platform overrides it, use `/usr/local/bin/manavault-healthcheck`; the runtime
image does not include `curl`.

Generate both required secrets once, put them in `.env`, then start the stack:

```sh
printf 'SECRET_KEY_BASE=%s\n' "$(mise exec -- mix phx.gen.secret)" > .env
printf 'MANAVAULT_ADMIN_PASSWORD_HASH=%s\n' "$(mise exec -- mix manavault.auth.hash 'change-me')" >> .env
printf 'PHX_HOST=localhost\n' >> .env
docker compose up -d
```

Build and run a local image:

```sh
docker build --pull --no-cache-filter runner -t manavault .

docker run --rm \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE="$(mise exec -- mix phx.gen.secret)" \
  -e MANAVAULT_ADMIN_PASSWORD_HASH="$(mise exec -- mix manavault.auth.hash 'change-me')" \
  -e PHX_HOST=localhost \
  manavault
```

The build refreshes base images and runtime Alpine packages while retaining
compiled-dependency caches. Public share-preview PNGs use resvg 0.48.1 and
DejaVu fonts; the container no longer needs the GLib-based `rsvg-convert`.
Non-container installations need `resvg` on `PATH` to generate these PNGs.

To check the final runtime image with Grype (including findings without fixes):

```sh
grype docker:manavault --fail-on high
```

Rebuild and redeploy to pick up security updates; existing containers and
published version tags do not change when the Dockerfile is updated.

## Authentication and Reverse Proxies

ManaVault handles owner authentication with a single password hash, so
Traefik/Authelia middleware is not required. Built-in auth is enabled by default:
set `MANAVAULT_ADMIN_PASSWORD_HASH`, or explicitly opt out with
`MANAVAULT_AUTH_DISABLED=true`.

Keep static assets and public share links public at the proxy. ManaVault protects
private app routes and `/api/graphql` with its own session cookie.

For an HTTPS deployment behind a reverse proxy, set both of these values:

```sh
MANAVAULT_SECURE_COOKIES=true
MANAVAULT_TRUST_PROXY_HEADERS=true
```

Secure cookies prevent browsers from sending the session over plaintext HTTP.
Trusting proxy headers gives each client its own login rate-limit key instead of
collapsing all clients into the proxy's IP address. Enable proxy-header trust
only when a proxy you control overwrites or appends the configured forwarded-IP
header.

### Recover from a permanent login ban

ManaVault permanently bans a client identifier after the configured cumulative
failure threshold. From a source checkout, clear one client or all clients with:

```sh
mise exec -- mix manavault.auth.unban 203.0.113.10
mise exec -- mix manavault.auth.unban --all
```

For a running release container, invoke the same reset through the release node
(replace `manavault` with the container name):

```sh
docker exec manavault /app/bin/manavault rpc 'Manavault.Auth.AttemptLimiter.reset("203.0.113.10")'
docker exec manavault /app/bin/manavault rpc 'Manavault.Auth.AttemptLimiter.reset_all()'
```

Owners can rotate or disable deck, wants-list, and trade-binder bearer links in
their Share dialogs. ManaVault rejects the old token immediately at the origin.
If a reverse proxy or CDN caches public responses despite ManaVault's response
headers, an already-cached response may remain visible until that intermediary's
cache expires or is purged; configure public share paths to revalidate when
immediate revocation at the edge is required.

### Remote ManaVault share destinations

Pasting a share link from a public ManaVault instance works without additional
configuration. Requests to loopback, private/LAN, link-local, multicast,
unspecified, and reserved IPv4 or IPv6 destinations are denied by default.

To trade with a trusted self-hosted friend on a LAN, explicitly allow the exact
hostname or the narrowest required CIDR with a comma-separated environment
variable, for example:

```sh
MANAVAULT_REMOTE_SHARE_ALLOWLIST=friend-vault.home,192.168.50.24/32,fd12:3456::20/128
```

An allowed hostname permits all addresses returned for that exact hostname;
an allowed CIDR permits only addresses in that network. Prefer an exact host or
`/32` (IPv4) or `/128` (IPv6) entry over a broad LAN range. ManaVault validates
every DNS result and connects to a validated, pinned address to prevent DNS
rebinding between policy evaluation and the outbound request.

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

- `manavault.db` - a consistent SQLite snapshot created with `VACUUM INTO`;
  replaceable Scryfall catalog rows are omitted and regenerated by sync
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
- `MANAVAULT_TRUST_PROXY_HEADERS` - set to `true` to use the forwarded IP header
  as the login rate-limit client identifier. Defaults to `false`; enable only
  behind a trusted proxy that controls the header.
- `MANAVAULT_FORWARDED_IP_HEADER` - forwarded client-IP header to trust when
  `MANAVAULT_TRUST_PROXY_HEADERS=true`. Defaults to `x-forwarded-for`.
- `MANAVAULT_SECURE_COOKIES` - set to `true` to mark the session cookie Secure.
  Defaults to `false`; enable whenever users reach ManaVault over HTTPS.
- `MANAVAULT_SESSION_MAX_AGE_DAYS` - session cookie lifetime in days. Defaults
  to `180`.
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
