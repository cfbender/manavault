---
id: TASK-25.1
title: Cancel equal basic land counts in deck diff
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 23:29'
updated_date: '2026-08-02 23:56'
labels: []
dependencies: []
parent_task_id: TASK-25
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deck compare should never show +N and -N of the same basic land; basics aggregate by card name across both sides and appear only when net counts differ.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Equal basic land counts on both sides produce no diff rows even when oracle resolution differs
- [x] #2 Differing basic counts surface as a single net row
- [x] #3 ExUnit coverage for equal, differing, and one-sided basic land cases
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
DeckDiff: classify basics (card type_line starts_with Basic Land; name fallback for unresolved entries), aggregate basics by card name on both sides, cancel equal counts, emit net rows only. Tests for equal/differing/one-sided.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Basics now aggregate by name in a parallel pipeline; equal counts cancel across oracle mismatches; net-only rows. Validated: full suite 467 passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DeckDiff splits basic lands into a name-keyed diff (type_line classification, name fallback for unresolved entries): equal counts cancel entirely, differing counts emit one net change/add/cut row. Verified by new ExUnit cases within the 467-test green suite.
<!-- SECTION:FINAL_SUMMARY:END -->
