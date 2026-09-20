---
id: TASK-71
title: >-
  Split the Collection and Trade contexts into actions and bound auto-sort and
  export work
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
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
- [ ] #1 Manavault.Catalog.Collection and Manavault.Trade delegate to action modules and contain no transactions or query construction
- [ ] #2 Bulk collection operations return {:error, {:not_found, ids}} for missing ids instead of raising, covered by tests
- [ ] #3 Auto-sort processes items in bounded batches with one transaction per batch, with a test covering more items than one batch
- [ ] #4 Collection exports stream or page through items instead of a single 100k-row read, and behavior is covered by tests
- [ ] #5 Manavault.Catalog.Util functions are moved to owning modules only where no other task owns the importing file; otherwise leave Util in place
- [ ] #6 mix test passes
<!-- AC:END -->
