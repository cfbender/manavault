---
id: TASK-6
title: Reject browser-normalized external login redirects
status: Done
assignee:
  - '@codex'
created_date: '2026-07-15 15:54'
updated_date: '2026-07-15 17:31'
labels:
  - security
  - backend
  - authentication
dependencies: []
references:
  - lib/manavault_web/controllers/auth_controller.ex
  - test/manavault_web/controllers/auth_controller_test.exs
priority: high
type: bug
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AuthController.safe_return_to currently accepts any value beginning with one slash unless it begins with two. Browsers normalize backslashes in special-scheme URLs, so a value such as /\\evil.example is accepted as local but resolves to https://evil.example after login. Replace prefix-only validation with a strict local-path contract and cover parser, encoding, and browser normalization edge cases.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 return_to accepts normal same-origin absolute paths, including root, nested paths, query strings, and fragments, and preserves the intended local destination after successful login.
- [x] #2 Raw backslash paths such as /\\evil.example and mixed slash/backslash authority forms are rejected and fall back to the safe root destination.
- [x] #3 Percent-encoded and form-decoded backslash variants, including single- and double-encoded inputs where applicable to the request boundary, cannot produce an external Location header.
- [x] #4 Absolute URLs, protocol-relative URLs, paths containing schemes, userinfo/authority tricks, control characters, or malformed URI data are rejected without raising.
- [x] #5 Controller tests exercise both login-page rendering and successful login redirects and assert that every rejected value remains same-origin under browser URL resolution.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a strict same-origin absolute-path parser at the authentication boundary.
2. Reject raw, decoded, double-encoded, malformed, authority-like, scheme, and control-character inputs without raising.
3. Expand controller coverage for login rendering and successful-login browser URL resolution.
4. Verify focused authentication controller tests and warnings-as-errors compilation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced prefix-only return_to handling with strict local absolute-path validation and browser-resolution controller coverage. Verification: combined focused backend run passed 50 tests, four full ExUnit seed runs passed, compilation with warnings as errors passed, and strict Credo passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
External and browser-normalized login redirects are rejected while valid same-origin paths remain supported. Verified through successful-login Location assertions, malformed/encoded edge coverage, full backend seed matrix, compile, and Credo.
<!-- SECTION:FINAL_SUMMARY:END -->
