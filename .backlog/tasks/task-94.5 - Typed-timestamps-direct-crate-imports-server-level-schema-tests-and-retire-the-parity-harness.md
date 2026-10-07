---
id: TASK-94.5
title: >-
  Typed timestamps, direct crate imports, server-level schema tests, and retire
  the parity harness
status: To Do
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
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
- [ ] #1 Record structs use OffsetDateTime for timestamp columns; timefmt only formats GraphQL output and parsing of stored text is covered by tests for both second and microsecond formats
- [ ] #2 No crate re-exports another crate's modules; no domain crate has manavault-server as a dependency or dev-dependency
- [ ] #3 rust/notes and rust/scripts/parity are removed; rust/README.md (or docs/) holds one architecture overview; mise tasks and CI referencing them are updated
- [ ] #4 mise run precommit passes
<!-- AC:END -->
