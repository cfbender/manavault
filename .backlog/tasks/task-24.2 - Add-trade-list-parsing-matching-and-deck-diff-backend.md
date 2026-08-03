---
id: TASK-24.2
title: 'Add trade list parsing, matching, and deck diff backend'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 22:14'
updated_date: '2026-08-02 23:24'
labels: []
dependencies: []
parent_task_id: TASK-24
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Resolve pasted text or supported URLs (Moxfield, Archidekt, local ManaVault share links) into normalized card entries; match entries against the trade binder and wants; diff entries against a ManaVault deck. No arbitrary-host fetching.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tradeMatches GraphQL query accepts text or URL and returns binder and want matches plus unrecognized lines
- [x] #2 deckDiff GraphQL query returns adds, cuts, and quantity changes versus a deck
- [x] #3 URL fetching is restricted to hardcoded Moxfield/Archidekt API origins with validated IDs, no redirects, timeout and size caps; ManaVault share URLs resolve locally
- [x] #4 Unsupported URLs return a friendly error suggesting paste
- [x] #5 ExUnit tests cover parsing, matching, diffing, and URL validation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Manavault.Trade.ListSource resolves text via Catalog.Decklists.parse or URL via provider modules: Moxfield id -> api2.moxfield.com, Archidekt id -> archidekt.com/api, ManaVault /share/decks/:token resolved locally; strict id regexes, hardcoded origins, redirects off, timeouts, size cap. Matcher joins normalized names to oracle ids, intersects with for_trade items and trade_wants. DeckDiff aggregates deck cards (non-maybeboard) vs entries. GraphQL trade_list_operations.ex: tradeMatches + deckDiff queries. Req.Test-based ExUnit coverage.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: ListSource (text via Decklists.parse, Moxfield/Archidekt hardened fetchers, local-only ManaVault share resolution restricted to own/relative host), EntryResolver, Matcher (excludes list-kind locations), DeckDiff, tradeMatches/deckDiff GraphQL. Req.Test-stubbed tests green.

Validation: full suite 418 passed incl. Req.Test-stubbed provider tests; live Archidekt deck fetched+diffed in browser; local share URL resolved with 127.0.0.1 host; Moxfield 403 surfaces approved-apps paste hint; foreign/unknown share tokens error clearly; matcher excludes list-kind locations.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Manavault.Trade.Lists (ListSource with hardened Moxfield/Archidekt fetchers — hardcoded origins, id regexes, no redirects, 10s timeout, 5MB cap — and local-only ManaVault share-token resolution), EntryResolver (normalized/split-card name→oracle), Matcher (binder + wants, list-kind locations excluded), DeckDiff (adds/cuts/changes, maybeboard excluded), and tradeMatches/deckDiff GraphQL queries. Verified with ExUnit provider/matcher/diff tests and live browser: Archidekt deck diff, own share link self-diff (lists match), paste matching both directions.
<!-- SECTION:FINAL_SUMMARY:END -->
