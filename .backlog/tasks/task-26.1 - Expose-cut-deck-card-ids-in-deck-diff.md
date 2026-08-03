---
id: TASK-26.1
title: Expose cut deck card ids in deck diff
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 00:16'
updated_date: '2026-08-03 00:34'
labels: []
dependencies: []
parent_task_id: TASK-26
ordinal: 36000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deck_diff_entry carries deckCardIds (relay ids) for cut rows including name-keyed basics
- [x] #2 ExUnit coverage for the new field
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Thread deck_card ids through cut aggregation (oracle- and name-keyed basics paths), encode via Absinthe.Relay.Node.to_global_id, add deck_card_ids list field to deck_diff_entry, contract test update.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DeckDiff cut rows (oracle- and name-keyed basics) and quantity-change rows now carry every backing deck card id; GraphQL deckCardIds field encodes them as relay DeckCard ids. Verified by new domain test (multi-zone cut) and a schema-level round-trip test (Node.from_global_id decodes to :deck_card); suite 469 green.
<!-- SECTION:FINAL_SUMMARY:END -->
