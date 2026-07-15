---
id: TASK-2
title: Collapse redundant deck domain forwarding layers
status: To Do
assignee: []
created_date: '2026-07-15 15:51'
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
- [ ] #1 A public deck operation exposed through Catalog reaches its owning deck query, record, allocation, decklist, buylist, EDHRec, or statistics module without passing through an identity-only Workflows facade.
- [ ] #2 The Workflows module is removed rather than replaced with another catch-all delegate module or generated forwarding layer.
- [ ] #3 Deck read caching and mutation invalidation remain explicit at the deck-domain boundary, with the same externally observable hit, miss, and invalidation behavior.
- [ ] #4 The public Catalog and GraphQL contracts for deck reads and mutations remain unchanged, and every caller is migrated without compatibility aliases or deprecated paths.
- [ ] #5 Focused deck context, cache invalidation, and GraphQL workflow tests pass, followed by backend compilation with warnings treated as errors.
<!-- AC:END -->
