---
id: TASK-94.2
title: >-
  Replace Plug-compatible sessions, CSRF tokens, and config names with typed
  axum cookies
status: To Do
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
labels: []
dependencies:
  - TASK-94.1
parent_task_id: TASK-94
priority: medium
type: enhancement
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
manavault-core/src/crypto.rs reimplements Plug.Crypto (KeyGenerator, MessageVerifier, Erlang external term format) so the `_manavault_key` cookie matches the Elixir release, and web/session.rs is a string-keyed map with `manavault_authenticated`, `manavault_auth_fingerprint`, and the masked Phoenix CSRF token. Nothing needs cookie compatibility anymore. Replace with a typed session struct serialized into a private (encrypted, signed) cookie via axum-extra, with the CSRF token a random value in that session compared unmasked from the x-csrf-token header or the login form field. Keep the admin-password-hash fingerprint so rotating the hash signs everyone out (TASK-67), keep the return_to flow, keep PBKDF2 password hashing and the `enc.v1.` secret encryption format unchanged. Rename `SECRET_KEY_BASE` to `MANAVAULT_SECRET_KEY` and `PHX_HOST` to `MANAVAULT_PUBLIC_HOST`, accepting the old names with a startup warning. Users will be signed out once by the upgrade; say so in docs/CHANGELOG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sessions are a typed struct in a private cookie; the Erlang term format, Plug MessageVerifier, Plug KeyGenerator, and token masking code are removed
- [ ] #2 Login, logout (drops the whole session), return_to, the password-hash fingerprint invalidation, the attempt limiter, and the websocket connect authorization behave as before, covered by tests
- [ ] #3 A POST to /api/graphql with a missing or wrong x-csrf-token is rejected with 403 in every auth mode
- [ ] #4 MANAVAULT_SECRET_KEY and MANAVAULT_PUBLIC_HOST are the documented names; SECRET_KEY_BASE and PHX_HOST still work and log a deprecation warning; docs/self-hosting.md and README are updated
- [ ] #5 Stored encrypted secrets (API keys, cloud credentials) written by earlier releases still decrypt, covered by a test with a fixture value
- [ ] #6 mise run precommit passes
<!-- AC:END -->
