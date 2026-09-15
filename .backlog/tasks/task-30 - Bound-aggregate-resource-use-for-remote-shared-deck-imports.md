---
id: TASK-30
title: Bound aggregate resource use for remote shared-deck imports
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-03 22:47'
updated_date: '2026-08-03 23:05'
labels: []
dependencies: []
modified_files:
  - lib/manavault/trade/list_source/http.ex
  - lib/manavault/trade/list_source/mana_vault_remote.ex
  - test/manavault/trade/list_source/http_test.exs
  - test/manavault/trade/list_source/mana_vault_remote_test.exs
priority: high
type: bug
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remote ManaVault shared-deck imports currently bound each page independently but trust pagination across up to 50 pages, allowing a malicious peer to consume excessive aggregate time, bytes, entries, and list-copying work. Bound the whole import while preserving ordinary deck, wants, and binder imports. This task is limited to import budgeting and pagination progress; SSRF and GraphQL endpoint changes are out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A whole-import monotonic deadline bounds total remote request time
- [x] #2 Cumulative response bytes and normalized entries are rejected at conservative limits with user-friendly errors
- [x] #3 Pagination has a substantially lower practical page cap and rejects repeated or non-advancing cursors
- [x] #4 Page accumulation avoids quadratic repeated list appends
- [x] #5 Focused deterministic tests cover endless pagination, repeated cursors, cumulative entries, cumulative bytes, cumulative time, ordinary multi-page success, wants, and binder
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the shared Http response path with a size-reporting POST variant while preserving existing callers and streamed per-response caps.
2. Add fixed conservative whole-import limits in ManaVaultRemote: 30 seconds monotonic time, 10 MB cumulative response bytes, 10,000 normalized entries, and 10 pages. Carry one budget through deck pagination and single-response wants/binder imports.
3. Reject empty, repeated, or unchanged continuation cursors and collect normalized deck pages in reverse page order, flattening once at completion.
4. Add deterministic Req.Test coverage using an injected monotonic clock seam for page, cursor, bytes, entry, and deadline failures plus successful deck/wants/binder regressions.
5. Run focused tests and formatting, then finalize TASK-30 and commit the scoped changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented fixed aggregate limits, task-enforced wall-clock timeout, streamed response-size accounting, cursor cycle rejection, and linear page-batch accumulation. Added focused tests; 56 relevant Http, ManaVaultRemote, and ListSource tests pass.

Validation: mix test test/manavault/trade/list_source_test.exs test/manavault/trade/list_source/http_test.exs test/manavault/trade/list_source/mana_vault_remote_test.exs (56 passed); mix format --check-formatted on all touched Elixir files; git diff --check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bound remote ManaVault imports with a task-enforced 30-second wall-clock deadline, 5 MB per-response and 10 MB cumulative byte caps, 10,000 normalized entries, and 10 pages. Rejected empty/repeated cursor cycles and replaced quadratic appends with reversed page batches plus one flatten. Verified all focused and resolver-level remote deck, wants, binder, pagination, budget, and Http tests (56 passed).
<!-- SECTION:FINAL_SUMMARY:END -->
