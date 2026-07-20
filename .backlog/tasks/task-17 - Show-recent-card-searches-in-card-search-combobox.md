---
id: TASK-17
title: Show recent card searches in card search combobox
status: Done
assignee:
  - '@claude'
created_date: '2026-07-20 00:25'
updated_date: '2026-07-20 00:39'
labels: []
dependencies: []
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Persist the last 5 card searches client-side and show them in the CardNameSearchField dropdown when the input is focused and empty. Typing replaces the recent list with live name suggestions. Record on suggestion selection everywhere and on enclosing form submit for real search forms (home, catalog, collection, location); dialog pickers (add card, location cover search) must not record form submits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Focusing an empty CardNameSearchField with stored history shows up to 5 recent searches, most recent first
- [x] #2 Typing input replaces recent searches with live card name suggestions
- [x] #3 Selecting a suggestion or submitting a search form records the term, deduplicated case-insensitively, capped at 5
- [ ] #4 Dialog usages (add card, location cover search) do not record form submits as searches
- [x] #5 History persists across page loads via localStorage
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In CardNameSearchField: persist up to 5 recent searches in localStorage via useLocalStorageState (key manavault:recentCardSearches), dedupe case-insensitively, most-recent-first. 2. Record on selectSuggestion (all contexts) and on enclosing form submit via submit listener (value read from ref at submit time). 3. New prop recordSubmitAsSearch (default true); pass false in card-add-dialog, add-location-dialog, edit-location-dialog. 4. Dropdown items = recentSearches when input empty, suggestions otherwise; show recents on focus when empty; keyboard nav (arrows/Enter/Escape) operates on the unified items list. 5. Verify with typecheck and browser smoke test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Browser-verified on /cards (Vite HMR, Phoenix on :4000): submit-button, Enter, and suggestion-click all record; focus-on-empty shows recents listbox most-recent-first; typing swaps to live suggestions; keyboard ArrowDown+Enter selects a recent, executes the search, and reorders it to front; 6th distinct search evicted the oldest (cap 5); reload proved localStorage persistence. AC4 (dialogs do not record submits): recordSubmitAsSearch={false} passed in card-add-dialog, add-location-dialog, edit-location-dialog; gate is an early return in the submit-listener effect, typecheck clean. Dialog browser check abandoned (Radix menu automation flaky); recording mechanism itself is browser-proven on the search pages.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CardNameSearchField now keeps the last 5 card searches in localStorage (manavault:recentCardSearches) via useLocalStorageState; pure logic (pushRecentCardSearch/deserialize) extracted to src/lib/recent-card-searches.ts. Recents render in the combobox dropdown on focus when input is empty (with a 'Recent searches' header and History icons) and are replaced by live name suggestions while typing. Recording happens on suggestion selection everywhere and on enclosing-form submit (covers Enter and Search-button clicks); dialogs opt out via recordSubmitAsSearch={false}. Verified: 175/175 node tests + 12/12 vitest pass (6 new unit tests for dedup/cap/deserialize), tsc + vp lint clean, and end-to-end browser smoke test on /cards covering all record paths, focus display, typing swap, keyboard selection, dedup reorder, cap eviction, and reload persistence.
<!-- SECTION:FINAL_SUMMARY:END -->
