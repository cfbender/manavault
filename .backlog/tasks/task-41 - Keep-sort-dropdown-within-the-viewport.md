---
id: TASK-41
title: Keep sort dropdown within the viewport
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-06 04:33'
updated_date: '2026-08-06 04:37'
labels: []
dependencies: []
modified_files:
  - assets/react/src/components/sort-dropdown.tsx
  - assets/react/test/trade-binder.test.tsx
priority: high
type: bug
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shared sort dropdown can extend beyond narrow screens because its fixed-width menu is positioned with static end alignment. Make the shared component collision-aware so every catalog, collection, location, and trade binder sort menu stays visible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The sort menu shifts or flips to remain within viewport edges
- [x] #2 The menu width is capped to the available mobile viewport
- [x] #3 All existing sort fields and direction controls remain keyboard and pointer accessible
- [x] #4 Every caller benefits through the shared sort dropdown component
- [x] #5 Automated tests cover opening and selecting sort controls after the positioning change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the hand-positioned dropdown shell with the existing Radix dropdown primitive, which portals content and handles viewport collisions.
2. Cap menu width to the viewport while retaining the existing desktop width and visual treatment.
3. Run focused sort interactions, the frontend suite, typecheck, build, and design detector.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced the hand-positioned DaisyUI dropdown with the project Radix dropdown primitive. The menu now renders in a portal with 16px collision padding and automatic side shifting/flipping, while its width is capped to min(18rem, 100vw - 2rem). Sort choices are proper menu items, preserving pointer behavior and adding arrow-key navigation. The shared component change reaches catalog search, collection, locations, and trade binder callers.

Validation: focused trade binder tests passed (5 tests), including menu width, pointer selection, and keyboard navigation assertions; full React suite passed (183 Node tests and 32 Vitest tests); typecheck, production build, formatting, and lint passed. Lint retains two pre-existing warnings in buylist-marketplace-actions.test.tsx. Impeccable detector returned no findings after replacing the undersized badge text with the design-system text-xs step.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made the shared sort dropdown collision-aware and viewport-capped using the existing Radix menu primitive. It now shifts or flips at screen edges, portals above clipping containers, fits narrow mobile viewports, and supports menu keyboard navigation. Verified with focused pointer/keyboard tests, the full React suite, typecheck, build, lint, formatting, and design detector.
<!-- SECTION:FINAL_SUMMARY:END -->
