---
id: TASK-3
title: Decompose the GraphQL root schema by domain ownership
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-15 15:52'
updated_date: '2026-07-15 17:32'
labels:
  - backend
  - graphql
  - architecture
dependencies: []
references:
  - lib/manavault_web/schema/root.ex
  - lib/manavault_web/schema/catalog_resolvers.ex
  - lib/manavault_web/schema/catalog
priority: high
type: enhancement
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The private GraphQL root is a 999-line registry containing roughly 127 fields and 50 Relay payload declarations, while CatalogResolvers adds a second 128-function identity facade over the resolver modules that actually own behavior. The root also reaches directly into Repo for node loading. Reorganize schema field definitions around the existing catalog domains so schema ownership, resolver ownership, and persistence boundaries align. The root should compose domain field groups rather than define the entire API inline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Private GraphQL query and mutation fields are grouped in focused card, collection, location, deck, backup, and other appropriate domain schema modules and imported by the root schema.
- [ ] #2 CatalogResolvers is removed; fields reference their owning resolver modules directly, with no replacement identity facade.
- [ ] #3 Root schema and node-resolution code do not query Repo directly; entity lookup is performed through the canonical context or domain query boundary.
- [ ] #4 The generated GraphQL contract remains backward compatible: field names, argument defaults, nullability, Relay payload shapes, global IDs, and public versus authenticated schema behavior are unchanged.
- [ ] #5 Focused schema, resolver, batching, mutation, and public-share tests pass, and introspection/code generation plus backend compilation complete without warnings.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory private/public root fields, payload declarations, resolver ownership, and node lookups.
2. Extract focused card, collection, location, deck, backup, and supporting domain field modules composed by the roots.
3. Remove CatalogResolvers and point fields/types at owning resolver modules directly.
4. Route node persistence lookups through canonical context/query boundaries while preserving the generated GraphQL contract.
5. Verify schema/resolver/batching/mutation/public-share tests, code generation/introspection, and warnings-as-errors compilation.
<!-- SECTION:PLAN:END -->
