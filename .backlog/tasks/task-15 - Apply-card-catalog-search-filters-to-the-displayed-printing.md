---
id: TASK-15
title: Apply card catalog search filters to the displayed printing
status: Done
assignee:
  - '@cfb'
created_date: '2026-07-17 04:48'
updated_date: '2026-07-17 05:02'
labels:
  - enhancement
dependencies: []
priority: medium
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The /cards catalog search filters (set:, usd, date:, lang:, etc.) already match at the printing level, but results always display printings[0] from a newest-first preload, so a query like 'set:dmr usd>=3' can show a printing from a different set/price than the one that matched. Make each search result surface the printing that satisfied the query: the earliest-released printing matching the printing-level filters, defaulting to the earliest-released printing overall when no printing filters constrain the result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Searching 'set:dmr usd>=3' shows each matching card with a DMR printing priced >= $3 as its displayed printing
- [x] #2 With no printing-level filters, the displayed printing is the card's earliest-released printing
- [x] #3 When multiple printings match the filters, the earliest-released matching printing is displayed
- [x] #4 Existing card search sorts and filters keep working (mix test passes)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In Manavault.Catalog.Search.Cards.search_cards/2: preload printings ordered released_at asc (earliest first, scryfall_id tiebreak) instead of desc. 2. Run a second query (same card+printing join and Filter.apply on the parsed term, restricted to the returned card_ids) selecting printing scryfall_ids that matched the query; stably reorder each card's preloaded printings so matched printings come first. GraphQL card_printings preserves list order and the UI grid renders printings[0], so no schema or frontend changes needed. 3. Tests in catalog_test.exs: set+usd filter surfaces the matching printing first; multiple matching printings -> earliest matched first; no printing filters -> earliest released first. 4. mix test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: mix test (325 passed, incl. 4 new catalog tests for matched-printing ordering), mix compile --warnings-as-errors clean, mix credo --strict clean, vp fmt --check clean. Live GraphQL smoke test on dev server: cards(q:"set:dmr usd>=3") returns each card with a DMR printing >= $3 first (Counterspell: dmr #457 $9.11 first, non-matching lea printing demoted); cards(q:"!\"Counterspell\"") returns printings lea -> leb -> 2ed (earliest first). No frontend changes needed: GraphQL card_printings preserves list order and the grid renders printings[0].

Follow-up: user's UI still showed newest-first printings after the change. Root cause: Manavault.Catalog.Cache caches search_cards results for 11h keyed by {module, @version, {:search_cards, term, opts}} and only invalidates on imports, so searches run before the ordering change kept serving pre-change results on the long-running dev server. Fixed by bumping the cache @version to 2 (lib/manavault/catalog/cache.ex) so stale entries are never read. Verified fresh GraphQL responses return matched-earliest printings across set/usd/lang/is:foil/date filter shapes; mix test 325 passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Card catalog search now surfaces the printing that matched the query. search_cards/2 preloads printings earliest-released-first (scryfall_id tiebreak), reruns the parsed filter over the card+printing join for the returned cards to collect matched printing ids, and stably promotes matched printings to the front of each card's list. The UI grid displays printings[0], so 'set:dmr usd>=3' shows the DMR printing >= $3 and unfiltered searches default to the first-released printing. Verified with mix test (325 passed) and live GraphQL queries against the dev catalog.
<!-- SECTION:FINAL_SUMMARY:END -->
