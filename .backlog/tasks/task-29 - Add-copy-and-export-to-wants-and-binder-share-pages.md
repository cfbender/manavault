---
id: TASK-29
title: Add copy and export to wants and binder share pages
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 01:39'
updated_date: '2026-08-03 01:43'
labels: []
dependencies: []
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Public /share/wants and /share/binder pages get a copy-list and download flow producing standard decklist text that any ManaVault Matches paste (or other tools) can consume.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both share pages offer copy-to-clipboard and .txt download of the list
- [x] #2 Exported lines use the standard quantity/name/(SET) collector/finish format, omitting printing info when a want is generic
- [x] #3 Typecheck and react tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Pure line-builder helper in pages/trade/share-list-export.ts (reusing lib/deck-export line conventions) + node test; copy/download buttons on share-wants-page.tsx and share-binder-page.tsx mirroring the shared deck page's copy/download actions; verify in browser.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ShareListActions (Copy list / Download .txt) to both /share/wants and /share/binder pages, backed by a pure shareListText builder emitting standard decklist lines (printing omitted for generic wants, *F*/*E* finish markers) and a new lib/clipboard.ts copy helper with a textarea/execCommand fallback for plain-http LAN share links. Verified: 4 new node tests (182 total) + typecheck/lint/fmt/build green; browser click-through on both pages captured exact copied text ('1x Ancient Tomb' / '1x A Realm Reborn (FIN) 196...') and the binder text round-tripped through tradeMatches with 0 unrecognized. Smoke binder token removed; pre-existing wants token left.
<!-- SECTION:FINAL_SUMMARY:END -->
