---
id: TASK-57
title: Run deck AI questions outside HTTP requests
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-22 16:58'
updated_date: '2026-08-22 17:08'
labels: []
dependencies: []
modified_files:
  - mix.exs
  - mix.lock
  - config/config.exs
  - config/test.exs
  - lib/manavault/application.ex
  - lib/manavault/ai.ex
  - lib/manavault/ai/deck_question_worker.ex
  - lib/manavault/catalog/deck_question_answer.ex
  - lib/manavault/catalog/decks/question_answers.ex
  - lib/manavault/catalog/decks.ex
  - lib/manavault/catalog.ex
  - lib/manavault_web/schema/catalog/deck_types.ex
  - assets/react/src/pages/decks/queries.ts
  - assets/react/src/pages/decks/deck-question-dialog.tsx
  - test/manavault/ai_test.exs
  - test/manavault_web/schema/ai_test.exs
  - assets/react/test/deck-question-dialog.test.tsx
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cloudflare returns HTTP 524 when a synchronous OpenRouter deck-question completion exceeds its roughly 120-second response timeout, even though ManaVault later receives a successful completion. Persist question jobs and complete them outside the GraphQL request so slow providers do not lose answers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Asking a deck question returns before the OpenRouter completion finishes
- [x] #2 Pending, completed, and failed question states are persisted and exposed through GraphQL
- [x] #3 The deck question dialog polls pending work and displays completion or a useful failure
- [x] #4 Pending work is recoverable after application restart
- [x] #5 Backend and frontend tests cover the asynchronous workflow
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Select a maintained SQLite-compatible durable job mechanism and establish shared application job infrastructure.
2. Persist AI question lifecycle state and enqueue generation transactionally outside the GraphQL request.
3. Expose pending/completed/failed states and poll them from the deck question dialog.
4. Recover interrupted work and verify backend, GraphQL, and React behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Selected Oban 2.23 with its native SQLite Lite engine. Added a dedicated ai queue, transactional question/job insertion, persisted lifecycle fields, retries, GraphQL exposure, and frontend polling.

Validation: all 632 ExUnit tests passed before the final worker observability adjustment; the 12 affected backend tests and 10 affected React tests passed afterward. TypeScript typecheck, frontend lint, production build, formatting, compilation with warnings as errors, migration execution, and git diff checks passed. The full precommit alias stops at two pre-existing Credo refactoring suggestions in deck_analysis.ex:170 and ai.ex:53.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved deck AI questions to a durable Oban SQLite queue so GraphQL returns a persisted pending record immediately instead of waiting for OpenRouter. Jobs retry and survive restarts, save completed or failed state, and the dialog polls pending questions and renders completion or errors. Verified backend lifecycle/GraphQL tests, React pending/failure/polling tests, typecheck, lint, and production build.
<!-- SECTION:FINAL_SUMMARY:END -->
