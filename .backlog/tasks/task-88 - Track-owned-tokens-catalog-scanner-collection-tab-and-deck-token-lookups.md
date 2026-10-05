---
id: TASK-88
title: 'Track owned tokens: catalog, scanner, collection tab, and deck token lookups'
status: In Progress
assignee:
  - '@cfbender'
created_date: '2026-10-05 18:23'
updated_date: '2026-10-05 19:24'
labels: []
dependencies: []
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tokens are second-class today: the Scryfall import drops every set_type "token" card, so the browser scanner recognizes token art (the Oracle gallery includes tokens) but scannerPrintings cannot resolve it and the scan never imports. Deck pages guess which tokens a deck makes by parsing Oracle text ("create ... token"), which produces wrong names such as "of those tokens" and can never show the real token card or how many the user owns. Scryfall carries the authoritative link: a producing card's all_parts lists component "token" entries with the token printing id. Tokens are physical cards players want to browse and keep in their collection, but they must not be allocated to decks, counted in collection value, traded, or sold like regular cards. Many Commander-deck tokens are double-sided and Scryfall only models 121 printings as double_faced_token; the rest are separate single-faced tokens, so the physical back side of a scanned token is usually unknown and the user must pick it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scryfall import stores real token printings (layout token/double_faced_token, excluding "Card"-type helper cards) and records producer->token links from all_parts; memorabilia and non-token cards in token sets stay excluded
- [x] #2 Tokens never appear in card search, name suggestions, exact-name resolution, collection import candidates, or deck card adds
- [x] #3 Owned tokens are stored separately from collection items (quantity, finish, optional back-face printing) and do not affect collection counts, value, allocation, trade, or sell flows
- [x] #4 Collection page has a Tokens tab that lists owned tokens with image, name, set, quantity and back face, and supports adding, editing quantity, and removing tokens
- [x] #5 Scanner resolves recognized token art to catalog token printings; for a double_faced_token both faces are known; for a single-faced token the user is prompted with images of candidate back faces from the same token set (or "no back") before import
- [x] #6 Scanned tokens import into owned tokens, not collection items
- [x] #7 Deck "Tokens this deck can create" shows the actual token cards (image, name, type line) from catalog links, with the number owned, and falls back to Oracle-text parsing only for producers without catalog links
- [x] #8 ExUnit and vitest tests cover import filtering/links, token exclusion from search, owned-token mutations, and deck token summaries
- [x] #9 docs/features.md documents tokens
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Catalog: add scryfall_cards.layout; import keeps real tokens (layout token/double_faced_token, not "Card" helpers) from token sets while still dropping memorabilia and other token-set cards; new scryfall_card_tokens(scryfall_id, token_scryfall_id) populated from all_parts component "token"; reconcile cleans stale links. Card.token?/1 helper; exclude tokens in Search.Cards.Filter, CardsByName, CardNameSuggestions, Printings.search_printings.
2. Owned tokens: token_items table (scryfall_id, back_scryfall_id nullable, quantity, finish); Manavault.Catalog.Tokens context (list grouped by printing, add/update/remove); GraphQL token_item type, tokenItems query, tokens(q:) search, addTokenItem/updateTokenItem/deleteTokenItem mutations; Card.tokens -> [deck_token{card, printing, ownedCount}] via dataloader.
3. Deck tokens: Deck query fetches card.tokens; deck-tokens.ts groups by catalog token first (image, name, type line, owned count), Oracle-text fallback for producers with no links; DeckTokensSection renders images + owned badge.
4. Scanner: scan entries carry layout/isToken; scannerPrintings already resolves tokens once imported; single-faced token scans open a back-face picker (same-set token printings via new scannerTokenBackFaces query, plus "no back"); scan CSV gains back_scryfall_id; collection import routes token rows to token_items in preview+commit.
5. Collection Tokens tab: list owned tokens with image/name/set/qty/back face; add-token dialog (search tokens), edit quantity, delete.
6. Tests (ExUnit + vitest), docs/features.md, visual verification through portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified in the dev portal with agent-browser: Tokens tab (count 10, tiles with quantity badges, Treasure // Beast flips to its Beast back, Add token search -> printing grid -> back-face picker -> quantity/finish adds and merges into the existing stack, Edit dialog, Remove menu item, 'No tokens match' empty state). Deck 'Tokens this deck can create' shows Soldier/Treasure/Elemental with real art, producers, per-event amounts and Owned 4/3/0. Public share page lists the same tokens with no Owned column.

Full mix test exposed a regression: PublicShareCacheTest replays the frontend Deck query against /share/graphql, which lacked producedTokens. Added :produced_token + card.producedTokens to PublicShareTypes with ownedCount fixed at 0 (public shares never reveal inventory, matching printing.ownedCount there), DeckTokensSection showOwned={!shareMode} hides the column, and a schema test asserts the public count is 0 while the authenticated count is 3. Also added a scannerPrintings test proving single/double-faced tokens resolve with layout and backImageUrl.

Validation: mix format/credo --strict/compile --warnings-as-errors clean; mix test 829 passed (plus the two new tests); node --test 254 passed; vitest 170 passed; aube typecheck, vp lint, vp format --check clean; impeccable detect reported no findings. docs/features.md and docs/scanner.md updated. Work is uncommitted on the local checkout pending user review.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tokens become first-class: Scryfall import keeps token printings with layout and producer->token links; owned tokens live in token_items (never allocated/valued) behind tokenItems/tokenPrintings/addTokenItem/updateTokenItem/deleteTokenItem; the collection gains a Tokens tab with add/edit/remove and face flipping; the scanner resolves tokens, knows both faces of double_faced_token printings and prompts for the back of single-faced ones, exporting back_scryfall_id to the import; deck pages show the real token card, image and owned count (hidden on public shares). Verified with ExUnit (829), node/vitest (254/170) and browser checks through the review portal.
<!-- SECTION:FINAL_SUMMARY:END -->
