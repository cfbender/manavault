# ManaVault Feature Reference

This reference names the product concepts and workflows that appear across the
app. It is intentionally more detailed than the README.

## Core Concepts

- **Card identity** - the game object shared by all printings of a card.
  ManaVault stores this using Scryfall's `oracle_id` and card-level fields such
  as name, type line, mana cost, oracle text, colors, and color identity.
- **Printing** - a specific physical or digital release of a card, keyed by
  Scryfall `id`. Printings carry set code, collector number, language, rarity,
  finishes, images, release date, and price data.
- **Collection item** - a stack of physical cards you own that share the same
  printing, condition, finish, language, purchase price, notes, and storage
  location. Quantity lives here.
- **Location** - a real storage place such as a box, binder, deck box, list,
  folder, or other container.
- **Deck** - a named list with format/status metadata and deck-card rows for
  requested cards, quantities, zones, finishes, commander flags, tags, and
  preferred printings.
- **Deck allocation** - a reservation connecting one deck card to one collection
  item. Allocations bridge decklists and physical inventory.
- **Missing cards** - deck demand that remains after allocated and available
  collection copies are counted. Missing-card exports can be tuned by printing
  mode and basic-land inclusion.

## Card Catalog

ManaVault syncs Scryfall bulk data into the local database. Card search uses that
local catalog and supports structured filters shared with collection search.

Card detail pages show:

- oracle text and mana symbols
- Scryfall oracle tags, deck category, and deck themes
- format legalities
- rulings
- all synced printings with set, collector number, language, rarity, finishes,
  release date, images, and prices
- full-screen printing previews
- add-to-collection and add-to-deck actions from exact printings

## Collection

The collection has two primary views:

- **Locations** - storage containers with counts, cover cards, value summaries,
  and per-location item lists.
- **All cards** - a filterable, sortable inventory list across locations.

Collection items track:

- exact printing
- quantity
- condition
- finish (`nonfoil`, `foil`, or `etched` when available)
- language
- purchase price and current value gain/loss
- location
- notes
- allocated quantity

Collection workflows include:

- single-card add/edit/delete
- location create/edit/delete
- TXT/CSV import preview and commit
- CSV/TXT export for the current filters
- Android/iOS share/open-with import handoff from native shells
- search, sort, and structured filters for color, type, rarity, price, year,
  finish, and other card fields
- persisted collection view state so back navigation restores the previous tab,
  filters, search, and sort
- bulk selection for loaded or matching items, with add-to-deck, add-to-list,
  move, and delete flows

## Decks

Decks model requested cards separately from owned collection items. A deck card
can point at a preferred printing and finish while still being resolved against
available collection copies.

Deck workflows include:

- create, edit, and delete decks
- import and export decklists
- commander/mainboard/sideboard/maybeboard zones
- commander selection for Commander decks
- quantity, zone, tag, finish, and preferred-printing edits
- deck grouping by theme/category and zone tables
- bulk deck-card selection and movement
- public share links
- read-only shared deck pages with copy/export/playtest actions

## Legality, Stats, Tokens, and Playtest

Deck detail pages include:

- format legality status and issue details
- mana curve, average/median/total mana value, land/nonland counts
- mana cost versus mana production comparison with source-card highlighting
- token summaries derived from Oracle text
- an in-browser playtest table with draw, shuffle, mulligan, move, exile, graveyard,
  command zone, and library interactions

## Allocation and Missing Cards

Allocation compares deck demand against collection supply:

- **Allocated** - a collection item is reserved for a deck card.
- **Available** - matching owned copies exist and are not reserved elsewhere.
- **Allocated elsewhere** - matching owned copies exist but are committed to other
  decks.
- **Missing** - remaining demand after owned and available copies are counted.

Allocation actions include reserving one card, deallocating, proxy marking,
choosing candidate collection items, and bulk allocation preview/commit.
Missing-card views and exports can target exact printings or matching printings
and can include or exclude basic lands.

## EDHREC

Commander decks can open EDHREC-powered views for:

- recommendations
- cuts
- commander pages
- related commanders
- themes and page stats
- optional land exclusion

EDHREC cards can be previewed in ManaVault, returned to the same EDHREC scroll
position, and added directly to mainboard, maybeboard, or sideboard.

## Mobile and Native Shells

The web UI is responsive and installable as a PWA. Optional Capacitor shells add:

- first-launch server URL configuration
- native back/app control behavior
- Android text/CSV Share, Open with, and file intents
- native import handoff into the collection import dialog
- Android release update checks
- iOS project sync for Xcode builds

Android release signing, App Links, and custom-domain builds are documented in
[android.md](android.md).

## Backups and Admin

ManaVault supports:

- local backup zip creation with SQLite `VACUUM INTO`
- local restore with pre-restore safety backup
- pre-migration backup before release migrations
- cloud backup settings for Google Drive and S3-compatible storage
- scheduled UTC CRON backups
- staged cloud restores applied on restart
- built-in owner password authentication with failed-login rate limiting and
  permanent client bans

Self-hosting and backup operations are documented in
[self-hosting.md](self-hosting.md).
