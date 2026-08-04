---
id: TASK-35
title: Make Liquid Glass dropdowns consistently readable
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-04 20:28'
updated_date: '2026-08-04 20:38'
labels: []
dependencies: []
type: bug
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Liquid Glass mode applies different surface treatments to DaisyUI menus, Radix dropdown menus, and native select option lists. Open menus can become too transparent against card art or ambient backgrounds, making labels hard to read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All custom dropdown menu panels use the same readable Liquid Glass surface in light and dark themes
- [x] #2 Native select option lists have an explicit opaque background and readable text in Liquid Glass mode
- [x] #3 Classic mode styling remains unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a dedicated high-opacity glass menu surface token for light and dark themes. 2. Apply the shared dropdown-content hook to Radix menu panels and style native select options explicitly. 3. Run formatting, type checking, and the focused frontend checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Unified DaisyUI and Radix dropdown panels behind the dropdown-content style hook. Liquid Glass menus now use a dedicated 92%-opaque theme surface; native option rows use solid theme colors. Validation: headless Chrome visual checks passed for light and dark glass menus over a saturated backdrop. Browser computed styles confirmed opaque native options in light/dark, 92%-opaque glass menu panels, and unchanged classic menu styling. Formatting, typecheck, production build, and design detector passed; frontend lint completed with two pre-existing warnings in buylist-marketplace-actions.test.tsx.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made Liquid Glass dropdowns consistent and readable by giving all custom menus a denser shared surface and native options explicit solid theme colors. Verified visually in headless Chrome for light/dark, checked browser-computed styles including classic mode, and passed formatting, typecheck, build, and design detection.
<!-- SECTION:FINAL_SUMMARY:END -->
