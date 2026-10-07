---
id: TASK-94.1
title: >-
  Serve GraphQL over HTTP and WebSocket with async-graphql-axum instead of
  Absinthe.Plug and Phoenix Channels
status: Done
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
updated_date: '2026-10-07 19:28'
labels: []
dependencies: []
parent_task_id: TASK-94
priority: medium
type: enhancement
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
manavault-core/src/web/params.rs reimplements Plug.Parsers (merged query string, urlencoded/multipart/JSON/application/graphql bodies, `_json` batches, variables as a JSON string, the 8 MB Plug limit) and graphql_http.rs executes requests the way Absinthe.Plug does; manavault-server/src/web/socket.rs speaks Phoenix Channels v2 with the `__absinthe__:control` topic so the frontend can use `phoenix` and `@absinthe/socket` for its single subscription (`serverLog`). The frontend only posts JSON through Apollo HttpLink. Replace both transports with async-graphql-axum: the `GraphQLRequest` extractor for `/api/graphql` and `/share/graphql`, and `GraphQLSubscription` (graphql-ws protocol) for subscriptions, with the frontend switched to Apollo GraphQLWsLink + graphql-ws. CSRF protection (header token on POST, unconditional in every auth mode, see TASK-67) and the websocket authorization (allowed Origin, owner session, CSRF token as a connection parameter) must keep working. The login form still posts urlencoded bodies; that is not GraphQL and keeps its own extractor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST /api/graphql and /share/graphql accept application/json GraphQL requests through async-graphql-axum and reject non-JSON bodies with 415, with the Plug.Parsers emulation and the GraphQL batch/form/raw-query transport removed
- [x] #2 The CSRF check on /api/graphql still rejects a POST without a valid x-csrf-token header in every auth mode (test covers auth disabled)
- [x] #3 The serverLog subscription works end to end over graphql-ws at /api/graphql/ws with the same authorization as before (allowed Origin, owner session, CSRF token in connection params), covered by a Rust websocket test
- [x] #4 The frontend uses graphql-ws via Apollo GraphQLWsLink; the phoenix, @types/phoenix, and @absinthe/socket packages and types/absinthe-socket.d.ts are removed
- [x] #5 The Settings server log panel streams live log lines in the browser (verified through the portal)
- [x] #6 mise run precommit passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace web/params.rs and web/graphql_http.rs with web/graphql.rs: async-graphql-axum GraphQLRequest with a JSON-error rejection, a require_json middleware (415 for non-JSON bodies), and a header-only x-csrf-token middleware; drop the method_not_allowed 404 fallback so axum answers 405 + Allow. Set DefaultBodyLimit to the previous 8 MB.
2. Rewrite /share/graphql to the GraphQLRequest extractor (single requests only, admit rate limiting kept, protection checks kept); delete public_graphql::validate.
3. Replace remaining Params users with Query/Form/Json extractors (login, SCG vendor form, scanner corrections); browser pipeline reads the CSRF token from the x-csrf-token header or a form body's _csrf_token.
4. Replace socket.rs (Phoenix Channels) with GET /api/graphql/ws served by GraphQLWebSocket: Origin + owner session at upgrade, csrfToken in connection_init, 60 s keepalive timeout.
5. Frontend: GraphQLWsLink + graphql-ws (keepAlive pings), Vite proxies /api with ws; remove phoenix, @types/phoenix, @absinthe/socket and the absinthe-socket typings.
6. Rewrite router and socket tests, update docs, run mise run precommit, verify Settings server logs through the portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: /share/graphql is POST-only JSON (GET queries dropped; the-gathering and the frontend POST JSON); the owner CSRF token is accepted only in the x-csrf-token header (form bodies keep _csrf_token in the browser pipeline); method mismatches answer axum's 405 + Allow instead of 404; the websocket closes idle sockets after 60 s and the client pings every 30 s; the-gathering needs no change. Validation: mise run precommit exit 0 (cargo fmt/clippy -D warnings, all workspace tests incl. web::tests::subscriptions; vitest 190 passed; build). Portal: Settings server-log panel shows Live and the counter rose 2 -> 8 when three GET /health requests were logged over graphql-ws.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the Plug.Parsers/Absinthe.Plug/Phoenix Channels emulation with async-graphql-axum (GraphQLRequest for /api/graphql and /share/graphql, require_json 415 + header CSRF middleware) and a graphql-ws endpoint at /api/graphql/ws (Origin + owner session at upgrade, csrfToken in connection_init); the frontend uses Apollo GraphQLWsLink + graphql-ws with phoenix/@absinthe/socket removed. Verified with mise run precommit and the Settings server-log panel streaming through the portal.
<!-- SECTION:FINAL_SUMMARY:END -->
