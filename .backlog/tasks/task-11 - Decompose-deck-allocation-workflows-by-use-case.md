---
id: TASK-11
title: Decompose deck allocation workflows by use case
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-15 15:57'
updated_date: '2026-07-15 17:33'
labels:
  - backend
  - elixir
  - architecture
  - decks
dependencies: []
references:
  - lib/manavault/catalog/decks/allocations.ex
  - lib/manavault/catalog/decks/allocation_items.ex
priority: high
type: enhancement
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decks.Allocations is a 916-line module with fourteen public and fifty-one private functions spanning single-item allocation, deallocation, pull-list normalization and execution, bulk collection allocation, proxy allocation, previews, persistence, and validation. Separate these use cases into focused domain actions with explicit transaction boundaries, while keeping collection-item movement in AllocationItems and preserving the public Catalog/GraphQL contracts. Avoid replacing the monolith with a generic framework or a shared grab-bag of helpers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Single-item allocation/deallocation, proxy allocation, pull-list execution, bulk collection allocation, and preview each have a focused owner whose public entry point exposes its complete validation and result contract.
- [ ] #2 Collection item splitting, moving, restoring, and rollback behavior remains owned by AllocationItems rather than being duplicated across action modules.
- [ ] #3 Every bulk or multi-record operation remains atomic: validation or persistence failure leaves deck cards, allocations, collection quantities, and locations unchanged.
- [ ] #4 Public Catalog and GraphQL function signatures, error mappings, allocation candidate semantics, preferred-printing behavior, and query batching remain backward compatible.
- [ ] #5 The 916-line catch-all is removed without creating another oversized helper module; focused tests cover success, exact and alternative printing matches, insufficient quantity, archived decks, rollback, bulk batching, proxy paths, and pull-list normalization.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map allocation validations, queries, transaction boundaries, and shared AllocationItems invariants by use case.
2. Extract focused single allocation/deallocation, proxy, pull-list, bulk collection, and preview action owners.
3. Keep collection-item splitting/moving/restoring in AllocationItems and every multi-record workflow atomic.
4. Preserve public Catalog/GraphQL signatures, errors, candidate/preferred-printing semantics, and batching.
5. Verify focused success/error/rollback/batching/proxy/pull-list tests plus warnings-as-errors compilation and strict Credo.
<!-- SECTION:PLAN:END -->
