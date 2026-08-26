---
id: TASK-61
title: Allow editing deck play history
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-08-26 04:09'
updated_date: '2026-08-26 04:28'
labels: []
dependencies: []
references:
  - assets/react/src/pages/decks/deck-editor-dialogs.tsx
  - lib/manavault/catalog/deck.ex
modified_files:
  - assets/react/src/gql/gql.ts
  - assets/react/src/gql/graphql.ts
  - assets/react/src/pages/decks/deck-editor-dialogs.tsx
  - assets/react/src/pages/decks/queries.ts
  - assets/react/test/deck-detail-overlays.test.tsx
  - lib/manavault/catalog/deck.ex
  - lib/manavault_web/schema/catalog/deck_types.ex
  - test/manavault/catalog/deck_picker_test.exs
  - test/manavault_web/schema/deck_mutations_test.exs
type: feature
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let users import historical deck-picker data by editing a deck's play count, skip count, and last-played date. The imported values should feed the existing picker weighting and play-history breakdown.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The deck editor shows the current play count, skip count, and last-played date for active, brewing, and archived decks.
- [x] #2 Saving accepts non-negative whole-number counts and persists a selected or cleared last-played date.
- [x] #3 Saved historical values immediately appear in the decks-page play-history breakdown and affect picker weighting.
- [x] #4 Backend/schema and React tests cover persistence, clearing the date, input validation, and mutation variables.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the deck changeset and GraphQL update input to accept non-negative play/skip counts and a nullable ISO last-played timestamp; cover persistence and clearing in context/schema tests.
2. Add play-history fields to the update mutation and a private edit-history query while keeping the shared public deck query compatible; regenerate typed GraphQL artifacts.
3. Add a compact Historical play data fieldset to the existing deck editor with validated whole-number inputs and a clearable date input, converting between the user’s local calendar date and the stored UTC timestamp.
4. Add React coverage for list/detail initial values, submitted variables, clearing, and invalid counts; run full checks and exercise the edit/history flow in the supervised portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented editing for plays, skips, and last-played date in the existing deck dialog. A dedicated authenticated DeckPlayHistory query keeps private history fields out of the public-share-compatible Deck query. Browser verification set Atraxa Counters to 17 plays, 4 skips, and July 15, 2026 from both list and detail edit paths and confirmed the play-history table updated immediately. Validation: mix test (647 passed); aube run test:react (196 Node + 99 Vitest passed); aube run typecheck; aube run lint; aube run build; scoped Elixir/React formatting; git diff --check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added historical play-data editing to the deck editor, including private detail loading, nonnegative count validation, clearable local-calendar dates, persistence, and immediate picker/history refreshes. Verified with the complete backend and React suites, typecheck, lint, production build, and desktop/mobile portal flows.
<!-- SECTION:FINAL_SUMMARY:END -->
