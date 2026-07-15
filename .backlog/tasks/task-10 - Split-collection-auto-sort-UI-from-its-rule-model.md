---
id: TASK-10
title: Split collection auto-sort UI from its rule model
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-15 15:57'
updated_date: '2026-07-15 16:25'
labels:
  - frontend
  - react
  - architecture
  - collection
dependencies: []
references:
  - assets/react/src/pages/settings/collection-auto-sort-section.tsx
priority: medium
type: enhancement
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CollectionAutoSortSection is a 1,012-line module combining settings-page orchestration, row rendering, a large rule editor dialog, form-state mutation, parsing, normalization, validation, and list reordering. Separate independently understandable UI and pure rule-model responsibilities so validation can be tested without rendering and the settings section remains easy to scan. Preserve the existing GraphQL input/output and user experience.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The settings section owns loading, preview/save orchestration, summary state, and composition, while the rule dialog owns only editing interactions and reusable row components own row presentation.
- [ ] #2 Form-to-input conversion, enum/list normalization, currency parsing, validation, and row reordering are pure typed functions in a focused model module with no React or Apollo dependency.
- [ ] #3 Validation preserves all current constraints and messages for required names, target locations, min/max price ordering, supported enum values, comma-separated fields, release dates, priorities, and malformed numeric input.
- [ ] #4 Creating, editing, deleting, moving, previewing, cancelling, and saving rules preserve current ordering and dirty-state behavior, including backend validation errors.
- [ ] #5 No replacement module exceeds 1,000 lines; focused pure-model and user-interaction tests pass along with frontend lint, typecheck, and production build.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract pure typed rule parsing, normalization, validation, conversion, and reordering into a React/Apollo-free model module.
2. Split reusable row presentation and the rule editor dialog from settings orchestration.
3. Preserve ordering, dirty state, preview/save/cancel, and backend validation behavior.
4. Add focused pure-model and interaction coverage and verify frontend format/lint/typecheck/build.
<!-- SECTION:PLAN:END -->
