---
id: TASK-68
title: >-
  Document proxy and cookie hardening flags, add an auth unban command, and
  audit dependencies in CI
status: Done
assignee:
  - '@cody'
created_date: '2026-09-20 16:34'
updated_date: '2026-09-20 16:40'
labels: []
dependencies: []
priority: high
type: enhancement
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
MANAVAULT_TRUST_PROXY_HEADERS, MANAVAULT_FORWARDED_IP_HEADER, MANAVAULT_SECURE_COOKIES, and MANAVAULT_SESSION_MAX_AGE_DAYS exist in config/runtime.exs but are not mentioned in README.md or docs/self-hosting.md. The recommended deployment (TLS-terminating reverse proxy) therefore ships with a non-Secure session cookie and every client sharing the proxy IP as the login rate-limit key, so 30 failed guesses from anyone permanently bans the owner too (Manavault.Auth.AttemptLimiter). AttemptLimiter.reset_all/0 exists but nothing exposes it. mix hex.audit currently reports mint 1.10.0 EEF-CVE-2026-82672 and neither hex.audit nor aube audit runs in CI or the precommit script.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/self-hosting.md and README.md document the four env vars above with guidance to enable secure cookies and trusted proxy headers when behind HTTPS/a proxy, including how to clear a permanent login ban
- [x] #2 A mix task and a release-friendly command clear permanent bans for one client id or all clients
- [x] #3 mint is updated so mix hex.audit reports no advisories
- [x] #4 mix hex.audit runs in the precommit script or the Quality workflow and fails the build on advisories
- [x] #5 mix test passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make AttemptLimiter resets fall back to direct persistent-row deletion when its GenServer is absent, then add and test a one-client/all-clients Mix task.
2. Document proxy IP trust, secure cookies, session lifetime, and lockout recovery in README and self-hosting guidance, including release RPC commands.
3. Update mint, add mix hex.audit to the precommit quality gate, and run targeted plus full verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented resilient AttemptLimiter resets that delete persistent rows directly when the GenServer is absent, plus mix manavault.auth.unban for one client or --all. Documented source and release-container recovery commands and reverse-proxy/session hardening. Updated mint 1.10.0 to 1.10.1 and added mix hex.audit to the package precommit script.

Validation: targeted unban tests passed (2 tests), full mix test passed (677 tests), and mix hex.audit reported no retired or advisory packages. aube audit still reports 18 known devDependency advisories through @capacitor/cli and vitest, intentionally out of scope.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Documented the four proxy/session hardening variables and lockout recovery, added tested Mix/release recovery paths for one or all client bans, updated mint to 1.10.1, and enforced mix hex.audit in the quality gate. Verified with 2 targeted tests, all 677 ExUnit tests, and a clean Hex audit.
<!-- SECTION:FINAL_SUMMARY:END -->
