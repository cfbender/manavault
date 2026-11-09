---
id: TASK-101
title: Make collection views responsive at split-screen widths
status: Done
assignee:
  - '@cfb'
created_date: '2026-11-09T22:04:00Z'
updated_date: '2026-11-09T22:20:00Z'
labels:
  - frontend
  - responsive
dependencies: []
modified_files:
  - assets/react/src/pages/collection/collection-page-header.tsx
  - assets/react/src/pages/collection/location-card.tsx
  - assets/react/src/pages/collection/location-page.tsx
  - assets/react/src/pages/collection/overview/collection-items-view.tsx
  - assets/react/src/pages/collection/selection-grid.tsx
type: enhancement
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The collection page keeps its full seven-tab row and multi-column search toolbars at widths where they wrap or become cramped, and the default 20rem card grid only fits two columns around 945px. This follow-up to TASK-100 covers the collection overview, inventory grids, selection controls, and location detail view while preserving existing filtering and virtualization behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Collection tabs and header actions remain readable without awkward wrapping or horizontal overflow from phone through desktop widths
- [x] #2 Collection and location search toolbars reflow without cramped fields or clipped controls at split-screen widths
- [x] #3 The default collection card grid fits three columns at approximately 945px and preserves card-size preferences and virtualization
- [x] #4 Location headers, card selection, filters, and card previews remain usable at phone, split-screen, and desktop widths
- [x] #5 Responsive states are exercised in the running app and relevant frontend checks pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture collection, inventory, selection, and location layouts with representative local data. 2. Reflow the collection view tabs and search toolbars at content-driven breakpoints. 3. Add opt-in responsive geometry to the shared virtualized collection grid and enable it for collection and location views. 4. Verify card-size preferences, selection, filters, previews, overflow, and frontend checks across phone, split-screen, and desktop widths.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Collection view switches from dropdown to full tabs only at xl, avoiding the two-row tab layout. Search toolbars use a full-width search row and two-column actions on tablets, moving to one row at 56rem (70rem for unfiled). Responsive virtualized grids render three 283px tracks at 945px, two 320px tracks at 768px, one at 390px, and four at 1440px; 26rem preference produces two 416px tracks at 945px and Reset restores three. Location heroes use compact 20rem columns until xl. Browser checks covered selection, filters at 390/945, full-screen preview at 390, unfiled controls at 1120, virtualized last-row rendering, and width sweeps from 320 through 1920 with no horizontal overflow. Full frontend:check passed: 285 Node tests, 209 Vitest tests, typecheck, lint, formatting, production build, and zero anti-patterns.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made collection and location views responsive from phone through desktop widths. Split-screen now uses a compact view selector, readable toolbars and location heroes, and three virtualized card columns without changing trade-grid defaults. Preserved card-size preferences and verified selection, filters, previews, unfiled controls, and scrolling in the running app. Full frontend checks and browser width sweeps pass.
<!-- SECTION:FINAL_SUMMARY:END -->
