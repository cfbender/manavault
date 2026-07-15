---
id: TASK-6
title: Reject browser-normalized external login redirects
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-15 15:54'
updated_date: '2026-07-15 16:25'
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
- [ ] #1 return_to accepts normal same-origin absolute paths, including root, nested paths, query strings, and fragments, and preserves the intended local destination after successful login.
- [ ] #2 Raw backslash paths such as /\\evil.example and mixed slash/backslash authority forms are rejected and fall back to the safe root destination.
- [ ] #3 Percent-encoded and form-decoded backslash variants, including single- and double-encoded inputs where applicable to the request boundary, cannot produce an external Location header.
- [ ] #4 Absolute URLs, protocol-relative URLs, paths containing schemes, userinfo/authority tricks, control characters, or malformed URI data are rejected without raising.
- [ ] #5 Controller tests exercise both login-page rendering and successful login redirects and assert that every rejected value remains same-origin under browser URL resolution.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a strict same-origin absolute-path parser at the authentication boundary.
2. Reject raw, decoded, double-encoded, malformed, authority-like, scheme, and control-character inputs without raising.
3. Expand controller coverage for login rendering and successful-login browser URL resolution.
4. Verify focused authentication controller tests and warnings-as-errors compilation.
<!-- SECTION:PLAN:END -->
