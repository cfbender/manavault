---
id: TASK-97
title: Group deck cards into AI-planned roles with Jev
status: Review
assignee:
  - '@cfbender-pdq'
created_date: '2026-10-13 22:30'
updated_date: '2026-10-13 23:14'
labels: []
dependencies: []
references:
  - 'https://openrouter.ai/docs/guides/community/jev'
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Theme grouping relies on catalog themes picked by a fixed priority order, so it cannot express what a card does for this particular deck (Zuko's cast-from-exile and firebending payoffs, Hapatra's -1/-1 engine). The feature needs an AI key anyway, so the deck analysis LLM names deck-specific card categories, each with a short description, and Jev (TypeSafe decision model, `typesafe/jev-1.13` on OpenRouter `POST /api/alpha/decisions`, $0.042 per million input tokens, free output) sorts each card into one of them with the commander as context. A hand-written Zuko category list sorted 86 cards cleanly in testing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deck analysis returns and saves deck-specific card categories, each with a name and description
- [x] #2 Each non-commander deck card is assigned one of those categories by Jev, with the commander(s) as context, and an Other category always exists
- [x] #3 Assignments are stored per deck and card, so repeat views make no new Jev calls; new cards, a new analysis, or a commander change get fresh assignments
- [x] #4 Deck pages offer a Roles grouping that shows cards under their assigned categories in the analysis order
- [x] #5 Without an analysis that has categories, or when Jev fails, the deck page shows no error and the other groupings are unaffected
- [x] #6 Tests cover analysis category normalization, the Jev request and response handling, and assignment caching
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration: decks.ai_card_categories (JSON) and deck_card_categories (deck_id, oracle_id, category, confidence, digest).
2. Analysis schema and prompt gain card_categories; normalize trims, dedupes, caps them; save_analysis stores them.
3. New ai::card_categories module: Jev Decisions client (platform_urls.openrouter_decisions), categorize missing cards concurrently with commander context, digest of categories + commanders invalidates stale rows.
4. Analysis job categorizes the deck after saving (best effort); GraphQL mutation assignDeckCardCategories(deckId) fills gaps and returns categories + assignments.
5. Frontend: Roles group-by option, hook that calls the mutation when grouping by roles, grouping by assigned category in analysis order.
6. Tests (wiremock), codegen, rust:check, frontend:check, live check on the Zuko and Hapatra decks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Spot check on real decks (Zuko 86 cards, Hapatra 37): commander-synergy Noul separates cleanly (Zuko exile cards 0.64-0.91, staples 0.10-0.40; Hapatra -1/-1 cards + Doubling Season 0.77-0.93, rest <=0.40), cost ~$0.002 per deck. Primary-role Choice is mixed: clear wins (Ephemerate blink, Lightning Greaves protection, Sneak Attack cheat, Animate Dead reanimation) but low-confidence picks are noisy (Ajani's Anguish anthem 0.47, Electrodominance coin flip), so a confidence fallback is needed. Gap found: no catalog theme for cast-from-exile/impulse draw.

Jev weighs Choice options in the order given: a sorted serde_json::Map put Swords to Plowshares/Path to Exile under Exile Payoffs; analysis order puts them under Targeted Removal. Criteria now serialize in analysis order (regression test checks raw request order). Adding each card's catalog role themes to the state also fixed literal readings. REQUEST_VERSION in the digest invalidates assignments when the request changes.

Validation: mise run rust:check and mise run frontend:check pass. Live: gemini-4-argon analysis of Zuko (89 cards) produced 11 deck-specific categories; Jev assigned 89/89 in 3.2s for $0.0034. Hapatra test deck: 39 cards sorted into 10 categories, off-plan cards to Other. Roles grouping and the no-analysis notice inspected in the browser.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deck analysis now returns deck-specific card categories (saved on decks.ai_card_categories); Jev (typesafe/jev-1.13 via OpenRouter Decisions) assigns each non-commander card one of them plus Other, with commanders and catalog themes as context, cached in deck_card_categories by a digest of categories, commanders, model and request version. assignDeckCardCategories fills gaps; the deck page's new Roles grouping uses it and falls back to themes with a notice. Verified with wiremock tests, rust:check, frontend:check, and live runs on the Zuko and Hapatra decks.
<!-- SECTION:FINAL_SUMMARY:END -->
