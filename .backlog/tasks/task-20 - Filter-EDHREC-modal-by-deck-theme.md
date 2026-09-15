---
id: TASK-20
title: Filter EDHREC modal by deck theme
status: Done
assignee:
  - '@cfb'
created_date: '2026-07-28 17:11'
updated_date: '2026-07-28 17:27'
labels: []
dependencies: []
references:
  - 'https://edhrec.com/commanders/zirda-the-dawnwaker/cycling'
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Commander EDHREC data should support choosing a deck type from the modal so users can inspect theme-specific results, such as Zirda cycling decks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Commander deck types in the EDHREC modal are keyboard- and pointer-clickable
- [x] #2 Selecting a deck type reloads the commander data from the corresponding EDHREC theme page
- [x] #3 The selected deck type is visibly identified and can return to the commander-wide results
- [x] #4 The selected deck type persists in the modal URL across tab and filter changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the deckEdhrec GraphQL query and EDHREC client so an optional commander name/theme slug filters only that commander page and produces the matching themed EDHREC URL. 2. Store the selected commander/theme in deck route search state, include it in Apollo variables and scroll keys, and preserve it across tabs/filter changes. 3. Replace static theme badges with accessible theme buttons plus an All decks reset, showing the selected state. 4. Add focused backend and React behavior coverage, regenerate GraphQL types, run targeted checks, and exercise Zirda's Cycling flow in the browser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: mise exec -- mix test test/manavault/catalog/deck_edhrec_test.exs (3 passed); mise exec -- mix compile --warnings-as-errors; aube run typecheck; focused Vitest (1 passed); aube run lint (only two pre-existing buylist-marketplace-actions warnings). Browser smoke test selected Lumra Lands Matter, observed GraphQL commanderTheme=lands-matter, rendered the themed EDHREC URL, reset to All decks, and retained commander/theme query state through tab and Exclude lands changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added commander-theme filtering end to end: optional GraphQL/client theme inputs fetch and normalize the matching EDHREC commander page, modal deck types are accessible selected-state buttons with an All decks reset, and route/Apollo/scroll state preserve the active theme. Verified with focused backend/frontend tests, strict compile/type checks, and a live themed modal flow.
<!-- SECTION:FINAL_SUMMARY:END -->
