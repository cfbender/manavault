---
id: TASK-34
title: Track per-copy trade binder quantities
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-04 19:42'
updated_date: '2026-08-04 20:04'
labels: []
dependencies: []
type: enhancement
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The trade binder currently treats an inventory row as entirely in or out of trade. Change it to track how many owned copies are offered: the first trade-button click offers one copy, later clicks increment the offered quantity, and the quantity remains bounded by copies owned.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The first trade-button click on an unmarked printing sets its offered quantity to one
- [x] #2 Repeated clicks increment the offered quantity up to the total owned quantity, then provide a way to clear the offered quantity
- [x] #3 The trade tile displays the offered quantity without obscuring the owned quantity
- [x] #4 Trade matching, binder totals, and public binder shares use offered quantity rather than all owned copies
- [x] #5 Existing boolean for-trade API inputs remain compatible
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a persisted per-row for-trade quantity, backfill existing marked rows to their full owned quantity, and keep the legacy boolean field synchronized for API compatibility.
2. Add an atomic grouped mutation that distributes a requested offered quantity across the printing group underlying inventory rows.
3. Update trade binder tiles so clicks cycle from zero through owned and back to zero, displaying the offered count as a numeric badge.
4. Use offered quantities in binder totals, matching, and public shares; add migration, domain, GraphQL, and interaction tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented persisted per-copy offer quantities with a legacy boolean compatibility layer, an atomic grouped GraphQL mutation, full-printing trade-filter grouping, quantity-aware matching/count/share behavior, and a binder control that cycles 0 → owned → 0. Added repository-local Amp settings to disable co-author trailers. Validation: development migration applied; mix compile --warnings-as-errors; full mix test (528 passed); frontend formatting; TypeScript typecheck; React tests (182 Node tests and 24 Vitest tests passed); Oracle review findings addressed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trade binder clicks now offer one copy first, increment to the full owned quantity, then clear. Tiles retain the owned count and show offered copies separately; matching, totals, and public shares use only offered copies. Legacy boolean API inputs remain supported. Verified by migration, full backend suite, TypeScript checks, React tests, and focused review.
<!-- SECTION:FINAL_SUMMARY:END -->
