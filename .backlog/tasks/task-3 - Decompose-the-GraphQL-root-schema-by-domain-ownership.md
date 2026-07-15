---
id: TASK-3
title: Decompose the GraphQL root schema by domain ownership
status: Done
assignee:
  - '@codex'
created_date: '2026-07-15 15:52'
updated_date: '2026-07-15 18:09'
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
- [x] #1 Private GraphQL query and mutation fields are grouped in focused card, collection, location, deck, backup, and other appropriate domain schema modules and imported by the root schema.
- [x] #2 CatalogResolvers is removed; fields reference their owning resolver modules directly, with no replacement identity facade.
- [x] #3 Root schema and node-resolution code do not query Repo directly; entity lookup is performed through the canonical context or domain query boundary.
- [x] #4 The generated GraphQL contract remains backward compatible: field names, argument defaults, nullability, Relay payload shapes, global IDs, and public versus authenticated schema behavior are unchanged.
- [x] #5 Focused schema, resolver, batching, mutation, and public-share tests pass, and introspection/code generation plus backend compilation complete without warnings.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory private/public root fields, payload declarations, resolver ownership, and node lookups.
2. Extract focused card, collection, location, deck, backup, and supporting domain field modules composed by the roots.
3. Remove CatalogResolvers and point fields/types at owning resolver modules directly.
4. Route node persistence lookups through canonical context/query boundaries while preserving the generated GraphQL contract.
5. Verify schema/resolver/batching/mutation/public-share tests, code generation/introspection, and warnings-as-errors compilation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Split private root fields and Relay payloads into card, collection, location, deck, backup, and other operation modules. Removed CatalogResolvers and rewired private/public/type fields directly to owning resolvers. Node resolution now uses Catalog/domain query boundaries, including canonical cached deck-card lookup. Added schema introspection, payload, global-ID, direct-resolver, node, and public-share isolation coverage. Integration verification: 303 ExUnit tests passed, warnings-fatal compilation and strict Credo passed, and changed Elixir files are formatted.

Integrated GraphQL client code generation completed against the architecture smoke server on port 4010 and produced no tracked changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The GraphQL root now composes focused domain operations; the identity resolver facade and root Repo access are gone. Generated schema contracts and public-share isolation remain intact under focused contract coverage and the complete integrated backend gate.
<!-- SECTION:FINAL_SUMMARY:END -->
