---
id: TASK-27.1
title: Backend zone migration and vocabulary
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 00:39'
updated_date: '2026-08-03 01:07'
labels: []
dependencies: []
parent_task_id: TASK-27
ordinal: 40000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Allocation-aware merge migration lands and runs on dev
- [x] #2 Backend zone references, buylist include flags, parsers, providers, and diff updated with green tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Migration 20260802120000: merge (deck_id, oracle_id) collisions across sideboard+maybeboard (keeper lowest id; quantity/proxy summed; tag precedence consider_cutting > getting > null; preferred_printing coalesced; deck_allocations repointed with quantity merge on unique collision), then UPDATE zones to considering. Update deck_card @zones, decklists parser/labels, buylist include_considering, edhrec payload/lookup, trade providers + deck_diff, public+private GraphQL args, tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merge branch explicitly exercised: scratch copy of the pre-migration dev DB seeded with a (deck,oracle) collision across both legacy zones (conflicting tags getting/consider_cutting, loser-only preferred printing, allocations colliding and non-colliding) and migrated via Ecto.Migrator on a dynamic repo — result: single considering row qty 5, proxy 1, tag consider_cutting, printing coalesced, allocations merged (1+2->3) and repointed, no unique violations. Dev DB backup at /tmp/manavault_dev.pre-zone-migration.db (integrity-checked).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Allocation-aware merge migration collapsed sideboard+maybeboard into considering (dev: 26+1 -> 27 rows, quantities preserved); zone vocabulary updated across schema validation, decklist parser/export (legacy headings still accepted, exports emit Considering), buylist include_considering on both schemas, EDHREC, trade providers/remote normalization, and deck diff (considering excluded both sides). 469 tests green.
<!-- SECTION:FINAL_SUMMARY:END -->
