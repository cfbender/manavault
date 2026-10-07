---
id: TASK-94.5
title: >-
  Typed timestamps, direct crate imports, server-level schema tests, and retire
  the parity harness
status: Done
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
updated_date: '2026-10-07 22:31'
labels: []
dependencies:
  - TASK-94.1
  - TASK-94.2
  - TASK-94.3
  - TASK-94.4
parent_task_id: TASK-94
priority: medium
type: enhancement
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Leftovers of the port that are not wire formats: records carry timestamps as String in Ecto text formats via manavault-core/src/timefmt.rs although sqlx's time feature is enabled; every domain crate re-exports core/catalog modules so `crate::graphql::...` keeps resolving (see manavault-collection/src/lib.rs); domain crates dev-depend on manavault-server for its test app, so tests link a second copy of the crate under test (rust/README.md documents the hazard); rust/notes/*.md and rust/scripts/parity exist to compare against the Elixir app, which no longer runs. Use time::OffsetDateTime in records (no column renames; `inserted_at` stays), import manavault_core/manavault_catalog paths directly and delete the aliases, move schema-level tests into manavault-server (tests/ or a dedicated test crate) so no domain crate depends on the server, and replace notes + parity with one architecture doc.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Record structs use OffsetDateTime for timestamp columns; timefmt only formats GraphQL output and parsing of stored text is covered by tests for both second and microsecond formats
- [x] #2 No crate re-exports another crate's modules; no domain crate has manavault-server as a dependency or dev-dependency
- [x] #3 rust/notes and rust/scripts/parity are removed; rust/README.md (or docs/) holds one architecture overview; mise tasks and CI referencing them are updated
- [x] #4 mise run precommit passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tests: extend manavault_core::testing (TestState::with_workers, GraphQL execute helpers, card fixtures) and add manavault_catalog::testing::import_cards; each domain crate gets a cfg(test) testing module with a TestApp over a crate-local schema (MergedObject of the root objects it and its dependencies own, same loaders and extensions as the server); HTTP tests that need the full router move to manavault-server/tests/. Then remove every pub use re-export of other crates' modules and the manavault-server dev-dependencies.
2. Timestamps: time::OffsetDateTime in record structs (sqlx time feature), timefmt reduced to GraphQL output formatting plus parsing of stored text (tests for second and microsecond formats).
3. Docs: delete rust/notes, rust/scripts/parity, rust/scripts/sdl_diff.py; one architecture overview in rust/README.md; update AGENTS.md references.
4. mise run precommit, review portal check of GraphQL timestamp output, finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design change from the description: GraphQL schema tests stay in their crates against crate-local schemas instead of moving into manavault-server; only full-router HTTP tests move. Same outcome for AC #2 (no server dev-dependency, no second linked copy) with tests kept next to the code they cover.

Timestamps: timefmt replaced by manavault_core::timestamp (Timestamp newtype for second-precision columns; micros/now_micros/parse for jobs, logs, vendor prices). apiKeys.createdAt/lastUsedAt and cloud backup modifiedAt now render ISO T form at second precision; frontend formatDate uses new Date() so it reads both. Docs: rust/notes, rust/scripts/parity, and sdl_diff.py removed; rust/README.md holds the architecture overview (crates, timestamps, tests, build settings, migrations); AGENTS.md no longer points at notes. Validation: mise run precommit exit=0 (826 Rust tests, React tests, lint, typecheck, build, impeccable detect). Portal check on manavault-review: createApiKey/apiKeys return createdAt 2026-10-07T22:30:40Z matching the stored column.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Records use typed timestamps (manavault_core::timestamp), crates import each other directly with no re-export layers or server dev-dependencies (crate-local test schemas via manavault_core::testing; router-level tests in manavault-server/tests), and the parity harness and port notes are replaced by one architecture overview in rust/README.md. Verified with mise run precommit (exit 0) and a GraphQL timestamp check through the review portal.
<!-- SECTION:FINAL_SUMMARY:END -->
