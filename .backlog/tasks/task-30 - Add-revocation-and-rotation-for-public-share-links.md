---
id: TASK-30
title: Add revocation and rotation for public share links
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-03 22:47'
updated_date: '2026-08-03 23:17'
labels: []
dependencies: []
priority: high
type: feature
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owners need explicit control over bearer links for decks, trade wants, and trade binder. Durable links currently cannot be revoked or safely rotated, and singleton trade tokens can expose future list changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Authenticated owners can disable sharing and rotate the link for decks, trade wants, and trade binder while preserving existing ensure-token URL creation behavior
- [x] #2 Disabling a deck clears its token; disabling wants or binder removes every singleton row; rotation leaves exactly one fresh canonical token and cannot reactivate an old token
- [x] #3 Every old token fails immediately at origin for public HTML metadata, /share/graphql, preview.svg, and preview.png, including application artifact caches
- [x] #4 Focused domain, GraphQL, controller/cache, and frontend tests cover revocation and rotation
- [x] #5 Relevant documentation and generated GraphQL artifacts are updated, and repository formatting and targeted tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add transactional context operations for deck disable/rotation and trade wants/binder disable/rotation, preserving ensure-token semantics and clearing all duplicate singleton rows during trade lifecycle changes.
2. Expose authenticated GraphQL mutations for all six operations and regenerate typed React documents.
3. Validate every public HTML token at origin, retain GraphQL null/preview 404 behavior, invalidate positive deck caches, and make preview artifact identities token-specific.
4. Add confirmed Rotate link and Disable sharing actions to the three existing share dialogs without changing automatic link creation and copy UX.
5. Add focused domain, GraphQL, controller/cache, artifact, and frontend coverage; update share-link documentation; format and run targeted verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented transactional deck and trade share lifecycle operations, authenticated GraphQL mutations, immediate origin token validation, token-bound preview artifacts, confirmed React controls, generated GraphQL types, docs, and focused/full tests. Security review led to uncached deck bearer authorization, transactional trade ensure/disable/rotate serialization, and fresh ensure-on-open UI state.

Validation: full mix test passed 498/498; full React test suite passed 182 Node tests and 18 Vitest tests; GraphQL codegen and TypeScript typecheck passed; Elixir and frontend formatting checks passed; mix compile --warnings-as-errors passed. mix credo --strict reports one pre-existing warning in lib/manavault/catalog/scryfall/bulk_data.ex unrelated to this task; frontend lint completed with two pre-existing warnings in buylist-marketplace-actions.test.tsx.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added authenticated disable and rotation for deck, wants, and binder share links. Trade singleton lifecycle writes are serialized and collapse stale duplicates; deck bearer authorization is uncached; revoked tokens return origin 404/null across HTML, GraphQL, and previews; preview artifacts are token-bound. Added confirmed owner UI, generated API types, docs, and domain/API/controller/cache/frontend coverage. Verified by full Elixir and React suites plus compile, codegen, typecheck, and formatting.
<!-- SECTION:FINAL_SUMMARY:END -->
