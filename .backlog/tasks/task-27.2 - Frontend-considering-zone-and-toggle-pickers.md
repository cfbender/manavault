---
id: TASK-27.2
title: Frontend considering zone and toggle pickers
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 00:39'
updated_date: '2026-08-03 01:07'
labels: []
dependencies: []
parent_task_id: TASK-27
ordinal: 41000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 DeckZone type and all zone literals updated; zone pickers become segmented Mainboard/Considering toggles
- [x] #2 Buylist queries use includeConsidering; deck detail add-card dialog uses the toggle
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
DeckZone -> mainboard|commander|considering; sweep literals (deck-card-model, buylist-export, readiness, types, export zones/labels, queries includeConsidering, dialogs); segmented toggle component for zone pickers (add-card-dialog.tsx, cards/add-card-to-deck-dialog, collection/add-to-deck-dialog, move dialogs); playtester/library filters use considering.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DeckZone is mainboard|commander|considering everywhere; new ZoneToggle segmented control (finish-toggle styling, wraps on narrow widths) replaces every zone select including the deck-detail Add card dialog from the user's screenshot, spanning its own dialog row; buylist documents/dialogs carry a single includeConsidering flag. Verified in browser: commander deck shows Mainboard|Commander|Considering, standard deck shows only Mainboard|Considering, and an add through the toggle landed zone considering in the DB.
<!-- SECTION:FINAL_SUMMARY:END -->
