---
id: TASK-49
title: Show card synergies at a glance
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-14 21:08'
updated_date: '2026-08-14 21:23'
labels: []
dependencies: []
modified_files:
  - assets/react/src/gql/gql.ts
  - assets/react/src/gql/graphql.ts
  - assets/react/src/pages/cards/card-synergies.tsx
  - assets/react/src/pages/cards/data.ts
  - assets/react/src/pages/cards/page.tsx
  - assets/react/test/card-synergies.test.tsx
  - lib/manavault/catalog.ex
  - lib/manavault/catalog/edhrec.ex
  - lib/manavault/catalog/edhrec/client.ex
  - lib/manavault/catalog/edhrec/response/card_page.ex
  - lib/manavault_web/schema/catalog/card_operations.ex
  - lib/manavault_web/schema/catalog/card_types.ex
  - lib/manavault_web/schema/catalog/query_resolvers.ex
  - test/manavault/catalog/edhrec/card_page_test.exs
  - test/manavault_web/schema/schema_domain_contract_test.exs
type: feature
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card detail pages should expose the most useful card-specific EDHREC relationships without sending collectors away from ManaVault. Add a compact, collapsible Synergies section to the card header.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each card detail can expand a Synergies section containing Top Commanders, New Commanders, New Cards, and High Lift Cards when EDHREC supplies them
- [x] #2 Synergy entries show useful card imagery and context, and locally synced entries navigate to their ManaVault card detail
- [x] #3 Loading, unavailable, partial, and empty EDHREC data do not block or break the card detail page
- [x] #4 The section is keyboard accessible and remains readable on mobile and desktop
- [x] #5 Focused backend and frontend tests cover normalization and disclosure behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a card-page EDHREC fetch and normalization path that keeps only the four requested sections and resolves entries against the local catalog in batches.
2. Expose normalized card synergy sections through GraphQL with local card imagery and EDHREC metrics.
3. Add a collapsed-by-default Synergies disclosure to the card detail hero with four compact, responsive rails and clear loading/error/empty states.
4. Add focused Elixir and React tests, regenerate GraphQL types, and run targeted checks plus responsive visual verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a server-side EDHREC card-page fetch and batched local-card normalization for the four requested sections, exposed it through GraphQL, and added a native details/summary disclosure to the card hero. Entries retain EDHREC fallbacks when the local catalog is stale and link locally when a card resolves.

Validation: `mix test` passed 598 tests; `aube run test:react` passed 195 Node tests and 62 Vitest tests; typecheck, lint, production build, and formatter checks passed. Browser automation exercised Sol Ring against live EDHREC data at 1440px and 390px, confirmed all four headings, 17 links, open/closed behavior, and zero horizontal overflow. The Impeccable finish review returned `ship` with no material fixes.

Final server-suite rerun after hardening null/partial EDHREC cardlists: `mix test` passed 599 tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a collapsible Synergies tray to card detail headers with Top Commanders, New Commanders, New Cards, and High Lift Cards from EDHREC. Data is normalized server-side against the local catalog, cards link back into ManaVault when available, and loading/error/empty fallbacks keep card details usable. Verified by the full Elixir and React suites, typecheck, lint, production build, responsive browser checks, and an Impeccable ship review.
<!-- SECTION:FINAL_SUMMARY:END -->
