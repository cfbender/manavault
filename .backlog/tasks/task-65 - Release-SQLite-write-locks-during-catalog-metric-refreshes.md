---
id: TASK-65
title: Release SQLite write locks during catalog metric refreshes
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-09-13 00:32'
updated_date: '2026-09-13 00:35'
labels: []
dependencies: []
type: bug
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Saltiness and commander-rank refreshes wrap every 200-row statement in a single transaction, blocking Oban acknowledgements and interactive writes despite apparent batching. Replace the recurring long transactions without blanket-clearing existing metrics. One-time printing reconciliation remains atomic because it updates linked user records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Saltiness and commander-rank refreshes release SQLite write locks between bounded update and stale-cleanup batches
- [x] #2 Refreshes preserve value mapping and return counts, clear absent values, handle empty feeds, and leave unrelated card fields untouched
- [x] #3 A failed later batch preserves earlier progress and leaves a retry able to complete the refresh correctly
- [x] #4 Real independent SQLite writer tests fail on the former implementation and pass with the change; relevant backend tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace whole-table metric resets with bounded stale-ID cleanup after metric updates. 2. Remove outer metric transactions while preserving single-statement batch atomicity and existing counts. 3. Test both modules with a disposable real SQLite repo and independent writer, failure injection, and retries. 4. Document incremental visibility and verify backend checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The independent raw SQLite writer failed with database is locked on both former outer-transaction implementations. Both now pass after each update and cleanup statement with busy_timeout=0. Six real SQLite tests cover bounded writes, reversed printing/oracle mappings, missing IDs, empty feeds, untouched other metrics, failed second update batches, failed second cleanup batches, and successful retries. Final values and existing return-count semantics are preserved. The recurring refresh is intentionally incremental; one-time printing reconciliation remains atomic and unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed whole-refresh transactions and whole-table resets from saltiness and commander ranks. Updates and stale cleanup are single-statement batches of at most 200 rows, releasing the SQLite writer lock between batches. Documented incremental visibility and retry behavior. Verification: new real SQLite tests 6 passed, full mise exec -- mix test 663 passed, mix credo --strict no issues, mix format --check-formatted and git diff --check passed. No migrations, production writes, push, or deployment.
<!-- SECTION:FINAL_SUMMARY:END -->
