---
id: TASK-53
title: Add custom instructions for AI deck analysis
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-19 04:30'
updated_date: '2026-08-19 04:43'
labels: []
dependencies: []
type: feature
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let users persist guidance that tailors every AI deck analysis, including constraints on recommendations and requests for additional analysis sections.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI settings let users view, edit, clear, and save deck analysis instructions.
- [x] #2 Saved instructions are included in every deck analysis request but do not affect one-off deck questions.
- [x] #3 A custom instruction can request an additional named section, such as budget upgrades, and that section is preserved in the rendered analysis.
- [x] #4 Backend and frontend tests cover persistence, prompt delivery, and settings submission.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a persisted deck-analysis-instructions field to AI settings and expose it through GraphQL.
2. Include the field in the deck-analysis system prompt and extend structured results with optional custom sections.
3. Add an instructions textarea to AI settings and regenerate GraphQL client types.
4. Run the migration, targeted backend/frontend tests, formatting, type checks, and a visual settings-page check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented persisted deck analysis instructions across Ecto, GraphQL, generated client types, the React settings form, and OpenRouter prompt construction. Added structured custom sections so instruction-requested output such as Budget upgrades is rendered in saved analysis Markdown. Verified the migration, 621 ExUnit tests, 196 Node tests, 77 React component tests, frontend lint/typecheck/format, production build, detector, GraphQL smoke query, and desktop/mobile UI states. `mix credo --strict` still reports its existing redundant-with refactoring suggestions in AI.analyze_deck/1 and DeckAnalysis.normalize_result/2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added persisted custom deck-analysis instructions to AI settings and the OpenRouter analysis prompt, with structured extra sections for requests such as budget upgrades. Verified by migration, 621 ExUnit tests, 196 Node tests, 77 React tests, frontend lint/typecheck/format, production build, GraphQL smoke query, detector, and desktop/mobile browser checks.
<!-- SECTION:FINAL_SUMMARY:END -->
