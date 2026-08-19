---
id: TASK-54
title: Provide authoritative deck counts to AI
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-19 04:47'
updated_date: '2026-08-19 04:47'
labels: []
dependencies: []
modified_files:
  - lib/manavault/ai/deck_analysis.ex
  - lib/manavault/ai/deck_question.ex
  - test/manavault/ai/deck_analysis_test.exs
  - test/manavault/ai/deck_question_test.exs
  - test/manavault/ai_test.exs
type: bug
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deck analysis and Q&A can miscount lands when inferring totals from the raw card list. Supply authoritative deck totals so responses use ManaVault's counted quantities, including land-faced MDFCs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deck analysis requests include authoritative total, land, and nonland counts.
- [x] #2 Deck Q&A requests include the same authoritative counts.
- [x] #3 Land-faced MDFCs are included in the authoritative land count, while non-counted deck zones are excluded.
- [x] #4 Automated tests cover metadata calculation and delivery in both AI flows.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Calculate total, land, and nonland quantities in the shared AI deck payload.
2. Tell analysis and Q&A prompts to trust the supplied facts rather than recounting cards.
3. Cover MDFCs, excluded zones, and transmitted request payloads with tests.
4. Run formatting, compilation, and the full test suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added shared authoritative card, land, and nonland quantities with MDFC-aware land detection and prompt guidance for both analysis and Q&A. Verification passed: 622 ExUnit tests, compilation with warnings as errors, format check, diff check, and Credo diff with no new issues.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Supplied authoritative deck totals to both AI analysis and Q&A so the model no longer needs to infer land counts from the card list. Land-faced MDFCs count as lands and excluded zones remain excluded. Verified by the full 622-test suite and static checks.
<!-- SECTION:FINAL_SUMMARY:END -->
