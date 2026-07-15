---
id: TASK-5
title: Enforce CSRF protection on authenticated GraphQL mutations
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-15 15:53'
updated_date: '2026-07-15 17:33'
labels:
  - security
  - backend
  - frontend
  - graphql
dependencies: []
references:
  - lib/manavault_web/router.ex
  - lib/manavault_web/endpoint.ex
  - lib/manavault_web/plugs/authentication.ex
  - assets/react/src/lib/apollo.ts
priority: high
type: bug
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The authenticated /api/graphql pipeline accepts session-authenticated mutation requests without validating the CSRF token that the browser client sends. A request with a valid session and no x-csrf-token currently reaches the mutation schema successfully. Enforce request forgery protection at the authenticated API boundary while preserving the intentionally public share schema and the supported browser and Capacitor/native clients.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A session-authenticated GraphQL mutation with a missing CSRF token is rejected before resolver execution with the API's documented unauthorized/forbidden response shape.
- [ ] #2 A session-authenticated GraphQL mutation with an invalid or stale CSRF token is rejected, while the same mutation with the current valid token succeeds.
- [ ] #3 CSRF enforcement cannot be bypassed by sending JSON, URL-encoded, or multipart request bodies through the configured parsers.
- [ ] #4 The unauthenticated /share/graphql schema remains accessible without a CSRF token and does not gain access to private mutations.
- [ ] #5 The browser Apollo client continues reading the current per-page token, including after session/token rotation, and authenticated queries and mutations remain functional.
- [ ] #6 The Capacitor/native shell obtains or preserves a valid token and can complete authenticated GraphQL mutations; automated coverage exercises valid, missing, invalid, rotated, browser, native-shell, and public-share flows.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define authenticated API CSRF enforcement at the router/plug boundary for all configured body parsers without affecting public share GraphQL.
2. Preserve unauthorized/forbidden response shape and authenticated query behavior.
3. Keep browser token lookup current across rotation and provide the Capacitor/native shell a valid token acquisition/preservation path.
4. Add valid, missing, invalid, rotated, browser, native, multipart/form, and public-share coverage.
5. Verify focused controller/GraphQL/frontend tests plus compile, lint, typecheck, and build.
<!-- SECTION:PLAN:END -->
