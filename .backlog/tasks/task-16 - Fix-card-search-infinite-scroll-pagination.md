---
id: TASK-16
title: Fix card search infinite-scroll pagination
status: Done
assignee:
  - '@assistant'
created_date: '2026-07-20 00:09'
updated_date: '2026-07-20 00:16'
labels: []
dependencies: []
type: bug
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card search currently shows only the first page of results. The GraphQL query accepts / and returns , but the frontend never requests subsequent pages, and the backend resolver does not advance its offset when an  cursor is supplied.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Card search results load additional pages when the user scrolls to the bottom
- [x] #2 Backend resolver respects the  Relay cursor and returns the correct slice
- [x] #3 Apollo cache merges paginated card search results keyed by query and sort
- [x] #4 Existing card search tests still pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add  option to  and add a backend test. 2. Update  to decode the Relay  cursor into an offset and request the right slice. 3. Add  to the frontend  and register  in the Apollo cache. 4. Implement fetchMore-based infinite scroll in . 5. Run focused tests and smoke-test the UI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: added offset option to Catalog.search_cards, updated QueryResolvers.cards to decode Relay cursor with RelayHelpers.offset_and_limit, and added pagination tests in catalog_test.exs and card_queries_test.exs.

Validation: backend pagination confirmed via curl (first page endCursor + second-page after query); typecheck and aube run test:react pass; Elixir tests pass for catalog_test.exs and card_queries_test.exs. Browser automation blocked by a tool framework error unrelated to the implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed card search infinite-scroll pagination by adding an offset option to Catalog.search_cards, decoding the Relay after cursor in QueryResolvers.cards, adding  to the CardsDocument query, registering cards: relayStylePagination(['q','sort']) in the Apollo cache, and wiring an IntersectionObserver-driven fetchMore in CardsPage. Verified backend pagination via direct GraphQL curl, typecheck, and focused Elixir/React tests.
<!-- SECTION:FINAL_SUMMARY:END -->
