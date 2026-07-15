---
id: TASK-11
title: Decompose deck allocation workflows by use case
status: To Do
assignee: []
created_date: '2026-07-15 15:57'
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
