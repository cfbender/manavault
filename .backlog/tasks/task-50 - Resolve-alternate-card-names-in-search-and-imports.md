---
id: TASK-50
title: Resolve alternate card names in search and imports
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-15 23:03'
updated_date: '2026-08-15 23:10'
labels: []
dependencies: []
modified_files:
  - lib/manavault/catalog/printing.ex
  - lib/manavault/catalog/scryfall/import.ex
  - lib/manavault/catalog/scryfall/import_rows.ex
  - lib/manavault/catalog/search/name_match.ex
  - lib/manavault/catalog/search/cards_by_name.ex
  - lib/manavault/catalog/search/card_name_suggestions.ex
  - lib/manavault/catalog/search/cards/filter.ex
  - lib/manavault/catalog/search/cards/text_predicates.ex
  - lib/manavault/catalog/search/printings.ex
  - lib/manavault/catalog/card_collection/search_filter/query.ex
  - lib/manavault/catalog/card_collection/search_filter/text_predicates.ex
  - priv/repo/migrations/20260815000000_add_normalized_flavor_names.exs
  - test/manavault/catalog_test.exs
  - test/manavault/catalog/card_name_suggestions_test.exs
  - test/manavault/catalog/collection_test.exs
  - test/manavault/catalog/decklist_test.exs
  - test/manavault/catalog/search/cards_by_name_test.exs
type: bug
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cards with a Scryfall flavor name (alternate display name) should resolve to their canonical card throughout name search and import flows. For example, Pelican Town should resolve to Homeward Path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catalog search for an alternate card name returns the canonical card
- [x] #2 Card-name suggestions for an alternate card name return the canonical card name
- [x] #3 Collection and decklist imports accept an alternate card name
- [x] #4 Canonical exact-name matches retain precedence over alternate-name collisions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Persist a normalized printing flavor name alongside the existing canonical normalized card name.
2. Include alternate names in catalog and printing name predicates, exact batched resolution, and suggestion indexing.
3. Add focused regression coverage for Pelican Town resolving to Homeward Path across search and import paths, then run targeted tests and the migration.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Persisted normalized flavor names during migration and Scryfall imports, then reused them in catalog, collection, printing, exact-name, and suggestion paths. Canonical names are populated before flavor aliases so exact canonical matches retain precedence.

Validation: `mise exec -- mix ecto.migrate`; focused regression suite (75 passed); full `mise exec -- mix test` (606 passed); `mise exec -- mix compile --warnings-as-errors`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scryfall flavor names now resolve to canonical cards in search suggestions, catalog and collection search, collection imports, and decklist imports. Added normalized persisted aliases and Pelican Town → Homeward Path regressions; migration, 606 tests, and warnings-as-errors compilation passed.
<!-- SECTION:FINAL_SUMMARY:END -->
