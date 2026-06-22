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
- Scan real cards quickly: camera captures are cropped to the card guide, matched
  against a local Scryfall art hash index first, then RapidOCR is used only for
  fallback and exact-printing disambiguation.
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

Release helper:

```sh
mise run changelog -- patch
mise run release -- patch
```

The release task generates `CHANGELOG.md`, bumps `mix.exs`, updates the Docker
tag examples, commits, creates an annotated tag, and pushes the branch and tag.
See [docs/releasing.md](docs/releasing.md) for details.

### Manual OCR Repair

If the scanner reports that RapidOCR is unavailable, rebuild the OCR environment:

```sh
python3 -m venv .venv
.venv/bin/python -m ensurepip --upgrade
.venv/bin/python -m pip install -r requirements-ocr.txt
mise exec -- mix manavault.ocr.setup
```

Build or refresh the complete local art hash index used by the art-first scanner
path:

```sh
mise exec -- mix manavault.scanner.art_index
```

Art-first live scanning refuses partial indexes because a nearest neighbor from a
small subset can be confidently wrong. `--limit` is only for development and
benchmarks.

Run the scanner benchmark against synthetic camera captures instead of perfect
Scryfall images:

```sh
mise exec -- mix manavault.ocr.benchmark --indexed-art --synthetic-camera --limit 10
```

In dev, rejected scanner frames are kept under
`data/uploads/scan-captures/scan_sessions/<session_id>/` so phone-camera samples
can be reused for local benchmarks and crop tuning.

For an Intel CPU/OpenVINO OCR trial, install the optional OCR dependencies and
run setup with the engine selected:

```sh
.venv/bin/python -m pip install -r requirements-ocr-openvino.txt
MANAVAULT_OCR_ENGINE=openvino mise exec -- mix manavault.ocr.setup
MANAVAULT_OCR_ENGINE=openvino mise exec -- mix manavault.ocr.benchmark --limit 10 --max-failures 10
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
and native API work. The native shell starts from bundled setup assets in
`native_www`, asks for the ManaVault server URL on first launch, stores that URL
on the device, checks the latest GitHub release for APK updates, and then opens
the configured server.

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
upload a debug APK to the GitHub release.

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
docker pull ghcr.io/cfbender/manavault:0.3.0
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
  ghcr.io/cfbender/manavault:0.3.0
```

Health check:

```sh
curl http://localhost:4000/health
```

First boot runs migrations and schedules Scryfall syncs. Card searches and
scanner matching become useful after the bulk catalog sync succeeds. The catalog
uses Scryfall's public bulk-data endpoint, and the catalog plus symbol/set icon
assets refresh daily while the app is running.

Build the image locally:

```sh
docker build -t manavault .
```

OpenVINO is optional. The published default image and a normal local build use
ONNX Runtime for OCR. Only set `MANAVAULT_OCR_ENGINE=openvino` when the image or
local Python environment includes the OpenVINO OCR dependencies. Published
OpenVINO image tags have an `-openvino` suffix, such as
`ghcr.io/cfbender/manavault:0.3.0-openvino`.

Example `docker-compose.yml` using the published GHCR image:

```yaml
services:
  manavault:
    image: ghcr.io/cfbender/manavault:0.3.0
    container_name: manavault
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./data:/data
    environment:
      SECRET_KEY_BASE: ${SECRET_KEY_BASE}
      PHX_HOST: ${PHX_HOST:-localhost}
```

Generate a secret once, put it in `.env`, then start the stack:

```sh
printf 'SECRET_KEY_BASE=%s\n' "$(mise exec -- mix phx.gen.secret)" > .env
printf 'PHX_HOST=localhost\n' >> .env
docker compose up -d
```

For Intel NUC/OpenVINO scanner testing, use the matching `-openvino` image tag
and add the OpenVINO environment:

```yaml
    image: ghcr.io/cfbender/manavault:0.3.0-openvino
    environment:
      SECRET_KEY_BASE: ${SECRET_KEY_BASE}
      PHX_HOST: ${PHX_HOST:-localhost}
      MANAVAULT_OCR_ENGINE: openvino
      MANAVAULT_OCR_OPENVINO_PERFORMANCE_HINT: LATENCY
      MANAVAULT_OCR_THREADS: "4"
```

Then restart the stack:

```sh
docker compose up -d
```

To build an OpenVINO image locally instead, use:

