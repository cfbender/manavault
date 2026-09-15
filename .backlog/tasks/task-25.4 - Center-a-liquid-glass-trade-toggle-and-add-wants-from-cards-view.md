---
id: TASK-25.4
title: Center a liquid-glass trade toggle and add wants from cards view
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 23:29'
updated_date: '2026-08-03 00:12'
labels: []
dependencies: []
parent_task_id: TASK-25
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Binder tiles get a large centered circular glass trade toggle; card detail printing actions gain Add to wants.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Trade binder tiles show a centered circular backdrop-blur toggle, always visible, with clear active state
- [x] #2 Card detail printings offer Add to wants beside add-to-collection/deck, wired to createTradeWant(scryfallId)
- [x] #3 Typecheck and react tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
CardTile trade toggle redesign: centered circular liquid-glass button (backdrop-blur, translucent ring, inner highlight), always visible when onToggleForTrade present, active primary-tinted state. Cards view: Add to wants action beside add-to-collection/deck on printings using createTradeWant(scryfallId).
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trade toggle is now a 3.5rem centered circular liquid-glass button (backdrop-blur, layered translucent gradient, inner highlight, primary-tinted active state with check badge), always visible, pointer-events scoped to the button; card detail printing menus gained Add to wants via createTradeWant(scryfallId). Verified: typecheck/lint/react tests/build green; browser toggled A Realm Reborn (count updated) and added Counterspell MAR #52 to wants from the printings menu with toast.
<!-- SECTION:FINAL_SUMMARY:END -->
