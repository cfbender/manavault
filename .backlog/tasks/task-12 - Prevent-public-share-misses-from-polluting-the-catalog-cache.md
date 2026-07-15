---
id: TASK-12
title: Prevent public share misses from polluting the catalog cache
status: Done
assignee:
  - '@codex'
created_date: '2026-07-15 15:58'
updated_date: '2026-07-15 18:24'
labels:
  - security
  - availability
  - cache
  - public-share
dependencies: []
references:
  - lib/manavault/catalog/cached.ex
  - lib/manavault/catalog/decks/queries.ex
  - lib/manavault/catalog/deck.ex
  - lib/manavault_web/controllers/app_controller.ex
  - lib/manavault_web/public_share_schema.ex
priority: high
type: bug
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cached.get_deck_by_share_token stores lookup misses under the raw public token in the shared catalog cache. Because public HTML, SVG/PNG preview, and GraphQL endpoints accept attacker-controlled token strings, unique misses can occupy the 100,000-entry cache for the eleven-hour default TTL and evict useful catalog data. Enforce the generated token shape at every public boundary and ensure missing decks are never inserted into the shared positive cache.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Malformed tokens are rejected before database or cache access using the exact generated-token contract, including bounded length and base64url character/decoding validation.
- [x] #2 A syntactically valid token with no matching deck returns the established not-found result and is not inserted into the shared catalog cache.
- [x] #3 Repeated malformed or nonexistent-token requests through public HTML, SVG/PNG preview, and public GraphQL routes do not increase shared cache cardinality or create attacker-controlled cache keys.
- [x] #4 A valid existing share token still benefits from positive caching, and deck changes, share-token rotation/removal, and deletion invalidate or bypass stale cached data correctly.
- [x] #5 Public routes preserve their current response contracts for not found, existing shares, content types, and GraphQL null/error behavior.
- [x] #6 Focused tests inspect producer/database call counts and cache contents for malformed, valid-missing, valid-existing, rotated, and deleted tokens across every public entry point.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define and enforce the generated share-token contract at every public HTML, SVG/PNG preview, and public GraphQL boundary before any cache lookup.
2. Ensure malformed and valid-missing requests never enter the shared positive deck cache while valid existing tokens retain positive caching and invalidation.
3. Preserve not-found, content-type, GraphQL null/error, rotation/removal, and deletion response contracts.
4. Add focused producer/database call-count and cache-content coverage across malformed, missing, existing, rotated, removed, and deleted tokens.
5. Verify focused public-share/cache suites, full backend tests, warnings-fatal compilation, and strict Credo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added canonical 18-byte unpadded base64url share-token generation/validation in the deck domain and gated Catalog/cache/query, public HTML, SVG/PNG preview, and public GraphQL paths before cache/database work. Positive caching now stores only existing decks; valid misses leave no cache residue while token rotation/removal, mutation, and deletion invalidate correctly. Added cache cardinality/key, producer/query count, response status/content-type, and GraphQL behavior coverage. Verification: focused public-share suite passed 5 tests; full backend passed 308 tests; warnings-fatal compilation, strict Credo, and changed-file formatting passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Malformed and missing public share tokens can no longer create attacker-controlled cache keys or consume shared catalog cache capacity. Valid shares retain positive caching and complete invalidation behavior while HTML, preview, and GraphQL contracts remain unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
