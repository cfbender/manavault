---
id: TASK-21
title: Allow writes during catalog imports
status: Done
assignee:
  - '@cfb'
created_date: '2026-07-28 18:00'
updated_date: '2026-07-28 18:14'
labels: []
dependencies: []
type: bug
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A production deck-card write returned HTTP 500 with SQLite database busy while the Scryfall catalog import held the database-wide write lock. Keep catalog batches atomic while releasing the lock between batches so interactive writes can proceed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Interactive deck-card writes can complete while a multi-batch catalog import is running
- [x] #2 Each catalog batch stores its cards, printings, and search rows atomically
- [x] #3 A completed catalog import reports the same counts and searchable card data as before
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the catalog-wide SQLite transaction with one immediate transaction per 200-card source batch, keeping each batch's card, printing, and search-row writes atomic while releasing the write lock between batches. 2. Preserve aggregate counts, logging, cache invalidation, and error propagation across the batch loop. 3. Add focused multi-batch regression coverage and exercise a concurrent deck-card write against a real SQLite repository with a catalog import in progress.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reporter clarified the failure coincided with a Scryfall catalog import and the production exception was SQLite database busy. The import now commits each 200-card source batch independently instead of holding one multi-minute write transaction. A failed later batch can leave earlier, internally consistent upserts committed; imports are idempotent and a failed sync remains stale for retry. Validation: 32 focused import/sync/deck GraphQL tests passed; strict compilation passed; a real temporary SQLite repo imported 20,000 cards while a maybeboard write completed in 7ms and the importer was still active.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Released SQLite's write lock between atomic Scryfall catalog batches so interactive writes no longer wait behind the full import. Preserved import counts and searchable rows, added transaction-boundary and failed-batch atomicity tests, and verified a concurrent maybeboard add during a 20,000-card import.
<!-- SECTION:FINAL_SUMMARY:END -->
