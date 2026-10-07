# Integration

Wiring the deferred cross-area fields, merging duplicated logic, and making
the owner schema match Absinthe's SDL exactly.

## Owner schema parity

`python3 scripts/sdl_diff.py /home/user/workspace/repo/_build/graphql-schema.graphql <(manavault sdl)`
reports **0 differences**.

`scripts/sdl_diff.py`: a definition's header may now only hold an
`implements` clause, so a body-less definition (`scalar Json`) no longer
swallows the definition after it (it reported `Location` and
`LinkDeckExternalSourcePayload` as missing/garbled).

## Ported / wired

| Elixir | Rust |
| --- | --- |
| `node interface` + `node field` (`ManavaultWeb.Schema`), `RelayHelpers.node_id/3`'s raw-id fallback inside `node` | `graphql::node` (`Node` interface over `Card`, `Printing`, `CollectionItem`, `Location` (incl. `unfiled`), `Deck`, `DeckCard`, `TokenItem`; `NodeQueries::node`); `relay::{decode_global_id, node_field_id, parse_internal_id}` |
| `AllocationResolvers` (`addCollectionItemToDeck`, `bulkAddCollectionItemsToDeck`, `allocateDeckCardItem`, `deallocateDeckCardItem`, `bulkDeallocateDeckCards`, `allocateDeckCardProxy`, `deallocateDeckCardProxy`, `previewBulkAllocateDeck`, `allocateDeckPullList`) | `deck_intel::allocations` (`AllocationMutations`, payloads, `DeckBulkAllocationPreview`, `DeckBulkAllocationEntry`) over `manavault_allocation` |
| `DeckTypes` `:deck_card_allocation_candidate`, `candidates` | `decks::schema::types::{DeckCardAllocationStatus::candidates, DeckCardAllocationCandidate}` (items batched through the collection loader) |
| `CollectionTypes` `:collection_item_allocation_deck` `deck` | `CollectionItemAllocationDeck::deck` (decks batched through the collection loader, `decks::model::load_decks`) |
| `DeckFields.deck_analysis_job_deck/3`, `AnalyzeDeckPayload.deck` | `ai::schema::{DeckAnalysisJob::deck, AnalyzeDeckPayload::deck}` |
| `AnalyzeDeckList` → `Trade.Lists.resolve/1` | `ai::analyze_deck_list` calls `trade::list_source::resolve` (local `/share/wants/…` and `/share/binder/…` links now resolve) |

Removed: the placeholder `ping` query and `noop` mutation.

## Consolidations

- **Allocation status / trim / clear / printing switch**: `decks::allocations`
  (a SQL re-implementation) is gone. Deck edits call
  `manavault_allocation::{clear_deck_card_allocations,
  trim_deck_card_allocations, switch_allocation_to_preferred_printing}` on
  their transaction, and `DeckCard.allocationStatus` uses the new
  `manavault_allocation::statuses_in(conn, &[StatusInput])` (same two
  queries as before, input order). `impl From<AllocationError> for
  DeckError` keeps the Elixir error atoms.
- **One `DeckCardAllocationStatus`**: `decks::DeckCardAllocationStatus`
  wraps the crate's `AllocationStatus` with the `state` string and optional
  `deck_zone` (`new`, `in_deck`, `unknown_card`, `shared(required)` for
  public share pages). `deck_intel::status` and its conversion shim are
  gone; EDHREC/Recommander statuses keep their candidates now (the shim
  dropped them).
