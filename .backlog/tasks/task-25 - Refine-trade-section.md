---
id: TASK-25
title: Refine trade section
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 23:29'
updated_date: '2026-08-03 00:12'
labels: []
dependencies: []
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Round 2 on the trade feature: cancel equal basic-land counts in deck diff, accept other ManaVault instances' share links, redesign the binder trade toggle as a centered liquid-glass button, add wants entry points (cards view printing actions, printing-resolving search), and shareable ManaVault wants lists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deck diff hides basic lands with equal counts on both sides and shows only net differences
- [x] #2 Share links from other ManaVault instances resolve for matching and diffing
- [x] #3 Trade binder tiles show a large centered circular glass toggle
- [x] #4 Wants can be added from card detail printings and via printing-specific search
- [x] #5 Wants list is shareable via public link, viewable and matchable like deck shares
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend wave: 25.1 (diff basics), 25.2 (wants printing + share), 25.3 (remote instance fetch) in parallel with fixed contracts. 2. Migrate, mix test, codegen. 3. Frontend wave: 25.4 + 25.5 in parallel. 4. Verify gates + browser smoke, finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gates: mix test 467, credo (1 pre-existing warning in untouched bulk_data.ex), mix format, vp fmt, lint, typecheck, react tests 15, vite build. docs/features.md updated. Smoke-test data cleared from dev DB (wants + share token rows).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Round 2 shipped: name-keyed basic-land cancellation in deck diff, cross-instance ManaVault share fetching (decks + wants), centered liquid-glass trade toggle, Add to wants from card printings, printing-pinned wants, and public wants sharing. Verified by the full test suite and an end-to-end browser walkthrough of each flow.
<!-- SECTION:FINAL_SUMMARY:END -->
