---
id: TASK-60
title: Add weighted random deck picker and play history
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-08-26 01:47'
updated_date: '2026-08-26 02:07'
labels: []
dependencies: []
references:
  - assets/react/src/pages/decks/list-page.tsx
  - lib/manavault/catalog/decks.ex
modified_files:
  - priv/repo/migrations/20260826000000_add_play_history_to_decks.exs
  - lib/manavault/catalog/deck.ex
  - lib/manavault/catalog/decks/deck_picker.ex
  - lib/manavault/catalog/decks.ex
  - lib/manavault/catalog.ex
  - lib/manavault_web/schema/catalog/deck_fields.ex
  - lib/manavault_web/schema/catalog/deck_mutations.ex
  - lib/manavault_web/schema/catalog/deck_operations.ex
  - lib/manavault_web/schema/catalog/deck_types.ex
  - lib/manavault_web/schema/catalog/mutation_resolvers.ex
  - lib/manavault_web/schema/catalog/query_resolvers.ex
  - assets/react/src/pages/decks/queries.ts
  - assets/react/src/pages/decks/deck-picker.tsx
  - assets/react/src/pages/decks/list-page.tsx
  - assets/react/src/gql/gql.ts
  - assets/react/src/gql/graphql.ts
  - test/manavault/catalog/deck_picker_test.exs
  - test/manavault_web/schema/deck_picker_test.exs
  - test/manavault_web/schema/schema_domain_contract_test.exs
  - assets/react/test/deck-picker.test.tsx
type: feature
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let users ask ManaVault to suggest an active deck to play. Suggestions should be weighted by play recency, play frequency, and prior skips; users can accept or skip a suggestion, and the decks page should show the resulting per-deck play history.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The decks page has a button that opens an accessible random-deck dialog when playable decks exist.
- [x] #2 The picker excludes archived decks and weights suggestions so older/less-played decks become more likely, accepted decks become less likely, and skipped decks become more likely.
- [x] #3 Accepting and skipping are persisted and skipping offers another eligible deck without immediately repeating the current suggestion when alternatives exist.
- [x] #4 A collapsed section below active decks and above archived decks shows each playable deck's play count, skip count, and last-played time, including decks with no history.
- [x] #5 Context, GraphQL, and React tests cover weighting, persistence, picker interaction, empty/single-deck behavior, and the play-history breakdown.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add aggregate play count, skip count, and last-played fields to decks, then implement a DeckPicker module that persists outcomes and selects non-archived decks with weight = recency × (skips + 1) / (plays + 1); treat never-played decks as older than the oldest played candidate and avoid the immediately skipped deck when alternatives exist.
2. Expose play statistics on Deck plus randomDeck and recordDeckPlay GraphQL operations, with context and schema tests for weighting, archive exclusion, persistence, and Relay IDs.
3. Add an accessible picker dialog and collapsed play-history table to the existing decks page, generate typed GraphQL artifacts, and cover choose/skip, empty, single-deck, and history states in React tests.
4. Run the migration and targeted backend/frontend checks, then exercise desktop and mobile states through a supervised Amp portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented aggregate play/skip history on decks and weighted selection using recency × (skips + 1) / (plays + 1). Never-played decks receive the strongest recency boost; archived decks are excluded; skipped suggestions avoid immediate repeats when alternatives exist.

Validation: migration is up; `mix test` passed 646 tests; Credo strict passed; frontend lint, typecheck, 196 Node tests, 95 Vitest tests, and production build passed. Desktop and 390px mobile picker/history states were exercised through the supervised portal, including persisted skip rerolls and persisted play updates. All task-touched files pass formatting checks. The repository-wide formatter still reports pre-existing drift in unrelated `assets/react/test/deck-bracket.test.tsx` and `aube-lock.yaml`, which were left untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a persisted weighted random deck picker with choose/skip actions and a collapsed per-deck play-history breakdown. Verified weighting and persistence through context/schema/React tests, the full backend and frontend suites, production build, migration status, and desktop/mobile portal interaction.
<!-- SECTION:FINAL_SUMMARY:END -->
