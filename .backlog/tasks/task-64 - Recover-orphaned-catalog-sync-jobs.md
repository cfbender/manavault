---
id: TASK-64
title: Recover orphaned catalog sync jobs
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-09-13 00:21'
updated_date: '2026-09-13 00:24'
labels: []
dependencies: []
type: bug
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
SLD 2618 is missing from a production catalog and a backup job acknowledgement logged SQLite Database busy. Infinite incomplete-job uniqueness plus no orphan recovery can block later syncs after failed acknowledgements or process restarts. Production job state is not available, so distinguish the confirmed recovery gap from the unconfirmed incident cause.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Stale executing jobs are recovered on SQLite, while recent executions are untouched and exhausted jobs no longer block new syncs
- [x] #2 Recovery threshold exceeds all configured worker execution timeouts
- [x] #3 SLD 2618 successfully passes the catalog sync and exact-printing search in a regression test
- [x] #4 Document recovery timing and read-only production diagnosis; run relevant backend tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Enable Lifeline with a conservative one-hour rescue threshold. 2. Exercise plugin recovery on SQLite for retryable, exhausted, and recent jobs and verify catalog uniqueness. 3. Test the reported printing through sync and search. 4. Document read-only diagnostics and validate backend tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified Scryfall live API lists SLD 2618 as a paper box-set printing released 2026-08-31. Oban v2.23.1 can leave executing jobs orphaned if both completion and follow-up failure acknowledgement fail; Lite does not automatically recover them. Infinite incomplete-state uniqueness then blocks scheduled and forced reloads. Production job rows and the identity of the contending writer remain unknown. Lifeline is recovery, not a SQLite contention fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Enabled Lifeline with a one-hour threshold above all worker timeouts. SQLite integration test reproduces blocked forced reloads, rescues stale attempts, preserves recent executions, and discards exhausted jobs so new reloads succeed. Added SLD 2618 sync/search regression and read-only production diagnostics. Verified: targeted tests 23 passed; mise exec -- mix test test/manavault/catalog test/manavault/backup test/manavault/pricing test/manavault/oban_config_test.exs — 259 passed; format check and git diff --check passed. No production changes or deployment performed.
<!-- SECTION:FINAL_SUMMARY:END -->
