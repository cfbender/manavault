---
id: TASK-14
title: Add sort options to card catalog search
status: Done
assignee:
  - '@cfb'
created_date: '2026-07-17 04:17'
updated_date: '2026-07-17 04:35'
labels:
  - enhancement
dependencies: []
priority: medium
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The /cards catalog search (CardsPage -> cards(q:) GraphQL -> Catalog.search_cards/2) always orders by card name ascending. Add user-selectable sort options (field + direction) that flow through React UI -> GraphQL -> Ecto query, mirroring the existing collection-item sort pattern (CardCollection.ItemQueries + collection SortDropdown).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GraphQL cards query accepts an optional sort input (field, direction) with name ascending as the default
- [x] #2 Catalog.search_cards/2 applies the requested sort (name, mana value, color, type) with a deterministic tiebreaker
- [x] #3 Unknown or missing sort fields/directions fall back to name ascending
- [x] #4 Card search page exposes a sort control that updates the URL and re-runs the query
- [x] #5 Sort selection survives navigation to card detail and back
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend: extract sort normalization + order_by into Search.Cards (sort opt on search_cards/2; fields name/cmc/colors/type, default name asc, oracle_id tiebreaker). 2. GraphQL: add card_sort input object + sort arg on cards connection; resolver passes sort map through. 3. Frontend: generic SortDropdown component (props for options), cards page sort state in URL (?sort=name:asc), pass to CardsDocument. 4. Verify: mix test for catalog search, GraphQL query test, browser smoke test of /cards sort control.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: mix test (321 passed) covers all 7 sort fields + fallback in catalog_test.exs and card_queries_test.exs. Frontend: typecheck/lint/format/build clean; browser-verified sort dropdown changes results + URL, default clears param, sort survives detail round-trip.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added sort options (name, mana value, color, type, release date, rarity, price; asc/desc) to the card catalog search. Sort flows: /cards URL ?sort=field:direction -> CardsDocument sort variable -> GraphQL CardSort input -> Catalog.search_cards/2 -> Ecto order_by with oracle_id tiebreaker (aggregates across printings for released/rarity/price via max/min). SortDropdown extracted to shared components; collection SortDropdown now delegates to it. Unknown fields/directions fall back to name ascending. Verified with mix test (321), GraphQL schema tests, curl smoke test, and browser round-trip.
<!-- SECTION:FINAL_SUMMARY:END -->
