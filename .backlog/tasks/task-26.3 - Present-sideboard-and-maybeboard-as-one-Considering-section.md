---
id: TASK-26.3
title: Present sideboard and maybeboard as one Considering section
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 00:16'
updated_date: '2026-08-03 00:34'
labels: []
dependencies: []
parent_task_id: TASK-26
ordinal: 38000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deck detail renders a single Considering section and merged header count
- [x] #2 Zone pickers and EDHREC add buttons offer Considering writing maybeboard
- [x] #3 Export and missing-cards dialogs use a single Include considering toggle covering both zones
- [x] #4 Typecheck and react tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Merge sideboard+maybeboard presentation across deck detail sections, header counts, zone pickers, EDHREC buttons, export/missing dialogs; label Considering; write maybeboard for new adds.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deck UI presents sideboard+maybeboard as one Considering section: merged detail section/table, combined header count, zone pickers and EDHREC buttons offer Considering (writing maybeboard), merged Include-considering export/missing toggles, shared zone icon, centralized deckZoneDisplayLabel. Zone data, wire formats, decklist text, playtester, and share pages untouched. Verified: typecheck, lint, vp fmt, 178 node + 15 vitest tests, build; browser shows Considering(16) with no stray Sideboard/Maybeboard labels.
<!-- SECTION:FINAL_SUMMARY:END -->
