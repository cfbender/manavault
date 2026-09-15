---
id: TASK-27
title: Migrate sideboard and maybeboard zones to considering
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 00:39'
updated_date: '2026-08-03 01:07'
labels: []
dependencies: []
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Collapse the sideboard and maybeboard deck zones into a single considering zone in the data model and everywhere downstream, and turn zone pickers into a Mainboard/Considering toggle (plus Commander where applicable).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deck_cards rows are migrated to zone considering with collisions merged (quantities and proxies summed, tag precedence consider_cutting then getting, preferred printing preserved, allocations repointed)
- [x] #2 Zone vocabulary is mainboard, commander, considering across backend validation, parsers, exports, EDHREC, buylist, trade providers, and diff
- [x] #3 Decklist import still accepts SB:, Sideboard, Maybe, and Maybeboard headings, mapping them to considering
- [x] #4 Add and move card dialogs use a segmented Mainboard/Considering toggle (with Commander when applicable)
- [x] #5 Full test suite, typecheck, react tests, and build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Parallel: backend migration+vocabulary agent, frontend zone+toggle agent, fixed contract (zone values mainboard|commander|considering; includeConsidering buylist arg on both schemas; parser keeps legacy headings; providers map external sideboard/maybeboard to considering; diff excludes considering). 2. Migrate dev DB, full gates, codegen between backend and frontend validation. 3. Browser smoke: add-card toggle, considering section, compare actions, import/export round-trip. 4. Docs + finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gates: mix test 469, mix format --check, credo (1 pre-existing warning), typecheck, lint, vp fmt, 178 node + 15 vitest, build. Export emits Mainboard/Considering/Commander headings (live-verified); docs/features.md updated. Smoke deck + considering row cleaned up.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sideboard and maybeboard are gone: one considering zone, data migrated with a collision-safe allocation-aware merge (branch proven on a seeded scratch DB), full-stack vocabulary swap, segmented Mainboard/Considering(+Commander) zone toggles, legacy import headings still accepted. Verified by full suite, all frontend gates, and browser walkthroughs of both deck formats.
<!-- SECTION:FINAL_SUMMARY:END -->
