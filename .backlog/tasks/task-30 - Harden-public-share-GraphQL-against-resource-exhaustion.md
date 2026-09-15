---
id: TASK-30
title: Harden public share GraphQL against resource exhaustion
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-03 22:46'
updated_date: '2026-08-03 23:12'
labels: []
dependencies: []
modified_files:
  - config/config.exs
  - config/runtime.exs
  - lib/manavault/application.ex
  - lib/manavault/public_share_request_limiter.ex
  - lib/manavault/trade/list_source/mana_vault_remote.ex
  - lib/manavault_web/endpoint.ex
  - lib/manavault_web/plugs/public_graphql_protection.ex
  - lib/manavault_web/public_share_schema.ex
  - lib/manavault_web/router.ex
  - lib/manavault_web/schema/public_share_types.ex
  - test/manavault/trade/list_source_test.exs
  - test/manavault_web/public_graphql_protection_test.exs
priority: high
type: bug
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The unauthenticated /share/graphql endpoint can be abused to consume database and application resources through repeated valid-shaped missing share tokens, recursive Card/Printing traversal, oversized connection pagination, complex/deep/token-heavy documents, and transport batches. Add cohesive public-endpoint controls without breaking legitimate shared deck, wants, binder, or remote ManaVault import flows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Public GraphQL rejects documents exceeding configured complexity, depth/token limits, and disallowed or oversized batches before expensive resolver work
- [x] #2 Public connection pagination is safely bounded and unnecessary Card/Printing recursion is removed where contract-compatible
- [x] #3 Practical endpoint request controls limit per-IP and aggregate abuse without an unbounded negative-token cache
- [x] #4 Legitimate deck, wants, binder share queries and remote ManaVault imports continue to work
- [x] #5 Focused abuse and regression tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Put /share/graphql behind an endpoint-specific protection pipeline that rejects transport batches and applies bounded fixed-window per-IP/global request admission using the existing trusted-proxy client identifier.
2. Enable Absinthe token and complexity limits only on the public endpoint, add a pre-execution max-depth phase, and weight public Relay connections by their clamped page sizes.
3. Clamp public deck-card and printing connection arguments, and replace Printing.card's recursive Card return type with a non-recursive public card summary while preserving fields used by share clients.
4. Add focused HTTP abuse tests plus schema/legitimate share and remote-import regressions; run the narrowest relevant tests and formatting.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented pre-parser per-IP/global admission with bounded fixed-window state, post-parser transport-batch rejection, public-only Absinthe token/complexity/depth controls, fixed complexity costs for expensive public roots, public connection clamping and fanout pricing, non-recursive printing card summaries, and compatible 500-row/100-page remote imports. Added focused abuse and regression coverage.
Verification: 41 focused public share/import tests passed; 9 CSRF/mutation/missing-token-cache tests passed; format check and test compile with warnings-as-errors passed. Full public cache module has one environment-only existing PNG renderer failure (no image/png response because rsvg rendering is unavailable); unrelated Credo warning remains in lib/manavault/catalog/scryfall/bulk_data.ex:81.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened /share/graphql with pre-parser bounded per-IP/global admission, complete transport-batch rejection, 5,000-token/12-depth/100,000-complexity limits, weighted expensive roots, 500 deck-card and 300 printing page clamps, and a non-recursive printing card summary. Remote imports now request 500 rows for up to 100 pages, preserving the prior 50,000-entry ceiling. Verified by 41 focused public-share/import regressions, 9 CSRF/mutation/cache checks, format validation, and warning-free test compilation.
<!-- SECTION:FINAL_SUMMARY:END -->
