---
id: TASK-24
title: Add trade section
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 22:14'
updated_date: '2026-08-02 23:24'
labels: []
dependencies: []
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
New Trade area: mark collection items up-for-trade from a collection-style binder view, maintain a card wants list, paste/link decklists or trade lists from Moxfield/Archidekt/ManaBox/ManaVault to find matches against binder and wants, and diff external decklists against ManaVault decks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Trade nav tab lands on binder, wants, and matches views
- [x] #2 Collection tiles in trade binder toggle up-for-trade state
- [x] #3 Wants can be added via card search and managed
- [x] #4 Pasted or linked external lists produce binder/want matches
- [x] #5 External decklist can be diffed against a ManaVault deck showing adds and cuts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend wave: TASK-24.1 and TASK-24.2 in parallel (shared GraphQL contract fixed up front). 2. Run migration, mix test, regenerate frontend gql types via codegen against local schema. 3. Frontend wave: TASK-24.3 and TASK-24.4 in parallel. 4. Verify: mix test, typecheck, react tests, browser smoke of trade flows.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Full gates: mix compile --warnings-as-errors, mix test (418), credo --strict (1 pre-existing warning in untouched scryfall/bulk_data.ex), vp fmt --check, lint, typecheck, test:react (15), vite build — all green. docs/features.md gained a Trade section. Dev DB test artifacts (wants, for_trade flags) removed after smoke.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trade section shipped: binder toggle on collection tiles, wants list with card search, list/URL matching (Moxfield/Archidekt/local share links + pasted text) against binder and wants, and deck Compare diff. Verified by 418 backend tests, react tests, typecheck/build, and an end-to-end browser walkthrough of every flow.
<!-- SECTION:FINAL_SUMMARY:END -->
