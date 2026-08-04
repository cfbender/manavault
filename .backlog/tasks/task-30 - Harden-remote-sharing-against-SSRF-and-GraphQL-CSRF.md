---
id: TASK-30
title: Harden remote sharing against SSRF and GraphQL CSRF
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-03 22:48'
updated_date: '2026-08-03 23:10'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Authenticated deckDiff and tradeMatches GraphQL operations can perform outbound remote-share requests. The authenticated endpoint currently accepts GET and only checks CSRF for mutations, while remote ManaVault origins permit arbitrary HTTP(S) network destinations. Close the GET/CSRF boundary and prevent SSRF without removing explicitly configured private/LAN friend sharing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Authenticated /api/graphql rejects GET and authenticated POST operations require a valid CSRF token before resolver execution
- [x] #2 Remote ManaVault sharing rejects loopback, private, link-local, multicast, unspecified, and other non-public IPv4/IPv6 destinations by default
- [x] #3 Operators can explicitly allow intended private/LAN hosts or networks, while dangerous destinations remain opt-in and documented
- [x] #4 DNS names are resolved, every result is policy-checked, and the selected validated address is pinned for the outbound request
- [x] #5 Fixed /share/graphql path and query, no credentials/cookies, disabled redirects, and response/time caps remain intact
- [x] #6 Focused tests cover GET, CSRF, public hosts, configured LAN, IPv4/IPv6, and DNS rebinding assumptions
- [x] #7 Self-hosting and feature documentation describe the remote-share destination policy and configuration
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tighten the authenticated GraphQL transport boundary: reject GET and require a valid session CSRF token for every authenticated POST payload. 2. Resolve remote ManaVault hosts once per request, classify all IPv4/IPv6 addresses, default-deny non-public ranges, and permit private destinations only through explicit host/CIDR configuration. 3. Pin the selected validated address in Req while preserving the original Host/TLS identity and existing request hardening; bypass real DNS only for injected Req test adapters. 4. Add focused boundary and destination-policy tests, update runtime configuration and docs, then run targeted and regression tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a POST-only authenticated GraphQL boundary with CSRF required for every session-authenticated POST, and reclassified deckDiff/tradeMatches as mutations. Remote ManaVault destinations now resolve once, reject any DNS answer outside public address policy unless exact-host/CIDR allowed, and connect to a pinned IPv4/IPv6 address while preserving Host and TLS hostname. Http accepts only the Req.Test plug from injected Req options; fixed URL/path, headers, redirects, retries, timeouts, and streaming size cap cannot be overridden. Added MANAVAULT_REMOTE_SHARE_ALLOWLIST docs/config.

Validation: 66 focused ExUnit tests passed; frontend typecheck passed; 182 Node and 15 Vitest tests passed; mix format --check-formatted and git diff --check passed. Full mix test ran 497 tests with 495 passing; the two failures are pre-existing/environmental PNG preview renderer 503 failures, outside these paths. Credo reports only the existing Scryfall BulkData reraise warning.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the authenticated GraphQL GET/CSRF gap and remote-share SSRF path. All authenticated GraphQL POSTs now require CSRF, network-effect operations are mutations, non-public IPv4/IPv6 is default-denied with explicit host/CIDR LAN opt-in, and validated DNS destinations are IP-pinned without weakening the fixed GraphQL request. Focused backend tests, frontend tests/typecheck, and formatting pass; the full backend suite has two unrelated PNG-renderer failures.
<!-- SECTION:FINAL_SUMMARY:END -->
