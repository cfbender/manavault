# ManaVault

ManaVault is a self-hosted Magic: The Gathering collection manager with scanned
list imports, physical deck allocation, and missing-card buying workflows.

It exists for players who want a local source of truth for the cards they own:
what printing each copy is, where it is stored, which deck is using it, and what
still needs to be bought or pulled from storage for the next deck.

ManaVault is built as a Phoenix application with a Vite/React frontend, GraphQL
API, SQLite storage, local file uploads, and an optional Capacitor mobile shell.

## Product Promise

- Own your data: production data lives in a local SQLite database under `/data`.
- Import cards quickly: collection imports accept text and CSV/TXT files,
  including Android shares/open-with files and iOS shares sent into the native
  shells.
- Treat decks as physical commitments: deck cards can be allocated to concrete
  collection items so one copy cannot accidentally be promised to multiple decks.
- Turn gaps into action: missing-card reports and buylist exports show what a
  deck still needs after available copies are allocated.
- Self-host with one container: no Postgres, Redis, object storage, or hosted
  backend is required.

## Core Concepts

- Card identity: the game object shared by all printings of a card. ManaVault
  stores this using Scryfall's `oracle_id` and card-level fields such as name,
  type line, mana cost, oracle text, and color identity.
- Printing: a specific physical/digital release of a card, keyed by Scryfall
  `id`. Printings carry set code, collector number, language, rarity, finishes,
  images, release date, and price data.
- Collection item: a stack of physical cards you own that share the same
  printing, condition, finish, and storage location. Quantity lives here.
- Location: a real storage place such as a box, binder, deck box, list, folder,
  or other container.
- Deck: a named deck with format/status metadata and deck-card rows for the
  requested cards, quantities, zones, finishes, commander flags, and preferred
  printings.
- Deck allocation: a reservation connecting one deck card to one collection
  item. Allocations are the bridge between decklists and physical inventory.
- Missing cards: deck demand that remains after allocated and available
  collection copies are counted. Missing-card exports can be tuned by printing
  mode and basic-land inclusion.

## Development Setup

Requirements:

- `mise` for the pinned local toolchain in `mise.toml`.
- SQLite support from the Elixir dependencies.

Install the toolchain, JavaScript dependencies, database, and assets:

```sh
mise run setup
```

Start Phoenix:

```sh
mise run dev
```

Then visit <http://localhost:4000>.

Health check:

```sh
curl http://localhost:4000/health
# {"status":"ok"}
```

Run tests:

```sh
mise run test
```

Run the fuller local precommit suite:

```sh
mise run precommit
```

Release helper:

```sh
mise run changelog -- patch
mise run release -- patch
```

The release task generates `CHANGELOG.md`, bumps `mix.exs`, updates the Docker
tag examples, commits, creates an annotated tag, and pushes the branch and tag.
See [docs/releasing.md](docs/releasing.md) for details.

## Native Shells

ManaVault includes Capacitor Android and iOS shell projects for mobile testing
and native API work. The native shell starts from bundled setup assets in
`native_www`, asks for the ManaVault server URL on first launch, stores that URL
on the device, checks the latest GitHub release for APK updates, and then loads
the configured server inside the native WebView.
The native shells register as text/CSV share targets. On Android, ManaVault also
accepts `content://` or `file://` open-with file intents; pick ManaVault with
the Import action label beneath the app name from the Share, Open with, or
Export file flow to send TXT/CSV exports into collection import with auto-preview.

Use `aube` for JavaScript package tasks:

```sh
mise run setup:native
mise run setup:android-sdk
mise run android:build
mise run android:run
```

Android uses the project-local Java and Android SDK toolchains declared in
`mise.toml`. `setup:android-sdk` accepts the Android SDK licenses and installs
`platform-tools`, Android API 36, and build-tools 35.0.0/36.0.0 for Capacitor's
native build and run flows. Tag builds in `.github/workflows/capacitor.yml`
upload a signed release APK to the GitHub release. See
[docs/android.md](docs/android.md) for release signing and custom-domain App
Link builds.

iOS syncs from this repo, but building or running the iOS app requires macOS
with Xcode:

```sh
mise run ios:sync
mise run ios:open
```

## Runtime Data Layout

Production mutable application data defaults under `/data`:

- `/data/manavault.db` - SQLite database
- `/data/cache/scryfall` - Scryfall cache; this can be regenerated
- `/data/backups` - ManaVault backup artifacts

On container boot, the entrypoint creates these directories, makes the mounted
data directory writable by the application user, and the release runs pending
Ecto migrations.

The local-data model is intentionally simple: back up the mounted `/data`
directory and you have the application state that matters.

## Backup and Restore

Back up `/data/manavault.db`. The Scryfall cache under `/data/cache/scryfall` is
disposable and does not need to be preserved.

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

Restore a ManaVault backup zip with the app stopped:

```sh
mise exec -- mix manavault.restore /path/to/manavault-manual-20260617T120000Z.zip
```

The restore replaces the configured SQLite database and restored local files.
Before it overwrites anything, it saves the existing database and local files
under `<DATA_DIR>/backups/pre-restore-<timestamp>`.

Cloud backups are configured from **Settings -> Cloud backups** in the app. The
settings page supports Google Drive and S3-compatible buckets, including
Cloudflare R2 with region `auto`. Scheduled backups use a five-field CRON
expression evaluated in UTC. A cloud restore downloads the selected artifact to
`<DATA_DIR>/restores/pending.zip`; restart ManaVault to apply it before the
database starts.

For a release/container restore, stop the running container, restore into the
mounted host `data` directory with the same command from a local checkout, then
start the container again. Alternatively, extract a full-directory tar backup
over the stopped host `data` directory.

