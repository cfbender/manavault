---
id: TASK-58
title: Migrate background work to Oban
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-22 17:20'
updated_date: '2026-08-22 17:32'
labels: []
dependencies: []
type: enhancement
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace ManaVault's GenServer timers, Task.Supervisor-based asynchronous workers, and in-memory preview render queue with durable, standardized Oban workers and cron scheduling while preserving existing user-facing behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scryfall catalog/assets, vendor pricing, and configured cloud backups are scheduled and executed through Oban without application-owned timer GenServers or Task.Supervisors.
- [x] #2 Manual Scryfall and pricing triggers enqueue deduplicated Oban jobs and continue returning the existing API responses.
- [x] #3 Public preview PNG rendering uses the Oban preview queue with shared artifact reuse and duplicate-job coalescing while preserving PNG/503 endpoint behavior.
- [x] #4 Oban queues, uniqueness, retry/timeout behavior, and periodic schedules are centrally configured and covered by focused tests.
- [x] #5 Obsolete queue, scheduler, supervision, and tests are removed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add domain-owned Oban workers for catalog, pricing, backup, and preview rendering with queue-specific concurrency, uniqueness, retries, and timeouts.
2. Configure Oban Cron for reboot/daily catalog checks, 30-minute pricing checks, and minute-level evaluation of user-configured backup cron.
3. Replace manual producers and preview rendering with Oban insertion/notification paths while preserving API contracts and artifact caching.
4. Remove superseded GenServers and Task.Supervisors, rewrite focused tests, format, and run targeted plus full verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced the Scryfall, pricing, and backup timer GenServers with domain-owned Oban workers. Added centralized Cron entries and dedicated queue concurrency, migrated manual GraphQL producers to unique forced jobs, and moved preview rendering from the FIFO GenServer/Task.Supervisor queue to a unique Oban render worker with notifier-based synchronous delivery and artifact reuse. Removed obsolete supervisors/modules and added focused worker, config, GraphQL, and preview tests.

Verification: `mix test` passes 634 tests; `mix compile --warnings-as-errors` passes; Oban production configuration validates; strict Credo passes on all changed source files. Repository-wide strict Credo still reports two pre-existing refactoring opportunities in `lib/manavault/ai.ex` and `lib/manavault/ai/deck_analysis.ex`.

Follow-up: removed both redundant final `with` clauses in the AI analysis paths. Repository-wide `mix credo --strict` now passes with no issues; focused AI tests pass 9/9.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Migrated all application-owned periodic workers and queued preview rendering to standardized Oban workers. Scryfall catalog/assets and pricing run on reboot plus recurring cron schedules, backup cron is evaluated by a minute-level unique worker, manual GraphQL triggers enqueue forced unique jobs, and preview cache misses enqueue unique render jobs while callers await artifact notifications. Removed the old timer GenServers, FIFO queue, and Task.Supervisors. Verified with 634 passing ExUnit tests, warnings-as-errors compilation, valid Oban configuration, clean diff checks, and strict Credo on every changed source file.
<!-- SECTION:FINAL_SUMMARY:END -->
