---
id: TASK-70
title: Move deck GraphQL resolver workflows and Repo access into Catalog actions
status: Done
assignee:
  - '@cody'
created_date: '2026-09-20 16:34'
updated_date: '2026-09-20 16:46'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Structural review against the developing-elixir standard: ManavaultWeb.Schema.Catalog.AllocationResolvers.add_collection_item_to_deck builds deck-card attrs and chains add_card_to_deck and allocate_collection_item_to_deck_card without a transaction; DeckMutations has six Repo.get!/Repo.preload call sites and owns commander error wording; LocationMutations calls Repo directly; CollectionOperations and DeckOperations carry identical private payload/5 helpers; Manavault.Catalog.Decks.Cards (455 lines) mixes CRUD, bulk edits, commander rules, and allocation migration. Scope is lib/manavault/catalog/decks.ex, lib/manavault/catalog/decks/*, and lib/manavault_web/schema/catalog/{allocation_resolvers,deck_mutations,deck_operations,deck_types,deck_fields,collection_operations,location_mutations}.ex. Do not modify lib/manavault/catalog/collection.ex, collection/*, trade*, ai*, backup*, scryfall/*, or query_resolvers.ex; other tasks own those.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No resolver under lib/manavault_web/schema/catalog/ calls Manavault.Repo directly for deck, deck card, allocation, or location operations
- [x] #2 Adding a collection item to a deck with allocation is one Catalog action that runs both writes in one transaction, with a test proving the deck card is not created when allocation fails
- [x] #3 Expected not-found cases return {:error, :not_found} from the domain and translate to GraphQL errors instead of raising
- [x] #4 One shared payload helper or middleware replaces the duplicated payload/5 functions
- [x] #5 Manavault.Catalog.Decks.Cards is split into verb-named action modules each under 250 lines
- [x] #6 mix test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Split Decks.Cards into focused verb-named add, update, bulk-update, commander, and delete action modules under 250 lines; keep Decks and Catalog as thin facades.
2. Add context-owned non-bang fetch/preload APIs for deck cards, deck tags, and resolver location validation, and route resolvers through them with centralized GraphQL error wording.
3. Add AddCollectionItemToDeck as one Repo.transact action and cover rollback on allocation failure.
4. Replace duplicated GraphQL payload wrappers with one shared helper without changing schema fields.
5. Run focused tests, schema codegen/no-generated-diff check, full mix test, and strict Credo; finalize TASK-70 and commit locally.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented focused deck-card action modules (largest 112 lines), a transactional AddCollectionItemToDeck action, non-bang resolver fetch APIs, centralized commander/not-found error text, and a shared GraphQL payload helper. Because collection domain files were explicitly out of scope, location fetch/preload/validation lives in Decks.FetchLocation; this can move to the collection domain when that ownership boundary is available.
Validation: focused deck/allocation/location suite 42 passed; full mix test 677 passed; mix credo --strict found no issues; GraphQL codegen completed with no assets/react/src/gql diff; git diff --check passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved deck/allocation/location persistence work out of assigned GraphQL resolvers, made add-collection-item-to-deck atomic, split the 455-line Cards implementation into verb-named modules under 250 lines, and centralized payload/error adaptation. Verified rollback and non-bang fetch behavior with tests; full suite passed 677 tests, strict Credo passed, and GraphQL codegen produced no generated schema diff.
<!-- SECTION:FINAL_SUMMARY:END -->
