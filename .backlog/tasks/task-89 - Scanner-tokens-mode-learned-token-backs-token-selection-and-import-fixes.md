---
id: TASK-89
title: 'Scanner tokens mode, learned token backs, token selection and import fixes'
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-10-05 22:05'
updated_date: '2026-10-05 23:16'
labels: []
dependencies: []
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 2 of owned tokens (follows TASK-88). Scanning a stack of tokens is slow and error-prone: the scanner never logs the same card twice in a row (so identical-art tokens with different backs or finishes need manual +1), it often reads tokens as Funeral Room // Awakening Hall because the recogniser's top five rarely contain the token, and the Identify/Wrong card search excludes tokens. Token backs picked in the scanner were also lost on import (the collection import preview never carried backScryfallId through the commit), the Tokens tab has no bulk selection, and the scan list's Back badge wrapped onto two lines on phones. Oracle-side recognition work (token oversampling, masked search graph) is tracked in the cfbender/oracle thread T-01a10e19-37cd-726a-9248-89ef98e54c92.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scanner has a Tokens mode: only token-layout candidates are considered and a recognised token is logged when the viewfinder is tapped, including the same token repeatedly
- [x] #2 Scanner card search (Identify and Wrong card) finds tokens; in Tokens mode it searches only tokens
- [x] #3 Back-face picker lists backs recorded on owned token items and on other entries in the current scan list as known backs, in both directions
- [x] #4 Token backs picked in the scanner survive the collection import commit
- [x] #5 Tokens tab supports select, select all and bulk delete
- [x] #6 Scan list Back badge no longer wraps on narrow screens
- [x] #7 Docs (scanner.md, features.md) describe Tokens mode and learned backs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scan-decision.ts: add evaluateTokenFrame (token-layout candidates only, 'ready' outcome, no auto-log); scan-view/status text for ready; viewfinder tap logs the ready candidate in Tokens mode; Tokens pill toggle persisted in ScanSettings.tokenMode.
2. GraphQL cards(q, tokens: EXCLUDE|INCLUDE|ONLY) via Search.Cards include/only option; scanner CardNameSearch passes INCLUDE (ONLY in Tokens mode).
3. BackOptions: known = owned token_items backs (both directions) + KnownBacks gallery data; TokenBackSheet adds backs from other entries in the scan list.
4. Import fix: select backScryfallId in CollectionImportPreview and forward in commitImportRow; regenerate gql types.
5. Tokens tab: selection hook + bulk bar (Select all / Clear / Delete) with new deleteTokenItems(ids) mutation.
6. scan-list-sheet Back badge whitespace-nowrap + wrapping meta row.
7. Tests (node scan-decision tests, ExUnit for Search.Cards tokens option, BackOptions learned backs, deleteTokenItems, import back round-trip), docs, portal verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: mix test 847 passed; aube run test:react 259 node + 178 vitest passed; typecheck, lint, vp fmt --check, credo --strict, compile --warnings-as-errors clean. Portal checks (agent-browser, 390px, fake getUserMedia init script): Tokens pill toggles status copy and empty-state hint; Identify sheet in Tokens mode returns only token cards for 'dragon'; scan list Back badges wrap as whole badges and truncate; back sheet lists session-picked backs first (merged with server record when known); Tokens tab Select -> Select all/Clear/Remove bar, Remove 1 token confirm dialog, deleteTokenItems removed the item (token_items 5 -> 4). Decisions: token-mode ready threshold reuses minScore 0.6 (uncalibrated); tap logs via viewfinder pointerdown; session backs live only in the sheet until import teaches the server; deleteTokenItems takes explicit IDs (Tokens list is unpaginated); TokenPrintingGrid hides the set line when an option has no set code. Oracle-side token oversampling / masked search graph delegated to thread T-01a10e19-37cd-726a-9248-89ef98e54c92; the client can still only filter the fixed top-5 until that lands.

Follow-up: Tokens toggle moved from the viewfinder bottom row into the scanner settings sheet ('Tokens mode' ToggleRow); status pill still shows the mode. Client now implements Oracle's search mask contract (oracle commit b48ed61, unpushed): recognizer checks search.onnx inputNames for 'mask', builds all/tokens Float32 masks over arts.json order once, feeds the frame's scope (tokens mode -> 'tokens'), drops padded rows scoring < -1; older bundles keep the embeddings-only call. 'token search' shown under Recognition model when available. Tests: scanner-pipeline.test.mjs galleryMask/isPaddedResult; node 261 + vitest 178 pass; typecheck/lint/fmt clean; portal check of settings sheet and bottom row.

Shipped: manavault origin/main d8f6346 (plus 3e783db resync-on-upgrade, 9b38daa deck linked tokens, 1c481f5 busy_timeout). Hub penalty follow-up delegated to the oracle thread T-01a10e19-37cd-726a-9248-89ef98e54c92.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added scanner Tokens mode (token-only candidates, tap-to-log, persisted toggle), token-aware scanner search (cards tokens: EXCLUDE|INCLUDE|ONLY), learned token backs from owned items and the current scan list, backScryfallId import fix, Tokens tab selection with deleteTokenItems bulk removal, and a non-wrapping Back badge; docs updated. Verified with ExUnit (847), node + vitest suites, and portal UI checks of each changed surface.
<!-- SECTION:FINAL_SUMMARY:END -->
