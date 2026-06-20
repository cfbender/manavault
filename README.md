# ManaVault

ManaVault is a self-hosted Magic: The Gathering collection manager with fast card
scanning, physical deck allocation, and missing-card buying workflows.

It exists for players who want a local source of truth for the cards they own:
what printing each copy is, where it is stored, which deck is using it, and what
still needs to be bought or pulled from storage for the next deck.

ManaVault is built as a Phoenix application with a Vite/React frontend, GraphQL
API, SQLite storage, local file uploads, and an optional Capacitor mobile shell.

## Product Promise

- Own your data: production data lives in a local SQLite database and local
  upload directories under `/data`.
- Scan real cards quickly: camera captures are processed with RapidOCR, local
  Scryfall matching, review queues, and image/art matching for exact-printing
  confidence.
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
- Scan session: a batch of camera captures. Each scan item records the uploaded
  image, OCR evidence, candidate printings, accepted printing, review status,
  and timing metadata.
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
- Python 3 with `venv` support for RapidOCR.
- SQLite support from the Elixir dependencies.

Install the toolchain, JavaScript dependencies, OCR Python environment, database,
and assets:

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

### Manual OCR Repair

If the scanner reports that RapidOCR is unavailable, rebuild the OCR environment:

```sh
python3 -m venv .venv
.venv/bin/python -m ensurepip --upgrade
.venv/bin/python -m pip install -r requirements-ocr.txt
mise exec -- mix manavault.ocr.setup
```

## Mobile Camera Scanning

Phone browsers only expose camera APIs in a secure context. `http://localhost:4000`
works on the same machine, but `http://<computer-lan-ip>:4000` from a phone will
not prompt for camera permission.

Use one of these for scanning from a phone:

- Run ManaVault behind a trusted HTTPS tunnel, such as Cloudflare Tunnel or ngrok.
- Serve Phoenix over HTTPS with a certificate your phone trusts.
- Run the app directly on the device and open it through `localhost`.

See [docs/mobile-scanner.md](docs/mobile-scanner.md) for supported browser notes,
known camera limitations, scanner ergonomics, and the Capacitor native shell
direction.

## Native Shells

ManaVault includes Capacitor Android and iOS shell projects for mobile testing
and native API work. Use `aube` for JavaScript package tasks:

```sh
mise run setup:native
mise run setup:android-sdk
mise run android:run
```

Android uses the project-local Java and Android SDK toolchains declared in
`mise.toml`. `setup:android-sdk` accepts the Android SDK licenses and installs
`platform-tools`, Android API 36, and build-tools 36.0.0 for Capacitor's
native-run flow.

iOS syncs from this repo, but building or running the iOS app requires macOS
with Xcode:

```sh
mise run ios:sync
mise run ios:open
```

## Runtime Data Layout

Production mutable application data defaults under `/data`:

- `/data/manavault.db` - SQLite database
- `/data/uploads/scans` - scan uploads and other user-owned local files
- `/data/cache/scryfall` - Scryfall cache; this can be regenerated
- `/data/backups` - ManaVault backup artifacts

On container boot, the entrypoint creates these directories, makes the mounted
data directory writable by the application user, and the release runs pending
Ecto migrations.

The local-data model is intentionally simple: back up the mounted `/data`
directory and you have the application state that matters.

## Backup and Restore

Back up `/data/manavault.db` and `/data/uploads/scans`. The Scryfall cache under
`/data/cache/scryfall` is disposable and does not need to be preserved.

Create a backup zip:

```sh
mise exec -- mix manavault.backup
```

By default the artifact is written to `<DATA_DIR>/backups` or, in local
development, beside the configured SQLite database. The artifact contains:

- `manavault.db` - a consistent SQLite snapshot created with `VACUUM INTO`
- `uploads/scans` - local scan files, when present
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
docker pull ghcr.io/cfbender/manavault:0.2.1
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
  ghcr.io/cfbender/manavault:0.2.1
```

Health check:

```sh
curl http://localhost:4000/health
```

First boot runs migrations and schedules a Scryfall bulk catalog sync. Card
searches and scanner matching become useful after that sync succeeds. The sync
uses Scryfall's public bulk-data endpoint and refreshes daily while the app is
running.

Build the image locally:

```sh
docker build -t manavault .
```

Run the local image:

```sh
docker run --rm \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE="$(mise exec -- mix phx.gen.secret)" \
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
- `DATA_DIR` - mutable data root. Defaults to `/data`.
- `DATABASE_PATH` - SQLite database path. Defaults to `/data/manavault.db`.
- `POOL_SIZE` - Ecto pool size. Defaults to `5`.
- `MANAVAULT_SKIP_MIGRATION_BACKUP` - skip automatic release backup before
  pending migrations. Defaults to unset.

No Postgres or external service is required.

### GHCR Publishing

The container workflow publishes `ghcr.io/cfbender/manavault` on pushes to
`main` and on version tags matching `v*.*.*`.

Expected tags:

- `latest` from the default branch
- branch tags from branch pushes
- `0.2.1` and `0.2` from tag `v0.2.1`
- `v0.2.1` from the raw tag ref

## Roadmap

The v0.1.0 line is the first self-hostable baseline. The phase issues capture
the implementation path:

| Phase | Scope | Status |
| --- | --- | --- |
| [#1](https://github.com/cfbender/manavault/issues/1) | Application foundation and single-container deployment | Closed |
| [#2](https://github.com/cfbender/manavault/issues/2) | Local Scryfall catalog sync | Closed |
| [#3](https://github.com/cfbender/manavault/issues/3) | Card and printing search UI | Closed |
| [#4](https://github.com/cfbender/manavault/issues/4) | Collection model and manual management | Closed |
| [#5](https://github.com/cfbender/manavault/issues/5) | Scan session and review queue foundation | Closed |
| [#6](https://github.com/cfbender/manavault/issues/6) | Mobile scanner camera and capture UI | Closed |
| [#7](https://github.com/cfbender/manavault/issues/7) | OCR and local Scryfall candidate matching | Closed |
| [#8](https://github.com/cfbender/manavault/issues/8) | Scanner review and exact printing correction UI | Closed |
| [#9](https://github.com/cfbender/manavault/issues/9) | Scanner speed and batch workflow | Closed |
| [#10](https://github.com/cfbender/manavault/issues/10) | Deck creation and import | Closed |
| [#11](https://github.com/cfbender/manavault/issues/11) | Physical card allocation engine | Closed |
| [#12](https://github.com/cfbender/manavault/issues/12) | Missing-card buylist and export workflows | Closed |
| [#13](https://github.com/cfbender/manavault/issues/13) | Collection import/export | Closed |
| [#14](https://github.com/cfbender/manavault/issues/14) | Backup, restore, and self-hosting safety | Closed |
| [#15](https://github.com/cfbender/manavault/issues/15) | Image/art matching scanner improvements | Closed |
| [#16](https://github.com/cfbender/manavault/issues/16) | PWA polish and scanner companion evaluation | Closed |
| [#17](https://github.com/cfbender/manavault/issues/17) | Project documentation and roadmap | Closed |

Near-term follow-up work is tracked in
[#20](https://github.com/cfbender/manavault/issues/20) for EDHRec
recommendations/cuts and [#21](https://github.com/cfbender/manavault/issues/21)
for catalog context refactoring.
