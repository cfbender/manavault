---
id: TASK-52
title: Improve deck AI answer accuracy and presentation
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-19 03:57'
updated_date: '2026-08-19 04:14'
labels: []
dependencies: []
references:
  - lib/manavault/ai/deck_question.ex
  - assets/react/src/pages/decks/deck-question-dialog.tsx
type: enhancement
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make saved deck AI Q&A answers respect deck and user constraints and render Magic-specific content as a polished, navigable response.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI question context explicitly includes Commander color identity and card legality data, and guidance prohibits off-color, format-illegal, invented, or user-disallowed recommendations
- [x] #2 Valid GitHub-flavored Markdown tables render as tables without overflowing the dialog
- [x] #3 Mana notation such as {2}{W} renders with local Scryfall symbol assets and remains accessible
- [x] #4 New AI card mentions link to the ManaVault catalog and expose a card image preview on hover or keyboard focus
- [x] #5 Focused backend and frontend tests cover prompt constraints and rich answer rendering
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Enrich the Q&A payload and require structured answer metadata for recommended additions. Validate those additions against the local catalog, format legality, and Commander color identity, with one automatic correction attempt.
2. Extend shared deck Markdown with GFM tables, accessible mana-symbol nodes, and opt-in linked card references with portal-based previews.
3. Enable rich card references for Q&A and verify backend correctness, frontend rendering, responsive overflow, focus/hover previews, and production build output.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented structured Q&A output with catalog-backed legality/color-identity validation and one correction retry before persistence. Added GFM table rendering, local mana symbols, internal card links, and Scryfall hover/focus previews.

Validation: 620 ExUnit tests passed; 196 Node tests and 76 Vitest tests passed; focused Q&A tests, TypeScript typecheck, frontend lint, formatting checks, git diff checks, production build, and Impeccable detector passed. Browser verification at 1440×1000 and 390×844 confirmed 3 rendered table rows, six catalog links, five accessible mana symbols, a visible portalled Sun Titan preview, contained mobile horizontal table scrolling, and no console errors.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Improved deck AI Q&A accuracy with structured, catalog-validated recommendations and automatic correction of invalid additions. Added polished GFM tables, accessible mana symbols, and linked card previews; verified through full backend/frontend suites, build checks, and desktop/mobile browser inspection.
<!-- SECTION:FINAL_SUMMARY:END -->
