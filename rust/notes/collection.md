# Collection and locations

## Ported

| Elixir                                                                                                                                                                                      | Rust                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Catalog.CollectionItem` (schema, `create_changeset`/`update_changeset`, for-trade sync)                                                                                                    | `collection::item` (`CollectionItemRecord`, `collection_item_query!`, `CollectionItem`), `collection::changes` (`ItemChanges`, `create`, `update`)             |
| `Collection.Items`, `ItemAttrs` (finish coercion, default purchase price, finish availability)                                                                                              | `collection::changes::{create_in, create, update, delete, preferred_finish}`                                                                                   |
| `Collection.BulkUpdateItems`, `SetTradeQuantity`, `DeleteItems`                                                                                                                             | `collection::changes::{bulk_update, set_trade_quantity, delete_many}`                                                                                          |
| `Catalog.Location`, `Collection.Locations`                                                                                                                                                  | `collection::location` (`LocationKind`, `LocationRecord`, `location_query!`, `Location`/`Place`, `create`/`update`/`delete`/`list`/`count`/`auto_sort_target`) |
| `CardCollection.ItemQueries.Base`, `SearchFilter.*` (text/color/scalar predicates)                                                                                                          | `collection::filters` (`ItemFilters`, `LocationFilter`, `base_query`, `search_filter`, `Sort`) — card/printing predicates reuse `catalog::search::predicates`  |
| `CardCollection.ItemQueries` (items, groups, totals, ids, stream), `ItemQueries.ValueSummary` (value summary, dashboard, location summaries)                                                | `collection::queries`                                                                                                                                          |
| `Collection.Export`, `ExportCollection`, `Catalog.CSV`                                                                                                                                      | `collection::export`                                                                                                                                           |
| `Catalog.CollectionImport` (CSV/TXT parsing, attrs)                                                                                                                                         | `collection::import::parse`                                                                                                                                    |
| `Collection.Import` (preview, commit, auto-sort preview, token rows)                                                                                                                        | `collection::import`                                                                                                                                           |
| `Catalog.AutoSortRule`, `ListAutoSortRules`, `ReplaceAutoSortRules`, `AutoSort.{Rules, Query, RuleMatcher, Apply}`                                                                          | `collection::auto_sort::{rules, matcher}`, `collection::auto_sort` (`run`, `run_in`)                                                                           |
| `Collection.BulkClean`                                                                                                                                                                      | `collection::bulk_clean`                                                                                                                                       |
| `Catalog.Dataloader` collection batches (allocations, total owned copies, location value summaries, cover printings)                                                                        | `collection::loader` (`DataLoader<CollectionLoader>`, registered in `graphql::build_schema`)                                                                   |
| `CollectionTypes`, `CollectionFields`, `ValueResolvers`                                                                                                                                     | `collection::graphql::{types, values, tools}`                                                                                                                  |
| `CollectionOperations`, `LocationOperations`, `CollectionMutations`, `LocationMutations`, `ImportResolvers`, `CollectionSelector`, collection parts of `QueryResolvers`/`MutationResolvers` | `collection::graphql::{queries, mutations, inputs}`                                                                                                            |

For other areas: `CollectionItem::load`/`load_many`, `item::load_items(conn, ids)`
(works inside a transaction), `Location::load`/`load_many`, `Location::stored(record)`,
`queries::{list_items, totals, allocations, owned_copies, location_summaries}`,
`filters::{ItemFilters, base_query, price_cents_sql, ALLOCATED_SQL, NOT_LIST_SQL}`,
`changes::{create_in, move_to, set_quantity}`, `graphql::selected_ids` (resolves a
`CollectionItemSelector`), and the GraphQL types `CollectionItem`, `Location`,
`CollectionItemConnection`, `LocationConnection`, `CollectionValueSummary`.

## GraphQL

Types: `CollectionItem`, `Location`, `CollectionItemAllocationDeck` (`quantity`),
`CollectionItemGroup`, `CollectionItemConnection`/`Edge`,
`CollectionItemGroupConnection`/`Edge`, `LocationConnection`/`Edge`, `HomeSummary`,
`CollectionValueSummary`, `CollectionValueDashboard`, `CollectionValuePosition`,
`CollectionAutoSortRule`/`Move`/`Result`, `CollectionBulkCleanPull`/`Card`/`Result`,
`CollectionImportAttrs`/`Row`/`Preview`/`Result`, every collection/location input,
and the payloads below.

Queries: `homeSummary`, `collectionItems`, `collectionItemGroups`,
`collectionItemCount`, `collectionItemEntryCount`, `collectionValueSummary`,
`collectionValueDashboard`, `collectionExportCsv`, `collectionExportText`,
`collectionAutoSortRules`, `collectionBulkClean`, `locations`, `location`.

Mutations: `createCollectionItem`, `updateCollectionItem`, `bulkUpdateCollectionItems`,
`setCollectionItemsForTradeQuantity`, `removeBulkCleanPulls`,
`bulkDeleteCollectionItems`, `deleteCollectionItem`, `updateCollectionAutoSortRules`,
`autoSortCollection`, `previewCollectionImport`, `previewCollectionImportAutoSort`,
`commitCollectionImport`, `createLocation`, `updateLocation`, `deleteLocation`.

`sdl_diff.py` shows no differences in this area except: `implements Node` on
`CollectionItem` and `Location` (integrator adds `Node`), the deferred fields
below, and a parser artifact: the script reads `scalar Json` as swallowing the
type that follows it alphabetically (`Location`), so it reports "missing type
Location" and odd `scalar Json.*` lines; the `Location` type matches field by
field.

## Deferred to integration (marked `// TODO(integration):`)

