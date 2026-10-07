# Deck allocation and deck intel

## Ported

| Elixir                                                                                                                                    | Rust                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Decks.DeckCardAllocation` (allocate, deallocate, `allocate_by_ids_in_transaction`, `allocate_available_preferred_printing_to_deck_card`) | `manavault_allocation::{allocate, allocate_in, deallocate, allocate_available_preferred_printing}`                                  |
| `Decks.AllocationItems`                                                                                                                   | `manavault_allocation` `items` (private)                                                                                            |
| `Decks.AllocationStatus` (single, `put_deck_card_allocation_statuses`, `deck_allocation_status`, `collection_requirement_statuses`)       | `allocation_status`, `deck_card_statuses`, `deck_allocation_statuses`, `requirement_statuses` (two queries for any number of cards) |
| `Decks.BulkDeckAllocation`                                                                                                                | `preview_bulk_allocate_deck`, `bulk_allocate_deck` (`AllocationMode`)                                                               |
| `Decks.PullListAllocation`                                                                                                                | `PullListEntry::new`, `allocate_deck_pull_list`                                                                                     |
| `Decks.BulkCollectionAllocation`                                                                                                          | `bulk_add_collection_items_to_deck`                                                                                                 |
| `Decks.AddCollectionItemToDeck` (+ the upsert half of `AddCardToDeck` it needs)                                                           | `add_collection_item_to_deck`                                                                                                       |
| `Decks.ProxyAllocation`                                                                                                                   | `allocate_proxy`, `deallocate_proxy`                                                                                                |
| `Decks.DeckCardDeallocation`                                                                                                              | `bulk_deallocate_deck_cards`                                                                                                        |
| `Decks.ClearDeckCardAllocations`                                                                                                          | `clear_deck_card_allocations` (caller's transaction)                                                                                |
| `Decks.TrimDeckCardAllocations`                                                                                                           | `trim_deck_card_allocations` (caller's transaction)                                                                                 |
| `UpdateDeckCard`'s allocation switch                                                                                                      | `switch_allocation_to_preferred_printing` (caller's transaction)                                                                    |
| `Decks.Disassembly`                                                                                                                       | `preview_deck_disassembly`, `disassemble_deck`                                                                                      |
| `Decks.Buylist` (counting)                                                                                                                | `deck_buylist_needs` (`BuylistOptions`, `BuylistNeed`, `BuylistReason`)                                                             |
| `Decks.Buylist` (printing/price/export), `Decks.Printings`                                                                                | `deck_intel::buylist::{deck_buylist, export_deck_buylist, PrintingMode}`                                                            |
| `EDHRec.Recommendations`, `Payload`, `Client.fetch_recs/fetch_commander_page`, `Response`, `Response.CommanderPage`                       | `deck_intel::edhrec` (reuses `catalog::edhrec::{CardLookup, card_slug, EdhrecError, entry_*}`)                                      |
| `EDHRec.Response.CollectionStatus`, `CardLookup.matching_deck_card`                                                                       | `deck_intel::suggest`                                                                                                               |
| `Catalog.Recommander` (+ `Client`, `Payload`, `Response`)                                                                                 | `deck_intel::recommander`                                                                                                           |
| `Catalog.CommanderSpellbook`                                                                                                              | `deck_intel::spellbook`                                                                                                             |
| `Errors.deck_allocation_error/edhrec_error/recommander_error/commander_spellbook_error`                                                   | `deck_intel::errors`, and the `Display` of `DeckEdhrecError`/`RecommanderError`/`SpellbookError`                                    |

`printings.ex` has no allocation logic (it picks the cheapest printing for the
buylist), so it lives in `deck_intel::buylist`.

Crate functions taking a pool run in their own `BEGIN IMMEDIATE`
transaction (the existing `allocate`/`deallocate` were switched from a
deferred `BEGIN` to that too). Functions taking `&mut SqliteConnection`
compose into the caller's transaction. Bulk and pull-list entries run in
savepoints, so a skipped entry leaves no partial writes. The public API of
the spike (`allocate`, `deallocate`, `allocation_status`,
`DeckCard::allocatable`, `AllocatableDeckCard`, the id types) is unchanged;
`AllocationError` gained variants (`DeckNotFound`, `DeckLinked`,
`InvalidQuantity`, `ProxyAllocationNotFound`, `FinishMismatch`,
`InvalidPullListEntry`, `InvalidAllocationMode`, `QuantityTooLarge`), so an
exhaustive `match` on it needs the new arms (prefer
`deck_intel::errors::deck_allocation_error`).

Every insert of an allocation still goes through `reserve`, which takes the
`AllocatableDeckCard` proof; proxies are only added through `add_proxies`,
which takes it too.

## GraphQL done

Queries: `deckBuylist`, `deckBuylistExport`, `deckEdhrec`, `deckRecommander`,
`deckCombos`. Mutations: `previewDeckDisassembly`, `disassembleDeck`,
`bulkAllocateDeck`. Types: `DeckBuylistEntry`, `DeckEdhrec`, `DeckEdhrecCard`,
`EdhrecCommanderPage`, `EdhrecTheme`, `EdhrecStat`, `EdhrecCardSection`,
`EdhrecSectionCard`, `DeckRecommander`, `DeckRecommanderCommander`,
`DeckRecommanderCard`, `DeckCombo`, `DeckComboCard`, `DeckDisassemblyMove`,
`DeckDisassemblyResult`, `DeckBulkAllocationResult`,
`PreviewDeckDisassemblyPayload`, `DisassembleDeckPayload`,
`BulkAllocateDeckPayload`, `AllocateDeckPullListPayload` (defined, reachable
once `allocateDeckPullList` is wired), and `DeckCardAllocationStatus`
(now `decks::DeckCardAllocationStatus`, with `candidates`; see
`integration.md`).

`sdl_diff.py` differences in this area are only the deferred items below.

`DeckCardAllocationStatus` is defined here because `DeckEdhrecCard`,
`EdhrecSectionCard`, and `DeckRecommanderCard` need it. The deck engineer's
`DeckCard.allocationStatus` must reuse this type (two Rust types with one
GraphQL name conflict): `DeckCardAllocationStatus::new(status)` from
`manavault_allocation::deck_card_statuses(pool, &cards)` (batched).

Third-party URLs: `Config::deck_intel` (`DeckIntelUrls`: `edhrec_recs`,
`recommander`, `commander_spellbook`; tests use `unreachable()`), and
`Config::edhrec_json_base_url` + `/pages/commanders` for commander pages.

## Deferred for integration (domain functions exist and are tested)

| Field                                                  | Call                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allocateDeckPullList(deckId, entries)`                | `deck_intel::schema::allocate_deck_pull_list(ctx, &deck_id, &[PullListEntryArgs])` — the whole resolver body, tested with a stand-in `DeckPullListEntryInput`; map the deck engineer's input into `PullListEntryArgs` and return its `AllocateDeckPullListPayload`.                                                    |
| `allocateDeckCardItem(deckCardId, collectionItemId)`   | `manavault_allocation::allocate(pool, deck_card_id, item_id, Quantity 1)`, then reload the deck card; errors through `deck_intel::errors::deck_allocation_error`.                                                                                                                                                      |
| `deallocateDeckCardItem(deckCardId, collectionItemId)` | `manavault_allocation::deallocate(pool, deck_card_id, item_id, Quantity 1)`, then reload the deck card.                                                                                                                                                                                                                |
| `bulkDeallocateDeckCards(deckCardIds)`                 | `manavault_allocation::bulk_deallocate_deck_cards(pool, &ids)` (request order, deduplicated; any missing id → `DeckCardNotFound`).                                                                                                                                                                                     |
| `allocateDeckCardProxy(deckCardId, quantity)`          | `parse_quantity(quantity.unwrap_or(1))` then `allocate_proxy(pool, id, q)`.                                                                                                                                                                                                                                            |
| `deallocateDeckCardProxy(deckCardId, quantity)`        | `parse_quantity(...)` then `deallocate_proxy(pool, id, q)`.                                                                                                                                                                                                                                                            |
| `previewBulkAllocateDeck(id, mode)`                    | `AllocationMode::parse(&mode)` then `preview_bulk_allocate_deck(pool, deck_id, mode)`; `mode.as_str()` for the `mode` field; each `BulkAllocationEntry` has `deck_card: DeckCard` (embed the deck engineer's `DeckCard` by id), `item: CollectionItem` (collection engineer's type by `item.id`), `quantity`, `exact`. |
| `addCollectionItemToDeck(id, deckId, zone)`            | `add_collection_item_to_deck(pool, deck_id, item_id, Zone::parse(zone or "mainboard"))`.                                                                                                                                                                                                                               |
| `bulkAddCollectionItemsToDeck(selector, deckId, zone)` | resolve the selector to ids (collection engineer), then `bulk_add_collection_items_to_deck(pool, deck_id, &ids, zone)`; returns deck cards by id.                                                                                                                                                                      |
| `DeckCardAllocationStatus.candidates`                  | add a resolver on `deck_intel::status::DeckCardAllocationStatus` mapping `self.status.candidates` (`Candidate { item: CollectionItem, allocated, allocated_elsewhere, available }`) to `DeckCardAllocationCandidate { item: <CollectionItem GraphQL by item.id>, … }`.                                                 |

