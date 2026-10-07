# Trade

## Ported

| Elixir | Rust |
| --- | --- |
| `Trade.Want`, `Trade.Query`, `CreateWant`, `UpdateWant`, `DeleteWant`, `Trade.want_image_url/1` | `trade::want` |
| `Trade.SingletonShare`, `WantsShare`, `BinderShare` (token lifecycle, lists by token), `Catalog.Decks.ShareToken` (generate/valid) | `trade::share` |
| `Trade.ForTradeQuery`, `BinderShare` entries, `Matcher.for_trade_items_by_oracle/1` | `trade::binder` |
| `Trade.Lists`, `Trade.ListSource` | `trade::list_source` (`resolve`, `resolve_with`) |
| `Catalog.Decklists.parse/2` (no zone override) + `ListSource.from_text/1` | `trade::list_source::text` (private copy, see below) |
| `ListSource.ManaVault` (host-less share links, resolved locally) | `trade::list_source::local` |
| `ListSource.Moxfield`, `.Archidekt`, `.ManaVaultRemote`, `.Http` | `trade::list_source::remote` over lotus `DeckLink`, `DecklistClient`, `MoxfieldDeck`, `ArchidektDeck`, `DeckPager`, `Allowlist` |
| `Trade.EntryResolver` | `trade::entry_resolver` |
| `Trade.Matcher` | `trade::matcher` |
| `Trade.CollectionCheck` (+ `AllocationStatus.collection_requirement_statuses/1` for not-yet-deck-card requirements) | `trade::collection_check` |
| `Trade.DeckDiff` | `trade::deck_diff` |
| `TradeTypes`, `TradeOperations`, `TradeMutations`, `TradeListTypes`, `TradeListOperations`, `TradeListResolvers` | `trade::schema` |
| `AppController.share_wants/2`, `share_binder/2` | `trade::web` (wired from `web::share::browser_routes`) |

Decks, deck cards, collection items, locations, and allocations are read with
SQL; nothing here depends on the deck/collection GraphQL types.

## GraphQL

Types: `TradeWant`, `WantsListEntry`, `BinderListEntry`, `BinderList`,
`WantsList`, `CollectionCheckResult`, `CollectionCheckCard`,
`TradeMatchResult`, `TradeBinderMatch`, `TradeWantMatch`, `DeckDiffResult`,
`DeckDiffEntry`, `DeckDiffChange`, and the nine trade payloads.

Queries: `tradeWants`, `tradeWantsShareToken`, `tradeBinderShareToken`
(`TradeQueries`); `binderList(id:)`, `wantsList(id:)` (`ShareListQueries`).

Mutations: `createTradeWant`, `updateTradeWant`, `deleteTradeWant`,
`ensureTradeWantsShareToken`, `ensureTradeBinderShareToken`,
`disableTradeWantsSharing`, `rotateTradeWantsShareToken`,
`disableTradeBinderSharing`, `rotateTradeBinderShareToken`, `collectionCheck`,
`tradeMatches`, `deckDiff`.

`sdl_diff.py` shows no differences for these. The only related differences
are on `CollectionItem` (see the stub below).

Routes: `GET /share/wants/{token}`, `GET /share/binder/{token}` in the
`:browser` pipeline: the app shell with the default preview for the current,
well-formed token, else an empty 404.

## Integration notes

