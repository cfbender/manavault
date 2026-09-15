---
id: TASK-48
title: Add EDHREC salt scores to cards and decks
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-08-13 07:41'
updated_date: '2026-08-13 14:56'
labels: []
dependencies: []
references:
  - 'https://edhrec.com/faq'
  - 'https://mtgjson.com/data-models/card/card-atomic/'
type: feature
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show each card’s EDHREC community salt score and a quantity-weighted salt sum for commander/mainboard cards in deck statistics. Keep the score nullable for cards without survey data and attribute its source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catalog refresh stores current nullable EDHREC salt scores by Scryfall oracle ID without treating missing scores as zero
- [x] #2 Card GraphQL data and card detail UI expose the score with source context
- [x] #3 Deck stats show the quantity-weighted salt sum for commander and mainboard cards only
- [x] #4 Backend and frontend tests cover score ingestion, missing values, quantity weighting, and excluded zones
- [x] #5 Salt score display shows only the EDHREC label and numeric score, without the scale or MTGJSON survey byline
- [x] #6 Legendary creature details show independently linked commander and card EDHREC ranks; other cards show only the linked card rank
- [x] #7 Catalog refresh stores nullable commander ranks from EDHREC without blocking Scryfall refresh when EDHREC is unavailable
- [x] #8 Deck title card shows the nullable salt sum as an icon-and-number badge immediately before the cost badge
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add nullable commander-rank storage and GraphQL exposure.
2. Import EDHREC’s paginated two-year commander ranking by Scryfall printing ID during catalog refresh, preserving prior ranks if the secondary source is unavailable.
3. Add EDHREC card/commander URL helpers and split the card-detail ranking display by legendary-creature status.
4. Simplify salt display to its label and numeric value.
5. Add ingestion and rendering tests, regenerate GraphQL types, migrate, and verify desktop/mobile portal states.

6. Reuse the deferred deck stats salt sum in the title card, render a compact accessible salt badge before cost when scored data exists, and verify desktop/mobile ordering and missing-data behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source decisions: Scryfall does not publish salt scores, so salt uses MTGJSON AtomicCards edhrecSaltiness (derived from EDHREC’s community survey) joined by scryfallOracleId. Commander rank uses EDHREC’s two-year commander index, which identifies entries by Scryfall printing ID and returns 3,478 live rank records across 2 pages. Partner-pair aggregate entries are excluded; individual commander entries remain. Missing salt stays NULL, and unavailable/empty secondary responses preserve prior enrichment without blocking Scryfall refresh.

Validation: both migrations are up; live salt and commander-rank imports completed (32,067 salt records / 32,065 local matches; 3,478 commander ranks / 3,478 local matches); mix test passed 596 tests; compile warnings-as-errors and strict Credo passed; frontend lint/typecheck passed; frontend tests passed (191 node tests and 57 Vitest tests); codegen, changed-file formatting, and production build passed. Portal DOM checks verified Stasis shows 3.06 with only a linked #7,750 card rank, The Ur-Dragon shows linked #2 commander and #2,603 card ranks with exact EDHREC destinations, and the rank row renders cleanly at desktop and 390px mobile widths. The repository-wide precommit command remains blocked only by unchanged aube-lock.yaml failing vp fmt --check.

Title badge validation: reused deferred DeckStats.saltSum; Vitest covers two-decimal/icon rendering and nullable omission; all 191 Node and 59 Vitest tests passed; lint, typecheck, production build, changed-file format, git diff check, and Impeccable detector passed. Portal DOM checks at 1440px and 390px verified 12.90, the salt-shaker icon, and immediate ordering before the cost badge; desktop/mobile screenshots were inspected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added nullable EDHREC salt and commander-rank enrichment, linked card and commander rankings to their respective EDHREC pages, simplified card salt display, and exposed the quantity-weighted deck salt sum in both deck stats and an accessible icon-and-number title badge before cost. Verified live imports and fallback behavior, 596 backend tests, 250 frontend tests, build/type/lint checks, and desktop/mobile portal states.
<!-- SECTION:FINAL_SUMMARY:END -->
