---
id: TASK-94.3
title: Own the background job table instead of emulating Oban
status: Done
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
updated_date: '2026-10-07 20:42'
labels: []
dependencies:
  - TASK-94.1
parent_task_id: TASK-94
priority: medium
type: enhancement
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
manavault-core/src/jobs/mod.rs is an Oban clone over the `oban_jobs` table: Oban states, uniqueness over incomplete states, snooze, backoff, errors as a JSON array, and Elixir worker names such as `Manavault.Catalog.ScryfallCatalogWorker`. Seven workers use it (Scryfall catalog, Scryfall assets, vendor prices, external deck sync, deck analysis, deck question, scanner bundle, cloud backup). The in-process scheduler is fine; the schema and vocabulary are not ours. Define a `jobs` table with only the columns the workers need, Rust worker names, and a migration (with a data step) that moves incomplete `oban_jobs` rows into it and drops `oban_jobs`. The `deckAnalysisJob` GraphQL query must keep reading job status for in-flight and finished analyses. Make `Worker` a native async trait (Rust 1.99) and drop the async-trait dependency and the `unused_async*` lint allowances if nothing else needs them. No external queue crate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A migration creates the jobs table, moves available/scheduled/retryable/executing oban_jobs rows into it with mapped worker names, and drops oban_jobs; rust/schema.sql and .sqlx are regenerated and the v1.0.0 upgrade test still passes
- [x] #2 All seven workers run on the new table with cron schedules, uniqueness, retries, and cancel semantics covered by tests
- [x] #3 deckAnalysisJob and the deck question flow report queued, running, finished, and failed jobs as before
- [x] #4 Worker is a native async trait; the async-trait dependency is removed from the workspace if unused
- [x] #5 mise run precommit passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration 20261007000000_replace_oban_jobs_with_jobs.sql: create jobs (id, worker, queue, args TEXT JSON, state queued|running|succeeded|failed|cancelled, attempt, max_attempts, run_at, started_at, finished_at, last_error, inserted_at) with a (queue, state, run_at, id) index; INSERT ... SELECT the incomplete oban_jobs rows with worker names mapped by CASE to the Rust names (scryfall_catalog, scryfall_assets, vendor_prices, scanner_bundle, cloud_backup, external_deck_sync, deck_analysis, deck_question, share_preview_render), state queued, run_at = scheduled_at; DROP oban_jobs. Pure SQL, no data step needed.
2. jobs/mod.rs: native async Worker trait (perform returns impl Future + Send) plus a blanket-implemented object-safe DynWorker the registry stores; drop Snooze, INCOMPLETE_STATES, failure_message (structured tracing::error! instead); states/vocabulary: queued/running/succeeded/failed/cancelled, run_at, last_error; keep enqueue/enqueue_at/enqueue_in/wake, cron, uniqueness over queued|running, retries with backoff, 1h orphan rescue, 1d pruning, drain_queue for tests.
3. Rename worker name constants in the nine workers, remove async_trait from Worker impls, update analyze_deck job_progress/latest_job, scryfall enqueue_forced, backup scheduled_at, and every test that reads oban_jobs.
4. Remove async-trait from crates that no longer use it (it stays in manavault-catalog for VendorFeed, which is dyn-dispatched); try dropping the unused_async lint allowances.
5. mise run rust:schema-db / rust:sqlx-prepare, regenerate rust/schema.sql, update docs (self-hosting troubleshooting SQL, README, notes), mise run precommit, portal check of deck analysis job status.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: worker names scryfall_catalog, scryfall_assets, vendor_prices, scanner_bundle, cloud_backup, external_deck_sync, deck_analysis, deck_question, share_preview_render. Migration 20261007201043_replace_oban_jobs_with_jobs.sql is pure SQL (no data_step); it moves available/scheduled/retryable/executing oban_jobs rows as queued with run_at = scheduled_at and drops oban_jobs, so finished job history is not carried over (documented in docs/self-hosting.md). Five states queued/running/succeeded/failed/cancelled; a single last_error column replaces Oban's error array; Snooze removed (no worker used it). Worker is a native async trait; DynWorker (blanket impl) is the object-safe form because native async traits are not dyn-compatible. async-trait stays only in manavault-catalog for the dyn-dispatched VendorFeed. The unused_async/unused_async_trait_impl allowances stay because axum handlers/extractors and async-graphql resolvers trigger them. Failed attempts log a structured 'job failed' event (worker, queue, attempt, max_attempts, retrying, error) instead of the Oban-format line.

Validation: mise run precommit passes (rust:check: fmt, clippy -D warnings, all crate tests incl. 7 new jobs tests, db upgrade test from v1.0.0 and moves_unfinished_oban_jobs_into_the_jobs_table; frontend:check green with only pre-existing advisory design-system notes). Portal check on manavault-review (dev DB with 82 historical oban_jobs rows + one seeded scheduled VendorSync row): migration applied at boot, the seeded row became jobs row vendor_prices/queued with its run_at preserved, oban_jobs dropped, @reboot workers scryfall_catalog/scryfall_assets/scanner_bundle/cloud_backup ran to succeeded. deckAnalysisJob queried via GraphQL for a deck with deck_analysis rows in each state: queued/running -> pending, succeeded -> completed, failed/cancelled -> failed. Deck page screenshot shows 'Analyzing in the background' for a running job (.amp/in/artifacts/jobs-deck-analysis-pending.png).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the Oban-shaped oban_jobs table and jobs module with a native jobs table (queued/running/succeeded/failed/cancelled, run_at, last_error), Rust worker names, a native async Worker trait plus DynWorker, and a migration that moves unfinished Oban rows across and drops oban_jobs. Verified with mise run precommit, the new jobs/db tests, and a portal upgrade run of the review stack that exercised the migration, the @reboot workers, and deckAnalysisJob status mapping in the API and deck page.
<!-- SECTION:FINAL_SUMMARY:END -->
