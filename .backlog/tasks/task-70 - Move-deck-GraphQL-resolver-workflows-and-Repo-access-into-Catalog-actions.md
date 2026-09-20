---
id: TASK-70
title: Move deck GraphQL resolver workflows and Repo access into Catalog actions
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
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
- [ ] #1 No resolver under lib/manavault_web/schema/catalog/ calls Manavault.Repo directly for deck, deck card, allocation, or location operations
- [ ] #2 Adding a collection item to a deck with allocation is one Catalog action that runs both writes in one transaction, with a test proving the deck card is not created when allocation fails
- [ ] #3 Expected not-found cases return {:error, :not_found} from the domain and translate to GraphQL errors instead of raising
- [ ] #4 One shared payload helper or middleware replaces the duplicated payload/5 functions
- [ ] #5 Manavault.Catalog.Decks.Cards is split into verb-named action modules each under 250 lines
- [ ] #6 mix test passes
<!-- AC:END -->
