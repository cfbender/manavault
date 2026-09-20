---
id: TASK-72
title: >-
  Split the AI and Backup contexts, paginate deck analysis requests, and batch
  Scryfall printing reconciliation
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
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
- [ ] #1 Manavault.Ai and Manavault.Backup are thin facades over action modules each under 250 lines
- [ ] #2 deck_analysis_requests is a bounded connection or takes a required limit, and the UI still lists analyses
- [ ] #3 Scryfall printing reconciliation runs in bounded batches or set-based SQL with per-batch transactions and no per-row Repo.one loop, with a test covering more rows than one batch
- [ ] #4 mix test passes
<!-- AC:END -->
