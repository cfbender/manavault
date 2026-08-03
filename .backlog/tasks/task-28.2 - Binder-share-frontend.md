---
id: TASK-28.2
title: Binder share frontend
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 01:09'
updated_date: '2026-08-03 01:35'
labels: []
dependencies: []
parent_task_id: TASK-28
ordinal: 44000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Share binder dialog on the binder tab, public share page and route, match tab copy update
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Share binder button+dialog on binder tab (mirror wants share dialog, /share/binder URL); routes/share/binder/$token.tsx + pages/trade/share-binder-page.tsx (read-only rows with finish/condition badges); match-tab URL hint mentions binder links.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Share binder dialog on the binder tab (ensure-once token, copy /share/binder link), public read-only page with printing/finish/condition badges via /share/graphql, match tab hint mentions binder links. Verified in browser.
<!-- SECTION:FINAL_SUMMARY:END -->
