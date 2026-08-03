---
id: TASK-25.5
title: Add printing-aware wants search and wants share UI
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 23:29'
updated_date: '2026-08-03 00:12'
labels: []
dependencies: []
parent_task_id: TASK-25
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wants tab search can resolve a specific printing before adding; wants tab gets a share-link action; public share wants page renders the list read-only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wants search supports choosing an exact printing, and want rows display their printing
- [x] #2 Wants tab offers a share action that ensures and copies the public link
- [x] #3 /share/wants/<token> renders a read-only wants list via the public schema
- [x] #4 Matches tab hint text mentions ManaVault deck and wants links from any instance
- [x] #5 Typecheck and react tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Wants tab: printing picker on add (mirroring add-card dialog printing resolution), printing labels on rows, share action (ensure token + copy /share/wants link). New routes/share/wants/$token.tsx read-only page via /share/graphql. Matches tab hint text update.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wants tab gained an opt-in printing picker (exact-name-matched printings list; quick generic add unchanged), printing badges on rows, and a Share wants dialog (ensure-once token, copy link); /share/wants/:token renders a read-only public page via /share/graphql; match tab copy names ManaVault deck/want links from any instance. Verified: gates green; browser added an Alpha Bolt printing want, shared, viewed the public page, and matched the share URL in the Matches tab.
<!-- SECTION:FINAL_SUMMARY:END -->
