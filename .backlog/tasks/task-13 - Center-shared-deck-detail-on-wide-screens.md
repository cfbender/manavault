---
id: TASK-13
title: Center shared deck detail on wide screens
status: Done
assignee:
  - '@cfb'
created_date: '2026-07-15 20:28'
updated_date: '2026-07-15 20:33'
labels: []
dependencies: []
modified_files:
  - assets/react/src/pages/decks/detail-page.tsx
type: bug
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The deck detail content shifts left on the public share page and wide monitors because the desktop layout reserves space for controls that do not render in share mode.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shared deck detail content is visually centered at desktop widths
- [x] #2 Authenticated deck detail retains its existing tag sidebar layout
- [x] #3 The responsive deck detail layout is verified in a browser at narrow and wide viewports
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make the desktop two-column wrapper conditional on the tag sidebar being present, leaving shared deck content in the shell's centered single column. 2. Run the frontend type/build check covering the updated class composition. 3. Exercise shared and authenticated deck detail routes in Chromium at narrow and wide viewports, confirming centering and sidebar behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated assets/react/src/pages/decks/detail-page.tsx so the lg two-column tag-sidebar grid only renders outside share mode. Frontend typecheck and targeted format check pass. Browser verification: shared deck at 1568px has equal 69px gutters and no tag sidebar; authenticated deck at 1568px retains the 48px tag sidebar and two-column grid; shared deck at 390px has no horizontal overflow (390px document width).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Centered public deck details by reserving the desktop tag-sidebar column only when the sidebar renders. Verified with aube run typecheck, targeted vp formatting, and Chromium on the real shared route at 1568x905 and 390x844; the authenticated 1568px route retained its sidebar grid.
<!-- SECTION:FINAL_SUMMARY:END -->
