---
id: TASK-73
title: >-
  Decompose the collection page, import/export dialogs, and collection GraphQL
  documents
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
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
- [ ] #1 collection-page.tsx is composition and layout only, under 300 lines, with overlay state modeled as a discriminated union
- [ ] #2 Import and export live in separate feature modules with the import flow driven by one explicit state model
- [ ] #3 GraphQL documents are colocated with the feature slice that uses them and shared selections use fragments
- [ ] #4 aube run typecheck, lint, and test:react pass and the collection, import, export, and auto-sort flows are verified in a browser
<!-- AC:END -->