Deck-core hooks for the deck engineer (all in the caller's transaction):
`clear_deck_card_allocations` (deleting a card; moving to considering — also
set `proxy_quantity` to 0 in the update), `trim_deck_card_allocations`
(after lowering a quantity, e.g. swaps),
`switch_allocation_to_preferred_printing` (after changing
`preferred_printing_id` or `finish`). Trade's
`collection_requirement_statuses` is `requirement_statuses`.

The public share schema's `deckBuylist`/`deckBuylistExport` can call
`deck_intel::buylist::{deck_buylist, export_deck_buylist}` with
`assume_no_owned: true`.

## Deliberate differences

- A missing deck reads "Deck was not found." and a missing deck card "Deck
  card was not found." (Elixir raised `Ecto.NoResultsError`). Database
  failures read "Something went wrong.".
- `bulkAllocateDeck` computes its plan inside the write transaction (Elixir
  previewed before opening it).
- `bulk_add_collection_items_to_deck` grows an existing allocation row for the
  same item instead of inserting a duplicate (the unique index would have
  rejected the insert anyway).
- A deck card reaching 10 000 copies through collection adds fails with the
  changeset's "quantity must be less than 10000".
- Recommander/EDHREC/Spellbook transport errors carry reqwest's message
  instead of `Exception.message/1`'s.
- The batched-preview query-count test is not ported as a counter; statuses
  are computed with a fixed two queries by construction
  (`status::load_statuses`), and the preview test covers a multi-card deck.

## Elixir bugs found (fixed here)

1. `EDHRec.Response.CollectionStatus` (used by EDHREC and Recommander for
   suggested cards not in the deck) only counted copies reserved by
   **active** decks, so a copy allocated to a brewing or archived deck — which
   has physically left its location — showed as available. Every reservation
   counts now, matching `AllocationStatus` ("physical allocations make a
   collection item unavailable regardless of deck status") and trade's
   requirement statuses. (`deck_intel::suggest::collection_statuses`,
   test `deck_edhrec_counts_copies_allocated_to_other_decks`.)

## lotus

No gaps hit (`is_basic_land` covers snow basics; `Zone`, `Finish`,
`Quantity` used directly).

## Foundation changes

- `config.rs`: `deck_intel: DeckIntelUrls` field (default and test values).
- `graphql/mod.rs`: merged `DeckIntelQueries` and `DeckIntelMutations`.
- `lib.rs`: `pub mod deck_intel`.
- `manavault-allocation/Cargo.toml`: `serde_json` (JSON list parameters,
  image URIs).

## Notes for others

- `web::tests::graphql_csrf::transport_batches_run_each_query` is flaky on
  `rust-backend` itself (roughly one run in four puts `appearanceSettings`
  before `backupSettings`); unrelated to this area.
- Test coverage: crate `tests/deck_flows.rs` (28) + `tests/allocation.rs`
  (13) + unit tests (4) + 1 compile-fail doctest; server `deck_intel` (23).