- **One decklist parser**: `decks::decklist::parse` is the only
  `Decklists.parse/2` port. `trade::list_source::text` maps its entries
  (and loads printing set code / collector number); `ai::deck_source` was
  deleted in favour of `trade::list_source::resolve`. The canonical parser
  took the stricter details of the copies after checking `decklists.ex`:
  `\R` line breaks (lone `\r`, U+2028, …), ASCII-only `\d`/`\s` in the line,
  printing, and finish patterns (no `u` flag in Elixir), and a quantity
  beyond `i64` saturates instead of becoming 1 (Elixir integers are
  unbounded, so the deck card then fails "quantity must be less than
  10000").
- **`ai::decks`**: `get` and `deck_cards` now read through
  `decks::model::load_deck` / `decks::contents::load_deck_contents`;
  `by_share_token` is gone. `list_ids` and `save_analysis` (columns only AI
  writes; there is no deck cache to invalidate) stay.
- **Vendor price SQL**: `catalog::price::price_value_sql` branches on the
  finish outside the vendor subquery, so a column finish (`i.finish`) works
  with the SQLite bundled with sqlx; `collection::filters::price_value_sql`
  now delegates to it. Test: `catalog::tests::prices` checks every price
  variant with the finish read from a column (it failed with "no such
  column: i.finish" before).

## Flaky test fixed

`web::tests::graphql_csrf::transport_batches_run_each_query` failed about
one run in four. Cause: async-graphql 7.2 resolves query fields with
`FuturesUnordered` and inserts each into the response map as it completes
(`resolver_utils::container::do_resolve_container`), so response field
order followed completion order — for every query, not just in the test.
`graphql::order::ResponseOrder` (registered in `graphql::build_schema`)
remembers the parsed document and reorders the response along the
selection sets (`CollectFields` order: fields, fragment spreads, inline
fragments, aliases, lists). Unit tests in `graphql::order`; the CSRF test
passed 25/25 runs afterwards. The public share schema
(`web::public_graphql`, being ported separately) should register the same
extension.

## Deliberate differences

- Introspection `defaultValue`s: the Absinthe SDL dump has no argument
  defaults, and the Rust schema declares none (to keep `sdl_diff` at zero),
  so introspection shows `defaultValue: null` where Absinthe would show
  e.g. `"1"` for `allocateDeckCardProxy(quantity:)`. Resolvers apply the
  same defaults. (`schema_domain_contract_test.exs` asserts that one
  introspected default; not ported.)
- Errors where Elixir raised (`get_*!/1`): `node` on a missing collection
  item, location, deck, deck card, or token item reads "… was not found.";
  `addCollectionItemToDeck`/`allocateDeckCardItem` with a missing item read
  "Collection item was not found.".
- `addCollectionItemToDeck`/`bulkAddCollectionItemsToDeck` treat
  `zone: null` like an omitted zone (mainboard). Elixir raised on the
  single add (`zone == nil` in a query) and failed the bulk add with "zone
  can't be blank"; async-graphql also reads an unset `$zone` variable as
  `null`, which Absinthe treated as omitted. An invalid zone is "zone is
  invalid" after the deck's archive/link checks, as in `AddCardToDeck`.
- `node` on a type that exists but is not a node reads "Type `X' is not a
  valid node type" (Absinthe's message), checked against the schema
  registry.
- `allocateDeckCardProxy`/`deallocateDeckCardProxy` with an invalid
  quantity report the deck card's errors (missing, archived, considering)
  first, as `ProxyAllocation` validated the quantity last;
  `previewBulkAllocateDeck` with an invalid mode reports a missing deck
  first (`get_deck!` ran before the mode check).

## Left as is (with reasons)

- `ai::tools::collection_status` keeps its own `CollectionStatus` port,
  which counts only copies allocated to **active** decks (Elixir's
  behaviour, which deck intel fixed for EDHREC/Recommander). Switching it
  to `manavault_allocation::requirement_statuses` changes what the model is
  told, and the tool description sent to the model (copied verbatim) says
  "another active deck"; changing both is a product decision.
- `trade::collection_check::holdings` computes requirement statuses itself
  (owned copies outside list locations, every allocation of the card); it
  is equivalent to `manavault_allocation::requirement_statuses` but returns
  trade-specific shapes. Not merged to keep the trade tests' exact
  semantics untouched.
- `trade::list_source::local::deck` reads the shared deck's cards with its
  own small query (names, quantities, zones) — not allocation logic.

## Elixir bugs found

None new beyond those already documented by the area notes.

## lotus

No new gaps. (The pasted-decklist parser gap the trade and AI notes mention
remains; there is now one app-side copy instead of three.)

## Foundation changes

- `graphql/mod.rs`: `pub mod node; pub mod order;`, `NodeQueries` replaces
  `SystemQueries`, `SystemMutations` removed, `deck_intel::AllocationMutations`
  merged, `.extension(order::ResponseOrder)`.
- `graphql/system.rs`: placeholder `ping`/`noop` removed.
- `graphql/relay.rs`: `NodeKind::from_type_name` public, `decode_global_id`,
  `node_field_id`, `parse_internal_id` (replacing the unused
  `node_field_raw`).
- `collection/loader.rs`: `ItemKey` and `DeckKey` loads (`items`, `deck`).
- `manavault-allocation`: `StatusInput`, `statuses_in`.
- The seven node types' `id` resolvers are `pub` (the `Node` interface
  calls them).
- `decks::tests` / `decks::tests::support` are `pub(crate)` so the
  allocation GraphQL tests reuse the deck fixtures.

## Tests

New: `deck_intel::allocation_tests` (10: add-to-deck incl. errors, status
candidates + allocate/deallocate + `allocationDecks.deck` visibility,
proxies incl. error order, bulk preview + bulk allocate, pull list,
`allocationDecks` across five items, bulk add incl. zones, bulk deallocate,
`node` for every kind and every id error), `graphql::order` (2),
`decks::decklist` line-break/printing/quantity parsing, the column-finish
price check, the AI deck selections of `ai_test.exs` (`analyzeDeck { deck }`,
`deckAnalysisJob { deck { … } }`), local want/binder links in
`analyzeDeckList`, and candidates in the deck page batching test. Ported
from `deck_allocations_test.exs`, `deck_bulk_allocations_test.exs`,
`deck_allocation_batching_test.exs` (candidates, bulk add),
`collection_allocation_decks_batching_test.exs` (deck field),
`schema_domain_contract_test.exs` (node), and `ai_test.exs`. Query-count
assertions are not ported (no query telemetry); candidates, items, and
allocation decks load in one batch per request through the collection
DataLoader.
