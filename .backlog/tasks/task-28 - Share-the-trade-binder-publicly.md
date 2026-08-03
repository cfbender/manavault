---
id: TASK-28
title: Share the trade binder publicly
status: Done
assignee:
  - '@claude'
created_date: '2026-08-03 01:09'
updated_date: '2026-08-03 01:36'
labels: []
dependencies: []
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cards flagged up-for-trade become shareable exactly like the wants list: share token, public read-only page at /share/binder/..., public GraphQL query, and binder share links resolve in trade matching and deck diff from any instance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Binder share token can be ensured and queried; public /share/binder/:token page renders the for-trade list read-only with finish and condition
- [x] #2 Public and private schemas expose binderList(id) with card, quantity, printing, finish, and condition info
- [x] #3 ManaVault /share/binder links resolve locally (relative) or from the link origin (absolute) in tradeMatches and deckDiff
- [x] #4 Binder tab offers a share action mirroring the wants share dialog
- [x] #5 Full suite, typecheck, react tests, and build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Mirror the wants-share architecture end to end: 1. Parallel backend (migration + Trade context + GraphQL + ListSource) and frontend (dialog + public page + copy) agents against a fixed contract. 2. Migrate, gates, codegen. 3. Browser smoke: share binder, view public page, paste binder link into Matches. 4. Docs + finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gates: mix test 489, credo (1 pre-existing warning), mix format --check, typecheck, lint, vp fmt, 178 node + 15 vitest, build. Browser loop: flagged cards -> Share binder -> public page (FIN #196 Near Mint etc.) -> pasted the binder URL into Matches (role their-cards) -> 'They have x1, you want x1' match. Smoke artifacts removed (my want + share row + one agent-created want); two for_trade flags from earlier in the session left in place since ownership was ambiguous.

Post-finalization corrections: credo alias-order fix in binder_share.ex; Ancient Tomb want (deleted during cleanup on ambiguous attribution) restored with original id/quantity/timestamps — prior preferred_printing_id unknowable (WAL gap in the file-copy backup), restored as generic; disclosed to user.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Trade binder is publicly shareable exactly like the wants list: token + dialog, /share/binder page with finish/condition, binderList on both schemas, and binder share links resolve in matching/diffing locally and cross-instance. Verified by the full suite and an end-to-end browser loop.
<!-- SECTION:FINAL_SUMMARY:END -->
