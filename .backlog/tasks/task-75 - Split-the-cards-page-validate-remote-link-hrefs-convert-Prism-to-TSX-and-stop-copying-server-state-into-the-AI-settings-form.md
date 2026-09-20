---
id: TASK-75
title: >-
  Split the cards page, validate remote link hrefs, convert Prism to TSX, and
  stop copying server state into the AI settings form
status: Done
assignee:
  - '@cody'
created_date: '2026-09-20 16:34'
updated_date: '2026-09-20 16:56'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Structural and frontend-security review against the developing-react standard: assets/react/src/pages/cards/page.tsx (671 lines) owns both catalog and detail routes plus an EDHREC data hook and copies route props into local state via effects; deck-analysis-dialog.tsx renders a stored user-supplied URL as href with no protocol check, and card-synergies.tsx, recommander.tsx, deck-combos-dialog.tsx, and edhrec-commander.tsx render EDHREC/Recommander API URLs as hrefs while edhrec-helpers.ts already has safeHttpUrl(); components/prism/Prism.jsx is 438 lines of unchecked JS with a hand-written Prism.d.ts; pages/settings/ai-settings-section.tsx copies server state into several local fields whenever the query identity changes, which can clobber in-progress edits. Scope is pages/cards/**, components/prism/**, pages/settings/ai-settings-section.tsx, lib/utils.ts, and the five link-rendering sites above. Do not modify pages/collection/** or the rest of pages/decks/**; other tasks own those.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every anchor whose href comes from stored or remote data passes through one shared safeHttpUrl helper that allows only http and https, with a test that a javascript: URL renders no link
- [x] #2 The cards catalog and detail routes are separate modules and route state is the source of truth without prop-to-state effects
- [x] #3 Prism is a typed .tsx component with no any and Prism.d.ts is deleted
- [x] #4 The AI settings form initializes once per settings record and does not overwrite dirty fields on refetch, covered by a test
- [x] #5 aube run typecheck, lint, and test:react pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Validate each server/remote deck URL through shared safeHttpUrl and add focused utility coverage.
2. Split the cards route into a thin composer, a search hook, and catalog/detail components while preserving URL-driven behavior.
3. Convert Prism to typed TSX and repair call-site type mismatches.
4. Isolate AI settings form state behind loaded-record initialization and test refetch safety.
5. Run typecheck, lint, React tests, then exercise cards, AI settings, and Prism through the supervised portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented four reviewable commits. The cards route now remounts catalog form drafts from URL state rather than syncing props in effects. AI form state initializes only when the settings query first yields a record and remains dirty across cache/refetch updates.

Validation: `mise exec -- aube run typecheck` and `mise exec -- aube run lint` exited 0; `mise exec -- aube run test:react` passed 197 Node tests and 118 Vitest tests across 38 files. Focused unsafe-link test passed 3/3 and verifies javascript: EDHREC URLs render as plain text/no anchors. Browser verification exercised card search, a White filter and clear, Black Lotus detail/printings, AI form editing plus rejected-key save validation, and the Prism home background at DPR 2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Validated all remote/stored deck and card hrefs through safeHttpUrl; split the cards catalog, detail page, commander gallery, and search state hook; replaced Prism JSX/declaration shims with a typed TSX component and typed WebGL hook; and isolated AI form draft state from refetches. Full typecheck, lint, and React suites pass, and browser verification covered all affected interfaces through the supervised portal.
<!-- SECTION:FINAL_SUMMARY:END -->
