---
id: TASK-1
title: Decompose the deck detail frontend by feature ownership
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-15 15:50'
updated_date: '2026-07-15 17:32'
labels:
  - frontend
  - react
  - architecture
dependencies: []
references:
  - assets/react/src/pages/decks/detail-page.tsx
  - assets/react/src/pages/decks/detail-page-content.tsx
priority: high
type: enhancement
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The deck detail route currently centralizes paginated queries, direct Apollo cache updates, optimistic rollback, fourteen mutations, roughly thirty local state values, bulk workflows, tagging, disassembly, and modal coordination in a 1,265-line component. The extracted 1,012-line content component still receives roughly forty top-level props, so the extraction moved JSX without reducing ownership. Refactor the feature so the route is a composition and data-entry boundary while independently understandable deck capabilities own their state, mutations, errors, and UI. Avoid replacing the page with a single equally large controller hook.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 DeckDetailPage is limited to route concerns, loading the deck read model, and composing focused deck feature components; allocation, tagging, card editing, bulk actions, and disassembly no longer share one page-level mutation/state hub.
- [ ] #2 Mutually exclusive overlays use one explicit typed state model, and opening, switching, cancelling, or completing an overlay cannot leave stale targets or errors from another workflow.
- [ ] #3 The large prop bridge into DeckDetailContent is removed; feature components receive only the domain data and callbacks they own, without a replacement catch-all controller object.
- [ ] #4 Existing deck-detail behavior remains covered for pagination, add/edit/delete, optimistic success and rollback, tagging, allocation and deallocation, bulk operations, disassembly preview/apply, sharing, and export.
- [ ] #5 Handwritten deck-detail modules stay below 1,000 lines and pass frontend formatting, linting, typechecking, relevant behavior tests, and the production build.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map deck-detail state, queries, mutations, overlays, and existing behavior tests by capability.
2. Extract focused allocation, tagging, card-editing, bulk-action, disassembly, sharing, and export owners while keeping the route a read/composition boundary.
3. Replace loose modal flags/targets/errors with one typed mutually exclusive overlay model.
4. Remove the large content prop bridge without introducing a catch-all controller hook/object.
5. Verify deck-detail behavior tests, frontend format/lint/typecheck, and production build.
<!-- SECTION:PLAN:END -->
