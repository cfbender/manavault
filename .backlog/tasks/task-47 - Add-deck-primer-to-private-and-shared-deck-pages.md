---
id: TASK-47
title: Add deck primer to private and shared deck pages
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-08-12 15:56'
updated_date: '2026-08-12 16:07'
labels: []
dependencies: []
type: feature
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deck builders can write a guide for how their deck plays, and readers can open the same primer from private and public shared deck pages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deck owners can save and clear a primer from the deck editor
- [x] #2 A non-empty primer appears as an accessible collapsible section on the deck detail page
- [x] #3 The same primer is available on the public share page without exposing edit controls
- [x] #4 Primer content renders safe Markdown without executing embedded HTML
- [x] #5 Backend and frontend tests cover persistence, public exposure, editing, and disclosure rendering
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a nullable validated primer field to decks and expose it through private/public GraphQL.
2. Add primer editing to the existing deck metadata dialog and regenerate typed GraphQL documents.
3. Build one accessible collapsible Markdown primer component reused by private and share modes.
4. Add targeted backend/frontend coverage, migrate the dev database, and verify desktop/mobile in the supervised portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a nullable 50,000-character deck primer persisted through Ecto and exposed by private/public GraphQL. Used react-markdown with skipHtml so standard Markdown renders while embedded HTML is ignored. The private and share routes reuse the same DeckPrimer disclosure; only the existing private deck editor can change it.

Validation: migration applied; 18 targeted ExUnit tests passed; 6 targeted Vitest tests passed; TypeScript typecheck, production Vite build, frozen dependency install, Elixir warnings-as-errors compile, and format checks passed. Scripted Chromium checks exercised private expansion, editor loading, public expansion with zero private actions, and 390px responsive rendering without overflow. Independent finish review: PASS.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an editable Markdown deck primer with a tactile collapsible reader shared by private and public deck pages. Verified persistence and public exposure through ExUnit, editor/disclosure/safe-Markdown behavior through Vitest, production build and type checks, and desktop/mobile interactions in the supervised portal.
<!-- SECTION:FINAL_SUMMARY:END -->