```sh
docker build \
  --build-arg OCR_REQUIREMENTS=requirements-ocr-openvino.txt \
  -t manavault:openvino .
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
- `MANAVAULT_OCR_ENGINE` - OCR inference engine. Defaults to `onnxruntime`; set
  to `openvino` only when the OpenVINO OCR dependencies are installed.
- `MANAVAULT_OCR_THREADS` - optional OCR engine thread count. Applies to
  OpenVINO and ONNX Runtime. Defaults to unset, which lets the engine choose.
- `MANAVAULT_OCR_OPENVINO_PERFORMANCE_HINT` - optional OpenVINO CPU performance
  hint, such as `LATENCY` or `THROUGHPUT`. Defaults to unset.
- `MANAVAULT_OCR_OPENVINO_NUM_STREAMS` - optional OpenVINO CPU stream count.
  Defaults to unset, which lets OpenVINO choose.
- `MANAVAULT_OCR_TITLE_WIDTH` - pixel width for the small OCR crop used during
  camera scans. This crop includes the card title and footer/set line. Defaults
  to `192`.
- `SCAN_IMAGE_MATCHING` - set to `false` to disable candidate image matching
  during camera scans and use OCR-only recognition. Defaults to `true`. Global
  art-first matching only runs when the local art hash index covers the catalog;
  until then, live scans go straight to OCR-narrowed candidate image matching.
  The art hash index is built newest-printing-first and incrementally in the
  background on app startup and refreshed after catalog imports; each batch is
  persisted and logged so a full first-time build shows progress instead of going
  silent. Completed art matching keeps only the best ranks in memory while
  scoring, avoiding a full sort of the 100k+ hash index for every camera frame.
  Set `SCAN_ART_INDEX_WORKER=false` to disable the background art-index builder.
- `SCAN_CAPTURE_REQUIRES_ART_MATCH` - set to `false` to let live camera captures
  auto-accept OCR-only matches when image matching misses. Defaults to `true`, so
  camera captures require either an art-index hit or OCR narrowed candidates that
  pass candidate-scoped image matching.
- `SCAN_KEEP_REJECTED_CAPTURES` - set to `true` to keep rejected camera frames
  on disk for scanner debugging. Development config enables this; production
  defaults to `false`.
- `SCAN_TITLE_OCR_FAST_PATH` - set to `false` to disable the title-crop OCR
  fast path and always OCR the full capture. Defaults to `true`.
- `SCAN_ASYNC_IMAGE_REFINEMENT` - set to `false` to stop background exact
  printing refinement while keeping other image-matching behavior enabled.
  Defaults to `true`.
- `SCAN_FULL_OCR_FALLBACK` - set to `false` to prevent camera scans from
  falling back to blocking full-card OCR when the title/footer crop is weak.
  Defaults to `true` for production scanner reliability.

Scanner timing is emitted as Telemetry spans and debug logs. The main stop events are:

- `[:manavault, :scanner, :capture, :stop]` — full live-capture request.
- `[:manavault, :scanner, :capture_write, :stop]` — frame persistence.
- `[:manavault, :scanner, :recognition, :stop]` — OCR/image recognition.
- `[:manavault, :scanner, :ocr, :stop]` — one OCR call, tagged by `ocr_crop`.
- `[:manavault, :scanner, :image_match, :stop]` — image matching, tagged by
  `phase` (`initial`, `candidate`, or `refinement`).
- `[:manavault, :scanner, :candidate_match, :stop]` — OCR candidate scoring.
- `[:manavault, :scanner, :persist, :stop]` — recognized scan item persistence.
- `[:manavault, :scanner, :refinement, :stop]` — async exact-printing refinement.
- `MANAVAULT_SKIP_MIGRATION_BACKUP` - skip automatic release backup before
  pending migrations. Defaults to unset.

Default OCR behavior is therefore ONNX Runtime CPU, title-crop fast path on,
blocking full-card OCR fallback on for weak title crops, and background
exact-printing image refinement on. For lower-power Intel self-hosting, the
tested NUC profile is OpenVINO with the title fast path, full OCR fallback, and
async image refinement left enabled.

No Postgres or external service is required.

### GHCR Publishing

The container workflow publishes `ghcr.io/cfbender/manavault` on pushes to
`main` and on version tags matching `v*.*.*`. It also publishes matching
OpenVINO OCR variants with an `-openvino` suffix.

Expected tags:

- `latest` from the default branch
- `latest-openvino` from the default branch
- branch tags from branch pushes
- branch tags with `-openvino` from branch pushes
- `0.3.0` and `0.3` from tag `v0.3.0`
- `0.2.3-openvino` and `0.2-openvino` from tag `v0.2.3`
- `v0.3.0` from the raw tag ref
- `v0.2.3-openvino` from the raw tag ref

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
