---
id: TASK-51
title: Persist deck AI question history
status: Done
assignee: []
created_date: '2026-08-19 03:23'
updated_date: '2026-08-19 03:35'
labels: []
dependencies: []
type: feature
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Save successful AI questions and answers per deck so users can revisit them, view newest entries first in collapsible sections, and delete individual entries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Successful deck AI questions and answers persist and remain available after the dialog is reopened or the page reloads
- [x] #2 Question history is ordered newest first and each entry can be expanded or collapsed
- [x] #3 Users can delete an individual saved question and answer after destructive confirmation
- [x] #4 Failed or empty AI responses are not saved
- [x] #5 Backend and frontend tests cover persistence, ordering, rendering, and deletion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a deck-owned question-answer record with cascade deletion and newest-first catalog APIs.
2. Persist successful provider answers, expose history and deletion through authenticated GraphQL, and regenerate client types.
3. Replace the one-off answer UI with a newest-first collapsible history and confirmed deletion.
4. Run the migration and focused backend/frontend quality checks, then visually verify the dialog states.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a deck-owned Ecto record with cascade deletion, newest-first catalog APIs, GraphQL history/delete operations, generated client documents, and a collapsible React history with destructive confirmation. Shared DeckMarkdown now renders LaTeX through remark-math and KaTeX.

Validation: migration applied; 618 ExUnit tests passed; 6 focused Vitest tests passed; TypeScript typecheck, frontend lint/format, and production build passed. Browser verification covered persisted ordering, expansion, KaTeX rendering, confirmation, and deletion. Credo has two pre-existing refactoring notices in AI analysis code; the new code adds none.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Persisted successful per-deck AI questions and answers, rendered newest-first collapsible history with confirmed deletion, and added KaTeX rendering for AI Markdown. Verified with the full backend suite, focused frontend tests, typecheck, lint, build, and browser interaction.
<!-- SECTION:FINAL_SUMMARY:END -->
