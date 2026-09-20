---
id: TASK-67
title: >-
  Enforce GraphQL CSRF checks in every auth mode and make owner sessions
  revocable
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A security review found two auth gaps. (1) ManavaultWeb.Plugs.GraphQLCSRFProtection only validates the token when the session is marked authenticated, so with MANAVAULT_AUTH_DISABLED=true the check never runs; Absinthe.Plug accepts application/x-www-form-urlencoded bodies with a query field, and a throwaway test proved a cross-origin form POST to /api/graphql with no token returned 200 and created a deck. (2) The cookie session stores only manavault_authenticated: true for up to 180 days, so rotating MANAVAULT_ADMIN_PASSWORD_HASH or logging out on one device never invalidates a captured cookie; only rotating SECRET_KEY_BASE does. The existing test/manavault_web/graphql_csrf_protection_test.exs forces auth_disabled false, which is why (1) was not caught. Do not modify lib/manavault_web/controllers/auth_controller.ex; another task is moving its HTML into templates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A POST to /api/graphql without a valid CSRF token is rejected with 403 when auth is disabled, covered by an ExUnit test that sends a form-encoded body
- [ ] #2 The SPA continues to work with auth disabled because it always sends the meta csrf token
- [ ] #3 Signing in stores a fingerprint derived from the current admin password hash in the session, and changing the hash makes existing sessions unauthenticated for both HTTP requests and the /socket websocket connect, covered by tests
- [ ] #4 Logout drops the whole session rather than deleting one key
- [ ] #5 mix test passes
<!-- AC:END -->
