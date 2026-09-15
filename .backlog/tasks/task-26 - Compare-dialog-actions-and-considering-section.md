---
id: TASK-26
title: Compare dialog actions and considering section
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 00:16'
updated_date: '2026-08-03 00:34'
labels: []
dependencies: []
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deck compare adds/cuts become actionable (add adds to the considering pile, tag cuts as consider_cutting), and the deck UI presents sideboard+maybeboard as one Considering section (presentation-level; zones, exports, and diff semantics unchanged).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Compare dialog add rows can add the card to the deck's considering pile
- [x] #2 Compare dialog cut rows can tag the matching deck cards as consider_cutting
- [x] #3 Deck detail shows one Considering section combining sideboard and maybeboard
- [x] #4 Add and move zone pickers offer Considering instead of separate sideboard and maybeboard options
- [x] #5 Existing zone data, exports, imports, and diff behavior are unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inline backend: deck_diff cut rows carry deckCardIds (relay), tests, codegen. 2. Parallel frontend: 26.2 compare actions, 26.3 considering presentation merge. 3. Gates + browser smoke, finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gates: mix test 469, mix format --check-formatted, credo (1 pre-existing warning), typecheck, lint, vp fmt, react tests, vite build. docs/features.md updated. Smoke deck mutations reverted precisely (pre-existing July consider_cutting tags preserved).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Compare dialog diffs are now actionable (add adds to Considering, tag cuts/downward changes consider_cutting, per-row + bulk) and the deck UI presents sideboard+maybeboard as a single Considering section, presentation-only. Verified by the full suite and a browser walkthrough.
<!-- SECTION:FINAL_SUMMARY:END -->
