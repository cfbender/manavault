---
id: TASK-42
title: Fix diacritic-insensitive card matching and deck picker overflow
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-08 03:11'
updated_date: '2026-08-08 03:28'
labels: []
dependencies: []
modified_files:
  - assets/react/src/pages/cards/add-card-to-deck-dialog.tsx
  - lib/manavault/catalog/card.ex
  - lib/manavault/catalog/card_collection/search_filter/query.ex
  - lib/manavault/catalog/card_collection/search_filter/text_predicates.ex
  - lib/manavault/catalog/decks/decklist_io.ex
  - lib/manavault/catalog/scryfall/import.ex
  - lib/manavault/catalog/scryfall/import_rows.ex
  - lib/manavault/catalog/search/cards/filter.ex
  - lib/manavault/catalog/search/cards/text_predicates.ex
  - lib/manavault/catalog/search/name_match.ex
  - lib/manavault/catalog/search/printings.ex
  - priv/repo/migrations/20260808000000_add_normalized_card_names.exs
  - test/manavault/catalog/card_name_suggestions_test.exs
  - test/manavault/catalog/decklist_test.exs
  - test/manavault/catalog/search/name_match_test.exs
  - test/manavault/catalog_test.exs
type: bug
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card search suggestions can show names such as “Óin the Brave”, but exact card matching in search and deck import does not recognize the card. Users should also be able to omit diacritics when searching. Separately, the add-to-deck picker is clipped when the user has many decks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Searching for “Óin the Brave” recognizes and returns the card
- [x] #2 Searching for “Oin the brave” returns “Óin the Brave” without requiring the diacritic
- [x] #3 Import card-name matching recognizes “Óin the Brave” consistently with search
- [x] #4 The add-to-deck menu has a bounded height and can scroll to all decks when the list is long
- [x] #5 Relevant automated tests cover card-name normalization and matching
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add and backfill an indexed normalized card-name key derived by Unicode decomposition, diacritic removal, case folding, and existing apostrophe normalization; populate it on catalog imports and card changesets.
2. Route card-name search predicates and decklist import resolution through the shared normalized key, then add regressions for canonical “Óin the Brave” and unaccented “Oin the brave”.
3. Replace the add-to-deck dialog’s native deck select with the installed Radix select so its portaled option viewport has a bounded height and vertical scrolling while preserving keyboard and screen-reader semantics.
4. Run the migration, focused Elixir tests, frontend type/lint checks, and one bounded UI inspection/detector pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented persisted Unicode/diacritic-folded card name keys with migration backfill and routed catalog, collection, printing, and decklist name matching through the shared normalization. Replaced the add-to-deck deck selector with a Radix listbox capped at 16rem and vertically scrollable. Added regressions for accented and unaccented suggestions, catalog search, exact quoted search, and decklist import.

Validation: `mise exec -- mix ecto.migrate` applied migration 20260808000000; `mise exec -- mix test` passed 531 tests; frontend typecheck and production build passed; lint passed with two pre-existing warnings in buylist-marketplace-actions.test.tsx; formatting checks and Impeccable detector passed. Browser verification opened the 32-option deck list and measured a 254px client height, 1160px scroll height, 256px max height, and `overflow-y: auto`; the last deck remained reachable and the inspected screenshot showed no clipping.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a backfilled, indexed Unicode-normalized card-name key and reused it for suggestion, search, and decklist-import matching, so both “Óin the Brave” and “Oin the brave” resolve correctly. Replaced the add-to-deck native selector with an accessible Radix listbox capped at 16rem with vertical scrolling. Verified by the full 531-test Elixir suite, frontend typecheck/build/lint/format checks, successful migration, detector pass, and a 32-option browser interaction reaching the final deck without clipping.
<!-- SECTION:FINAL_SUMMARY:END -->
