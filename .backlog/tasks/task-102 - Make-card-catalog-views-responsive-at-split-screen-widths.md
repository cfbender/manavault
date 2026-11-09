---
id: TASK-102
title: Make card catalog views responsive at split-screen widths
status: Done
assignee:
  - '@cfb'
created_date: '2026-11-09T22:36:00Z'
updated_date: '2026-11-09T22:46:00Z'
labels:
  - frontend
  - responsive
dependencies: []
modified_files:
  - assets/react/src/pages/cards/card-responsive-grid.tsx
  - assets/react/src/pages/cards/card-results-grid.tsx
  - assets/react/src/pages/cards/card-printings-grid.tsx
  - assets/react/src/pages/cards/search-form.tsx
  - assets/react/src/pages/cards/card-detail-page.tsx
  - assets/react/src/pages/cards/add-card-to-deck-dialog.tsx
  - assets/react/src/pages/card-add-dialog.tsx
type: enhancement
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card search results and card-detail printings retain two oversized columns around 945px, the catalog search toolbar compresses at tablet widths, and the detail hero starts its horizontal layout before longer card names have enough room. This follow-up to TASK-100 and TASK-101 covers the catalog landing toolbar, results, detail hero, and printings while preserving card-size preferences and existing card interactions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catalog search controls reflow without cramped fields or clipped controls from phone through desktop widths
- [x] #2 Search results and detail printings fit three columns at approximately 945px and preserve card-size preferences
- [x] #3 Card detail hero, title, oracle content, and printings remain readable without overflow at tablet and split-screen widths
- [x] #4 Filters, full-screen previews, add-to-collection/deck actions, and the commander gallery remain usable after the layout changes
- [x] #5 Responsive states are exercised in the running app and relevant frontend checks pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture catalog results, long-name card detail, and commander gallery at split-screen, tablet, and phone widths. 2. Reflow the catalog toolbar and detail hero at content-driven breakpoints. 3. Add a shared responsive grid for catalog results and printings, preserving the user's card-size preference. 4. Verify filters, previews, card actions, gallery behavior, overflow, and frontend checks across representative widths.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added ResponsiveCardGrid for results and printings: three 283px tracks at 945px, two 320px tracks at 768px, one at 390px, and four at 1440px; 26rem produces two 416px tracks at 945px and Reset restores three. Catalog toolbar uses a full-width search row and full-width submit row on tablets, moving to one row at 56rem. Long-name card detail stacks below 56rem and keeps title/mana type smaller until lg. Printing select labels wrap on phones in both add-to-deck and add-to-collection dialogs. Browser checks covered the WebGPU commander gallery, filters, full-screen preview, both add-card dialogs, card-size preferences, and width sweeps from 320 through 1920 with no horizontal overflow. Full frontend:check passed: 285 Node tests, 209 Vitest tests, typecheck, lint, formatting, production build, and zero anti-patterns.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made card search, long-name card detail, and printings responsive from phone through desktop widths. Split-screen now shows three card columns with a readable toolbar and detail hero, while phone printing selectors wrap instead of clipping. Preserved card-size preferences and verified the commander gallery, filters, previews, and add-card actions. Full frontend checks and browser width sweeps pass.
<!-- SECTION:FINAL_SUMMARY:END -->
