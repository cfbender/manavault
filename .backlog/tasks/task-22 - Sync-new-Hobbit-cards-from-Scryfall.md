---
id: TASK-22
title: Sync new Hobbit cards from Scryfall
status: Done
assignee:
  - '@cfb'
created_date: '2026-08-01 14:58'
updated_date: '2026-08-01 15:08'
labels: []
dependencies: []
modified_files:
  - lib/manavault/catalog/scryfall/bulk_data.ex
  - lib/manavault/catalog/scryfall/import.ex
  - lib/manavault/catalog/scryfall/sync.ex
  - test/manavault/catalog/sync_test.exs
type: bug
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The catalog sync is missing newly available Hobbit cards from Scryfall; Gleaming Splendor is a concrete reported example.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Scryfall sync imports Gleaming Splendor
- [x] #2 Other cards from the same newly available Scryfall release are not excluded by the same cause
- [x] #3 Relevant automated coverage prevents regression without breaking existing sync behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a bounded decoder for Scryfall's current gzip-compressed JSON Lines bulk payload while retaining legacy JSON-array compatibility. 2. Route both default-card and oracle-tag downloads through the decoder and allow card imports to consume lazy enumerables. 3. Add sync coverage using jsonl_download_uri payloads containing Gleaming Splendor and oracle tags. 4. Run the focused sync/import tests and exercise a real current Scryfall sync payload path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added streaming support for Scryfall's jsonl_download_uri gzip payloads for both default cards and oracle tags while retaining legacy JSON-array downloads. Import now accepts lazy enumerables in 200-card batches. Regression coverage imports Gleaming Splendor and Long-Bodied Grey Dog from gzip JSON Lines. Focused sync/import tests pass, and the live 2026-08-01 default-cards payload decoded all reported Hobbit records.

Validation: mise exec -- mix test test/manavault/catalog/import_test.exs test/manavault/catalog/sync_test.exs completed with 20 passing tests. A no-database live smoke decode of Scryfall's default-cards-20260801090942.jsonl.gz found all three Gleaming Splendor printings plus Long-Bodied Grey Dog from set hob.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored Scryfall synchronization after its bulk API moved from download_uri JSON arrays to jsonl_download_uri gzip JSON Lines. Added bounded streaming decode for default cards, current-format oracle-tag support, lazy batched import, and legacy compatibility. Verified with 20 focused passing tests and the live current bulk payload containing Gleaming Splendor and another Hobbit card.
<!-- SECTION:FINAL_SUMMARY:END -->
