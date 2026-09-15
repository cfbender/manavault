---
id: TASK-46
title: Price ManaPool special treatments independently
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-08-11 17:54'
updated_date: '2026-08-11 18:00'
labels: []
dependencies: []
modified_files:
  - lib/manavault/catalog/printing.ex
  - lib/manavault/catalog/scryfall/import.ex
  - lib/manavault/catalog/scryfall/import_rows.ex
  - lib/manavault/pricing/vendors/mana_pool.ex
  - >-
    priv/repo/migrations/20260811180000_add_promo_types_to_scryfall_printings.exs
  - test/manavault/catalog/sync_test.exs
  - test/manavault/pricing_test.exs
type: bug
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ManaPool market fields can represent a generic foil product rather than the treatment-specific Scryfall printing. Gleaming Splendor HOB #275 is a surge foil with a $430 ManaPool NM listing, while ManaPool publishes a $209.55 generic foil market value (and a nonfoil market value despite the printing being foil-only). Preserve market pricing for ordinary printings while using treatment-specific ManaPool listing data for special treatments.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Gleaming Splendor HOB #275 resolves from ManaPool's surge-foil-specific listing price instead of its generic foil market field
- [x] #2 Ordinary nonfoil and foil printings continue to use ManaPool market prices
- [x] #3 Etched printings use ManaPool's etched listing price instead of falling through to ordinary foil
- [x] #4 Scryfall imports retain the metadata needed to identify special-treatment printings
- [x] #5 Targeted pricing and catalog import tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Persist Scryfall promo types on printing records during catalog import.
2. Classify printing-specific physical/foil promo treatments from that metadata.
3. During ManaPool sync, use treatment-specific listing fields for classified printings, retain market fields for ordinary printings, and ingest etched listing prices.
4. Add regression coverage for ordinary, surge-foil, and etched pricing, then run migrations and targeted tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ManaPool documents price_market/price_market_foil separately from per-finish listing fields and exposes no etched market field. The live HOB #275 page showed a $430 NM surge-foil listing while the market fields were $85.95 nonfoil and $209.55 foil, confirming treatment contamination. Special treatment promo types now select NM/LP+/any listing fields; ordinary printings retain market fields.

Validation: `mise exec -- mix ecto.migrate` applied 20260811180000; targeted catalog/pricing suite passed 51 tests; full `mise exec -- mix test` passed 592 tests; focused `mise exec -- mix credo --strict ...` found no issues; `git diff --check` passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Persisted Scryfall promo types and made ManaPool pricing treatment-aware. Special treatments such as surge foils now use their Scryfall-printing-specific listing price, ordinary foil/nonfoil cards keep market pricing, and etched cards use etched listings. Verified the Gleaming Splendor regression end to end and passed the 592-test suite.
<!-- SECTION:FINAL_SUMMARY:END -->
