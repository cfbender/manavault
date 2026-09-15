---
id: TASK-39
title: Keep filter dialogs within mobile viewports
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-06 03:40'
updated_date: '2026-08-06 03:43'
labels: []
dependencies: []
modified_files:
  - assets/react/src/components/ui/dialog.tsx
  - assets/react/src/pages/collection/filter-modal.tsx
  - assets/react/test/dialog.test.tsx
  - assets/react/test/trade-binder.test.tsx
priority: high
type: bug
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shared collection filter dialog extends beyond mobile screens. Make its layout, controls, scrolling, and safe-area behavior fit narrow portrait and landscape viewports everywhere the filter dialog is used, without regressing desktop behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The shared filter dialog stays within a 320px-wide mobile viewport without horizontal overflow
- [x] #2 The full filter form and its actions remain reachable within short mobile viewports
- [x] #3 Collection, location, card catalog, and trade binder filter dialogs all receive the fix through the shared component
- [x] #4 Desktop filter dialog layout remains usable
- [x] #5 Automated coverage verifies the responsive containment behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit the shared dialog shell and collection filter internals for viewport and intrinsic-width overflow.
2. Fix containment and mobile scrolling in shared ownership points so every filter-dialog caller benefits.
3. Add responsive regression coverage and run targeted frontend checks plus the design detector.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The shared dialog shell now constrains intrinsic width, clips accidental horizontal overflow, and applies left/right safe-area padding at mobile and desktop breakpoints. The shared collection filter body owns the remaining dialog height as its scroll region, uses minmax(0, 1fr) containment, wraps expert query text, and stacks segmented controls to full width on mobile.

Validation: focused dialog and trade binder DOM interaction tests passed (8 tests); full React suite passed (183 Node tests and 29 Vitest tests); typecheck, production build, formatting, and lint passed. Lint retains two pre-existing warnings in buylist-marketplace-actions.test.tsx. The design detector only reported two pre-existing advisory 0.68rem type-ramp findings in filter-modal.tsx.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made the shared dialog shell and collection filter modal viewport-safe across all callers. Mobile dialogs now respect horizontal safe areas and intrinsic-width limits, keep the full form/actions in one bounded scroll region, wrap long query text, and stack segmented controls; desktop retains its two-column layout. Verified through responsive DOM assertions, interaction tests, the full React suite, typecheck, and production build.
<!-- SECTION:FINAL_SUMMARY:END -->
