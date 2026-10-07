---
id: TASK-94.2
title: >-
  Replace Plug-compatible sessions, CSRF tokens, and config names with typed
  axum cookies
status: Done
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
updated_date: '2026-10-07 19:59'
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
- [x] #1 Sessions are a typed struct in a private cookie; the Erlang term format, Plug MessageVerifier, Plug KeyGenerator, and token masking code are removed
- [x] #2 Login, logout (drops the whole session), return_to, the password-hash fingerprint invalidation, the attempt limiter, and the websocket connect authorization behave as before, covered by tests
- [x] #3 A POST to /api/graphql with a missing or wrong x-csrf-token is rejected with 403 in every auth mode
- [x] #4 MANAVAULT_SECRET_KEY and MANAVAULT_PUBLIC_HOST are the documented names; SECRET_KEY_BASE and PHX_HOST still work and log a deprecation warning; docs/self-hosting.md and README are updated
- [x] #5 Stored encrypted secrets (API keys, cloud credentials) written by earlier releases still decrypt, covered by a test with a fixture value
- [x] #6 mise run precommit passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. manavault-core: enable axum-extra cookie-private; rewrite web/session.rs around a typed SessionData {csrf_token, owner_fingerprint} serialized as JSON into a PrivateCookieJar cookie (manavault_session), key derived from the secret with SHA-512; the request handle keeps the middleware write-back pattern (sign_in replaces the session with a fresh token, sign_out expires the cookie). CSRF tokens are 32 random bytes compared unmasked in constant time from the x-csrf-token header or the login form's _csrf_token field.
2. crypto.rs: remove KeyGenerator/MessageVerifier/ETF/SessionCodec/masking; keep encrypt_secret/decrypt_secret (enc.v1.), PBKDF2 password hashing, the password fingerprint, and the helpers other crates use.
3. config.rs: rename secret_key_base to secret_key read from MANAVAULT_SECRET_KEY (SECRET_KEY_BASE accepted with a warning) and public_url from MANAVAULT_PUBLIC_HOST (PHX_HOST accepted with a warning); split from_env into a lookup-based reader so tests cover the fallbacks and warnings.
4. Update AppState (cookie key instead of SessionCodec), auth_controller, subscriptions, browser/graphql CSRF middleware, test helpers, parity.sh, README/docs/self-hosting (new names, one-time sign-out on upgrade).
5. Tests: cookie round trip and tampering, old env names, CSRF 403 in both auth modes, legacy encrypted secret fixture; mise run precommit; portal check of login/logout.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: the cookie is renamed manavault_session (the old _manavault_key cookie is simply ignored, so the upgrade signs browsers out once). The private-cookie Key is derived with SHA-512 over 'manavault.session.v1:' || secret so any secret length works. CSRF tokens are unmasked (no BREACH masking; the token never appears in compressible response bodies other than the meta tag). Session middleware builds the PrivateCookieJar from the request so jar.remove emits the removal cookie on sign-out. Config::read(&dyn Lookup) returns (Config, warnings) so fallbacks are unit-tested; from_env logs them. rust/scripts/parity/parity.sh keeps SECRET_KEY_BASE because the Elixir release still needs it (harness retires in TASK-94.5).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sessions are a typed SessionData struct stored as JSON in an axum-extra PrivateCookieJar cookie (manavault_session); Plug.Crypto emulation (KeyGenerator, MessageVerifier, Erlang term format, CSRF masking) is deleted from crypto.rs while enc.v1. secret encryption and PBKDF2 password hashing are unchanged (legacy fixture test kept). CSRF tokens are 32 random bytes compared unmasked in constant time from x-csrf-token; wrong/missing tokens return 403 in both auth modes (tests). Config renames: MANAVAULT_SECRET_KEY and MANAVAULT_PUBLIC_HOST, with SECRET_KEY_BASE/PHX_HOST still accepted and logging a deprecation warning (tests + docs). Verified: mise run precommit exit 0; portal check of login, signed-in page, logout via POST /logout with wrong (403) and valid token (cookie removed, /collection redirects to login), and the PHX_HOST deprecation warning in the service log.
<!-- SECTION:FINAL_SUMMARY:END -->
