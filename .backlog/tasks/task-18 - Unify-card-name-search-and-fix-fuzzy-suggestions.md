---
id: TASK-18
title: Unify card name search and fix fuzzy suggestions
status: Done
assignee:
  - '@claude'
created_date: '2026-07-20 00:45'
updated_date: '2026-07-20 02:13'
labels:
  - enhancement
dependencies: []
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card name matching is implemented three (four) times with divergent behavior: (1) CardNameSuggestions (in-memory name cache + hand-rolled edit distance) backs the cardNameSuggestions combobox query; (2) Catalog.Search.Cards + Cards.Filter/TextPredicates (SQL LIKE) backs the cards connection used by catalog search, home search, and the add-card dialog lookup; (3) CardCollection.SearchFilter is a parallel query-parser/predicate stack for collection/location item search; (4) Search.Printings name filter used by import and cover search. Suggestions therefore disagree with real search results.

Confirmed bug: suggest_card_names("mask of memory") returns ["\"Rumors of My Death . . .\"", "A Display of My Dark Power", "Aegis of the Meek", "Agent of Masks", "Akuta, Born of Ash"] — Mask of Memory is absent, while the cards search for the same term works. Root cause: card_name_candidate?/2 accepts any name where ANY term token prefix-matches ANY name token, so the token "of" admits most of the catalog; card_name_suggestion_candidates/2 then truncates the ALPHABETICALLY sorted pool with Enum.take(250) BEFORE scoring, so correct matches past the first 250 accepted candidates (e.g. names starting with m) are never scored.

Goal: one core name-matching action shared by suggestions, catalog card search, collection item search, and printing search so a term behaves identically everywhere, and suggestions that surface the right cards for partial/multi-word input.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cardNameSuggestions("mask of memory") and partial inputs like "mask of mem" return Mask of Memory (regression test for the pre-scoring truncation bug)
- [x] #2 Suggestions, catalog cards search, collection item search, and printing name search all delegate to a single shared core name-matching action/resolver path (no parallel hand-rolled matcher remains)
- [x] #3 Multi-word and out-of-order/typo-tolerant queries return the intended card within the top suggestions (e.g. stopword tokens like 'of' cannot admit the whole catalog)
- [x] #4 Existing search behavior (scryfall-style field syntax, collection filters, import matching) keeps working; relevant test suites pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New shared module Catalog.Search.NameMatch: normalize/1 (downcase, apostrophe-strip, non-alnum collapse), like_pattern/1 (escape + wildcards, consolidated from the two duplicated Values.like_pattern), candidate?/2 (fixed gate: exact/substring/compact OR every significant term token prefix-matches a name token, stopwords optional, else per-token fuzzy with distance<=max(2,div(len,3)) and first-token initial alignment), score/2 (class: exact 0/prefix 1/substring 2/fuzzy 8; cheap classes rank by length+alpha, fuzzy class by min edit distance). 2. CardNameSuggestions: keep name cache + ngram/initial indexes (not the bug), replace gate+score with NameMatch, remove pre-scoring alphabetical Enum.take(250) truncation. 3. SQL unification: Cards.TextPredicates, CardCollection.SearchFilter.TextPredicates, Search.Printings name filters all use NameMatch.like_pattern + apostrophe-insensitive column match (lower(replace(name, apostrophe, ''))); both Values.like_pattern duplicates delegate to NameMatch. 4. Tests: NameMatch unit tests; suggestions regression with filler 'A ... of ...' cards proving mask of memory surfaces; keep existing fuzzy tests green. 5. Verify: mix test, mix credo, manual mix run checks (mask of memory/mem/memroy, of, m), browser spot-check combobox on /cards.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: new shared module Catalog.Search.NameMatch owns all name-match semantics (normalize, sql_normalize, like_pattern/substring_pattern, candidate?/2 gate, score/2 ranking). CardNameSuggestions keeps its persistent_term name cache + ngram/initial indexes but delegates gating/scoring to NameMatch; the pre-scoring alphabetical Enum.take(250) truncation is gone — all gated candidates are scored and sorted. Gate now requires every significant term token to prefix- or fuzzy-match a name token (stopwords of/the/a/... optional, fuzzy only for >=3-char tokens with shared initial, threshold max(2, div(len,2))), plus a compacted whole-term distance fallback. Score ranks exact < prefix < substring < fuzzy; cheap classes order by length then alpha. SQL name predicates in Cards.TextPredicates (plain_text + name:), CardCollection.SearchFilter.TextPredicates (plain_text name clause + name:), and Search.Printings.maybe_filter_card_name all use NameMatch.like_pattern with an apostrophe-insensitive column expression lower(replace(replace(name,'',''),'’','')) — 'urzas' now finds Urza's cards everywhere. Both duplicated Values.like_pattern implementations now delegate to NameMatch.substring_pattern. Out of scope (noted): the collection SearchFilter.Query parser is a distinct smaller grammar than ScryfallQuery — query parsing, not name matching. Evidence: new name_match_test.exs (13 tests) + mask-of-memory regression with of-token distractors; full mix test 339/339; credo --strict clean; dev-DB mix run: 'mask of memory'/'mask of mem'/'mask of memroy' all return Mask of Memory first, pathological short terms ('m','of','li','the') 4-22ms; live browser check on /cards combobox confirms both terms rank Mask of Memory first.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Unified card name matching behind Catalog.Search.NameMatch and fixed fuzzy suggestions. Root cause of 'mask of memory' returning garbage: the old gate admitted any name sharing any token (so 'of' admitted most of the catalog) and truncated the alphabetically-sorted candidate pool at 250 before scoring, dropping the exact match. Now every significant token must match, stopwords can't admit candidates alone, and all gated candidates are scored (exact < prefix < substring < fuzzy). Catalog cards search, collection item search, printing search, and suggestions all share NameMatch for term normalization/patterns, with apostrophe-insensitive matching on both sides ('urzas' matches Urza's). Verified: 339/339 mix test incl. 13 new NameMatch tests + regression test, credo --strict clean, dev-DB timings 4-33ms per suggestion, live browser combobox check on /cards.
<!-- SECTION:FINAL_SUMMARY:END -->
