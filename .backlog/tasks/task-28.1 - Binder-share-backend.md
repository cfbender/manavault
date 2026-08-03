---
id: TASK-28.1
title: Binder share backend
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 01:09'
updated_date: '2026-08-03 01:35'
labels: []
dependencies: []
parent_task_id: TASK-28
ordinal: 43000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 trade_binder_shares migration, Trade context functions, public and private binderList, share route, ListSource support, tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Migration 20260802130000 trade_binder_shares (mirror trade_want_shares); Trade.binder_share_token/ensure_binder_share_token/binder_list_by_share_token (for_trade items excluding list-kind locations, aggregated by printing+finish+condition); binderList(id) on public and private schemas; GET /share/binder/:token; ListSource local+remote binder link support; tests incl. contract MapSets.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
trade_binder_shares migration + BinderShare (token trio mirroring WantsShare), ForTradeQuery extracted and shared with Matcher unchanged, binder entries aggregated by printing/finish/condition, binderList on public+private schemas, GET /share/binder/:token, ListSource local+remote binder link support with wants-style error buckets. 489 tests green incl. new ExUnit + contract MapSet coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
