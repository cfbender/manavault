---
id: TASK-95
title: Track market price at acquisition on collection items
status: Done
assignee:
  - '@cfbender'
created_date: '2026-10-08 22:00'
updated_date: '2026-10-08 22:23'
labels: []
dependencies: []
type: feature
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Purchase price records what the owner paid, which does not track how the market has moved since a card entered the collection (gifts, trades, bulk buys, and manual basis edits all distort it). Each collection item should also snapshot the selected price source's market price when it is added, so the Value tab can compare current market value against the market at acquisition as well as against purchase basis. Existing items are backfilled with the current price of the selected price source when the migration runs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 collection_items has an acquisition_market_price_cents column; the migration backfills existing rows with the current price from the selected price source (vendor price along the finish fallback chain, else Scryfall) and leaves rows without a price NULL
- [x] #2 Creating a collection item (add dialog, import, scan) stores the current selected-source price of the printing/finish as its acquisition market price; splitting an item (deck deallocation) copies it
- [x] #3 GraphQL exposes acquisitionMarketPriceCents/Text on CollectionItem, and acquisition market totals plus gain vs acquisition market on CollectionValueSummary and CollectionValuePosition
- [x] #4 collectionValueDashboard accepts a basis argument so rankings and gain/loss counts can be computed against purchase basis or acquisition market
- [x] #5 The Value tab has a toggle to compare market value against purchase basis or market at acquisition, and the overview, bars, distribution, and rankings follow it
- [x] #6 Rust and React tests cover the backfill, create-time snapshot, and the basis argument; mise run precommit passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration adding acquisition_market_price_cents with a SQL backfill from pricing_settings.source + vendor_prices (finish fallback chain) else scryfall_printings.prices.
2. CollectionItemRecord, collection_item_query!, ItemChanges/Draft, create_in (snapshot price_cents_for_printing at create), update, allocation split insert, and deallocate migration copy.
3. ValueTotals/value_columns add acquisition market sum; CollectionValueSummary and CollectionValuePosition gain market fields; collectionValueDashboard(basis) ranks on the chosen basis.
4. Regenerate schema.sql/.sqlx, sdl, frontend codegen.
5. Value tab: basis toggle (localStorage), overview/comparison/distribution/rankings follow basis.
6. Tests: migration backfill, create snapshot, dashboard basis; precommit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: mise run precommit passed (Rust 828 tests incl. manavault-core db upgrade backfill test, manavault-collection crud snapshot test and value_dashboard_ranks_against_the_chosen_basis; React 192 tests incl. new basis-toggle test; fmt/clippy/lint clean; Impeccable detector 0 anti-patterns). UI verified in the review portal: seeded 6 printings via createCollectionItem (snapshot captured automatically, e.g. Rhystic Study $114.83), adjusted snapshots in the dev DB, and screenshotted the Value tab in both bases at 1280px and 390px (.amp/in/artifacts/value-*.png). Decisions: snapshot is not user-editable and untouched by updates; NULL snapshot counts at current price (0 gain); summary/position carry both bases, basis arg only changes rankings/counts; UI labels follow the basis returned by the server so numbers and labels never mismatch mid-load.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added collection_items.acquisition_market_price_cents (migration with SQL backfill from the selected price source), set it at item creation and copied on allocation split, exposed it plus market-gain fields on CollectionItem/CollectionValueSummary/CollectionValuePosition, added collectionValueDashboard(basis: CollectionValueBasis), and added a persisted Compare-to toggle on the Value tab. Verified with mise run precommit and portal screenshots of both bases.
<!-- SECTION:FINAL_SUMMARY:END -->
