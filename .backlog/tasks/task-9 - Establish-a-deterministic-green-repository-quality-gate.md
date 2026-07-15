---
id: TASK-9
title: Establish a deterministic green repository quality gate
status: Done
assignee:
  - '@codex'
created_date: '2026-07-15 15:56'
updated_date: '2026-07-15 17:31'
labels:
  - ci
  - testing
  - backend
  - frontend
dependencies: []
references:
  - mix.exs
  - package.json
  - .github/workflows/container.yml
  - .github/workflows/capacitor.yml
priority: high
type: chore
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
There is no dependable green verification path. The backend suite has three deterministic failures in serial mode and can also fail with Exqlite Database busy when SQLite-writing DataCase modules run asynchronously. The configured frontend test script uses an unsupported Node flag even though the tests pass without it. Existing GitHub workflows build release artifacts but do not run the repository's backend and frontend quality checks for pull requests. Repair the contracts and wire one reproducible local and CI gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The deck allocation batching test passes because the observed query behavior meets an explicitly justified budget; the budget is not merely increased to hide an avoidable N+1 regression.
- [x] #2 Deck disassembly implementation and tests agree on the intended archive-versus-delete contract, including the final deck state and restoration of allocated collection items.
- [x] #3 Archived-deck allocation coverage constructs valid preconditions and verifies the intended policy without expecting successful edits to archived decks.
- [x] #4 The full backend suite passes at normal concurrency and in serial mode across multiple seeds without Exqlite Database busy; SQLite-writing tests are synchronized or isolated rather than made flaky with retries.
- [x] #5 The package test:react command runs through mise/aube on the pinned Node version without unsupported flags and reports all frontend tests passing.
- [x] #6 Pull requests run backend compilation with warnings as errors, strict Credo, the full ExUnit suite, frontend formatting/linting, TypeScript typechecking, frontend behavior tests, and the production frontend build; required commands are also documented or represented by one local precommit entry point.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce and correct the deterministic allocation, disassembly, archived-deck, and SQLite concurrency failures at their contracts.
2. Repair the pinned aube frontend test command and establish one local quality entry point.
3. Add pull-request CI for warnings-as-errors compilation, Credo, ExUnit, frontend format/lint/typecheck/tests/build.
4. Verify backend suites serially and concurrently across multiple seeds plus the complete frontend gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Established a pinned local/PR quality gate; corrected allocation query batching with exact telemetry classes, aligned disassembly/archive and archived-deck tests, partitioned/serialized SQLite tests, and added Node+Vitest frontend coverage. Verification: focused backend 50/50; full ExUnit normal seeds 101 and 202 plus serial seeds 303 and 404 all 295/295 with no database-lock errors; test:react passed; frontend format/lint/typecheck/build passed; mix compile --warnings-as-errors and mix credo --strict passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The repository now has a deterministic local and pull-request quality gate across backend and frontend. Verified across four full-suite seed/mode runs, exact batching coverage, warnings-fatal compilation, strict Credo, locked frontend tests, formatting, linting, typechecking, and production build.
<!-- SECTION:FINAL_SUMMARY:END -->
