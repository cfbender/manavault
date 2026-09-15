---
id: TASK-43
title: Add multi-vendor pricing engine with selectable price source
status: Done
assignee:
  - '@cfb'
created_date: '2026-08-10 15:28'
updated_date: '2026-08-10 15:56'
labels: []
dependencies: []
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scryfall prices are often wrong for special treatments (e.g. HOB 275 surge foil links to the regular foil price). Add a pricing engine that syncs vendor prices into a dedicated vendor_prices store: TCGPlayer via openapi.tcgtracking.com (daily), Card Kingdom via api.cardkingdom.com/api/v2/pricelist and ManaPool via manapool.com/api/v1/prices/singles (every 6 hours, both keyed by scryfall_id). Scryfall imports keep writing only scryfall_printings.prices; vendor data lives in its own table and is joined at read time with fallback to Scryfall. The user selects the active price source in settings. Cardmarket is deferred (EUR, needs cardmarket_id mapping).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Vendor prices are stored separately from Scryfall prices; Scryfall catalog imports never overwrite vendor price data and vendor syncs never overwrite Scryfall data
- [x] #2 Card Kingdom and ManaPool prices refresh automatically every 6 hours; TCGPlayer refreshes daily
- [x] #3 A settings UI lets the user pick the price source (Scryfall, TCGPlayer, Card Kingdom, ManaPool) and the choice persists server-side
- [x] #4 All displayed prices (card grid, collection totals, deck prices, sell dialog) use the selected source with per-card fallback to Scryfall when the vendor has no price for that printing and finish
- [x] #5 Foil, etched and nonfoil finishes resolve to the correct vendor price
- [x] #6 Tests cover vendor feed parsing, fallback resolution, and the settings mutation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration: vendor_prices (scryfall_id, vendor, finish PK, price_cents, updated_at) + pricing_settings singleton (source).
2. Manavault.Pricing context: VendorPrice + Settings schemas, vendor fetchers (CardKingdom, ManaPool, TcgTracking), upsert in batches.
3. Pricing.Store GenServer owning ETS with active-source prices; rebuilt at boot, after sync, and on source change.
4. Pricing.SyncWorker GenServer: CK+MP every 6h, TCGPlayer daily via tcgtracking per-set pricing.
5. Catalog.Price consults Pricing.Store first, falls back to Scryfall prices JSON per printing+finish.
6. GraphQL: pricingSettings query + setPriceSource mutation.
7. React settings page: price source selector.
8. Tests: parsers, fallback, mutation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validated live payloads: tcgtracking /sets/{id}/cards + /pricing (TCG market/low per Normal/Foil subtype; surge-foil products carry scryfall_id only in nested cardtrader match - parser falls back to it), Card Kingdom v2 pricelist (JSON served as text/html, parser decodes binary bodies), ManaPool singles feed (cents per finish, keyed by scryfall_id). Verified end-to-end in dev: HOB 275 surge foil resolves to $675.49 (tcgplayer) / $489.74 (manapool) vs Scryfall's wrong $198.04. Full sync: tcgplayer 149,931 / cardkingdom 148,948 / manapool 149,864 rows. Fallback verified (LEB Sol Ring shows Scryfall $869 under tcgplayer source before full sync). Settings UI verified via headless Chrome screenshot. mix test: 545 passed. Pre-existing credo warning in scryfall/bulk_data.ex is unrelated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Manavault.Pricing: vendor_prices table + pricing_settings singleton, vendor fetchers (TcgTracking daily, CardKingdom + ManaPool 6h), ETS Store for the active source, periodic SyncWorker, Catalog.Price now resolves vendor-first with exact-finish chain and Scryfall fallback. GraphQL pricingSettings query + updatePricingSettings/syncVendorPrices mutations, React settings Pricing section with source selector and sync status. Verified live: HOB 275 surge foil $675 (TCG) instead of Scryfall's $198; 545 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
