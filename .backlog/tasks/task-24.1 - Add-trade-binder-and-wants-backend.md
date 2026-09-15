---
id: TASK-24.1
title: Add trade binder and wants backend
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 22:14'
updated_date: '2026-08-02 23:24'
labels: []
dependencies: []
parent_task_id: TASK-24
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Persist up-for-trade state on collection items and a trade wants list, exposed through GraphQL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 collection_items has an indexed for_trade boolean settable via existing update and bulk update mutations
- [x] #2 collectionItems query filters by forTrade and items expose forTrade
- [x] #3 trade_wants table keyed by oracle_id supports create-by-name, quantity update, delete via GraphQL
- [x] #4 ExUnit tests cover wants CRUD and for_trade filter
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Migration adds collection_items.for_trade (boolean, default false, indexed) and trade_wants (oracle_id FK unique, quantity). CollectionItem schema/changesets cast for_trade; item_queries/base.ex gains for_trade filter. New Manavault.Trade context with Want schema and CRUD (create by card name via existing name lookup). GraphQL: for_trade on collection_item type/filters/update input; new trade_operations.ex + trade_types.ex for wants; wire into root.ex. ExUnit tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: migrations 20260802000000/1, CollectionItem.for_trade + filter, Manavault.Trade wants context, trade GraphQL types/ops. 97 backend tests green (trade + collection).

Validation: mix test full suite 418 passed; forTrade toggle exercised in browser (mark/unmark, count updates, only-for-trade filter); updateCollectionItem input carries forTrade end to end.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added collection_items.for_trade (indexed) + trade_wants (oracle_id unique, quantity) via migrations; Manavault.Trade context with wants CRUD (create-by-name with duplicate quantity bump); for_trade wired through CollectionItem changesets, item query filter, and GraphQL (collection_item field/filters/update input, trade_want type, tradeWants query, create/update/deleteTradeWant mutations). Verified with ExUnit (trade_test, collection for_trade facet test, schema contract test) and live browser toggling on /trade.
<!-- SECTION:FINAL_SUMMARY:END -->
