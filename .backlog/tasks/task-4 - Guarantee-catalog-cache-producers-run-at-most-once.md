---
id: TASK-4
title: Guarantee catalog cache producers run at most once
status: Done
assignee:
  - '@codex'
created_date: '2026-07-15 15:52'
updated_date: '2026-07-15 17:31'
labels:
  - backend
  - cache
  - correctness
dependencies: []
references:
  - lib/manavault/catalog/cache.ex
  - lib/manavault/catalog/cached.ex
priority: high
type: bug
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Catalog.Cache.cached currently rescues exceptions from both cache infrastructure and the supplied producer in the same block. A producer failure can therefore be classified as a cache failure and cause the producer to run a second time, duplicating database work or external requests. Establish a strict boundary in which cache fetch and put failures are best-effort, but the producer executes no more than once and its result or failure is preserved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a cache hit, the cached value is returned and the producer is not executed.
- [x] #2 On a cache miss, the producer executes exactly once and its successful value is returned even when the subsequent cache put fails.
- [x] #3 When the producer raises, throws, or exits, it is executed exactly once and the original failure is propagated without being logged or retried as a cache infrastructure failure.
- [x] #4 A cache fetch failure falls back to one producer execution, and cache fetch/put failures retain the existing best-effort logging behavior without hiding producer errors.
- [x] #5 Deterministic tests use a counted producer and injected cache failures to cover hit, miss, fetch failure, put failure, and producer failure paths.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Separate cache fetch, producer execution, and cache put failure boundaries.
2. Add deterministic injectable hit, miss, fetch-failure, put-failure, and producer-failure coverage.
3. Preserve best-effort cache logging while propagating producer failures exactly once.
4. Verify focused cache tests and warnings-as-errors compilation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented strict fetch/produce/put boundaries in Catalog.Cache. Verification: combined focused backend run passed 50 tests, including deterministic cache hit/miss/fetch-failure/put-failure and raise/throw/exit producer cases. Full ExUnit runs also passed at normal seeds 101/202 and serial seeds 303/404.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cache producers now execute at most once; infrastructure failures remain best-effort while producer failures propagate unchanged. Verified by focused cache/backend tests, four full-suite seed runs, warnings-as-errors compilation, and strict Credo.
<!-- SECTION:FINAL_SUMMARY:END -->
