---
id: TASK-24.3
title: Add trade section frontend with binder and wants
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 22:14'
updated_date: '2026-08-02 23:24'
labels: []
dependencies: []
parent_task_id: TASK-24
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Trade nav tab and page with a binder tab (collection grid with per-tile up-for-trade toggle styled like the deck tag overlay) and a wants tab (card search to add, quantity edit, remove).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Trade tab appears in desktop and mobile nav and routes to /trade
- [x] #2 Binder tab renders the virtualized collection grid with a per-tile trade toggle and only-for-trade filter
- [x] #3 Wants tab adds wants via card name search and supports quantity edit and removal
- [x] #4 Typecheck and existing react tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add Trade nav item + /trade route (tab search param). pages/trade: page shell with Binder/Wants/Matches tabs; binder reuses CollectionItemsPageDocument + VirtualizedCollectionGrid with new optional per-tile trade toggle overlay (deck TAG overlay styling) calling updateCollectionItem({forTrade}); wants tab uses card-name-search-field + trade want mutations.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: typecheck, lint, vp fmt, vitest+node tests (15 passed), production build green. Browser: Trade tab in nav, binder grid with per-tile TRADE toggle (aria-pressed, card-named labels, optimistic update, count 2->3->2), only-for-trade filter, wants add-by-search/quantity stepper/remove all exercised. Added GET /trade to Phoenix router (app routes are explicitly declared).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Trade nav item + /trade route (tab search param), TradePage with Binder/Wants/Matches tabs; binder reuses CollectionItemsPageDocument + VirtualizedCollectionGrid with a new optional per-tile for-trade overlay toggle on CardTile (touch-reveal pattern, accessible labels); wants tab uses CardNameSearchField + trade want mutations. Verified via typecheck/tests/build and full browser walkthrough.
<!-- SECTION:FINAL_SUMMARY:END -->
