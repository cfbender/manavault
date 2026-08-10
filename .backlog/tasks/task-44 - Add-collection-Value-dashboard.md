---
id: TASK-44
title: Add collection Value dashboard
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-08-10 21:40'
updated_date: '2026-08-10 21:53'
labels: []
dependencies: []
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move collection valuation out of the inventory header into a dedicated Value tab. Show source-dependent whole-collection market value and purchase basis, compact visual comparisons, and the collection positions with the five biggest gains and losses. The dashboard must refresh after pricing-source changes without relying on paginated inventory data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Collection includes a persisted Value tab and ordinary inventory tabs no longer show the valuation summary
- [x] #2 Value tab shows whole-collection market value, purchase basis, absolute and percentage gain or loss, with useful compact visualization
- [x] #3 Value tab shows up to five biggest gain positions and up to five biggest loss positions using selected-vendor current prices
- [x] #4 Changing pricing source causes the Value tab to fetch and display current source-dependent valuation data
- [x] #5 Backend and frontend tests cover aggregate and ranking behavior, including empty states
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an uncoupled collection valuation dashboard query that aggregates the whole collection and ranks printing positions by total selected-source market gain or loss.
2. Add a dedicated persisted Value tab, remove valuation from the inventory header, and render accessible summary, comparison/distribution visuals, ranking lists, and loading/error/empty states.
3. Invalidate server aggregates when pricing data or source changes, and reset Apollo data so an open or subsequently opened Value tab performs a fresh query.
4. Add focused catalog, GraphQL, and React tests; regenerate GraphQL types; and run the full test and quality suites.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: 586 ExUnit tests passed; 236 React/Node tests passed; TypeScript typecheck, strict Credo, frontend lint, formatting, and production build passed. A live local GraphQL query against the user collection returned selected-source totals, position counts, and five ordered gains/losses. Component tests exercised the Value tab, persistence decoder, dashboard visual labels, rankings, and empty state. Amp portal startup was unavailable on this non-orb macOS executor; the user had already opted to test locally.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved collection valuation into a dedicated Value dashboard with market-vs-basis and position-distribution charts, top-five gains/losses, selected-source labeling, and explicit empty/error/loading states. Fixed pricing-source and vendor-sync cache invalidation plus Apollo refresh so totals update. Verified with full backend/frontend suites and local live GraphQL data.
<!-- SECTION:FINAL_SUMMARY:END -->
