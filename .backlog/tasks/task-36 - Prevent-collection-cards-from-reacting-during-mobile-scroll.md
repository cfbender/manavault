---
id: TASK-36
title: Prevent collection cards from reacting during mobile scroll
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-05 01:34'
updated_date: '2026-08-05 01:37'
labels: []
dependencies: []
references:
  - assets/react/src/components/card-tile.tsx
  - assets/react/src/lib/mobile-hover.ts
modified_files:
  - assets/react/src/components/card-tile.tsx
  - assets/react/src/lib/mobile-hover.ts
  - assets/react/test/mobile-hover.test.mjs
  - assets/react/test/trade-quantity.test.tsx
type: bug
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Collection cards currently activate their mobile hover/reveal state on pointer-down, so cards lift and scale while a user is beginning a scroll. Preserve tap, keyboard, and desktop behavior while ensuring a touch scroll does not reveal or activate a card.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dragging to scroll over a collection card does not reveal, scale, select, or open the card
- [x] #2 A stationary touch tap still reveals the card actions and suppresses that tap's primary action
- [x] #3 Mouse and keyboard card interactions remain unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delay CardTile mobile reveal until a touch pointer is released without meaningful movement or cancellation.
2. Add focused gesture tests for stationary taps, movement, and cancellation.
3. Run targeted frontend tests and typechecking.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CardTile now defers coarse-pointer reveal until pointer-up and cancels the reveal after movement beyond 8px or pointer cancellation. A moved gesture also suppresses any synthetic click emitted immediately after pointer-up. Other useMobileHoverReveal consumers keep the existing pointer-down behavior.

Validation: 5 focused CardTile Vitest tests passed; 8 mobile-hover Node tests passed; TypeScript typecheck passed; formatting and git diff checks passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prevented collection cards from lifting or activating at scroll start by distinguishing stationary touch taps from moved/cancelled gestures. Stationary taps still reveal actions, and mouse/keyboard behavior remains immediate. Verified with focused gesture tests, typechecking, and formatting.
<!-- SECTION:FINAL_SUMMARY:END -->
