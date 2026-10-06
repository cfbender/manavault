---
id: TASK-91
title: Source TCGplayer prices from tcgcsv.com TCG Low
status: Done
assignee:
  - '@cfb'
created_date: '2026-10-06 18:15'
updated_date: '2026-10-06 18:22'
labels: []
dependencies: []
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TCGplayer vendor currently uses tcgtracking.com market prices with listing fallbacks, which the user finds inconsistent. tcgcsv.com republishes TCGplayer pricing daily per group with a consistent lowPrice (TCG Low), a common way to price cards. tcgcsv carries TCGplayer productIds but no Scryfall IDs, so printings must store Scryfall tcgplayer_id / tcgplayer_etched_id to join prices. The user accepted that lowPrice is not condition-filtered.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scryfall imports store tcgplayer_id and tcgplayer_etched_id on printings
- [x] #2 The tcgplayer vendor sync fetches tcgcsv.com Magic group prices and prices each printing finish with lowPrice, falling back to marketPrice
- [x] #3 Normal maps to nonfoil, Foil to foil, and products matched via tcgplayer_etched_id map to etched
- [x] #4 Settings copy describes the new TCGplayer source
- [x] #5 Tests cover tcgcsv row mapping and import of the new printing columns
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration adding tcgplayer_id/tcgplayer_etched_id integers to scryfall_printings; Printing schema + ImportRows printing fields.
2. Replace Vendors.TcgTracking with Vendors.TcgCsv: GET /tcgplayer/1/groups then /tcgplayer/1/{group}/prices, identifiable User-Agent; join productId to printings loaded from DB.
3. Price = lowPrice || marketPrice; subtype Normal->nonfoil, Foil->foil, etched id or Etched subtype -> etched.
4. Update Sync vendor map, settings copy, tests.
5. Run migration and narrow tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced Vendors.TcgTracking with Vendors.TcgCsv. Migration 20261006120000 adds scryfall_printings.tcgplayer_id/tcgplayer_etched_id; the next Scryfall catalog import fills them (ImportDiff sees the new columns as changed). Until then the tcgplayer sync matches no printings and returns :empty_feed, keeping existing prices. Requests are paced at 250ms with an identifying User-Agent per tcgcsv FAQ. Etched TCGplayer products carry subTypeName "Foil" and map to etched via tcgplayer_etched_id.
Validation: mix test pricing + catalog import/sync (66 passed); credo --strict clean; format check clean; live smoke against tcgcsv group 2708 with Scryfall IDs mapped Prismatic Piper nonfoil/foil, War Room nonfoil/foil, Karador etched; settings copy verified in portal.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TCGplayer prices now come from tcgcsv.com lowPrice (TCG Low, market fallback), joined through Scryfall tcgplayer_id/tcgplayer_etched_id stored on printings. Verified with ExUnit (66 passed), credo/format, a live tcgcsv smoke check, and the settings copy in the portal.
<!-- SECTION:FINAL_SUMMARY:END -->
