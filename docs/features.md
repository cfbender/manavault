# ManaVault Feature Reference

This reference names the product concepts and workflows that appear across the
app. The [README](../README.md) gives the short tour; this document holds the
detail.

- [Core concepts](#core-concepts)
- [Card catalog](#card-catalog)
- [Collection](#collection)
- [Card scanner](#card-scanner)
- [Decks](#decks)
- [Allocation, pull lists, and missing cards](#allocation-pull-lists-and-missing-cards)
- [Legality, stats, combos, and playtest](#legality-stats-combos-and-playtest)
- [Recommendations: EDHREC and Recommander](#recommendations-edhrec-and-recommander)
- [Random deck picker and play history](#random-deck-picker-and-play-history)
- [AI deck insights](#ai-deck-insights)
- [Trade](#trade)
- [Sharing](#sharing)
- [Pricing](#pricing)
- [Settings and appearance](#settings-and-appearance)
- [Mobile and native shells](#mobile-and-native-shells)
- [Backups and admin](#backups-and-admin)

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
- **Token item** - a stack of owned token cards (Scryfall layout `token` or
  `double_faced_token`) sharing one front printing, optional back printing, and
  finish. Tokens are kept apart from collection items: they are never
  allocated, never counted toward collection value, and never satisfy deck
  demand. The catalog also records which token printings each card creates,
  from Scryfall's related-parts links.

## Card Catalog

ManaVault syncs Scryfall bulk data into the local database, along with symbol
and set icons, Scryfall oracle tags, EDHREC ranks, and EDHREC salt scores. Card
search uses that local catalog, supports sorting and recent searches, shows how
many copies you own, and shares structured filters with collection search. The
search page also shows a gallery of top EDHREC commanders.

Card detail pages show:

- oracle text and mana symbols, including back faces
- Scryfall oracle tags, deck category, and deck themes
- format legalities and Game Changer status
- rulings
- EDHREC synergies such as top commanders and related cards
- your collection copies and the decks they are allocated to
- all synced printings with set, collector number, language, rarity, finishes,
  release date, images, and prices
- full-screen printing previews
- add-to-collection, add-to-deck, and add-to-wants actions from exact printings
- links to Scryfall, EDHREC, and MTGStocks

## Collection

The collection has four primary views:

- **Locations** - storage containers with counts, cover cards, value summaries,
  and per-location item lists.
- **All cards** - a filterable, sortable inventory list across locations.
- **Tokens** - the tokens you own, shown as card tiles with quantity badges and
  filtered by name. Double-sided tokens are named "Front // Back" and flip to
  the other face on click. **Add token** searches token printings (newest
  first), optionally picks the back face (known pairings first, then the rest
  of the set; see the scanner's **What is on the back?**), and sets quantity
  and finish; each tile's menu edits quantity/finish or removes the stack.
  **Select** (or tapping a tile's checkbox) enters selection mode with **Select
  all**, **Clear** and **Remove** for the selected stacks. Tokens have no
  location, condition, or value and are never allocated.
- **Value** - market value compared with purchase basis, with editable purchase
  prices and biggest gains/losses rankings that toggle between total and
  percentage change.

Collection items track:

- exact printing (changeable after the fact)
- quantity
- condition
- finish (`nonfoil`, `foil`, or `etched` when available)
- language
- purchase price and current value gain/loss
- location
- notes
- allocated quantity and the decks using each copy

Collection workflows include:

- single-card add/edit/delete, plus bulk edit
- location create/edit/delete with selectable cover cards
- TXT/CSV import preview and commit, with an optional default purchase price or
  total spend spread across the import; rows whose printing is a token become
  token items instead of collection items, and an optional `back_scryfall_id`
  column records the token's other face
- CSV/TXT export for the current filters
- Android/iOS share/open-with import handoff from native shells
- search, sort (quantity, name, set, rarity, price, value gain, added date), and
  structured filters for color, type, rarity, price, purchase price, added date,
  multiple sets, year, finish, quantity, allocation status, and other card
  fields
- persisted collection view state so back navigation restores the previous tab,
  filters, search, and sort
- bulk selection for loaded or matching items, with add-to-deck, add-to-list,
  move, and delete flows

Auto-sort type filters and deck type grouping use a permanent's front-face type,
not its adventure, prepared spell, or back face. Split spells retain both types.

### Collection check

**Check a list** on the collection page takes a pasted card/deck list or a
Moxfield or Archidekt link and reports, per card, whether it is ready to pull, only
available in other decks, or not owned, with an estimated cost to source the
rest using the cheapest known printing.

### Auto-sort

Auto-sort rules live in **Settings -> Collection auto-sort**. Each enabled rule
matches cards by color mode, type line includes/excludes, rarity, price range,
set membership, and release date, and targets a location; rules are evaluated in
priority order. Running auto-sort shows a preview summary (toggleable between
source and destination locations, including foil status) before moving
anything. Items moved within the last 30 days are left alone so a sort does not
churn recently filed cards.

### Selling cards

**Sell** on the collection page accepts a pasted sold list, selects the matching
collection items and quantities, shows the selected total, and deletes those copies on confirm.

## Card Scanner

`/scan` (the **Scan** nav item) identifies cards from the camera, in the
browser, the installed PWA and the Capacitor apps. It opens straight into the
camera; the browser or OS asks for camera access once.

- Hold one card at a time in view (a phone scanner stand works well; the whole
  camera image is scanned). Cards are recognized and logged
  automatically, with no tap. The same card is never logged twice in a row;
  tap the result or **+1** to count another copy.
- Recognition matches the artwork, so reprints that share art cannot be told
  apart by the camera. The default printing is a locked set if any, then the
  scanned art, then a printing you already own, then the newest English
  non-promo printing. Locked sets also restrict recognition: only cards printed
  in them are logged, and anything else shows "Not in locked sets". Chips on the
  result change finish (normal/foil/etched), printing, and language.
- Settings: lock one or more sets, ignore promos, prefer foil, show the running
  total value (optionally counting only cards priced at or above a minimum, so
  bulk does not add up), sounds (a click per scan, a ding at $1 and a bigger
  ding at $10 by default; both thresholds are configurable), camera preview
  zoom and pan, and recognition threads.
- **Identify** next to the status adds a card the scanner does not recognize:
  it freezes the camera view and searches the card (or token) by name.
- **Wrong card?** in the printing picker searches the catalog by name and swaps
  a misrecognized scan for the right card. Both searches include tokens.
- **Tokens mode** in the scanner settings restricts recognition to tokens, and
  nothing is logged until you tap the screen, so the same token can be added
  again and again. The status pill reads "Hold one token in view" and then
  "Tap to add <token>". The back picker asks once per token; later copies reuse
  the back you chose, and the finish and Back chips under the camera view change
  a copy that is foil or paired differently before you scan the next one.
  **Identify** searches
  tokens only in this mode. With a model bundle whose search graph takes a
  gallery mask (shown as "token search" under **Recognition model**), only
  token artwork is searched at all; with an older bundle the scanner filters
  tokens out of the model's top results instead.
- Tokens are recognized like any other card. Double-faced tokens carry both
  faces from Scryfall. For a single-faced token, the scanner pauses and asks
  **What is on the back?**. **Known backs** come first: backs you picked earlier
  in the scan list or recorded on tokens you own (either side of the pairing),
  then the fixed front/back combinations Wizards publishes in its card image
  galleries (`priv/data/token_backs.json`, Modern Horizons 3 onward). The
  published list is incomplete (one product's pairing per face; bundles and
  decks pair differently), so the rest of the set always follows under **Other
  tokens**. Tokens from older sets show the whole set. Pick the reverse or mark it
  **Single-sided**; a chip on the entry changes the answer later. **Add to
  collection** files tokens as token items (see Collection -> Tokens) rather
  than collection items.
- **Collect training data** (off by default) uploads each scan's camera frame
  and card to your server so the recognition model can be retrained on your
  phone, stand and foils; see [scanner.md](scanner.md#training-data).
- The scanned list stays on the device until cleared. It supports search,
  quantity edits, per-card chips, delete, and clear. **Add to collection**
  opens the collection import preview with the list as CSV (exact Scryfall IDs,
  finish, and language); nothing is added until the import is confirmed.
- The recognition model (about 50 MB) downloads on first use and is cached on
  the device per version. See [scanner.md](scanner.md) for model storage and
  updates.

## Decks

Decks model requested cards separately from owned collection items. A deck card
can point at a preferred printing and finish while still being resolved against
available collection copies.

Deck workflows include:

- create, edit, archive, and delete decks, with tags, format, status, and a
  selectable cover card
- import and export decklists (import straight into a zone, or into select mode)
- mainboard/commander/considering zones - a segmented Mainboard/Considering
  toggle (plus Commander for Commander decks) picks the zone when adding or
  moving cards. Considering replaced the old sideboard and maybeboard zones;
  a migration merged existing rows, and decklist import still accepts `SB:`,
  Sideboard, Maybe, and Maybeboard headings, mapping them all to Considering.
  Exports emit a Considering heading.
- commander selection for Commander decks, including partner, companion, and
  background pairings; any card that can legally be your commander is accepted
- quantity, zone, tag, finish, and preferred-printing edits, plus **Optimize
  printings** to switch selected cards to their cheapest priced printing for
  their current finish
- grouping by theme, category, type, color, color identity, mana value, rarity,
  set, custom tag, price, salt score, allocation, or none
- custom deck tags with a radial tag picker on each card, a collapsible tags
  sidebar with counts and jump-to-group, and default tags (with optional
  targets) configured in **Settings -> Default Deck Tags**
- a deck primer saved with the deck, with clickable card references
- EDHREC salt score totals in the deck header
- bulk deck-card selection and movement
- **Disassemble deck** - preview and return a deck's allocated copies to the
  collection, archiving the deck
- keyboard shortcuts on the deck page: `A` add card, `E` Swap cards, `S` select
  mode, `G` cycle grouping, `P` playtest, `1`-`9` jump to custom tag, `Esc`
  clear highlight/deselect, `?` help
- a **Swap cards** workbench (toolbar button or `E`) that stages mainboard
  cuts and adds together: Consider Cutting cards lead the cut column, the
  Considering board and card-name search feed the add column, and each cut
  can be removed or moved to Considering. A server-side preview runs the deck
  legality rules on the staged list and shows which issues the swap
  introduces or resolves; applying commits every change in one transaction
  and releases collection copies that no longer fit. Illegal results can
  still be applied. The add column also toggles to **Ask AI**, a light chat
  scoped to the workbench session: each turn sends the deck, the staged cuts
  and adds, and the last six turns, and every recommended cut or add appears
  as a chip that stages it with one tap. Chat turns reuse the Ask AI pipeline
  and catalog checks but stay out of the Ask AI history.
- **Compare decklist** - diff an external list against the open deck as adds,
  cuts, and quantity changes (see [Trade](#trade) for supported sources)
- **Link external deck** - attach a public Moxfield or Archidekt deck URL from
  the deck actions menu. Linking imports that list (replacing the current
  cards) and keeps it in sync every hour; the header shows the last sync time
  and a **Sync now** button, and failed syncs leave the last good list in
  place with the error shown. While linked, every decklist edit (add, swap,
  import, move, tag, printing, commander, delete, EDHREC/Recommander adds) is
  disabled and the Share dialog offers the external page instead of a
  ManaVault link; allocation, pull lists, proxies, and buylists still work.
  Printing and finish follow the remote only for cards without allocated
  copies, since an allocation pins the deck card to the owned printing.
  **Unlink** keeps the imported cards and makes the deck editable again.

## Allocation, Pull Lists, and Missing Cards

Allocation compares deck demand against collection supply:

- **Allocated** - a collection item is reserved for a deck card.
- **Available** - matching owned copies exist and are not reserved elsewhere.
- **Allocated elsewhere** - matching owned copies exist but are committed to other
  decks.
- **Missing** - remaining demand after owned and available copies are counted.

Allocation actions include reserving one card, deallocating, proxy marking,
choosing candidate collection items, and bulk allocation preview/commit. Deck
cards can be grouped and filtered by allocation status.

The deck readiness panel summarizes cards that are accounted for, to pull, to
buy, or proxied. The **Deck pull list** lists the cards that still need a
physical copy pulled, bought, or proxied, and **Pull owned cards** allocates the
available copies in one pass.

**Missing cards** views and buylist exports can target exact printings or
matching printings and can include or exclude basic lands. Buylists can be
shared, and missing cards can be purchased through Mana Pool, Card Kingdom,
StarCityGames, or TCGplayer.

## Legality, Stats, Combos, and Playtest

Deck detail pages include:

- format legality status and issue details
- mana curve, average/median/total mana value, land/nonland counts
- mana cost versus mana production comparison with source-card highlighting
- **Tokens this deck can create** - each token the deck's cards make, with the
  token's actual card image and name when Scryfall links the card to a token
  printing (falling back to the Oracle text description otherwise), the cards
  that create it, how many each event makes, and how many copies you own. Public
  share pages list the tokens but never show owned counts.
- **Infinite combos** from Commander Spellbook, listing cards, prerequisites,
  mana needed, steps, and results for combos found in the commander and
  mainboard
- an in-browser playtest table with draw, shuffle, mulligan, move, exile,
  graveyard, command zone, and library interactions

## Recommendations: EDHREC and Recommander

Commander decks can open EDHREC-powered views for:

- recommendations
- cuts (tag deck cards as consider-cutting)
- commander pages and categories
- related commanders
- themes and page stats
- optional land exclusion

EDHREC cards can be previewed in ManaVault, returned to the same EDHREC scroll
position, and added directly to the mainboard or Considering.

**Recommander** sends the decklist to the public Recommander API and returns
suggested cards, optionally limited to cards you own.

## Random Deck Picker and Play History

**Pick a deck** on the deck list suggests a random active deck, weighted toward
decks that have not been played recently. Mark the suggestion as played or
skipped; play counts, skips, and last-played dates are kept per deck and can be
edited.

To keep a deck out of random picks without archiving it, open **Edit**, turn off
**Included for play**, and save. New and existing decks are included by default;
archived decks are always excluded and do not count toward the home page deck
total. Turning the switch back on restores eligibility without changing play
history.

## AI Deck Insights

AI features are optional and currently use OpenRouter. The owner configures and
validates an API key and model ID in **Settings -> AI**, and can add custom
analysis instructions; the key is encrypted at rest and is never returned
through GraphQL. Deck data is sent only when the owner explicitly runs an
analysis or sends a question.

### Deck analysis

User-initiated analysis covers goals, themes, game plan, structure, role
balance, synergy, tuning options, and consistency, and is saved with the deck
below its primer with model metadata. Card references in the analysis open the
card detail dialog. **Settings -> AI -> Refresh all deck analyses** re-runs
analyses across decks.

Saved-deck analysis runs in the background, including individual refreshes.
You can leave the page and return while it runs; the deck page checks progress
and displays the result when ready. Refreshing keeps the previous analysis
visible, and repeat requests reuse an active job. Failed jobs can be retried
from the deck page.

**Analyze list** on the deck list analyzes a pasted decklist or deck link
without saving it as a deck.

### Commander brackets

Commander analyses assign granular ratings such as **Bracket 3-**,
**Bracket 3**, and **Bracket 3+**: lower end, typical, and upper end without
quite reaching the next bracket. The model assesses this placement directly;
official WotC classification and expected pace stay in the analysis body. Older
analyses use the higher of their saved official and practical brackets, with a
minus when those values differ; refresh an analysis to get a directly assessed
rating. The saved label appears on deck cards, the deck header, and shared
preview images.

### Ask AI

**Ask AI** opens a saved conversation about the deck, using the same chat
controls as **Swap cards**. Press Enter to send or Shift+Enter for a new line.
**New chat** starts fresh AI context without deleting earlier conversations;
reopen them from **Saved chats**. A new chat is saved when you send its first
message. Follow-ups include the last six completed answers from that
conversation and the decklist as it exists when the message is processed.
Earlier replies are not rewritten after deck edits. Recommended changes can be
applied to the deck from the answer. Swap cards chats stay separate, and
existing saved questions remain together in the original chat with their
recommendation and delete controls.

### Tools

During analysis and questions, the model can call a `lookup_cards` tool that
returns rules text, color identity, and legality from the local Scryfall
catalog, so it can verify cards released after its training data before
recommending them. A `check_collection` tool reports whether the owner has a
free copy of each candidate, has copies only in other active decks, or does not
own it. The prompts tell the model to prefer cards with a free copy when they
fit comparably well, treat copies in other decks the same as unowned cards, and
still suggest cards without a free copy when they are clearly better. Answers
say which additions the owner has a free copy of; deck analysis uses collection
status only to choose cards and does not label them. Models whose OpenRouter
endpoints lack tool support fall back to answering without tools.

## Trade

The Trade tab connects owned inventory to trading with other players:

- **Binder** - the collection grid with a centered circular glass toggle on
  each tile that marks a collection item (and quantity) up for trade, plus
  sorting, filters, an only-for-trade filter, and a flagged count. Items stored
  in list-kind locations never count as tradable copies.
- **Wants** - a card-search-backed want list with quantities. Wants are
  either generic ("any printing") or pinned to an exact printing via the
  opt-in printing picker or the **Add to wants** action on a card detail
  printing.
- **Matches** - paste list text or a supported link, declare whether the
  list is the partner's haves or wants, and see the overlap: cards you have
  up for trade that they want, or cards they have that are on your want
  list. Unrecognized lines are reported.

Deck detail pages additionally offer a **Compare decklist** action that diffs
an external list against the open deck as adds, cuts, and quantity changes
(considering piles excluded on both sides - the diff compares the actual
deck), with a copyable +/- text diff. Basic lands are compared by name and
only appear when the two sides disagree on the count - equal counts cancel
instead of showing paired add/cut rows. Diff rows are actionable: adds can
be added to the deck's Considering pile (individually or all at once), and
cuts or downward quantity changes can tag the matching deck cards as
consider-cutting.

Supported link sources are Moxfield and Archidekt deck URLs (fetched
server-side from their public APIs with strict id validation, no redirects,
and size/time caps) plus ManaVault `/share/decks/...`, `/share/wants/...`,
and `/share/binder/...` links from any instance: relative links resolve
locally by share token, and absolute links are fetched from that link's origin
through its public `/share/graphql` endpoint. Public Internet destinations work
by default. Private, loopback, link-local, and other non-public destinations
are blocked unless the operator explicitly allows the intended hostname or
network with `MANAVAULT_REMOTE_SHARE_ALLOWLIST` (see
[self-hosting.md](self-hosting.md#remote-manavault-share-destinations)); this
preserves opt-in LAN sharing between self-hosted friends without making
internal services generally reachable. DNS results are policy-checked and the
validated address is pinned for the request. Every request remains bounded
(fixed path, fixed query body, no credentials, no redirects, time and size
caps), and its response is only ever shown to the owner who pasted the link.

Moxfield's API only serves approved clients, so those fetches may fail with
a hint to paste the export text instead; ManaBox has no public URL API and
is supported through its plain-text export (its CSV export remains a
collection-import format, not a trade-match input). Any standard decklist
text (quantities, optional set and collector number, `*F*` finishes, `SB:`
prefixes, section headings) parses.

## Sharing

Decks, deck buylists, the want list, and the trade binder can each be shared
through a bearer link:

- `/share/decks/...` - read-only deck view with copy, export, and playtest
  actions, plus a generated preview image for link unfurls
- `/share/wants/...` - the want list
- `/share/binder/...` - each for-trade printing with finish and condition

Share pages offer copy-to-clipboard (with a plain-http fallback) and `.txt`
download as standard decklist text, ready to paste into any ManaVault Matches
tab or other deck tools. Owners can rotate a link or disable sharing from the
Share dialog; the old token stops working immediately.
Decks linked to Moxfield or Archidekt share their external page instead; the
Share dialog shows that URL and hides the rotate/disable controls.

## Pricing

**Settings -> Pricing** selects the price source used across the app: Scryfall
(default), TCGplayer, Card Kingdom, or Mana Pool. Vendor prices sync in the
background into their own table and fall back to Scryfall for printings a vendor
does not stock. TCGplayer and Mana Pool use the lowest near-mint listing per
finish. A manual vendor sync can be queued from the same section.

## Settings and Appearance

The Settings page groups owner configuration:

- **Appearance** - Liquid Glass (default) or classic surface style, a color
  palette (Claret, Nord, Catppuccin, Tokyo Night, Gruvbox, Everforest, Kanagawa,
  Night Owl, Dracula, Rosé Pine, Solarized, Monochrome) saved on the owner
  account (the card size slider in the app shell adjusts card images across
  the app)
- **Pricing** - price source and vendor sync
- **AI** - OpenRouter key, model, and custom instructions
- **Personal API keys** - read-only keys for integrations; see [api.md](api.md)
- **Collection auto-sort** and **Default Deck Tags**
- **Scryfall data** - force a Scryfall catalog or symbol/set icon reload
- **Cloud backups** and **Restore** - see [Backups and admin](#backups-and-admin)
- **Server logs** - live application output streamed to the browser
- **Mobile app** - configured server URL and app version (native shells only)

## Mobile and Native Shells

The web UI is responsive and installable as a PWA. Optional Capacitor shells add:

- first-launch server URL configuration, with a warning for cleartext `http://`
- native back/app control behavior
- Android text/CSV Share, Open with, and file intents
- native import handoff into the collection import dialog
- camera access for the card scanner (Android `CAMERA` permission, iOS
  `NSCameraUsageDescription`)
- Android release update checks
- iOS project sync for Xcode builds

Android release signing, App Links, and custom-domain builds are documented in
[android.md](android.md).

## Backups and Admin

ManaVault supports:

- local backup zip creation with SQLite `VACUUM INTO`, excluding replaceable
  Scryfall catalog rows
- local restore with pre-restore safety backup
- pre-migration backup before release migrations
- cloud backup settings for Google Drive and S3-compatible storage, with
  retention
- scheduled UTC CRON backups
- staged cloud restores applied on restart
- built-in owner password authentication with failed-login rate limiting and
  permanent client bans

Self-hosting and backup operations are documented in
[self-hosting.md](self-hosting.md).
