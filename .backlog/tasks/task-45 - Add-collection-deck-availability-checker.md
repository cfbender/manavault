---
id: TASK-45
title: Add collection deck availability checker
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-08-10 22:16'
updated_date: '2026-08-10 22:16'
labels: []
dependencies: []
type: feature
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a collection-page workflow where a user can paste a standard card/deck list or a supported deck link and immediately compare its requirements with physical collection availability, including cards already allocated elsewhere and estimated replacement cost. The workflow should reuse existing trade list-source support and deck allocation/pricing semantics without creating or mutating a deck.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Collection page exposes an obvious quick-check action for pasted lists and supported Moxfield, Archidekt, or ManaVault deck links
- [x] #2 Results show requested, ready-to-pull, allocated-elsewhere, and truly missing quantities without mutating collection or deck data
- [x] #3 Missing-card rows include known per-card and total estimated purchase costs, and unpriced quantities are disclosed
- [x] #4 Unrecognized cards are reported with recovery guidance
- [x] #5 The workflow is keyboard accessible, responsive, and handles loading, empty, error, and repeat-check states
- [x] #6 Focused backend and frontend tests cover list analysis and result summaries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the trade list resolution context with a read-only collection check that aggregates resolved requirements, collection ownership/availability, allocations elsewhere, and cheapest known replacement prices.
2. Expose the check through the existing private GraphQL trade-list mutation boundary with dedicated result types.
3. Add a collection-header action and responsive inline quick-check workbench that accepts either a supported link or pasted list, then presents summary metrics and status-grouped rows with copy and marketplace actions.
4. Generate GraphQL types, add focused Elixir and React tests, run formatting/type/test checks, and exercise desktop/mobile UX through the supervised portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a read-only collection requirement analyzer that reuses existing list-source, card resolution, allocation, basic-land, and pricing behavior. Added an inline responsive collection workbench with paste/link modes, considering toggle, status filters, marketplace/copy actions, unrecognized/unpriced disclosure, and clean retry errors.

Validation: mix format --check-formatted; 587 ExUnit tests; frontend lint/typecheck; 189 model tests plus 45 Vitest interaction tests; production Vite build; git diff --check. Exercised paste, ready/to-source filters, empty-link validation, unsupported-link recovery, and responsive desktop/mobile layouts through the supervised portal. Scoped axe WCAG A/AA audit reports 0 violations; browser inspection found no horizontal overflow or runtime errors after recovery.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a sleek, read-only collection deck checker for pasted lists and Moxfield, Archidekt, or ManaVault deck links. It distinguishes pullable, allocated, missing, unrecognized, and unpriced cards; estimates sourcing cost; and offers filtered rows plus copy/marketplace actions. Verified with full backend/frontend suites, production build, and desktop/mobile portal interaction and accessibility audits.
<!-- SECTION:FINAL_SUMMARY:END -->
