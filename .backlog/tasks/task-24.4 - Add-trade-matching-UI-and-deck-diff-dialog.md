---
id: TASK-24.4
title: Add trade matching UI and deck diff dialog
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 22:14'
updated_date: '2026-08-02 23:24'
labels: []
dependencies: []
parent_task_id: TASK-24
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Matches tab on the Trade page for pasting a list or URL and viewing binder/want matches; Compare dialog on deck detail diffing an external list against the open deck.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Matches tab accepts paste or URL and renders both match directions and unrecognized lines
- [x] #2 Deck detail offers a compare action showing adds, cuts, and quantity changes
- [x] #3 Typecheck and existing react tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Matches tab component (URL input + textarea -> tradeMatches lazy query, two match sections + unrecognized). Deck detail Compare action opening dialog -> deckDiff query rendering adds/cuts/changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: browser walkthrough — paste list matched both directions with explicit list-role selector (their haves vs their wants, only the semantically valid section shown), unrecognized lines disclosed; deck Compare dialog diffed live Archidekt deck (17 adds/89 cuts) and own share link (lists match); typecheck/tests/build green. Role selector added post-review to avoid claiming a direction the list can't support.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Matches tab (URL-or-paste form, list-role selector, direction-correct match sections, unrecognized disclosure) and deck detail Compare decklist action (dialog with adds/cuts/quantity changes, copy-as-text). Verified in browser against pasted lists, live Archidekt, and local share links.
<!-- SECTION:FINAL_SUMMARY:END -->
