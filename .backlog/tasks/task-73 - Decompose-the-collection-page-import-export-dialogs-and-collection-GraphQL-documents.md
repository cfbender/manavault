---
id: TASK-73
title: >-
  Decompose the collection page, import/export dialogs, and collection GraphQL
  documents
status: Done
assignee:
  - '@Cody Bender'
created_date: '2026-09-20 16:34'
updated_date: '2026-09-20 17:00'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Structural review against the developing-react standard: assets/react/src/pages/collection/collection-page.tsx (700 lines) owns 20+ useState values, queries, pagination, selection, native import handling, auto-sort, and every dialog; import-export-dialogs.tsx (810 lines) holds two unrelated workflows and two effects that both reset the same form; documents.ts (747 lines) is a catch-all operation registry with repeated selections. Scope is assets/react/src/pages/collection/** and its tests. Do not modify pages/decks/**, pages/cards/**, pages/settings/**, or components/** except to add a new shared component that no other task touches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 collection-page.tsx is composition and layout only, under 300 lines, with overlay state modeled as a discriminated union
- [x] #2 Import and export live in separate feature modules with the import flow driven by one explicit state model
- [x] #3 GraphQL documents are colocated with the feature slice that uses them and shared selections use fragments
- [x] #4 aube run typecheck, lint, and test:react pass and the collection, import, export, and auto-sort flows are verified in a browser
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Split collection GraphQL operations into feature-owned document modules, retaining a narrow compatibility re-export only for out-of-scope consumers and introducing shared fragments without changing selection sets.
2. Extract collection page filter/tab state, queries/pagination, mutations/auto-sort, overlay orchestration, item controls/grid, and dialog rendering into focused hooks and components; keep the page under 300 lines and model overlays as a discriminated union.
3. Split import and export dialogs into separate feature folders, with import form/mutation behavior owned by one explicit reducer-driven state model and focused preview components.
4. Regenerate GraphQL types, run typecheck/lint/React tests, then exercise filters, sorting, selection, bulk actions, import/export, and auto-sort in the browser and inspect screenshots.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: split the collection overview into focused filter, query, mutation, overlay, grid, and dialog modules; split import/export into separate feature folders with reducer-driven import state; moved GraphQL documents into feature slices with shared fragments. Kept documents.ts as a narrow compatibility re-export for out-of-scope consumers. Disabled generated fragment masking because existing typed consumers need direct access to fragment-expanded fields.

Validation: codegen succeeded against the local Phoenix schema; aube run typecheck passed; aube run lint passed with only existing circular-dependency warnings; aube run test:react passed (197 Node assertions plus 37 Vitest files/113 tests); git diff --check passed. Browser verification covered structured filtering, Price ascending sort, keyboard and multi-item selection, bulk action bar, import preview, CSV/text export, and auto-sort fallback; all screenshots inspected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decomposed the 700-line collection page into a 112-line composition root, split the 810-line import/export bundle into focused feature modules, and reduced the 747-line collection document registry to an 8-line compatibility facade over colocated GraphQL modules. Regenerated GraphQL types and verified typecheck, lint, all React tests, and collection/import/export/auto-sort browser flows.
<!-- SECTION:FINAL_SUMMARY:END -->
