---
id: TASK-33
title: Allow changing a card's printing while editing
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-04 19:09'
updated_date: '2026-08-04 19:17'
labels: []
dependencies: []
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Collectors can correct a mistakenly scanned printing from the cards page without deleting the collection entry and adding it again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The card edit UI allows selecting a different printing of the same card
- [x] #2 Saving moves the collection entry to the selected printing while preserving its editable collection details
- [x] #3 The cards page reflects the newly selected printing after a successful save
- [x] #4 Relevant backend and frontend behavior is covered by tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the single-item GraphQL update input and collection update changeset to accept a printing ID, validating the chosen printing and all edited item fields in one database update.\n2. Query printings for the item's card in the edit dialog, initialize the current printing, and submit the selected printing while keeping quantity, condition, language, finish, location, notes, and purchase price in the same save.\n3. Keep finish selection valid when the chosen printing offers different finishes, regenerate GraphQL client types, and add targeted schema and React tests.\n4. Run focused backend tests plus frontend typecheck/tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented printing selection in the collection-item edit dialog, constrained finish choices to the selected printing, added printing ID support to the atomic update mutation, regenerated GraphQL client artifacts, and added focused backend/frontend coverage.

Validation: 30 focused ExUnit tests passed; frontend typecheck passed; all 201 React tests passed (182 node tests and 19 Vitest tests); frontend lint completed with 0 errors and 2 pre-existing warnings in buylist-marketplace-actions.test.tsx.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added printing selection to collection-item editing, including finish compatibility and an atomic GraphQL/backend update that preserves item metadata. Verified through the edit-dialog DOM test, schema/context tests, TypeScript typecheck, frontend lint, and the complete React test suite.
<!-- SECTION:FINAL_SUMMARY:END -->
