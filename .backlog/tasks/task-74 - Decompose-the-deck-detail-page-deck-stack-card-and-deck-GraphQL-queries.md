---
id: TASK-74
title: 'Decompose the deck detail page, deck stack card, and deck GraphQL queries'
status: Done
assignee:
  - '@cfbender'
created_date: '2026-09-20 16:34'
updated_date: '2026-09-20 17:00'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Structural review against the developing-react standard: assets/react/src/pages/decks/detail-page.tsx (637 lines) combines pagination, tags, selection, allocation, and routing with corrective useEffects that reconcile overlay state; deck-stack-card.tsx (831 lines, 32-prop interface) mixes pointer gestures, focus, mobile hover, menus, allocation, and tags; queries.ts (1272 lines) is a catch-all registry spanning list, detail, analysis, sharing, allocation, EDHREC, and import/export with repeated selections. Scope is assets/react/src/pages/decks/** and its tests, except do not change the bodies of deck-analysis-dialog.tsx, recommander.tsx, deck-combos-dialog.tsx, or edhrec-commander.tsx beyond updating import paths; another task is editing their link rendering.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 detail-page.tsx is composition and layout only, under 300 lines, with route and overlay transitions handled by a reducer or hook rather than corrective effects
- [x] #2 deck-stack-card.tsx is split into interaction hooks and presentational pieces with no component over 300 lines
- [x] #3 Deck GraphQL documents are colocated with the feature slice that uses them and shared selections use fragments
- [x] #4 aube run typecheck, lint, and test:react pass and deck detail, allocation, tags, and playtest flows are verified in a browser
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract deck detail loading, grouping, mutations, and overlay/route state into focused hooks, then compose existing detail sections through thin page and dialog/content components.
2. Split deck stack card interaction state, action menus, tag/allocation controls, image rendering, and unstacked selection into focused modules with grouped typed props.
3. Move GraphQL documents from the catch-all registry into feature-owned document modules, sharing repeated deck-card/allocation selections through unmasked fragments without changing operations.
4. Regenerate GraphQL types; run typecheck, lint, and React tests; exercise detail, quantity/printing, allocation/tags, dialogs, and playtest in the portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented reducer-owned deck/route overlay transitions, focused detail/grouping/mutation hooks, a dialog launcher, and a split stack-card interaction/rendering hierarchy. Replaced queries.ts with feature document modules and an unmasked shared allocation fragment while preserving operation variables and selections.
Validation: codegen passed against the supervised dev server; aube typecheck and lint passed; test:react passed (197 node tests and 113 Vitest tests across 37 files). Browser verification created a two-copy Sol Ring deck, selected a printing, changed quantity, applied a tag, inspected allocation status, opened analysis/combos/share dialogs, and rendered playtest.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decomposed the deck detail route and stack card into focused hooks/components, replaced the 1,272-line GraphQL registry with feature-owned documents and a shared allocation fragment, and regenerated client types. Verified with typecheck, lint, all 310 React tests, and browser exercise of deck editing, printing, quantity, tags, allocation status, dialogs, and playtest.
<!-- SECTION:FINAL_SUMMARY:END -->