- **`CollectionItem` stub.** `TradeBinderMatch.items` needs the collection's
  `CollectionItem` type, which is being ported concurrently.
  `trade/collection_item_stub.rs` defines `BinderItem` as a GraphQL object
  named `CollectionItem` with the fields the trade page reads (`id`,
  `quantity`, `condition`, `language`, `finish`, `forTrade`,
  `forTradeQuantity`, `notes`, `printing`). When merging: delete the stub,
  load the real items by id, and override `quantity` with the for-trade
  quantity (Elixir's `Matcher` does `%{item | quantity: item.for_trade_quantity}`).
  Two Rust types named `CollectionItem` cannot be in one schema.
- **Public share schema.** Merge `trade::ShareListQueries` into the public
  `/share/graphql` schema; it is the same resolver Absinthe uses for both.
- **Decklist text parser.** `trade/list_source/text.rs` is a private copy of
  `Catalog.Decklists.parse/2` (without the zone override). If the deck port
  adds the shared parser, switch to it.
- **Collection requirement statuses.** `collection_check::holdings` computes
  `AllocationStatus.collection_requirement_statuses/1` for requirements that
  are not deck cards (owned copies outside list locations, copies reserved by
  allocations of deck cards with the same oracle id). The allocation crate
  could expose this instead.
- **Config.** `PlatformUrls::moxfield_api` and `archidekt_api` (defaults are
  lotus's API bases; tests point them at wiremock). The deck port's external
  deck sync needs the same two values; reuse them rather than adding more.
- **lotus ManaVault share queries.** `DecklistClient` posts to
  `{origin}/share/graphql` (lotus `src/decklist/manavault.rs`). The public
  share schema must expose:
  - `deck(id: ID!)` → `name`, `cardCount`, `commanderColorIdentity`,
    `deckCards(first: 500, after: $after)` → `pageInfo { hasNextPage endCursor }`,
    `edges { node { quantity zone finish card { name }
    preferredPrinting { scryfallId } fallbackPrinting { scryfallId } } }`
    (variables `$id: ID!`, `$after: String`, `after` always sent, `null` on
    the first page);
  - `wantsList(id: ID!)` → `entries { cardName quantity setCode collectorNumber }`;
  - `binderList(id: ID!)` → `entries { cardName quantity setCode collectorNumber finish }`.

  All of these exist in `_build/public-share-schema.graphql` today; the
  Elixir client did not request `cardCount`, `commanderColorIdentity`,
  `finish`, or the printing references. A remote instance whose deck schema
  lacks one of them answers with GraphQL errors, which read as "Couldn't
  reach that ManaVault instance".
- Absolute share links to this very instance are fetched over HTTP like
  Elixir, so they need the public `/share/graphql` endpoint (not ported yet);
  host-less `/share/...` links resolve locally now.

## Deliberate differences

lotus decklist behavior (documented at `trade::list_source::remote`):

- Archidekt zones follow each card's primary category and that category's
  `includedInDeck` flag: cards whose primary category is excluded from the
  deck are kept as considering, and a secondary `Maybeboard`/`Sideboard`
  category no longer moves a card out of the deck. Elixir used
  "Maybeboard or Sideboard anywhere in the categories".
- Remote ManaVault deck edges clamp quantity to at least 1, and unknown zone
  strings read as mainboard (Elixir kept both as sent). Locally resolved
  deck shares also map an unknown stored zone to mainboard.
- HTTP 401 is treated like 403 (Moxfield: the "blocked the request" message;
  Elixir: the generic message).
- A remote ManaVault HTTP 404, or `data` without a `deck` field, reads as
  "doesn't match a deck on that ManaVault instance" (Elixir: "Couldn't
  reach").
- Moxfield entries come back commanders first, then each board sorted by
  name (Elixir: map order). An absolute `moxfield.com`/`archidekt.com` URL
  with a `/share/...` path is unsupported (Elixir fetched that host's
  `/share/graphql`).

Other:

- `FetchError`s map to the exact Elixir messages: `UnsupportedLink`/
  `BlockedDestination` → "Unsupported link…", `NotFound` → the per-kind
  "doesn't match … on that ManaVault instance", `LimitExceeded`/`BodyTooLarge`
  → "too large or took too long", `InvalidPagination` → "invalid list
  pagination", `Unsupported(kind)` → "doesn't support shared want lists/trade
  binders yet", everything else → "Couldn't reach…". Moxfield: `Forbidden` →
  blocked message, else the friendly message; Archidekt: always the friendly
  message.
- `createTradeWant` finds and bumps the matching want inside one `BEGIN
  IMMEDIATE` transaction instead of insert-then-bump-on-conflict; same result.
- Database failures surface as "Something went wrong." (`internal_error`).
- `deckDiff` representative images order printings by release date, then set
  code and collector number (Elixir: release date only, ties unspecified).

## Elixir bugs found (fixed here)

1. `CollectionCheck.priced_printing/1` and `representative_printing/1` sorted
   `released_at` `Date` structs inside `Enum.sort_by/2` tuples, which compares
   them in Erlang term order (day, then month, then year), so price ties and
   unpriced cards picked the wrong printing. Dates compare chronologically
   here (test `the_cheapest_printing_ties_break_chronologically`).
2. `DeckDiff` treated only type lines starting with `Basic Land` as basics, so
   `Basic Snow Land` cards compared by oracle id while unresolved
   `Snow-Covered ...` names compared by name. Basics are
   `lotus::is_basic_land` everywhere (test
   `snow_basics_in_the_catalog_compare_by_name`).

## lotus gaps

- `FetchError::NotFound` conflates HTTP 404 with a `null` GraphQL result, and
  `DeckData`/`WantsData`/`BinderData` default a missing field to `null`, so an
  app cannot tell "not found" from "unexpected response".
- No pasted-decklist text parser; both apps parse `4x Name (SET) 123 *F*`
  lists with zone headings. A shared parser would remove the copy here (it
  needs a printing lookup callback for `(SET) 123`).
- `is_share_token` exists but no share token generator (18 random bytes,
  URL-safe base64); generating stays app code.

## Tests

86 tests under `trade::tests` (wants, shares, lists, list_source, remote,
schema, web), ported from `trade_test.exs`, `trade/*_test.exs`,
`trade/list_source/*_test.exs` (`mana_vault_remote_test.exs` against wiremock
through lotus, with stub DNS resolvers and the operator allowlist; HTTP
status mapping from `http_test.exs`), `deck_diff_ids_test.exs`, the trade
parts of `schema_domain_contract_test.exs` and
`deck_detail_and_share_test.exs`, `public_wants_share_test.exs` /
`public_binder_share_test.exs` (against the owner schema's identical
fields), and the share page parts of `app_controller_test.exs`.

Not ported: Req-adapter-specific `http_test.exs` cases (lotus owns the HTTP
plumbing), the injectable monotonic clock (the deadline test uses a short
lotus `Limits::timeout` and a delayed wiremock response instead), and the
`/share/graphql` HTTP parts of the public share tests (public schema not
ported yet).

## Foundation changes

- `config.rs`: `PlatformUrls::{moxfield_api, archidekt_api}`.
- `web/share.rs`: `browser_routes` adds `trade::web::routes`.
- `graphql/mod.rs`: merged `TradeQueries`, `ShareListQueries`, `TradeMutations`.
- `lib.rs`: `pub mod trade`.

`web::tests::graphql_csrf::transport_batches_run_each_query` failed once in a
full parallel run and passed on rerun (pre-existing; unrelated to trade).
