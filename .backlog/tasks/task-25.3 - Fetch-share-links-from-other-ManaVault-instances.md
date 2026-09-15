---
id: TASK-25.3
title: Fetch share links from other ManaVault instances
status: Done
assignee:
  - '@claude'
created_date: '2026-08-02 23:29'
updated_date: '2026-08-03 00:12'
labels: []
dependencies: []
parent_task_id: TASK-25
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Absolute ManaVault share URLs (decks and wants) resolve by POSTing that origin's /share/graphql; relative links resolve locally. Enables cross-instance trade matching and deck diffing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Absolute /share/decks and /share/wants URLs fetch from the link's own origin via /share/graphql
- [x] #2 Relative share paths still resolve locally with no outbound request
- [x] #3 Remote fetches are hardened: fixed path, no redirects, timeout, size cap, strict JSON shape validation, friendly errors
- [x] #4 ExUnit tests stub remote instances for deck and wants fetches and error paths
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
ManaVault list source: absolute share URLs POST {origin}/share/graphql (deck query via deckCards connection; wantsList for wants links) with hardened Req (no redirects, 10s, 5MB, shape validation); relative paths resolve locally; wants tokens resolve locally for relative links via Trade context. Req.Test tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend landed and green: relative share paths resolve locally, absolute URLs always POST the link origin's /share/graphql (path forced from origin only, no redirects, 10s/5MB, shape-validated), deck pagination on hasNextPage, distinct friendly errors incl. unsupported-wants-share instances.

Deliberate tradeoff (user requirement): cross-instance fetch allows private/LAN origins so self-hosted friends can trade; bounded by fixed /share/graphql path built from origin only, fixed query body, no credentials, no redirects, 10s/5MB caps, strict shape validation, and responses render only to the pasting owner. Documented in docs/features.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Absolute ManaVault share links (decks + wants) now fetch that origin's public /share/graphql (with deck connection pagination); relative links resolve locally. Verified: Req.Test-stubbed remote/error tests within the 467-test suite; live browser match against this instance's own absolute wants share URL resolved through the remote path.
<!-- SECTION:FINAL_SUMMARY:END -->
