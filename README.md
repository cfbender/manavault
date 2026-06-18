# Manavault

Phoenix LiveView application generated with SQLite.

## Requirements

- [mise](https://mise.jdx.dev/) with the project toolchain from `mise.toml`
- SQLite support from the generated Phoenix dependencies
- RapidOCR for camera card scanning. `mix setup` runs `mix manavault.ocr.setup`, which verifies the local Python RapidOCR environment.

Install the pinned Elixir toolchain:

```sh
mise install
```

Or run the full local setup, including JavaScript dependencies used by the
Capacitor native projects:

```sh
mise run setup
```

## Local development

Set up dependencies, the local SQLite database, and assets:

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

### Mobile camera scanning

Phone browsers only expose camera APIs in a secure context. `http://localhost:4000`
works on the same machine, but `http://<computer-lan-ip>:4000` from a phone will not
prompt for camera permission.

Use one of these for scanning from a phone:

- Run ManaVault behind a trusted HTTPS tunnel, such as Cloudflare Tunnel or ngrok.
- Serve Phoenix over HTTPS with a certificate your phone trusts.
- Run the app directly on the device and open it through `localhost`.

See [docs/mobile-scanner.md](docs/mobile-scanner.md) for supported browser notes,
known camera limitations, scanner ergonomics, and the Capacitor native shell
direction.

## Native shells

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

## Runtime data layout

Production mutable application data defaults under `/data`:

- `/data/manavault.db` — SQLite database
- `/data/uploads/scans` — scan uploads and other user-owned local files
- `/data/cache/scryfall` — Scryfall cache; this can be regenerated
- `/data/backups` — ManaVault backup artifacts

On container boot, the entrypoint creates these directories, makes the mounted data directory writable by the application user, and the release runs Ecto migrations.

## Backup and restore

Back up `/data/manavault.db` and `/data/uploads/scans`. The Scryfall cache under
`/data/cache/scryfall` is disposable and does not need to be preserved.

Create a backup zip:

```sh
mise exec -- mix manavault.backup
```

By default the artifact is written to `<DATA_DIR>/backups` or, in local
development, beside the configured SQLite database. The artifact contains:

- `manavault.db` — a consistent SQLite snapshot created with `VACUUM INTO`
- `uploads/scans` — local scan files, when present
- `manifest.json` — backup metadata

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

When a release starts with pending database migrations, ManaVault first creates
a pre-migration backup in `/data/backups`. If this backup fails, startup fails
instead of running migrations without a recoverable snapshot. Set
`MANAVAULT_SKIP_MIGRATION_BACKUP=true` only when you have already made an
external backup.

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
- `MANAVAULT_SKIP_MIGRATION_BACKUP` — skip automatic release backup before pending migrations. Defaults to unset.

No Postgres or external service is required by the generated application.
