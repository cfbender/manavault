---
id: TASK-19
title: Add StarCityGames deck purchase vendor
status: Done
assignee:
  - '@cfb'
created_date: '2026-07-27 14:30'
updated_date: '2026-07-27 14:57'
labels: []
dependencies: []
modified_files:
  - lib/manavault/catalog/vendors/star_city_games.ex
  - lib/manavault_web/controllers/vendor_controller.ex
  - lib/manavault_web/router.ex
  - assets/react/src/lib/csrf.ts
  - assets/react/src/lib/apollo.ts
  - assets/react/src/pages/decks/buylist-marketplace-actions.tsx
  - assets/react/test/buylist-marketplace-actions.test.tsx
  - test/manavault_web/controllers/vendor_controller_test.exs
  - README.md
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add StarCityGames as a decklist purchase option beside the existing marketplace actions, and order the actions Mana Pool, Card Kingdom, StarCityGames, then TCGplayer. Moxfield sends users to https://starcitygames.com/shop/deck-builder/?data=<uuid> after preparing the list.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Buylist actions render in Mana Pool, Card Kingdom, StarCityGames, TCGplayer order
- [x] #2 StarCityGames opens the vendor deck builder with the decklist data
- [x] #3 Empty buylists keep StarCityGames disabled like other link-based vendors
- [x] #4 Relevant frontend tests cover the new StarCityGames flow and ordering
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a same-origin form endpoint that forwards the plain-text buylist as JSON to StarCityGames' affiliate handoff and redirects only to a validated SCG deck-builder UUID URL. 2. Add the StarCityGames form action and order marketplace controls Mana Pool, Card Kingdom, StarCityGames, TCGplayer, including empty-state disabling. 3. Cover request/redirect behavior, URL construction, disabled state, and ordering with the narrowest relevant tests, then smoke-test the handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a CSRF-protected browser form endpoint that posts the buylist to StarCityGames' affiliate storage API, validates the returned UUID, and redirects to the SCG deck builder. Added the StarCityGames action, reordered all vendors, documented the choices, and added controller and frontend coverage.

Validation: controller test 2/2 passed; marketplace Vitest 2/2 passed; TypeScript typecheck passed. Browser smoke test rendered vendors in Mana Pool, Card Kingdom, StarCityGames, TCGplayer order, opened https://starcitygames.com/shop/deck-builder/?data=<uuid>, and confirmed all nine missing-card lines populated the SCG decklist.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added StarCityGames purchasing through a CSRF-protected SCG affiliate handoff, reordered the marketplace actions, and documented the vendor choices. Verified the redirect and failure paths with ExUnit, ordering/disabled/form behavior with Vitest, TypeScript with the project typecheck, and the populated StarCityGames deck builder in Chromium.
<!-- SECTION:FINAL_SUMMARY:END -->
