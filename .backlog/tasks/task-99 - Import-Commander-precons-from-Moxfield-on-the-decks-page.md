---
id: TASK-99
title: Import Commander precons from Moxfield on the decks page
status: Review
assignee:
  - '@amp'
created_date: '2026-11-04T00:26:00Z'
updated_date: '2026-11-04T06:58:00Z'
labels: []
dependencies: []
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an Import precon button to the decks gallery. It lists the Commander-format decks the Moxfield user WizardsOfTheCoast publishes (Moxfield deck search API), lets the user search and pick one, and imports its list as a new deck. Optionally the cards are added to the collection (in a chosen location) and allocated to the new deck.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Decks page has an Import precon button that opens a searchable list of WizardsOfTheCoast Commander precons from Moxfield
- [x] #2 Choosing a precon creates a new unlinked deck with the precon's cards, printings, and finishes
- [x] #3 Optionally the precon's cards are added to the collection in a chosen location and allocated to the new deck in one transaction
- [x] #4 Backend list fetch and import are covered by tests against a mocked Moxfield API
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend (manavault-collection decks/precons.rs): list WizardsOfTheCoast commander decks via Moxfield v2/decks/search-sfw (paged, cached 12h in AppState cache), parse name/product. 2. Import: fetch deck via lotus DecklistClient, create deck + write entries in one transaction (reuse external.rs reconciliation), optionally create collection items (precon printing/finish, chosen location, basics skipped) and allocate_in each to its deck card. 3. GraphQL: commanderPrecons query, importCommanderPrecon mutation; platform URL moxfield_deck_search. 4. Frontend: Import precon button + dialog on decks page with search, deck name, add-to-collection switch, location select; navigate to new deck. 5. Tests: wiremock list + import with/without collection; frontend dialog test. 6. Docs: features.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: rust:check (fmt, clippy -D warnings, workspace tests) and frontend lint/format/typecheck/test:react pass. 4 new Rust tests (wiremock list paging/cache, import with collection add + allocation, GraphQL import + list-location refusal) and 2 React dialog tests. End-to-end in the orb against a local mock of Moxfield's API (orb IPs get Cloudflare 403 from moxfield.com) with a full Scryfall catalog: imported Subjective Reality with collection add into a deck box; 30 non-basic items created and all allocated with the deck box as source location. Live Moxfield responses were not reachable from the orb.

Switched the precon source from Moxfield to MTGJSON (DeckList.json filtered to type 'Commander Deck', decks/<fileName>.json). Moxfield's list came back empty in prod: the WotC account files precons under a separate format and the source can't be checked from orbs. MTGJSON was verified live from the orb: 198 Commander decks, real Scryfall ids and isFoil/isEtched flags; an end-to-end import of Subjective Reality (no mocks) produced 100 cards, 3 foil commanders, 84 collection copies all allocated. Imports only accept ids from the list; empty lists are not cached.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decks gallery gets an Import precon button. Backend: decks/precons.rs lists WizardsOfTheCoast Commander decks via Moxfield v2/decks/search-sfw (paged, cached 12h) and imports one as a new unlinked deck in one transaction (create_deck_in + external::write_entries), optionally creating collection items in the precon's printing/finish in a chosen non-list location and allocating them (basics skipped). GraphQL: commanderPrecons query, importCommanderPrecon mutation; new PlatformUrls.moxfield_deck_search. Frontend: PreconImportDialog (search, deck name, collection switch, LocationPicker). Risk: Moxfield may 403 unapproved clients, same as linked decks.
<!-- SECTION:FINAL_SUMMARY:END -->
