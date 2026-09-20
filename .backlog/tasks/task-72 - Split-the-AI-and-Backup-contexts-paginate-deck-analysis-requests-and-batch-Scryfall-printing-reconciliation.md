---
id: TASK-72
title: >-
  Split the AI and Backup contexts, paginate deck analysis requests, and batch
  Scryfall printing reconciliation
status: Done
assignee:
  - '@cody-bender'
created_date: '2026-09-20 16:34'
updated_date: '2026-09-20 16:46'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Structural review against the developing-elixir standard: Manavault.Ai (418 lines) owns settings persistence, provider validation, decklist parsing, AI calls, retries, and Oban orchestration; Ai.list_deck_analysis_requests/0 is an unbounded Repo.all exposed via the deck_analysis_requests GraphQL field (resolved in QueryResolvers.deck_analysis_requests); Manavault.Backup (423 lines) mixes archive creation, SQLite snapshot pruning, extraction, and filesystem restore; Manavault.Catalog.Scryfall.Import reconciliation loads the entire current and stale printing sets into memory under an infinite-timeout transaction and does a Repo.one plus writes per stale trade want. Scope is lib/manavault/ai.ex, ai/*, backup.ex, backup/*, catalog/scryfall/import.ex, lib/manavault_web/schema/{ai_resolvers,ai_types}.ex, schema/catalog/ai_operations.ex, and only the deck_analysis_requests resolver in query_resolvers.ex plus its field in deck_operations.ex. Do not modify collection*, trade*, decks/*, or other resolvers; other tasks own those. Keep the frontend query for deck analysis requests working or update it in assets/react/src/pages/decks/deck-analysis-dialog.tsx only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Manavault.Ai and Manavault.Backup are thin facades over action modules each under 250 lines
- [x] #2 deck_analysis_requests is a bounded connection or takes a required limit, and the UI still lists analyses
- [x] #3 Scryfall printing reconciliation runs in bounded batches or set-based SQL with per-batch transactions and no per-row Repo.one loop, with a test covering more rows than one batch
- [x] #4 mix test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract AI settings, deck analysis, external-list analysis, question answering, and analysis-request querying into focused action/query modules while retaining Manavault.AI as a compatibility facade. Split deck-analysis prompt/schema from result normalization/rendering.
2. Add a backwards-compatible optional GraphQL limit with a bounded default and server-side maximum; verify the existing no-argument frontend operation remains valid and regenerate generated GraphQL artifacts.
3. Extract backup creation, restore, SQLite snapshot pruning, and archive safety into focused modules while preserving public facade behavior and safety invariants.
4. Extract Scryfall reconciliation into a bounded batch action. Select only one stale-printing batch at a time, choose replacements from current printings for those oracle IDs, update references in a per-batch transaction, and replace trade-want per-row lookups with set-based SQL. Add coverage beyond one batch and idempotent retry coverage.
5. Run focused tests, formatter/codegen, full mix test, and strict Credo; record acceptance evidence and finalize TASK-72.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented thin AI and Backup facades with focused action modules. Preserved the existing deck-analysis frontend query by adding an optional GraphQL limit (default 50, server maximum 100); codegen completed with no generated diff. Scryfall reconciliation now processes 200 stale printings per transaction, uses bounded replacement queries, and merges trade wants with set-based SQLite upserts instead of per-row lookups. Added coverage for 201 stale rows, retry idempotency, existing trade-want merge conflicts, and GraphQL limiting.

Validation: focused suite 40 passed; Scryfall sync suite 19 passed; full mix test 676 passed; mix credo --strict found no issues; GraphQL codegen succeeded.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Split the AI and Backup god modules into thin facades and focused actions, bounded deck-analysis history without requiring a frontend change, and replaced unbounded Scryfall reconciliation with 200-row per-transaction batches plus set-based trade-want merging. Verified by 676 passing ExUnit tests, strict Credo, successful codegen, and explicit multi-batch/retry tests.
<!-- SECTION:FINAL_SUMMARY:END -->
