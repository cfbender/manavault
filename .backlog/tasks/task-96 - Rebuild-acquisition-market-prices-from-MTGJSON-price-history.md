---
id: TASK-96
title: Rebuild acquisition market prices from MTGJSON price history
status: Done
assignee:
  - '@cfbender'
created_date: '2026-10-09 01:43'
updated_date: '2026-10-09 02:14'
labels: []
dependencies:
  - TASK-95
references:
  - 'https://mtgjson.com/downloads/all-files/'
  - 'https://mtgjson.com/data-models/price/price-list/'
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-95 backfilled `collection_items.acquisition_market_price_cents` with the price at upgrade time, which is wrong for cards added before that upgrade. tcgcsv's daily price archive is offline (403, maintainer note: "temporarily removed due to rising server costs"), and TCGTracking's Open TCG API has no history, so the only free source of past prices is MTGJSON AllPrices (https://mtgjson.com/api/v5/AllPrices.json.gz, ~148 MB gzip), which carries 90 days of daily retail prices per MTGJSON uuid for tcgplayer, cardkingdom, manapool (USD) and cardmarket (EUR), by finish normal/foil/etched. Scryfall ids map to uuids through https://mtgjson.com/api/v5/csv/cardIdentifiers.csv (~32 MB; 2,436 Scryfall ids map to two uuids). The user wants an opt-in action that re-snapshots the acquisition price of items added inside that window from the price recorded on their `inserted_at` date for the selected price source (Scryfall source uses MTGJSON tcgplayer since Scryfall USD prices come from TCGplayer). Items older than the history window keep their current snapshot.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A background job downloads MTGJSON cardIdentifiers.csv and AllPrices.json.gz, streams them without holding either document in memory, and sets acquisition_market_price_cents for every collection item whose inserted_at date falls inside the history window using the selected price source and the item finish (with the existing finish fallback order), choosing the price recorded on that date or the nearest earlier day
- [x] #2 Items added before the history window, and items with no history for their source, keep their current snapshot and are counted separately in the run result
- [x] #3 A GraphQL mutation queues the job (at most one queued or running at a time) and a query exposes the latest run: status, source, history window, counts, and error
- [x] #4 The Settings pricing section offers the rebuild with a plain explanation, shows the latest run result, and keeps polling while a run is queued or running
- [x] #5 Rust and React tests cover the date and finish resolution, the window filtering and counts, a failed download recording a failed run, and the settings UI states
- [x] #6 docs/features.md describes the rebuild and its limits
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration: acquisition_price_rebuilds run log (status queued|running|succeeded|failed, source, started/completed, history_from/to, items_in_window, items_updated, items_without_history, error); regen schema.sql + sqlx metadata; migration count test 77.
2. manavault-catalog pricing/history.rs: HistoryUrls (AllPrices.json.gz + cardIdentifiers.csv), streamed CSV uuid map for wanted Scryfall ids, DeserializeSeed-streamed gzip JSON keeping only wanted uuids and USD providers, PriceHistory::price_cents(scryfall_id, PriceSource, finish, date) with finish_fallbacks and nearest-earlier-day (else first later day); Scryfall source reads MTGJSON tcgplayer.
3. manavault-collection collection/acquisition_prices.rs: run(state, urls) inserts/updates the run row, selects items with inserted_at in the window, applies prices in one write transaction, counts results; AcquisitionPriceRebuildWorker on the pricing queue (unique, 1 attempt) registered in collection::workers; enqueue creates the queued row.
4. GraphQL (collection crate): acquisitionPriceRebuild query (latest run) and rebuildAcquisitionPrices mutation; codegen.
5. Settings pricing section: Acquisition prices card with explanation, Rebuild button, latest run summary, polling while queued/running; React test.
6. Rust tests with wiremock (resolution, window/counts, failed download); docs/features.md; mise run precommit; portal screenshots.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: mise run precommit exit 0 (Rust fmt/clippy/tests all ok incl. collection::tests::acquisition_prices 3 tests + pricing::history 4 unit tests; frontend 53 files / 194 tests). Live run through the review portal: rebuild queued -> running -> succeeded in ~2 min (debug build; downloads took ~15 s, gz streaming the rest), source scryfall, history 2026-07-10..2026-10-08, 6 items in window / 5 updated / 0 without history; item 6 went from NULL to a real snapshot, temp downloads under data/cache/mtgjson were removed. Value tab 'Market at acquisition' comparison reflects the rebuilt snapshots. Decisions: items are preselected with inserted_at >= now-100d then filtered to the actual history range; nearest earlier day, else earliest later day; Scryfall source reads MTGJSON tcgplayer; cardmarket (EUR) skipped; item updated_at untouched; one queued/running run at a time; mutation returns the pending run if one exists.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an opt-in acquisition-price rebuild: acquisition_price_rebuilds run log migration, MTGJSON history streaming (manavault-catalog pricing/history.rs), the acquisition_price_rebuild pricing-queue worker (manavault-collection collection/acquisition_prices.rs), acquisitionPriceRebuild query + rebuildAcquisitionPrices mutation, and a Settings 'Acquisition prices' card with status polling. Verified by mise run precommit (exit 0) and a live rebuild through the portal (6 in window, 5 updated, 0 without history).
<!-- SECTION:FINAL_SUMMARY:END -->
