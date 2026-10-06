---
id: TASK-90
title: Stop the Scryfall catalog import from starving other SQLite writers
status: Done
assignee: []
created_date: '2026-10-06 01:05'
updated_date: '2026-10-06 01:22'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every daily Scryfall import on production logs Oban stager/producer crashes ("database is locked" on BEGIN IMMEDIATE, "Database busy" on oban_jobs fetch) and DBConnection disconnects ("queued and checked out the connection for longer than 15000ms"). The import commits one transaction per 200-card batch, but it realizes the whole decoded catalog in memory first (2.7 GB peak locally) and then runs the ~550 batch transactions back-to-back with only a few ms between commits. Exqlite's busy handler polls every 50 ms, so a waiter such as Oban's stager rarely finds the lock free and times out after busy_timeout. On production each batch holds the lock ~1.4 s, so the import keeps the lock nearly continuously for ~14 minutes while rewriting every card and printing row (including unchanged ones) each day.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A concurrent writer (BEGIN IMMEDIATE every second, like Oban's stager) completes without a busy error during a full real-catalog import, and its wait never approaches busy_timeout
- [x] #2 Rerunning the import over an unchanged catalog does not rewrite card, printing, or token-link rows whose stored data already matches the bulk file
- [x] #3 The import decodes and writes the catalog in a streaming fashion so peak memory no longer grows with the full decoded catalog
- [x] #4 Paper printing reconciliation and all existing import/sync tests still pass; import counts match the bulk data
- [x] #5 A busy_timeout expiry no longer also disconnects the pooled connection
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make the import pipeline lazy (Stream.chunk_every) so decoding and row prep run between batch transactions instead of before them. 2. Per batch, read the existing card/printing/token-link rows (reads never take the write lock) and upsert only rows whose stored values differ. 3. Guarantee a minimum gap between batch commits that exceeds Exqlite's 50 ms busy poll so waiters always get a turn. 4. Replace ReconcilePrintings' updated_at-based staleness with the set of printing ids seen in this import, since unchanged rows no longer get a new updated_at. 5. Lower busy_timeout below the DBConnection checkout timeout. 6. Add tests for skip-unchanged and the inter-batch gap; benchmark against the real bulk file with a stager-like concurrent writer.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: mix compile --warnings-as-errors, mix format --check-formatted, mix credo --strict (changed files) clean; mix test 850 passed. Real-data benchmark (default-cards 78 MB jsonl.gz, stager-like BEGIN IMMEDIATE every 1 s): baseline cold 48.7 s with stager wait max 2245 ms (rerun max 3135 ms); new cold 64.9 s with stager max 36 ms; new unchanged rerun 42.2 s, stager max 1 ms, written_printings=0, written_cards=2862 (all genuine source inconsistencies: 624 oracle ids whose printings disagree on legalities/layout/name), peak BEAM memory 161 MB vs 2.7 GB before. Decisions: 75 ms minimum commit gap; rulings_uri excluded from the card diff because it embeds a printing id; ReconcilePrintings now uses the seen-printing-id set; busy_timeout 10 s so it expires before DBConnection's 15 s checkout timeout. Possible follow-ups (not done): resolve the per-oracle flip-flop for inconsistent source rows; move Oban/pricing to a separate SQLite file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catalog import now streams the bulk file, diffs each batch against stored rows (ImportDiff) and writes only changed cards/printings/token links, and enforces a 75 ms gap between batch commits so Oban and other writers can take the SQLite lock. ReconcilePrintings uses the set of printing ids seen during the import instead of updated_at. busy_timeout lowered to 10 s so expiry no longer tears down the pooled connection. Verified with new import tests (skip-unchanged, commit gap), full mix test (850 passed), and a real-catalog benchmark with a concurrent stager-like writer (max wait 36 ms cold, 1 ms on unchanged rerun, previously up to 3.1 s).
<!-- SECTION:FINAL_SUMMARY:END -->
