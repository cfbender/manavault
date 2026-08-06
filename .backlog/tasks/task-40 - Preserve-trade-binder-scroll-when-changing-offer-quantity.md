---
id: TASK-40
title: Preserve trade binder scroll when changing offer quantity
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-06 03:44'
updated_date: '2026-08-06 03:46'
labels: []
dependencies: []
modified_files:
  - assets/react/src/pages/trade/binder-tab.tsx
  - assets/react/test/trade-binder.test.tsx
priority: high
type: bug
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Changing a card's trade quantity currently refetches the binder connection, disrupting the virtualized grid and moving the user's scroll position. Keep the immediate quantity feedback and accurate trade count without replacing the binder result set after each click.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Changing a trade quantity does not refetch the binder collection query
- [x] #2 The card tile updates immediately while the mutation is pending
- [x] #3 A failed mutation restores the prior displayed quantity and reports the error
- [x] #4 The total cards-up-for-trade count refreshes after a successful mutation
- [x] #5 Automated tests cover the no-refetch success path and rollback behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the existing local trade-quantity override as the optimistic display source.
2. Stop refetching the binder connection after a successful mutation, retain the confirmed override, and refresh only the independent count query.
3. Add focused tests for success, count refresh, no binder refetch, and mutation rollback; run frontend checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The binder already had a local quantity override that provides immediate optimistic feedback. The scroll disruption came from refetching the full paginated binder connection after every successful mutation. The success path now keeps the confirmed override and refreshes only the independent trade-count query; mutation failures still remove the override and show the server error.

Validation: focused trade binder tests passed (4 tests), including a deferred success test that proves the optimistic value is visible while pending, the count refreshes, and binder refetch is never called, plus a rejection test that proves rollback. Full React suite passed (183 Node tests and 31 Vitest tests); typecheck and formatting passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Stopped refetching the virtualized binder connection after trade-quantity mutations, preserving scroll position while retaining immediate optimistic updates. Successful changes refresh only the header count; failures roll back the tile and show an error. Verified through focused success/rollback interaction tests and the full React suite.
<!-- SECTION:FINAL_SUMMARY:END -->
