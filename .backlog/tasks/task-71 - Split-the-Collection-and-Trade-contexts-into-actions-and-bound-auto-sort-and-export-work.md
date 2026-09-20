---
id: TASK-71
title: >-
  Split the Collection and Trade contexts into actions and bound auto-sort and
  export work
status: Done
assignee:
  - '@cody'
created_date: '2026-09-20 16:34'
updated_date: '2026-09-20 16:48'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Structural review against the developing-elixir standard: Manavault.Catalog.Collection (435 lines) owns bulk transactions, queries, raise Ecto.NoResultsError for expected missing ids, auto-sort rule replacement, and exports; Manavault.Catalog.Collection.AutoSort (527 lines) loads every eligible item and updates one by one inside a single transaction; Manavault.Trade builds queries and handles upsert conflicts inline; collection CSV/text export materializes up to 100k rows synchronously through QueryResolvers.collection_export_csv/text; Manavault.Catalog.Util is a catch-all imported across catalog and trade. Scope is lib/manavault/catalog/collection.ex, collection/*, card_collection/*, lib/manavault/trade.ex, trade/*, and the export resolvers in lib/manavault_web/schema/catalog/query_resolvers.ex. Do not modify decks*, ai*, backup*, scryfall/*, or other schema files; other tasks own those.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Manavault.Catalog.Collection and Manavault.Trade delegate to action modules and contain no transactions or query construction
- [x] #2 Bulk collection operations return {:error, {:not_found, ids}} for missing ids instead of raising, covered by tests
- [x] #3 Auto-sort processes items in bounded batches with one transaction per batch, with a test covering more items than one batch
- [x] #4 Collection exports stream or page through items instead of a single 100k-row read, and behavior is covered by tests
- [x] #5 Manavault.Catalog.Util functions are moved to owning modules only where no other task owns the importing file; otherwise leave Util in place
- [x] #6 mix test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract collection bulk update, trade quantity, auto-sort-rule replacement, and export workflows into verb-named action modules; make Collection a thin delegating context.
2. Split auto-sort query construction, rule normalization/matching, and batched application into focused modules using keyset batches and one transaction per write batch while preserving dry-run results.
3. Extract Trade queries and want creation/upsert handling, leaving Trade as delegations and lightweight presentation behavior.
4. Add regression tests for missing bulk IDs, auto-sort exceeding one batch, and paged exports; translate bulk not-found results in CollectionMutations.
5. Run focused tests, full mix test, strict Credo, and GraphQL codegen; confirm generated GraphQL files are unchanged, record final evidence, and commit locally.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented focused collection item, bulk update/delete, trade quantity, auto-sort rule replacement, export, and trade want query/action modules. Auto-sort now keyset-pages 100 items and commits each batch independently; exports use Repo.stream with max_rows: 100 inside a transaction. Catalog.Util remains unchanged because normalize_filter/parse_quantity/decode_json/positive_quantity all have consumers in explicitly out-of-scope deck, AI, search, schema, or other shared files.
Validation: focused suite 87 passed; full suite 680 passed; mix credo --strict found no issues; aube codegen completed against a supervised Phoenix server and assets/react/src/gql had no diff.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Split the Collection and Trade contexts into focused actions and queries, replaced expected missing-id exceptions with tagged errors translated by GraphQL, batched auto-sort writes, and streamed collection exports. Verified with 680 passing tests, strict Credo, regression coverage above both 100-item batch sizes, and schema codegen with no generated GraphQL changes.
<!-- SECTION:FINAL_SUMMARY:END -->
