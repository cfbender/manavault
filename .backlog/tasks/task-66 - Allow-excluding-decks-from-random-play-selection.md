---
id: TASK-66
title: Allow excluding decks from random play selection
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-09-14 23:11'
updated_date: '2026-09-14 23:17'
labels: []
dependencies: []
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users need to temporarily bench a deck without archiving it or losing its play history.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deck inclusion for play persists and defaults to enabled for existing and new decks.
- [x] #2 Excluded decks never enter random selection, including reroll fallback and empty pools.
- [x] #3 Edit deck exposes an accessible inclusion toggle, verified through the review portal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add a persisted boolean and GraphQL field; filter picker candidates before weighting and reroll fallback; add the existing Switch to Edit deck; cover persistence and selection with tests and verify desktop/narrow portal states.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Included-for-play uses the private play-history query on detail pages, preserving the shared deck query and public schema. Existing Switch and design tokens reused; no design-system changes. Ran migration in local orb. Portal verified saving off from detail, persistence in gallery edit after navigation, empty picker with both action buttons disabled, and restored candidate after enabling and reload. Inspected desktop enabled, narrow excluded, and empty-picker screenshots; narrow viewport has no horizontal overflow.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented persistent deck inclusion for random play selection, enabled by default and independent of status/history. Filter is applied before weights and reroll fallback; archived decks remain excluded. Verified 18 targeted ExUnit tests, 14 React tests, typecheck, lint, formatting, production build, and portal interactions. Review portal remains running at https://t-03gvbqqm0mqwkx0laa8sttxt3-p20201.onamp.dev/.
<!-- SECTION:FINAL_SUMMARY:END -->
