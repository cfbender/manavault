---
id: TASK-2
title: Collapse redundant deck domain forwarding layers
status: Done
assignee:
  - '@codex'
created_date: '2026-07-15 15:51'
updated_date: '2026-07-15 19:07'
labels:
  - backend
  - elixir
  - architecture
  - decks
dependencies: []
references:
  - lib/manavault/catalog.ex
  - lib/manavault/catalog/cached.ex
  - lib/manavault/catalog/decks.ex
  - lib/manavault/catalog/decks/workflows.ex
priority: high
type: enhancement
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deck operations currently travel through Catalog, the catch-all Cached module, Decks, and an almost entirely delegating Workflows module before reaching the code that owns the behavior. This adds navigation cost without isolating policy or orchestration. Make Decks the real deck-domain boundary beneath the public Catalog context, colocate deck read caching with the deck read boundary, and remove identity-only forwarding. Preserve the public Catalog API and cache behavior while reducing the number of concepts and hops a maintainer must follow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A public deck operation exposed through Catalog reaches its owning deck query, record, allocation, decklist, buylist, EDHRec, or statistics module without passing through an identity-only Workflows facade.
- [x] #2 The Workflows module is removed rather than replaced with another catch-all delegate module or generated forwarding layer.
- [x] #3 Deck read caching and mutation invalidation remain explicit at the deck-domain boundary, with the same externally observable hit, miss, and invalidation behavior.
- [x] #4 The public Catalog and GraphQL contracts for deck reads and mutations remain unchanged, and every caller is migrated without compatibility aliases or deprecated paths.
- [x] #5 Focused deck context, cache invalidation, and GraphQL workflow tests pass, followed by backend compilation with warnings treated as errors.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory every Catalog, Cached, Decks, and Workflows deck entrypoint and classify its owning query, record, allocation, decklist, buylist, EDHRec, or statistics module.
2. Make Decks the explicit domain boundary, colocate positive read caching and mutation invalidation there, and route each public Catalog operation directly to the focused owner.
3. Remove Workflows and deck forwarding from catch-all Cached without replacement facades; migrate every internal caller cleanly.
4. Preserve public Catalog/GraphQL signatures, errors, batching, and all TASK-12/TASK-7 share-cache/artifact invalidation behavior.
5. Verify focused deck context/cache/GraphQL/public-share suites, full backend tests, formatting, warnings-fatal compilation, and strict Credo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Catalog deck APIs now delegate to Decks, which explicitly owns deck read cache keys, positive-only strict share-token caching, and successful-mutation invalidation before calling focused query, record, card, decklist, buylist, statistics, allocation, and import owners. Removed Decks.Workflows and all references; general Cached retains only non-deck responsibilities. Renamed the GraphQL workflow behavior test to deck mutations. Verification: focused deck/cache/schema/public-share suite passed 85 tests; full backend passed 317 tests; warnings-fatal compilation, strict Credo, changed-file formatting, and a repository search proving no Workflows references passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decks is now the real domain/cache boundary beneath the unchanged Catalog API. The identity-only Workflows layer and deck forwarding in Cached are gone; focused owners execute behavior while read caching, positive share caching, mutation invalidation, batching, and GraphQL contracts remain intact.
<!-- SECTION:FINAL_SUMMARY:END -->
