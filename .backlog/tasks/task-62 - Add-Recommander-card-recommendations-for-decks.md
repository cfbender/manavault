---
id: TASK-62
title: Add Recommander card recommendations for decks
status: Done
assignee:
  - '@Cody Bender'
created_date: '2026-08-28 11:42'
updated_date: '2026-08-28 12:24'
labels: []
dependencies: []
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the recommander.cards public API (https://api.recommander.cards/public-release/api/decks/recommend/top) as a deck recommendation source alongside EDHREC. Recommander returns a single deck-aware ranked list of recommendations (oracle_id, name, score 0-1, only scores > 0.7), so the integration is tailored to that: query by oracle_id (ManaVault's canonical card IDs), enrich results with local card data and collection status, and present one ranked grid with an owned-only filter and attribution per Recommander's terms of use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deckRecommander GraphQL query returns ranked recommendations enriched with local card and collection status
- [x] #2 Payload sends commander, optional partner, and mainboard oracle_ids in oracle_id card_format
- [x] #3 Recommander API error result_codes (including rate limiting) map to friendly GraphQL errors
- [x] #4 Deck detail page offers a Recommander dialog with add-to-deck actions, owned-only filter, and attribution link
- [x] #5 Backend covered by an ExUnit test with a stubbed fetch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend: Manavault.Catalog.Recommander (client/payload/response) mirroring EDHRec module layout; payload uses card_format oracle_id with commander + optional partner from commander zone and mainboard oracle_ids; client POSTs to public-release recommend/top and unwraps ApiResult envelope mapping result_codes to error tuples; response reuses EDHRec.Response.CardLookup + CollectionStatus batched enrichment and adds rank.
2. Catalog context: deck_recommander/2 via cached_deck_read; Errors.recommander_error/1.
3. GraphQL: deck_recommander query field, :deck_recommander and :deck_recommander_card types, resolver.
4. ExUnit test with stubbed fetch validating payload shape and normalized response.
5. Frontend: DeckRecommanderDocument query, RecommanderDialog with ranked grid (rank + match percent), owned-only filter, attribution link; overlay kind recommander wired into detail page, utility overlays, and deck action menu; run codegen.
6. Verify: mix test (targeted), tsc/build, portal verification via agent-browser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend: Manavault.Catalog.Recommander (client/payload/response) mirrors EDHRec layout; payload uses card_format oracle_id, commanders sorted by name (first=commander, second=partner), deck=mainboard-only unique sorted oracle_ids (excludes commander+considering). Response reuses EDHRec.Response.CardLookup/CollectionStatus batched enrichment and adds 1-based rank sorted by score desc. GraphQL deckRecommander query + DeckRecommander/DeckRecommanderCard types + friendly error mapping in Errors.recommander_error/1. Frontend: RecommanderDialog ranked grid (rank badge, match %, price, collection badge), owned-only filter, attribution link, wired via overlay kind recommander + deck action menu (commander decks only). Verification: 651/650->651 mix test pass (added error-mapping test + schema contract update for deckRecommander), credo/format/typecheck/lint/build clean, live API e2e returned 10 ranked recs, browser-verified dialog + add-to-considering + owned filter via portal.

Follow-up: replaced commanderNames with commanders [{name, oracle_id, url}] on deckRecommander; url links to https://recommander.cards/card/<oracle_id> (verified their /card/ route resolves oracle IDs client-side). Dialog now shows a 'View on Recommander' external-link button per commander (labeled with commander name for partner decks), opening in a new tab / system browser via the house target=_blank pattern. Verified: 651 mix test, typecheck/lint/build clean, browser-verified button + correct href on portal.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Recommander (recommander.cards) deck recommendations: Elixir client/payload/response modules, Catalog.deck_recommander, deckRecommander GraphQL query with friendly result_code error mapping, and a RecommanderDialog on deck detail with ranked grid, owned-only filter, add-to-deck actions, and attribution. Verified with 651-test suite (incl. 4 new ExUnit tests + schema contract), live API call, and browser portal exercise of the dialog.
<!-- SECTION:FINAL_SUMMARY:END -->