When a release starts with pending database migrations, ManaVault first creates a
pre-migration backup in `/data/backups`. If this backup fails, startup fails
instead of running migrations without a recoverable snapshot. Set
`MANAVAULT_SKIP_MIGRATION_BACKUP=true` only when you have already made an
external backup.

## Docker and Self-Hosting

The production image is published to GitHub Container Registry:

```sh
docker pull ghcr.io/cfbender/manavault:0.6.9
```

Generate a secret for production cookies:

```sh
mise exec -- mix phx.gen.secret
```

Run with a mounted `/data` volume:

```sh
mkdir -p data

docker run -d \
  --name manavault \
  --restart unless-stopped \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE="$(mise exec -- mix phx.gen.secret)" \
  -e PHX_HOST=localhost \
  ghcr.io/cfbender/manavault:0.6.9
```

Health check:

```sh
curl http://localhost:4000/health
```

First boot runs migrations and schedules Scryfall syncs. Card searches and import
matching become useful after the bulk catalog sync succeeds. The catalog uses
Scryfall's public bulk-data endpoint, and the catalog plus symbol/set icon assets
refresh daily while the app is running.

Build the image locally:

```sh
docker build -t manavault .
```

Example `docker-compose.yml` using the published GHCR image:

```yaml
services:
  manavault:
    image: ghcr.io/cfbender/manavault:0.6.9
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

ManaVault handles owner authentication itself with a single password hash, so
Traefik/Authelia middleware is not required. Built-in auth is enabled by default:
set `MANAVAULT_ADMIN_PASSWORD_HASH`, or explicitly opt out with
`MANAVAULT_AUTH_DISABLED=true`. Keep static assets and share links public at the
proxy; ManaVault protects the private app routes and `/api/graphql` with its own
session cookie.

The login endpoint also enforces in-app failed-password defenses before
checking the password hash: 5 failures per client IP and 30 failures globally
per 15-minute window by default. A client IP is permanently blocked after 30
failed password checks. This is not a replacement for fail2ban or proxy-level
throttling, but it keeps brute-force protection with the app when the reverse
proxy is simple or misconfigured.

Permanent means no automatic expiry: to unblock a client, delete its row from
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

Generate both required secrets once, put them in `.env`, then start the stack:

```sh
printf 'SECRET_KEY_BASE=%s\n' "$(mise exec -- mix phx.gen.secret)" > .env
printf 'MANAVAULT_ADMIN_PASSWORD_HASH=%s\n' "$(mise exec -- mix manavault.auth.hash 'change-me')" >> .env
printf 'PHX_HOST=localhost\n' >> .env
docker compose up -d
```

Run the local image:

```sh
docker run --rm \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE="$(mise exec -- mix phx.gen.secret)" \
  -e MANAVAULT_ADMIN_PASSWORD_HASH="$(mise exec -- mix manavault.auth.hash 'change-me')" \
  -e PHX_HOST=localhost \
  manavault
```

### Production Environment Variables

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
- `MANAVAULT_AUTH_MAX_ATTEMPTS_GLOBAL` - failed login attempts allowed across
  all clients during the rate-limit window. Defaults to `30`.
- `MANAVAULT_AUTH_PERMANENT_BAN_AFTER_FAILURES` - cumulative failed login
  attempts from one client IP before ManaVault permanently blocks that client.
  Defaults to `30`.
- `MANAVAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS` - failed login rate-limit window.
  Defaults to `900`.
- `DATA_DIR` - mutable data root. Defaults to `/data`.
- `DATABASE_PATH` - SQLite database path. Defaults to `/data/manavault.db`.
- `POOL_SIZE` - Ecto pool size. Defaults to `5`.
- `MANAVAULT_ASSET_VERSION` - cache-busting version used by the HTML shell,
  PWA manifest, and service worker. Published GitHub container builds set this
  to the commit SHA automatically. Defaults to the application version when
  unset.

No Postgres or external service is required.

### GHCR Publishing

The container workflow publishes `ghcr.io/cfbender/manavault` on pushes to
`main` and on version tags matching `v*.*.*`.

Expected tags:

- `latest` from the default branch
- branch tags from branch pushes
- `0.6.9` and `0.6` from tag `v0.6.9`
- `v0.6.9` from the raw tag ref

## Roadmap

The v0.1.0 line is the first self-hostable baseline. The phase issues capture
the implementation path:

| Phase                                                  | Scope                                                  | Status |
| ------------------------------------------------------ | ------------------------------------------------------ | ------ |
| [#1](https://github.com/cfbender/manavault/issues/1)   | Application foundation and single-container deployment | Closed |
| [#2](https://github.com/cfbender/manavault/issues/2)   | Local Scryfall catalog sync                            | Closed |
| [#3](https://github.com/cfbender/manavault/issues/3)   | Card and printing search UI                            | Closed |
| [#4](https://github.com/cfbender/manavault/issues/4)   | Collection model and manual management                 | Closed |
| [#10](https://github.com/cfbender/manavault/issues/10) | Deck creation and import                               | Closed |
| [#11](https://github.com/cfbender/manavault/issues/11) | Physical card allocation engine                        | Closed |
| [#12](https://github.com/cfbender/manavault/issues/12) | Missing-card buylist and export workflows              | Closed |
| [#13](https://github.com/cfbender/manavault/issues/13) | Collection import/export                               | Closed |
| [#14](https://github.com/cfbender/manavault/issues/14) | Backup, restore, and self-hosting safety               | Closed |
| [#17](https://github.com/cfbender/manavault/issues/17) | Project documentation and roadmap                      | Closed |

Near-term follow-up work is tracked in
[#20](https://github.com/cfbender/manavault/issues/20) for EDHRec
recommendations/cuts and [#21](https://github.com/cfbender/manavault/issues/21)
for catalog context refactoring.
