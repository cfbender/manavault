---
id: TASK-32
title: Group collection and trade cards by printing
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-04 19:07'
updated_date: '2026-08-04 19:37'
labels: []
dependencies: []
type: bug
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Collection and trade card grids currently render separate tiles for inventory rows of the same printing, including rows split by purchase price. These overview grids should present one tile per printing while the individual card page continues showing the underlying rows so purchase prices can be compared.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Collection overview and location grids show one tile per printing with quantities combined across matching inventory rows
- [x] #2 Trade binder shows one tile per printing with quantities combined across matching inventory rows
- [x] #3 The individual card page continues showing separate inventory rows and their purchase prices
- [x] #4 Pagination does not split or duplicate a printing group
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a dedicated printing-group connection that paginates distinct printings and retains every underlying collection row.
2. Switch collection, location, and trade grids to printing groups; flatten member IDs for existing bulk actions and use bulk edit/trade updates for multi-row groups.
3. Leave the card-detail collection query unchanged so it continues showing purchase-price lots separately.
4. Add focused catalog and GraphQL tests, regenerate GraphQL types, and run targeted backend/frontend checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a dedicated printing-group GraphQL connection with distinct-printing pagination and member rows. Collection, location, and trade grids use the grouped connection; actions flatten all member IDs. Selection snapshots retain IDs and finish metadata across pagination/sorting. Mixed-finish and Select all deck actions are disabled because the deck model requires one finish per card. Card detail remains on the raw collectionItems connection.

Validation: 34 focused ExUnit tests passed across catalog collection and collection GraphQL suites; all 203 React tests passed (182 Node + 21 Vitest); TypeScript typecheck and Elixir warnings-as-errors compilation passed; Oracle final review approved with no blockers.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Grouped collection and trade tiles by exact printing while retaining separate purchase-price rows on card detail. Added group-safe pagination, member-aware bulk actions, persistent selection snapshots, and mixed-finish safeguards. Verified with focused backend tests, the full React test suite, typecheck, compilation, and independent review.
<!-- SECTION:FINAL_SUMMARY:END -->
