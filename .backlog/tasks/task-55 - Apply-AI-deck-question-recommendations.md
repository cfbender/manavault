---
id: TASK-55
title: Apply AI deck question recommendations
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-19 21:26'
updated_date: '2026-08-19 21:47'
labels: []
dependencies: []
modified_files:
  - assets/react/src/gql/gql.ts
  - assets/react/src/gql/graphql.ts
  - assets/react/src/pages/decks/deck-detail-header.tsx
  - assets/react/src/pages/decks/deck-question-dialog.tsx
  - assets/react/src/pages/decks/deck-question-recommendations.tsx
  - assets/react/src/pages/decks/queries.ts
  - assets/react/test/deck-question-dialog.test.tsx
  - lib/manavault/ai.ex
  - lib/manavault/ai/deck_question.ex
  - lib/manavault/catalog/deck_question_answer.ex
  - lib/manavault_web/schema/catalog/deck_fields.ex
  - lib/manavault_web/schema/catalog/deck_types.ex
  - >-
    priv/repo/migrations/20260819212626_add_recommendations_to_deck_question_answers.exs
  - test/manavault/ai/deck_question_test.exs
  - test/manavault/ai_test.exs
  - test/manavault_web/schema/ai_test.exs
type: feature
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deck Q&A answers can carry structured cut and addition recommendations so users can turn AI advice into deck-planning actions without manually finding each card.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI deck-question responses may return zero or more recommended cuts and additions, and saved question history preserves and exposes them.
- [x] #2 A saved answer with recommendations shows cut and addition choices selected by default, and the user can toggle each recommendation independently.
- [x] #3 The user can mark the selected cuts as Consider Cutting and add the selected additions to the Considering board, with clear pending, success, and error feedback.
- [x] #4 Existing answers without recommendations continue to render normally, and focused backend and React tests cover the new behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Persist normalized cut/add recommendation names with each deck question answer and expose non-null recommendation lists through GraphQL.
2. Extend the strict AI response contract and prompt for cuts as well as additions, validate cuts against the current deck and additions against catalog legality, then save canonical names.
3. Render recommendation checklists in saved answers with all actionable items selected by default; use the existing bulk tag and add-card mutations to mark selected cuts Consider Cutting and add selected cards to Considering, with local pending/success/error states.
4. Update generated GraphQL types, migrate the database, and verify focused Elixir/React tests plus type and UI checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented structured, persisted cut/add recommendations for deck Q&A. The backend validates cuts against counted deck cards and additions against catalog legality/color identity, canonicalizes names, and exposes empty lists for legacy answers. The Q&A history renders default-selected, independently toggleable recommendations and reuses existing deck mutations to apply selected cuts/additions with pending, partial-error, success, and applied states.

Validation: mix ecto.migrate (already up); mix test (626 passed); frontend test suite (196 node tests + 80 Vitest tests passed); TypeScript typecheck; Vite production build; frontend lint (0 warnings/errors); changed-file format check; mix format --check-formatted; git diff --check; impeccable detect ([]). Browser-tested default selection, independent toggling, both real mutation paths, applied states, and full mobile scrolling; inspected desktop and mobile layouts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added optional AI cut/add recommendations to saved deck Q&A, with default-selected controls that mark chosen cuts Consider Cutting and add chosen cards to Considering. Verified backend persistence/validation and legacy compatibility, automated action behavior, full test suites, build/type/lint checks, and desktop/mobile interaction.
<!-- SECTION:FINAL_SUMMARY:END -->
