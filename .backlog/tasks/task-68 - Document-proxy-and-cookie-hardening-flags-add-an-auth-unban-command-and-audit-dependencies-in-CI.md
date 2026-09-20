---
id: TASK-68
title: >-
  Document proxy and cookie hardening flags, add an auth unban command, and
  audit dependencies in CI
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
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
- [ ] #1 docs/self-hosting.md and README.md document the four env vars above with guidance to enable secure cookies and trusted proxy headers when behind HTTPS/a proxy, including how to clear a permanent login ban
- [ ] #2 A mix task and a release-friendly command clear permanent bans for one client id or all clients
- [ ] #3 mint is updated so mix hex.audit reports no advisories
- [ ] #4 mix hex.audit runs in the precommit script or the Quality workflow and fails the build on advisories
- [ ] #5 mix test passes
<!-- AC:END -->
