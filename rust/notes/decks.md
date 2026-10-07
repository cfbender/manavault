# Decks

## Ported

| Elixir | Rust |
| --- | --- |
| `Catalog.Deck`, `DeckCard`, `DeckTag`, `DeckCardTag`, `DefaultDeckTag` (schemas, vocabularies) | `decks::model` (`DeckRow`, `DeckCardRow`, `DeckTagRow`, `DefaultDeckTagRow`, `DeckFormat`, `DeckStatus`, `ExternalSource`, `DeckCardTag`, `deck_row_query!`, `deck_card_row_query!`, loaders) |
| Ecto changesets of those schemas, `Errors.changeset_error_message/1` | `decks::validation` (`Change<T>`, validators; reuses `settings::changeset::Errors`) |
| `Decks.Records`, `Decks.Queries` (CRUD, counts, share-token reads), `DeckPicker.record_outcome/2` | `decks::records` |
| `Decks.ShareToken` | `decks::share_token` |
| `Decks.Cards`, `AddCardToDeck`, `UpdateDeckCard`, `UpdateDeckCards`, `DeleteDeckCard`, `SetDeckCommander`, `AddDeckPartner`, `EditGuard`, `FetchDeckRecords`, `Decks.Printings` | `decks::cards`, `decks::{ensure_deck_editable, ensure_decklist_editable}` |
| `TrimDeckCardAllocations`, `ClearDeckCardAllocations`, `AllocationItems`, `DeckCardAllocation.allocate_available_preferred_printing_to_deck_card/2`, `AllocationStatus` (batched statuses) | `manavault_allocation` (`clear_deck_card_allocations`, `trim_deck_card_allocations`, `switch_allocation_to_preferred_printing`, `statuses_in`, on the caller's transaction; the former `decks::allocations` copy was removed at integration) |
| `DeckLegality` | `decks::legality` |
| `CommanderRules` | `decks::commander` (on lotus `can_be_commander`/`commander_pairing`) |
| `DeckSummaries`, `Decks.Preloads`, `Decks.Statistics` | `decks::contents` (`DeckContents`, `DeckSummary`, `deck_summaries`, `fallback_printings`, `DeckStats`) |
| `Decklists`, `Decks.DecklistIO` | `decks::decklist` |
| `Decks.DeckPicker` | `decks::picker` |
| `Decks.SwapDeckCards` | `decks::swap` |
| `Decks.Tags`, `Decks.DefaultTags` | `decks::tags` |
| `Decks.ExternalSource`, `Decks.ExternalDeckSyncWorker` (+ the `Trade.ListSource.Moxfield/Archidekt` fetches it used) | `decks::external` (lotus `DeckLink`, `DecklistClient`, `MoxfieldDeck`, `ArchidektDeck`); worker `Manavault.Catalog.Decks.ExternalDeckSyncWorker`, queue `catalog`, max 1 attempt, unique per worker, 15 min timeout, cron `0 * * * *` |
| `DeckTypes`, `DeckFields`, `DeckOperations`, `DeckMutations`, `DeckSwapResolvers`, deck parts of `QueryResolvers`/`MutationResolvers`/`Errors` | `decks::schema` (`types`, `errors`, `DeckQueries`, `DeckMutations`) |

For other modules: `decks::Deck` / `decks::DeckCard` (GraphQL objects;
`Deck::new`, `Deck::load`, `Deck::contents`, `DeckCard::load`, `load_many`,
`hydrate(rows)`, `hydrate_loaded`), `decks::DeckCardAllocationStatus`
(wraps `allocations::AllocationStatus`; set `deck_zone` for EDHREC-style
lookups, `AllocationState::Shared` for public pages),
`manavault_allocation::statuses_in` (batched; requirement statuses are
`manavault_allocation::requirement_statuses`), `deck_summaries(pool, ids)` (card count,
unique count, commander color identity, cover image — for `/api/v1/decks`
and share previews), `contents::load_contents`, `records::get_deck`,
`records::get_by_share_token`, `cards::cheapest_printing`,
`cards::cheapest_priced_printing`, `cards::ensure_card_editable`,
`decklist::export_line` (EDHREC payload), `schema::DeckPullListEntryInput`.

## GraphQL

Types: `Deck`, `DeckCard`, `DeckTag`, `DefaultDeckTag`, `DeckLegality`,
`DeckLegalityIssue`, `DeckConnection`/`DeckEdge`,
`DeckCardConnection`/`DeckCardEdge`, `DeckCardAllocationStatus` (all fields
but `candidates`), `DeckImportResult`, `DeckSwapPreview`, `DeckPlayOutcome`,
`DeckSwapCutDestination`, inputs `DeckInput`, `DeckUpdateInput`,
`DeckCardInput`, `DeckCardUpdateInput`, `DeckSwapCutInput`,
`DeckSwapAddInput`, `DeckSwapInput`, `DeckTagInput`, `DefaultDeckTagInput`,
`DeckPullListEntryInput`, and every payload below.

Queries: `defaultDeckTags`, `decks`, `randomDeck`, `deck`, `sharedDeck`,
`deckExportText`, `deckSwapPreview`.

Mutations: `createDeck`, `updateDeck`, `recordDeckPlay`,
`ensureDeckShareToken`, `disableDeckSharing`, `rotateDeckShareToken`,
`linkDeckExternalSource`, `unlinkDeckExternalSource`,
`syncDeckExternalSource`, `addDeckCard`, `importDecklist`, `deleteDeck`,
`updateDeckCard`, `updateDeckCardsTag`, `createDeckTag`, `updateDeckTag`,
`deleteDeckTag`, `reorderDeckTags`, `replaceDefaultDeckTags`,
`assignDeckCardTag`, `unassignDeckCardTag`, `bulkUpdateDeckCards`,
`applyDeckSwap`, `bulkDeleteDeckCards`, `optimizeDeckCardPrintings`,
`deleteDeckCard`, `setDeckCommander`, `addDeckPartner`.

`sdl_diff.py` shows no differences for these except: `implements Node` on
`Deck`/`DeckCard` (the integrator adds `Node`), `DeckCardAllocationStatus.candidates`
(deferred), and `DeckPullListEntryInput` (defined, but async-graphql only
registers it once `allocateDeckPullList` references it). The script also
misparses `scalar Json` followed by `LinkDeckExternalSourcePayload` in the
Rust SDL (it reports both as wrong); the payload itself matches.

Deck cards load once per `Deck` object (a `OnceCell`), so `cardCount`,
`legality`, `coverImageUrl`, and `deckCards` share one load; `decks` loads
every listed deck's cards in one batch. `Deck.deckCards` computes tag ids
and allocation statuses for the whole deck with three queries (tags,
candidates, allocation counts), like the Elixir batching.

## Deliberate differences

- No deck read cache (`Cache.cached` with the decks tag): reads go to SQLite
  each request, so nothing needs invalidating after collection or deck writes.
- `deck(id:)` and deck mutations on a missing deck return "Deck was not
  found." (Elixir raised `Ecto.NoResultsError`). Database failures return
  "Something went wrong.".
- `DeckCard.priceCents` uses the preferred printing only; the Elixir field
  fell back to the newest printing only when the deck had been preloaded with
  card printings (not on the deck page or in mutation payloads).
- Deck card payloads of deleted cards (`deleteDeckCard`,
  `bulkDeleteDeckCards`) resolve `allocationStatus` from the deleted row
  (Elixir raised `Ecto.NoResultsError` on that field).
- External decks (lotus instead of `Trade.ListSource`):
  - Archidekt zones follow the primary category and the deck's
    `includedInDeck` flags; cards whose primary category is excluded are
    Considering (Elixir: any `Maybeboard`/`Sideboard` category anywhere made
    a card Considering, then `Commander` anywhere made it a commander).
    Without category metadata `Maybeboard`/`Sideboard` count as excluded.
  - Quantities below one become one (as `Util.positive_quantity/1` did);
    Moxfield boards other than commanders/mainboard/sideboard/maybeboard are
    ignored as before; an Archidekt card whose primary category is unknown
    or included is mainboard (or commander when tagged `Commander`).
  - HTTP 401 is reported like 403 ("The deck site refused the request (HTTP
    403)…", Elixir `:forbidden`); Elixir said "returned HTTP 401".
  - A JSON response of the wrong shape is "The deck site returned an
    unexpected response." on the deck and "Could not sync the external
    deck." in GraphQL (Elixir crashed on non-map payloads).
  - Base URLs are `Config::platform_urls.moxfield_api` / `archidekt_api`
    (defaults from lotus).
- A brand-new database created from `structure.sql` gets the four default
  deck tags the `CreateDefaultDeckTags` migration seeds (Ramp, Draw,
  Interact, Plan); see foundation changes.

## Elixir bugs found (fixed here)

1. `UpdateDeckCard` did not trim allocations when a card's quantity dropped
   (only swaps and syncs called `TrimDeckCardAllocations`), so
   `updateDeckCard`/`bulkUpdateDeckCards`/`addDeckCard` with a lower quantity
   left more copies reserved than the card needs. They are trimmed now
   (proxies first, then physical copies back to their source location).
2. `SetDeckCommander.move_to_zone!/2` merged a moved card into an existing
   row for the same card by deleting the moved row; the `ON DELETE CASCADE`
   dropped its reservations while the copies stayed outside any location.
   The merged row now takes over the reservations.
3. `ExternalSource.link/2` saved the link before fetching and kept it when
   the first fetch failed; only the stale deck cache made the next request
   say "not linked" (the GraphQL test relied on that). A failed first link
   now leaves the deck unlinked and unchanged.

## lotus gaps

- `can_be_commander` knows only legendary creatures (and "can be your
  commander" text); CR 903.3 also allows legendary Vehicles and Spacecraft,
  and the Elixir rule judges the front face. `decks::commander` passes the
  front face and adds Vehicles/Spacecraft.
- No two-card pairing check: `commander_pairing` classifies one card, but
  restricted Partner labels ("Partner—Survivors") and "Partner with <name>"
  matching are app code (`decks::commander::valid_pair`). lotus classifies
  "Partner—Friends forever" as Friends forever, so it pairs with the older
  "Friends forever" wording (Elixir did not).

## Foundation changes

- `db.rs`: a new database created from `structure.sql` inserts the default
  deck tags the Ecto migration seeds (structure dumps carry no data).
- `config.rs`: `PlatformUrls::{moxfield_api, archidekt_api}` (the trade port
  may want the same fields).
- `lib.rs`, `graphql/mod.rs` (merged `DeckQueries`/`DeckMutations`), `app.rs`
  (worker and cron entry).

## Left undone / for others

- `DeckCardAllocationStatus.candidates` (`TODO(integration)` in
  `schema/types.rs`): needs the collection module's `CollectionItem`;
  `AllocationStatus.candidates` already carries item ids and counts in the
  Elixir order (preferred printing first).
- Allocation mutations (`allocateDeckCardItem`, `deallocateDeckCardItem`,
  `bulkDeallocateDeckCards`, `allocateDeckCardProxy`,
  `deallocateDeckCardProxy`, `previewBulkAllocateDeck`, `bulkAllocateDeck`,
  `allocateDeckPullList`, `previewDeckDisassembly`, `disassembleDeck`),
  `addCollectionItemToDeck`/`bulkAddCollectionItemsToDeck`, `deckBuylist*`,
  `deckEdhrec`, `deckRecommander`, `deckCombos`, and the AI fields
  (`analyzeDeck`, `askDeckQuestion`, `deckAnalysis*`, `deckQuestionAnswers`).
- The public share schema's `Deck` (different field set, `state: "shared"`),
  share pages, and `GET /api/v1/decks` (use `deck_summaries`).
- Query-count assertions of `deck_allocation_batching_test.exs` are not
  ported (no query telemetry); the status values are.
- `web::tests::graphql_csrf::transport_batches_run_each_query` is flaky on
  this branch (top-level field order of the second request), unrelated to
  decks.
