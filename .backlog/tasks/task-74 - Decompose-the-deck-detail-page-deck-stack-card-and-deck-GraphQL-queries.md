---
id: TASK-74
title: 'Decompose the deck detail page, deck stack card, and deck GraphQL queries'
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
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
- [ ] #1 detail-page.tsx is composition and layout only, under 300 lines, with route and overlay transitions handled by a reducer or hook rather than corrective effects
- [ ] #2 deck-stack-card.tsx is split into interaction hooks and presentational pieces with no component over 300 lines
- [ ] #3 Deck GraphQL documents are colocated with the feature slice that uses them and shared selections use fragments
- [ ] #4 aube run typecheck, lint, and test:react pass and deck detail, allocation, tags, and playtest flows are verified in a browser
<!-- AC:END -->
