---
id: TASK-94.3
title: Own the background job table instead of emulating Oban
status: To Do
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
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
- [ ] #1 A migration creates the jobs table, moves available/scheduled/retryable/executing oban_jobs rows into it with mapped worker names, and drops oban_jobs; rust/schema.sql and .sqlx are regenerated and the v1.0.0 upgrade test still passes
- [ ] #2 All seven workers run on the new table with cron schedules, uniqueness, retries, and cancel semantics covered by tests
- [ ] #3 deckAnalysisJob and the deck question flow report queued, running, finished, and failed jobs as before
- [ ] #4 Worker is a native async trait; the async-trait dependency is removed from the workspace if unused
- [ ] #5 mise run precommit passes
<!-- AC:END -->
