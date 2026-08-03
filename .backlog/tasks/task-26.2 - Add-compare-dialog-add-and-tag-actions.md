---
id: TASK-26.2
title: Add compare dialog add and tag actions
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 00:16'
updated_date: '2026-08-03 00:34'
labels: []
dependencies: []
parent_task_id: TASK-26
ordinal: 37000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add rows add to maybeboard via addDeckCard with per-row pending and done states, disabled for unrecognized names
- [x] #2 Cut rows tag all matching deck cards consider_cutting via updateDeckCardsTag with per-row states
- [x] #3 Deck view reflects changes after acting
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
deck-compare-dialog: per-row actions using AddDeckCard (zone maybeboard) and UpdateDeckCardsTag (consider_cutting), pending/done state, refetch deck.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Compare dialog rows are actionable: per-row 'Add to considering' (addDeckCard zone maybeboard, disabled for unrecognized names) and 'Consider cutting' (updateDeckCardsTag consider_cutting) on cuts and downward changes, plus bulk 'Add all'/'Mark all' header actions with progress; active-query refetch updates the open deck. Verified in browser: Sol Ring added (row -> Added, DB row zone maybeboard) and Sandstorm Verge tagged (row -> Tagged, DB tag consider_cutting); smoke mutations reverted.
<!-- SECTION:FINAL_SUMMARY:END -->
