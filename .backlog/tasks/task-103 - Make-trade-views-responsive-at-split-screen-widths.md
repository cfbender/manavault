---
id: TASK-103
title: Make trade views responsive at split-screen widths
status: Done
assignee:
  - '@cfb'
created_date: '2026-11-09T23:05:00Z'
updated_date: '2026-11-09T23:19:00Z'
labels:
  - frontend
  - responsive
dependencies: []
modified_files:
  - assets/react/src/pages/trade/binder-tab.tsx
  - assets/react/src/pages/trade/wants-tab.tsx
  - assets/react/src/pages/trade/want-row.tsx
  - assets/react/src/pages/trade/binder-share-dialog.tsx
  - assets/react/src/pages/trade/wants-share-dialog.tsx
type: enhancement
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The trade binder keeps two oversized card columns around 945px and wraps search, filters, and deck-card toggles unevenly. Want rows also rely on a single horizontal layout for card details, quantity, and removal, which becomes cramped on phones. This follow-up to TASK-100 through TASK-102 covers binder, wants, and local match results while preserving trade quantities, sharing, filtering, and card previews.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Binder search, sort, filters, toggles, and share actions reflow without awkward wrapping or horizontal overflow
- [x] #2 The binder fits three card columns at approximately 945px and preserves card-size preferences and trade quantity controls
- [x] #3 Want list search and rows remain readable with accessible quantity and removal controls on phones
- [x] #4 Match forms, match results, filters, sharing, and full-screen previews remain usable at phone and split-screen widths
- [x] #5 Responsive states are exercised in the running app and relevant frontend checks pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture binder, wants, quantity controls, and local match results with representative data. 2. Reflow binder filters and share actions at content-driven breakpoints. 3. Enable responsive geometry for the binder grid and give want rows a deliberate phone layout. 4. Verify trade quantities, wants mutations, match results, filters, previews, overflow, and frontend checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Enabled the existing responsive virtualized grid for the binder: three 283px tracks at 945px, two at 768px, one at 390px, and four at 1440px; 26rem produces two 416px tracks at 945px and Reset restores three. Binder controls use a full-width tablet search row, two-column secondary controls, and a single desktop row at xl. Want rows keep full card names on phones with a dedicated quantity/remove row. Binder and wants share dialogs use complete two-row action footers on phones. Browser checks covered offer and want quantity updates with restoration, local match results, filters, both share dialogs, full-screen preview, and width sweeps from 320 through 1920 with no horizontal overflow. Full frontend:check passed: 285 Node tests, 209 Vitest tests, typecheck, lint, formatting, production build, and zero anti-patterns.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made binder, wants, match results, and share dialogs responsive from phone through desktop widths. Split-screen now shows three binder cards with orderly filter groups, while phone want rows and share actions have deliberate layouts instead of clipped controls. Preserved trade quantities, sharing, filtering, previews, and local matches. Full frontend checks and browser width sweeps pass.
<!-- SECTION:FINAL_SUMMARY:END -->
