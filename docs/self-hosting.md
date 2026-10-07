# Self-Hosting ManaVault

ManaVault runs as a single Rust binary (`manavault`) backed by SQLite and local
files. No
Postgres, Redis, object storage, or hosted service is required.

- [Container image](#container-image)
- [Quick container run](#quick-container-run)
- [Docker Compose](#docker-compose)
- [Building your own image](#building-your-own-image)
- [Authentication and reverse proxies](#authentication-and-reverse-proxies)
- [Public share links](#public-share-links)
- [Runtime data layout](#runtime-data-layout)
- [Upgrading](#upgrading)
- [Manual backups](#manual-backups), [Restore](#restore), and
  [Cloud backups](#cloud-backups)
- [Production environment variables](#production-environment-variables)
- [Troubleshooting](#troubleshooting)
- [GHCR publishing](#ghcr-publishing)

## Container Image

The production image is published to GitHub Container Registry:

```sh
docker pull ghcr.io/cfbender/manavault:<version>
```

Use a concrete release tag for deployments. `latest` follows the default branch
and is useful for testing only.

## Quick Container Run

Generate a secret key base and an owner password hash. The image's binary
prints the hash, so no source checkout is needed:

```sh
openssl rand -base64 48
docker run --rm --entrypoint /app/bin/manavault ghcr.io/cfbender/manavault:<version> \
  hash-password 'change-me'
```

From a source checkout, `cargo run --bin manavault -- hash-password 'change-me'`
(in `rust/`) prints the same format.

Run with a mounted `/data` volume:

```sh
mkdir -p data

docker run -d \
  --name manavault \
  --restart unless-stopped \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e MANAVAULT_SECRET_KEY='paste-generated-secret' \
  -e MANAVAULT_ADMIN_PASSWORD_HASH='paste-generated-password-hash' \
  -e MANAVAULT_PUBLIC_HOST=localhost \
  ghcr.io/cfbender/manavault:<version>
```

Health check:

```sh
curl http://localhost:4000/health
# {"status":"ok"}
```

First boot creates the database (or applies pending migrations to an existing
one) and schedules background syncs. Card
searches and import matching become useful after the bulk catalog sync succeeds.
The catalog uses Scryfall's public bulk-data endpoint. While the app is running,
the catalog and symbol/set icon assets refresh daily, vendor prices every 30
minutes, and scanner models every six hours.

Keep `MANAVAULT_SECRET_KEY` stable. It encrypts sessions and derives the key that
encrypts stored secrets (the OpenRouter API key and cloud backup credentials).
After a change, or when restoring a backup under a different value, existing
sessions end and those secrets load as empty; re-enter them in Settings.

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
      MANAVAULT_SECRET_KEY: ${MANAVAULT_SECRET_KEY}
      MANAVAULT_PUBLIC_HOST: ${MANAVAULT_PUBLIC_HOST:-localhost}
      MANAVAULT_ADMIN_PASSWORD_HASH: ${MANAVAULT_ADMIN_PASSWORD_HASH}
      # Only needed when ManaVault is also reached under hostnames other than MANAVAULT_PUBLIC_HOST:
      # MANAVAULT_ALLOWED_ORIGINS: https://manavault.mytailnet.ts.net
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
printf 'MANAVAULT_SECRET_KEY=%s\n' "$(openssl rand -base64 48)" > .env
printf 'MANAVAULT_ADMIN_PASSWORD_HASH=%s\n' "$(docker run --rm --entrypoint /app/bin/manavault \
  ghcr.io/cfbender/manavault:<version> hash-password 'change-me')" >> .env
printf 'MANAVAULT_PUBLIC_HOST=localhost\n' >> .env
docker compose up -d
```

## Building Your Own Image

Build and run a local image:

```sh
docker build --pull --no-cache-filter runner -t manavault .

docker run --rm \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e MANAVAULT_SECRET_KEY="$(openssl rand -base64 48)" \
  -e MANAVAULT_ADMIN_PASSWORD_HASH="$(docker run --rm --entrypoint /app/bin/manavault manavault hash-password 'change-me')" \
  -e MANAVAULT_PUBLIC_HOST=localhost \
  manavault
```

The build has four stages: Node with aube and Tailwind's standalone CLI builds
the frontend into `priv/static`, the Rust toolchain builds the `manavault`
release binary (`cargo build --release --locked` against the committed `.sqlx`
query metadata), and a slim Debian runtime holds the binary, the static files,
CA certificates, DejaVu fonts, and `tini`. It refreshes base images and runtime
Debian packages while retaining compiled-dependency caches. Public share-preview PNGs use resvg 0.48.1 and
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
`MANAVAULT_AUTH_DISABLED=true` (only for localhost trials or when another layer
already protects ManaVault).

To change the password, generate a new hash with
`manavault hash-password 'new-password'`, update the environment variable, and
recreate the container.

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
header (`MANAVAULT_FORWARDED_IP_HEADER`, default `x-forwarded-for`).

A minimal Traefik config can stay simple:

```yaml
labels:
  traefik.enable: "true"
  traefik.http.services.manavault.loadbalancer.server.port: 4000
  traefik.http.routers.manavault.tls.certresolver: prod
  traefik.http.routers.manavault.rule: Host(`${MANAVAULT_HOST}`)
  traefik.http.routers.manavault.middlewares: hsts-header
```

### Serving more than one hostname

Live updates use a WebSocket, and ManaVault only accepts WebSocket connections
from pages served on `MANAVAULT_PUBLIC_HOST`. If the same instance is also reached under
another name, for example through a reverse proxy at `manavault.example.com` and
through `tailscale serve` at `manavault.mytailnet.ts.net`, list the extra origins:

```sh
MANAVAULT_PUBLIC_HOST=manavault.example.com
MANAVAULT_ALLOWED_ORIGINS=https://manavault.mytailnet.ts.net,https://manavault.lan
```

Each entry is a scheme, hostname, and optional port (`https://manavault.lan:8443`)
with no path. `MANAVAULT_PUBLIC_HOST` stays allowed automatically, and ManaVault refuses to
start if an entry is malformed. Absolute URLs that ManaVault generates, such as
deck share links and link-preview metadata, still use `MANAVAULT_PUBLIC_HOST`.

### Login rate limits

The login endpoint enforces failed-password defenses before checking the password
hash:

- 5 failures per client IP per 15-minute window by default
- 30 failures globally per 15-minute window by default
- permanent client IP block after 30 cumulative failed password checks by default

The thresholds are configurable; see
[environment variables](#production-environment-variables).

### Recover from a permanent login ban

Permanent bans do not expire. In a running container, clear one client or all
clients with the binary (replace `manavault` with the container name); the
running server's short-lived rate-limit windows expire on their own:

```sh
docker exec -u app manavault /app/bin/manavault unban 203.0.113.10
docker exec -u app manavault /app/bin/manavault unban --all
```

From a source checkout, the same binary does it against the development
database (`MANAVAULT_ENV=dev`; set `DATABASE_PATH` for another file):

```sh
MANAVAULT_ENV=dev MANAVAULT_ROOT=.. mise exec -- cargo run --bin manavault -- unban 203.0.113.10   # in rust/
MANAVAULT_ENV=dev MANAVAULT_ROOT=.. mise exec -- cargo run --bin manavault -- unban --all
```

Both remove the client's rows from the `auth_client_failures` table and clear
the in-memory counters.

## Public Share Links

Share pages (`/share/...`) and the public `/share/graphql` endpoint do not
require login. `/share/graphql` is rate limited to 120 requests per client IP
and 1,200 globally per minute by default; the same budget applies to the
[personal API](api.md).

Owners can rotate or disable deck, wants-list, and trade-binder bearer links in
their Share dialogs. ManaVault rejects the old token immediately at the origin.
If a reverse proxy or CDN caches public responses despite ManaVault's response
headers, an already-cached response may remain visible until that intermediary's
cache expires or is purged; configure public share paths to revalidate when
immediate revocation at the edge is required.

### Remote ManaVault share destinations

Pasting a share link from a public ManaVault instance into Trade Matches or
Compare decklist works without additional configuration. Requests to loopback,
private/LAN, link-local, multicast, unspecified, and reserved IPv4 or IPv6
destinations are denied by default.

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

## Runtime Data Layout

Production mutable application data defaults under `/data`:

- `/data/manavault.db` - SQLite database
- `/data/cache/scryfall` - Scryfall cache; this can be regenerated
- `/data/cache/share-previews` - generated share preview images; regenerated
  on demand
- `/data/scanner` - card scanner model bundles (downloaded automatically) and
  `scanner/corrections` training captures when collection is enabled
- `/data/backups` - ManaVault backup artifacts
- `/data/restores` - staged restore artifacts

On container boot, the entrypoint creates these directories and makes the
mounted data directory writable by the application user. The server then
creates the database, or applies pending migrations to an existing one, from
the migrations it embeds.

The local-data model is intentionally simple: back up the mounted `/data`
directory and you have the application state that matters. The caches are
disposable and do not need to be preserved.

## Upgrading

1. Check [CHANGELOG.md](../CHANGELOG.md) for the target version.
2. Update the image tag and recreate the container:

   ```sh
   docker compose pull && docker compose up -d
   ```

3. Confirm `GET /health` returns `{"status":"ok"}`.

On boot the server applies any pending database migrations, oldest first, so
an install from any earlier release (including the ones built on the previous
backend) upgrades in place. Before migrating it writes a pre-migration backup
to `/data/backups/manavault-pre_migration-<timestamp>.zip`. Encrypted settings
keep working as long as `MANAVAULT_SECRET_KEY` stays the same. Upgrading from a
1.x release signs every browser out once: the session cookie changed format, so
sign in again after the upgrade. The 1.x variable names `SECRET_KEY_BASE` and
`PHX_HOST` still work (with a warning in the server log) until you rename them
to `MANAVAULT_SECRET_KEY` and `MANAVAULT_PUBLIC_HOST`.
A database from a newer release than the image still starts (migrations the
image does not know are ignored with a warning), but downgrading is not
supported; restore the pre-migration backup instead. Set
`MANAVAULT_SKIP_MIGRATION_BACKUP=true` only when you have already made an
external backup.

When a release changes what the catalog importer records (for example the
token printings and card-to-token links added for the Tokens tab), the first
start after upgrading re-runs the full Scryfall catalog sync instead of
waiting for the daily refresh. Until it finishes, features that depend on the
new data fall back to their previous behavior (deck token lists show Oracle
text guesses rather than real token cards). Progress is logged as
`Scryfall catalog sync ...`, and **Settings -> Scryfall data -> Reload Scryfall
catalog** forces the sync by hand.

The catalog import only writes cards, printings, and token links whose stored
data differs from the Scryfall bulk file, and it pauses briefly between batch
commits so other writers (Oban, price refreshes, user edits) can take the
SQLite write lock. Progress lines report `written_cards=N written_printings=M`
alongside the source counts; on a day with no catalog changes both stay near
zero. `GenServer {Oban.Registry, {Oban, Oban.Stager}} terminating` with
`database is locked` means a writer waited the full SQLite `busy_timeout`
(10 seconds) for the lock. The stager restarts on its own, but seeing this
repeatedly points to another long-running writer rather than the import.

To roll back, stop the container, restore the pre-migration backup (see
[Restore](#restore)), and start the previous image tag. Switching the tag alone
leaves the newer schema in place.

## Manual Backups

Inside a running container, create a backup in `/data/backups`:

```sh
docker exec -u app manavault /app/bin/manavault backup
```

From a source checkout, the binary backs up the development database
(`MANAVAULT_ENV=dev`, or `--database PATH`); `-o DIR` chooses where the zip is
written:

```sh
MANAVAULT_ENV=dev MANAVAULT_ROOT=.. mise exec -- cargo run --bin manavault -- backup   # in rust/
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
/app/bin/manavault restore /path/to/manavault-manual-20260617T120000Z.zip
```

The restore replaces the configured SQLite database and restored local files.
Before it overwrites anything, it saves the existing database and local files
under `<DATA_DIR>/backups/pre-restore-<timestamp>`.

For a container restore, stop the running container, restore into the mounted
`data` directory with the image's binary (it reads the same environment as the
server, here the `.env` from [Docker Compose](#docker-compose); `docker compose
run --rm -u app --entrypoint /app/bin/manavault manavault restore <zip>` works
too), then start the container again:

```sh
docker stop manavault
docker run --rm -u app -v "$PWD/data:/data" --env-file .env \
  --entrypoint /app/bin/manavault ghcr.io/cfbender/manavault:<version> \
  restore /data/backups/manavault-manual-20260617T120000Z.zip
docker start manavault
```

From a checkout, `cargo run --bin manavault -- restore --database ../data/manavault.db
--data-dir ../data <zip>` (in `rust/`) does the same.

Alternatively, extract a full-directory tar backup over the stopped host `data`
directory, or stage a cloud restore from Settings.

## Cloud Backups

Cloud backups are configured from **Settings -> Cloud backups** in the app.
Supported providers:

- Google Drive
- S3-compatible buckets, including Cloudflare R2 with region `auto`

Scheduled backups use a five-field CRON expression evaluated in UTC, and a
retention count prunes older remote backups. A cloud restore downloads the
selected artifact to `<DATA_DIR>/restores/pending.zip`; restart ManaVault to
apply it before the database starts. Provider credentials are encrypted with a
key derived from `MANAVAULT_SECRET_KEY`.

## Production Environment Variables

Required:

- `MANAVAULT_SECRET_KEY` - secret key (64+ characters; encrypts sessions and
  stored credentials). Generate with `openssl rand -base64 48`. Keep it
  stable; see [Quick container run](#quick-container-run). The 1.x name
  `SECRET_KEY_BASE` is still read, with a deprecation warning.
- `MANAVAULT_ADMIN_PASSWORD_HASH` - owner password hash for built-in login.
  Generate with `manavault hash-password 'your-password'`. Required
  unless `MANAVAULT_AUTH_DISABLED=true`.

Server:

- `PORT` - HTTP port inside the container. Defaults to `4000`.
- `MANAVAULT_PUBLIC_HOST` - public host used for generated URLs. Required in
  production. The 1.x name `PHX_HOST` is still read, with a deprecation warning.
- `MANAVAULT_ALLOWED_ORIGINS` - comma-separated extra origins allowed to open the
  live-update WebSocket, e.g. `https://manavault.mytailnet.ts.net`. Needed only
  when the instance is reached under more than one hostname, such as a reverse
  proxy plus Tailscale. Unset by default, which allows `MANAVAULT_PUBLIC_HOST` only. See
  [Serving more than one hostname](#serving-more-than-one-hostname).
- `DATA_DIR` - mutable data root. Defaults to `/data`.
- `DATABASE_PATH` - SQLite database path. Defaults to `/data/manavault.db`.
- `POOL_SIZE` - SQLite connection pool size. Defaults to `5`.
- `MANAVAULT_ENV` - `prod` (default), `dev`, or `test`; selects defaults (dev
  and test disable authentication and use local paths). The image sets `prod`.
- `MANAVAULT_STATIC_DIR` - built frontend and static files. Defaults to
  `<MANAVAULT_ROOT>/priv/static` (`/app/priv/static` in the image).
- `SHARE_PREVIEW_CACHE_DIR` - share preview image cache. Defaults to
  `<DATA_DIR>/cache/share-previews`.
- `MANAVAULT_ASSET_VERSION` - cache-busting version used by the HTML shell, PWA
  manifest, and service worker. Published GitHub container builds set this to the
  commit SHA automatically. Defaults to the application version when unset.
- `MANAVAULT_SKIP_MIGRATION_BACKUP` - set to `true` to skip automatic
  pre-migration backup creation. Use only after creating an external backup.

Authentication and sessions:

- `MANAVAULT_AUTH_DISABLED` - set to `true` only when another layer already
  protects ManaVault and you want to opt out of built-in auth.
- `MANAVAULT_SECURE_COOKIES` - set to `true` to mark the session cookie Secure.
  Defaults to `false`; enable whenever users reach ManaVault over HTTPS.
- `MANAVAULT_SESSION_MAX_AGE_DAYS` - session cookie lifetime in days. Defaults
  to `180`.
- `MANAVAULT_TRUST_PROXY_HEADERS` - set to `true` to use the forwarded IP header
  as the rate-limit client identifier. Defaults to `false`; enable only behind a
  trusted proxy that controls the header.
- `MANAVAULT_FORWARDED_IP_HEADER` - forwarded client-IP header to trust when
  `MANAVAULT_TRUST_PROXY_HEADERS=true`. Defaults to `x-forwarded-for`.
- `MANAVAULT_AUTH_MAX_ATTEMPTS_PER_IP` - failed login attempts allowed per
  client IP during the rate-limit window. Defaults to `5`.
- `MANAVAULT_AUTH_MAX_ATTEMPTS_GLOBAL` - failed login attempts allowed across all
  clients during the rate-limit window. Defaults to `30`.
- `MANAVAULT_AUTH_PERMANENT_BAN_AFTER_FAILURES` - cumulative failed login
  attempts from one client IP before ManaVault permanently blocks that client.
  Defaults to `30`.
- `MANAVAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS` - failed login rate-limit window.
  Defaults to `900`.

Public sharing and API:

- `MANAVAULT_PUBLIC_SHARE_MAX_REQUESTS_PER_IP` - `/share/graphql` and personal
  API requests allowed per client IP per window. Defaults to `120`.
- `MANAVAULT_PUBLIC_SHARE_MAX_REQUESTS_GLOBAL` - `/share/graphql` and personal
  API requests allowed globally per window. Defaults to `1200`.
- `MANAVAULT_PUBLIC_SHARE_RATE_LIMIT_WINDOW_SECONDS` - public request window.
  Defaults to `60`.
- `MANAVAULT_REMOTE_SHARE_ALLOWLIST` - comma-separated hostnames or CIDRs that
  remote share-link fetches may reach even though they are private or loopback.
  Empty by default; see
  [Remote ManaVault share destinations](#remote-manavault-share-destinations).

Card scanner:

- `SCANNER_BUNDLE_SOURCE` - where scanner model updates come from: `github`
  (default, the newest published `scanner-bundle-*` release), an HTTPS URL
  ending in `manifest.json`, or `off`. See [scanner.md](scanner.md).
- `SCANNER_CORRECTIONS_TOKEN` - read-only token (32+ characters) that lets
  Oracle's importer download scanner training captures from
  `/api/scanner/corrections`. Unset disables token access. See
  [scanner.md](scanner.md#training-data).

## Troubleshooting

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

### Logs

**Settings -> Server logs** streams live application output to the browser.
The same output goes to the container's stdout (`docker logs manavault`).

## GHCR Publishing

The container workflow publishes `ghcr.io/cfbender/manavault` on pushes to
`main` and on version tags matching `v*.*.*`.

Expected tags:

- `latest` from the default branch
- branch tags from branch pushes
- `<major>.<minor>.<patch>` and `<major>.<minor>` from tag
  `v<major>.<minor>.<patch>`
- `v<major>.<minor>.<patch>` from the raw tag ref
