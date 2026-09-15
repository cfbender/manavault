---
id: TASK-56
title: Show Commander Spellbook combos for decks
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-22 16:18'
updated_date: '2026-08-22 16:44'
labels: []
dependencies: []
references:
  - 'https://backend.commanderspellbook.com/'
type: feature
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let users inspect infinite combos detected by Commander Spellbook directly from a deck action menu. Results load only when requested and are not persisted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each deck three-dot menu exposes an action that opens its Commander Spellbook combo results.
- [x] #2 Opening the action loads the current commander and mainboard card list ad hoc and displays fully included combos with cards, outcomes, instructions, prerequisites, and source links.
- [x] #3 Loading, empty, and external-service error states are clear and retryable without changing deck data.
- [x] #4 The combo dialog works on deck gallery and deck detail layouts at desktop and mobile widths.
- [x] #5 Backend normalization and frontend interaction tests cover successful, empty, and failed lookups.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a read-only Catalog integration and GraphQL query that submits commander and mainboard cards to Commander Spellbook and normalizes fully included variants.
2. Add a reusable lazy combo dialog and wire it to gallery and detail three-dot menus.
3. Cover payload/normalization and menu/dialog states with focused tests, then run typecheck, unit tests, detector, and desktop/mobile UI verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a read-only Commander Spellbook proxy for commander and mainboard cards, a private GraphQL query, and one lazy non-persisting combo dialog shared by deck gallery and detail menus. The mobile confirmation pass removed a local max-height override so the dialog preserves the shared full-height mobile contract.

Validation: 6 focused backend tests, 8 focused frontend tests, all 632 ExUnit tests, 196 model tests, and 86 React tests passed. mix compile --warnings-as-errors, frontend lint, typecheck, production build, targeted format checks, and the Impeccable detector passed. Live browser verification exercised a real Sanguine Bond + Exquisite Blood result at 1440x960 and 390x844 with no browser errors or overflow; finish review disposition: ship. Repository-wide Credo and format checks still report unrelated pre-existing findings in lib/manavault/ai*.ex, assets/react/test/deck-bracket.test.tsx, and aube-lock.yaml.

Post-review polish: aligned instruction markers to the text baseline and right-aligned the number column. The focused 4-test dialog suite and a live 390x844 browser inspection passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ad-hoc Commander Spellbook infinite-combo results to both deck action menus through a normalized Phoenix/GraphQL integration and a responsive lazy dialog with loading, empty, retry, and result states. Verified with full backend/frontend suites, production build, detector, and real desktop/mobile browser flows.
<!-- SECTION:FINAL_SUMMARY:END -->
