---
id: TASK-38
title: Add sorting and filtering to trade binder search
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-06 03:26'
updated_date: '2026-08-06 03:29'
labels: []
dependencies: []
modified_files:
  - assets/react/src/pages/trade/binder-tab.tsx
  - assets/react/test/trade-binder.test.tsx
priority: medium
type: feature
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Improve the trade binder so users can narrow and order their collection while choosing cards to offer. Deck-allocated cards should be excluded by default, with an explicit control to include them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Trade binder results can be sorted using the supported collection sort options and directions
- [x] #2 Trade binder results can be filtered using the supported collection filters
- [x] #3 Cards allocated to a deck are excluded by default
- [x] #4 A toggle includes deck-allocated cards when enabled
- [x] #5 Relevant automated tests cover the new query behavior and controls
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse the collection filter modal and sort dropdown in the trade binder.
2. Combine the debounced binder search with structured filter syntax, and default queries to unallocated items unless the include-allocated toggle is enabled.
3. Add focused UI tests for default query variables and interactive controls, then run frontend format, typecheck, tests, and the design detector.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the trade binder controls by reusing the collection sort dropdown and structured filter modal. Binder queries now set unallocatedOnly by default and remove it when Include deck cards is enabled.

Validation: frontend typecheck passed; all React tests passed (183 Node tests and 29 Vitest tests); focused trade binder tests passed; formatting passed; Impeccable detector returned no findings; lint completed with two pre-existing warnings in buylist-marketplace-actions.test.tsx.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added collection sorting and structured filters to the trade binder, with deck-allocated cards excluded by default and an Include deck cards toggle. Verified query variables and interactions through focused DOM tests, then passed the full React suite, typecheck, formatting, and design detector.
<!-- SECTION:FINAL_SUMMARY:END -->