- `CollectionItemAllocationDeck.deck: Deck!` — the struct keeps `deck_id`
  (`collection::graphql::types`).
- `addCollectionItemToDeck` and `bulkAddCollectionItemsToDeck` (with their
  payloads) — `collection::graphql::mutations`; use `inputs::selected_ids` for
  the selector.

## Deliberate differences

- Missing records return GraphQL errors instead of raising (Elixir 404/500):
  `updateCollectionItem`/`deleteCollectionItem` → "Collection item was not
  found."; `location(id:)` → "Location was not found." (`Errors.not_found_error(:location)`).
- Database failures return "Something went wrong." (`graphql::internal_error`).
- A missing printing, location, or cover printing on create/update is the
  changeset error Ecto's `foreign_key_constraint/2` would give
  (`scryfall_id does not exist`, `location_id does not exist`,
  `cover_scryfall_id does not exist`); Elixir raised (SQLite FK errors carry no
  constraint name). `updateCollectionItem` with `scryfallId: null` is
  "scryfall_id can't be blank" (Elixir hit the NOT NULL constraint).
- Exports load the matching items in chunks instead of `Repo.stream`.
- `autoSortCollection` runs in one write transaction (Elixir: one per batch of
  100); dry runs use a plain connection.
- `homeSummary.collectionCount` goes through the joined collection query
  (Elixir skipped the printing/card joins for the unfiltered count; equal
  unless a printing lacks its card).
- Collection SQL prices use `filters::price_value_sql()`, which branches on
  `i.finish` outside the vendor-price subquery. `catalog::price::price_value_sql("p", "i.finish")`
  puts the outer column in the subquery's `ORDER BY`, and the SQLite bundled
  with sqlx (3.51.3) rejects that with "no such column: i.finish" (the 3.53
  CLI accepts it). **Other areas that pass a column as the finish (deck cards)
  will hit the same error**; the integrator may want to move this fix into
  `catalog::price`.

## Elixir bugs found (fixed here)

1. `CollectionImport.normalize_condition/1` replaced `[^a-z0-9]+` before
   lower-casing, so `NM`, `LP`, `Lightly Played`, ... all imported as
   near mint. Conditions are matched case-insensitively here.
2. `CollectionImport.normalize_finish/1` did not lower-case, so `Foil`/`FOIL`
   imported as nonfoil. Matched case-insensitively here.

## lotus

No gaps hit. `Finish`, `Condition`, `Quantity` decode the item columns;
`lotus::card::is_token_layout` drives token import rows.

## Foundation changes

- `lib.rs`: `pub mod collection;`
- `graphql/mod.rs`: merged `CollectionQueries`/`CollectionMutations`; registered
  `collection::loader::data_loader`.

## Tests

86 tests in `collection::` (unit tests in `import::parse`, `changes`,
`auto_sort::matcher`, `graphql::values`, and `collection::tests::{items, import,
auto_sort, bulk_clean, locations, schema}`), ported from
`collection_test.exs`, `collection/import_preview_batching_test.exs`,
`collection_bulk_clean_test.exs`, `collection_import_csv_test.exs`,
`collection_items_test.exs`, `collection_queries_test.exs`,
`collection_item_selector_test.exs`, `bulk_update_collection_items_batching_test.exs`,
`locations_and_imports_test.exs`, `collection_allocation_decks_batching_test.exs`
(quantities and deck order; the `deck` field is deferred), and the home summary
and count-invalidation tests of `schema_test.exs`/`catalog_test.exs`. Decks and
allocations are inserted with SQL. Query-count assertions are not ported; the
Rust code batches the same lookups (bulk Scryfall-id resolution, one loader
query per field across items).

## Left undone

- The deferred deck field and mutations above.
- `collectionCheck`/`CollectionCheck*` are not in this area (deck intel).
