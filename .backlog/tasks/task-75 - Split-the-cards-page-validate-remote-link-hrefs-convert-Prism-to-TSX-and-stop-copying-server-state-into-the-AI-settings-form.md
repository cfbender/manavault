---
id: TASK-75
title: >-
  Split the cards page, validate remote link hrefs, convert Prism to TSX, and
  stop copying server state into the AI settings form
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
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
- [ ] #1 Every anchor whose href comes from stored or remote data passes through one shared safeHttpUrl helper that allows only http and https, with a test that a javascript: URL renders no link
- [ ] #2 The cards catalog and detail routes are separate modules and route state is the source of truth without prop-to-state effects
- [ ] #3 Prism is a typed .tsx component with no any and Prism.d.ts is deleted
- [ ] #4 The AI settings form initializes once per settings record and does not overwrite dirty fields on refetch, covered by a test
- [ ] #5 aube run typecheck, lint, and test:react pass
<!-- AC:END -->
