# ManaVault

<img width="1693" height="831" alt="ManaVault collection and deck dashboard" src="https://github.com/user-attachments/assets/fcb7cd81-cd9c-450a-9111-02945f416b9e" />

ManaVault is a self-hosted Magic: The Gathering collection and deck workspace.
It gives you one local source of truth for the cards you own, where they live,
which decks are using them, and what still needs to be bought or pulled from
storage.

It is built for players who care about exact printings, physical inventory, and
repeatable deck-building workflows without handing collection data to a hosted
service. One container, one SQLite database: no Postgres, Redis, object
storage, or hosted backend required.

## Features

Each area links to the [feature reference](docs/features.md) for details.

- **[Card catalog](docs/features.md#card-catalog)** - local Scryfall sync with
  fast search, exact printings, prices, legalities, rulings, oracle tags, EDHREC
  synergies, and full-screen previews.
- **[Collection](docs/features.md#collection)** - track quantity, condition,
  language, finish, purchase price, and storage location per printing. TXT/CSV
  import and export, structured filters, bulk edits, a value dashboard with
  gains and losses, rule-based auto-sort into locations, list availability
  checks, and sold-list removal.
- **[Card scanner](docs/features.md#card-scanner)** - identify cards from the
  camera entirely in the browser, log them hands-free, and import the scanned
  list into the collection.
- **[Decks](docs/features.md#decks)** - commander/mainboard/considering zones,
  decklist import/export, preferred printings, custom tags, flexible grouping,
  primers, keyboard shortcuts, a Swap cards workbench with a legality
  preview, and read-only decks linked to a Moxfield or Archidekt list that
  re-sync hourly.
- **[Allocation](docs/features.md#allocation-pull-lists-and-missing-cards)** -
  reserve physical copies for deck cards so a card is never promised to two
  decks, then turn gaps into pull lists, proxies, and buylists for Mana Pool,
  Card Kingdom, StarCityGames, or TCGplayer.
- **[Deck analysis](docs/features.md#legality-stats-combos-and-playtest)** -
  format legality, mana curve and production, tokens, Commander Spellbook
  combos, salt scores, and an in-browser playtest table.
- **[Recommendations](docs/features.md#recommendations-edhrec-and-recommander)** -
  EDHREC recommendations, cuts, themes, and commander pages, plus Recommander
  suggestions.
- **[AI deck insights](docs/features.md#ai-deck-insights)** (optional,
  OpenRouter) - saved deck analysis with granular Commander bracket ratings,
  analysis of pasted lists, and saved Ask AI conversations that can check your
  collection for free copies.
- **[Random deck picker](docs/features.md#random-deck-picker-and-play-history)** -
  a weighted "pick a deck" suggestion with play history.
- **[Trade](docs/features.md#trade)** - a trade binder, want list, and matches
  against a partner's list or a Moxfield, Archidekt, or ManaVault link, plus
  decklist diffs.
- **[Sharing](docs/features.md#sharing)** - revocable read-only links for
  decks, buylists, want lists, and trade binders.
- **[Pricing](docs/features.md#pricing)** - choose Scryfall, TCGplayer, Card
  Kingdom, or Mana Pool as the price source.
- **[Settings and appearance](docs/features.md#settings-and-appearance)** -
  Liquid Glass or classic styling, a dozen color palettes, live server logs, and
  read-only [personal API keys](docs/api.md).
- **[Mobile](docs/features.md#mobile-and-native-shells)** - an installable PWA
  plus optional Android and iOS shells with Share/Open with collection imports.
- **[Backups](docs/self-hosting.md#manual-backups)** - SQLite-safe local
  backups, Google Drive or S3-compatible (including Cloudflare R2) cloud
  backups on a CRON schedule, and automatic pre-migration snapshots.

## Quick Start

For a localhost-only trial with auth disabled:

```sh
mkdir -p data

docker run --rm \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE="$(openssl rand -base64 48)" \
  -e MANAVAULT_AUTH_DISABLED=true \
  -e PHX_HOST=localhost \
  ghcr.io/cfbender/manavault:1.4.3
```

Visit <http://localhost:4000>. The first boot downloads the Scryfall catalog in
the background; card search and import matching work once that sync finishes
(**Settings -> Server logs** reports when it completes).

## Self-Hosting

For anything reachable beyond localhost, enable built-in auth. Generate a
secret key base and an owner password hash (the image's `manavault` binary
prints the hash):

```sh
openssl rand -base64 48
docker run --rm --entrypoint /app/bin/manavault ghcr.io/cfbender/manavault:1.4.3 \
  hash-password 'your-password'
```

Then run the published image with Docker Compose:

```yaml
services:
  manavault:
    image: ghcr.io/cfbender/manavault:1.4.3
    container_name: manavault
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./data:/data
    environment:
      SECRET_KEY_BASE: ${SECRET_KEY_BASE}
      MANAVAULT_ADMIN_PASSWORD_HASH: ${MANAVAULT_ADMIN_PASSWORD_HASH}
      PHX_HOST: vault.example.com
      # Behind an HTTPS reverse proxy you control:
      MANAVAULT_SECURE_COOKIES: "true"
      MANAVAULT_TRUST_PROXY_HEADERS: "true"
```

Keep `SECRET_KEY_BASE` stable and saved somewhere safe: it signs sessions and
encrypts stored secrets (AI and cloud backup credentials), so changing it means
re-entering those secrets.

The [self-hosting guide](docs/self-hosting.md) covers the full environment
variable list, reverse proxies, data layout, and building your own image. If the
same instance is reached under more than one hostname, list the extra origins in
`MANAVAULT_ALLOWED_ORIGINS` so live updates keep working on each of them; see
[Serving more than one hostname](docs/self-hosting.md#serving-more-than-one-hostname).

## Operating

- **Health check** - `GET /health` returns `{"status":"ok"}`; the image ships a
  Docker healthcheck.
- **Upgrade** - pull a newer tag and recreate the container. The server backs
  the database up and applies any pending migrations on boot, so installs from
  any earlier release upgrade in place. See
  [Upgrading](docs/self-hosting.md#upgrading).
- **Back up** - schedule cloud backups in **Settings -> Cloud backups**, copy the
  stopped `data/` directory, or create a zip in the running container:

  ```sh
  docker exec -u app manavault /app/bin/manavault backup
  ```

  See [Manual backups](docs/self-hosting.md#manual-backups).

- **Restore** - stop the container and run the binary's `restore` command
  against the data volume (`docker compose run --rm -u app --entrypoint
/app/bin/manavault manavault restore /data/backups/<file>.zip`), or stage a
  cloud restore in Settings and restart. See
  [Restore](docs/self-hosting.md#restore).
- **Card data** - the Scryfall catalog and symbols refresh daily and vendor
  prices every 30 minutes; force a reload from **Settings -> Scryfall data**.
  See [stalled syncs](docs/self-hosting.md#diagnosing-a-stalled-catalog-sync).
- **Linked decks** - decks linked to Moxfield or Archidekt re-import on the
  hour (`ExternalDeckSyncWorker`, Oban cron); use **Sync now** on the deck page
  to refresh immediately.
- **Logs** - **Settings -> Server logs** streams live output, and
  `docker logs manavault` shows the same.
- **Locked out** - clear permanent login bans in the running container; see
  [login bans](docs/self-hosting.md#recover-from-a-permanent-login-ban):

  ```sh
  docker exec -u app manavault /app/bin/manavault unban --all
  ```

- **Scanner models** - downloaded from GitHub releases at startup and every six
  hours; see [scanner.md](docs/scanner.md#bundles-server).

## Documentation

- [Feature reference](docs/features.md) - concepts and product-area behavior.
- [Self-hosting](docs/self-hosting.md) - Docker, data layout, auth, reverse
  proxies, environment variables, backups, restores, and upgrades.
- [Card scanner](docs/scanner.md) - scanner models, updates, training data, and
  the browser pipeline.
- [Improving card recognition](https://github.com/cfbender/oracle/blob/main/CONTRIBUTING.md) -
  train, test, and contribute data for the scanner's models (in Oracle).
- [Personal API](docs/api.md) - create read-only API keys and list decks for
  integrations such as The Gathering.
- [Android builds](docs/android.md) - official APK behavior, Share/Open with
  imports, custom domains, App Links, and release signing.
- [Development](docs/development.md) - local setup, tests, codegen, and native
  shell commands.
- [Releasing](docs/releasing.md) - changelog, version bump, tag, container, and
  APK release flow.
- [Changelog](CHANGELOG.md)

## Development

The server is the Rust backend in [`rust/`](rust/README.md). The Elixir/Phoenix
app in `lib/` stays as the behavioral reference and owns the Ecto migrations
(`mix ecto.dump` writes `priv/repo/structure.sql`, which the Rust backend
embeds). Tool versions are pinned in `mise.toml`:

```sh
mise run setup        # toolchain, dependencies, database, assets, Rust build
mise run dev          # Rust backend on $PORT (4000) + Vite on http://localhost:5173
mise run rust:test    # Rust test suite (`rust:check` adds fmt and clippy)
mise run rust:build   # release binary at rust/target/release/manavault
mise run dev:elixir   # the Phoenix reference server instead
mise run test         # Elixir test suite
```

`mise run dev` runs `scripts/dev-rust.sh`: the server, the Vite dev server
(which proxies backend routes to `$PORT`), and Tailwind in watch mode; it stops
all three when one exits. Open the Vite URL (5173) for hot reload, or `$PORT`
directly. `mise run rust:assets` builds the production frontend into
`priv/static/assets`.

See [development.md](docs/development.md) for the full workflow.

## Tech Stack

Rust (axum, async-graphql, sqlx/SQLite, an Oban-compatible job queue), Vite,
React, TanStack Router/Query, Tailwind/DaisyUI styling, onnxruntime-web for the
scanner, and optional Capacitor native shells. The original Phoenix, Absinthe,
Ecto, and Oban app remains in `lib/` as the reference implementation.

## License

[Mozilla Public License 2.0](LICENSE).
