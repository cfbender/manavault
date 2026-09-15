---
id: TASK-25.2
title: Add wants printing preference and public wants share backend
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 23:29'
updated_date: '2026-08-03 00:12'
labels: []
dependencies: []
parent_task_id: TASK-25
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wants may target a specific printing; the wants list gets a deck-style share token exposed on the public share schema and a public share page route.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 trade_wants supports an optional preferred printing with sane uniqueness (one generic want per card, one per printing)
- [x] #2 createTradeWant accepts a scryfallId alternative to name; trade_want exposes its printing
- [x] #3 ensureTradeWantsShareToken mutation and tradeWantsShareToken query manage a share token
- [x] #4 Public /share/graphql exposes wantsList(id: token) with card name, quantity, printing info, and image
- [x] #5 GET /share/wants/:token serves the public app shell
- [x] #6 ExUnit tests cover printing wants, share token, and public query
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Migrations: trade_wants.preferred_printing_id (partial unique indexes: oracle-only where null, oracle+printing where not null) + trade_want_shares singleton token table. Trade context: create_want_by_printing, printing-aware bumping, wants_share_token/ensure/entries. GraphQL: trade_want.printing, createTradeWant(scryfall_id), share token query/mutation, public wantsList(id), router GET /share/wants/:token. Tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend landed and green (467 tests): preferred_printing_id with partial unique indexes, trade_want_shares singleton token, createTradeWant scryfallId path persists the printing, public + private-mirror wantsList query, GET /share/wants/:token. Frontend consumption under 25.5.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
trade_wants gained preferred_printing_id (partial unique indexes: one generic want per card, one per printing); createTradeWant(scryfallId) persists the printing; trade_want.printing exposed; trade_want_shares singleton token with ensure mutation + token query; public wantsList(id) on /share/graphql (mirrored on the private schema for codegen, sharedDeck precedent); GET /share/wants/:token serves the shell publicly. Verified: 467 ExUnit tests green; browser flow added an LEA-pinned Lightning Bolt want, shared it, and viewed the public page.
<!-- SECTION:FINAL_SUMMARY:END -->
