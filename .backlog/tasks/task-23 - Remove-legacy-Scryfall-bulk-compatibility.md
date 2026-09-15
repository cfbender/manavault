---
id: TASK-23
title: Remove legacy Scryfall bulk compatibility
status: Done
assignee:
  - '@cfb'
created_date: '2026-08-01 15:10'
updated_date: '2026-08-01 15:16'
labels: []
dependencies: []
modified_files:
  - lib/manavault/catalog/scryfall/bulk_data.ex
  - lib/manavault/catalog/scryfall/import.ex
  - lib/manavault/catalog/scryfall/sync.ex
  - test/manavault/catalog/scryfall/bulk_data_test.exs
  - test/manavault/catalog/sync_test.exs
type: task
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Complete the Scryfall bulk-data cutover by removing support and tests for the former download_uri JSON-array payload. Catalog and oracle-tag synchronization should use only Scryfall's current jsonl_download_uri gzip JSON Lines format.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Default-card and oracle-tag synchronization consume jsonl_download_uri gzip JSON Lines payloads
- [x] #2 Former download_uri JSON-array metadata and payload compatibility is removed
- [x] #3 Focused sync and import tests pass using only the current bulk-data format
- [x] #4 Malformed JSON Lines beyond one import batch fail before any catalog records are committed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make BulkData accept only jsonl_download_uri metadata and gzip JSON Lines bodies. 2. Validate the full lazy JSONL stream before any batch writes, then replay it for bounded imports so malformed late records cannot leave committed partial data. 3. Move list-count inference into the generic import layer so direct in-memory imports remain independent of Scryfall payload compatibility. 4. Convert successful sync tests to current bulk payloads, test legacy metadata rejection, and test malformed data beyond one batch. 5. Run focused sync/import tests and a live current-payload smoke decode.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed download_uri and JSON-array decoding. BulkData now requires jsonl_download_uri plus gzip JSON Lines, validates the complete stream before returning a replayable bounded stream, rejects truncated gzip data, and safely closes early-halted streams. Converted successful sync tests to current payloads and added rejection/late-malformation regressions.

Validation: 24 focused bulk-data, sync, and import tests passed after formatting. The current live default-cards-20260801090942.jsonl.gz payload validated 116,488 records and yielded Gleaming Splendor through the strict jsonl_download_uri path. Regression tests prove former download_uri metadata is rejected, malformed line 201 commits zero records, truncated gzip is rejected, and early stream halts close cleanly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the Scryfall bulk-data cutover: only jsonl_download_uri gzip JSON Lines is accepted for cards and oracle tags; former JSON-array support is removed. Full pre-import validation preserves zero-write failure on late malformed records while replay keeps database imports bounded. Verified with 24 passing focused tests and the live 116,488-record Scryfall payload.
<!-- SECTION:FINAL_SUMMARY:END -->
