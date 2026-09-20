# ManaVault

<img width="1693" height="831" alt="ManaVault collection and deck dashboard" src="https://github.com/user-attachments/assets/fcb7cd81-cd9c-450a-9111-02945f416b9e" />

ManaVault is a self-hosted Magic: The Gathering collection and deck workspace.
It gives you one local source of truth for the cards you own, where they live,
which decks are using them, and what still needs to be bought or pulled from
storage.

It is built for players who care about exact printings, physical inventory, and
repeatable deck-building workflows without handing collection data to a hosted
service.

## Why ManaVault

- **Own your data.** Production state lives in SQLite and local files under your
  mounted data directory.
- **Track real cardboard.** Quantity, condition, language, finish, purchase
  price, storage location, and exact Scryfall printing stay attached to each
  collection item.
- **Reserve cards intentionally.** Deck allocation connects deck cards to the
  physical copies that satisfy them, so one card is not promised to two decks by
  accident.
- **Turn deck gaps into actions.** Missing-card views and buylist exports show
  what a deck still needs after owned and allocated copies are counted.
- **Run it anywhere boring.** One container, one SQLite database, no Postgres,
  Redis, object storage, or hosted backend required.

## What You Can Do

### Search the card catalog

ManaVault syncs Scryfall bulk data locally, then lets you search cards and exact
printings with prices, images, legalities, rulings, Scryfall oracle tags, deck
categories, and themes. Full-screen printing previews keep high-resolution card
art close while you choose the copy you want.

### Manage a physical collection

Import TXT/CSV exports, add individual cards, organize cards into locations,
filter and sort across the full collection, track purchase price versus current
value, and export filtered CSV/TXT lists. Collection state is preserved while you
move between locations and cards, so back navigation returns to the same view.

Auto-sort type filters and deck type grouping use a permanent's front-face type,
not its adventure, prepared spell, or back face. Split spells retain both types.

### Build and maintain decks

Create decks, import/export decklists, manage commander/main/side/maybe zones,
choose preferred printings and finishes, group cards by theme or category, tag
decks, check format legality, and inspect mana curve, mana production, and token
creation summaries.

Use **Pick a deck** for a random suggestion. To keep a deck out of random picks
without archiving it, open **Edit**, turn off **Included for play**, and save.
New and existing decks are included by default; archived decks remain excluded.
Turning the switch back on restores eligibility without changing play history.

### Allocate owned cards to decks

Allocation status shows which deck cards are satisfied, missing, unavailable, or
already allocated elsewhere. Bulk allocation can reserve matching collection
items, and missing-card/buylist exports can include or exclude basics and target
exact or matching printings.
Purchase missing cards through Mana Pool, Card Kingdom, StarCityGames, or TCGplayer.

### Find upgrades and test lists

Commander decks can pull EDHREC recommendations, cuts, commander pages, themes,
and stats. Add recommendations directly to mainboard, maybeboard, or sideboard.
Decks also include a browser playtest table and share links with read-only deck
view, playtest, copy, and export actions.

### Use it on mobile

The responsive web app can be installed as a PWA. Optional Capacitor Android and
iOS shells load your ManaVault server, handle native back/app controls, and
accept text/CSV share or open-with flows for collection imports.

### Back up the vault

Manual backup/restore tasks create SQLite-safe zip artifacts. In-app cloud
backup settings support Google Drive and S3-compatible storage, including
Cloudflare R2, with scheduled UTC CRON runs and staged restores.

## Quick Local Trial

For a localhost-only smoke test with auth disabled:

```sh
mkdir -p data

docker run --rm \
  -p 4000:4000 \
  -v "$PWD/data:/data" \
  -e SECRET_KEY_BASE="$(openssl rand -base64 48)" \
  -e MANAVAULT_AUTH_DISABLED=true \
  -e PHX_HOST=localhost \
  ghcr.io/cfbender/manavault:1.3.0
```

Then visit <http://localhost:4000>. For anything exposed beyond localhost, enable
built-in auth and follow the self-hosting guide.

For an HTTPS deployment behind a reverse proxy, set
`MANAVAULT_SECURE_COOKIES=true` and `MANAVAULT_TRUST_PROXY_HEADERS=true`. The
latter keeps login rate limiting separate per client instead of treating the
proxy as one client; enable it only when a proxy you control sets the forwarded
IP header. `MANAVAULT_FORWARDED_IP_HEADER` selects that header (default
`x-forwarded-for`), and `MANAVAULT_SESSION_MAX_AGE_DAYS` controls the session
lifetime (default `180`). If an owner is permanently locked out, clear one
client with `mix manavault.auth.unban CLIENT_ID` or every client with
`mix manavault.auth.unban --all`; the self-hosting guide includes container
release commands.

## Documentation

- [Feature reference](docs/features.md) - concepts and product-area behavior.
- [Self-hosting](docs/self-hosting.md) - Docker, data layout, auth, environment
  variables, backups, and restores.
- [Personal API](docs/api.md) - create read-only API keys and list decks for
  integrations such as The Gathering.
- [Development](docs/development.md) - local setup, tests, and native shell dev
  commands.
- [Android builds](docs/android.md) - official APK behavior, Share/Open with
  imports, custom domains, App Links, and release signing.
- [Releasing](docs/releasing.md) - changelog, version bump, tag, container, and
  APK release flow.

## Tech Stack

Phoenix, Absinthe GraphQL, Ecto/SQLite, Vite, React, TanStack Router/Query,
Tailwind/DaisyUI styling, and optional Capacitor native shells.
