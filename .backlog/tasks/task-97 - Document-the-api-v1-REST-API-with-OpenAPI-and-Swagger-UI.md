---
id: TASK-97
title: Document the /api/v1 REST API with OpenAPI and Swagger UI
status: Done
assignee: []
created_date: '2026-10-13 13:30'
updated_date: '2026-10-13 16:09'
labels: []
dependencies: []
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The personal API under `/api/v1` is documented by hand in `docs/api.md`, so the contract drifts from the Rust DTOs and handlers whenever they change, and there is no way to explore the API or send an authenticated request without writing a client. Generating the OpenAPI document from the Rust types keeps the contract in one place and gives the project a pattern for every future `/api/v1` route.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GET /api-docs/openapi.json returns a valid OpenAPI 3.1 JSON document that describes GET /api/v1/decks
- [x] #2 The document declares page and per_page with their defaults (1 and 50), the 100 cap, and the fallback to the default for invalid values
- [x] #3 Deck, pagination, and error schemas match the real JSON, including serde-renamed fields, nullable commanderColorIdentity and public_share_url, and second-precision timestamps
- [x] #4 The document includes fictional examples for a shared deck, a private deck, an empty list, and error responses
- [x] #5 GET /docs/rest serves a Swagger UI from locally embedded assets with a working Authorize button
- [x] #6 Swagger UI can send an authenticated request to GET /api/v1/decks and shows paginated, 401, and 429 responses
- [x] #7 Both documentation routes work in dev and prod, and the release build embeds the assets without network access
- [x] #8 docs/api.md and rust/README.md describe the endpoints, the Authorize flow, and how to document a new endpoint
- [x] #9 Tests cover the generated contract, the JSON routes, the Swagger UI assets, and the 401/429 examples
- [x] #10 cargo fmt, clippy -D warnings, and the workspace tests pass with --locked
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add utoipa and utoipa-swagger-ui (axum, vendored features) to the workspace and manavault-server manifests, keep the lockfile consistent for --locked builds, and confirm the vendored assets build without network access.
2. Give the /api/v1 DTOs ToSchema (preserving the serde names, nullability, and the second-precision timestamp format) and turn the error envelope and its code into reusable schema types used by the responses.
3. Annotate the decks handler with #[utoipa::path]: page/per_page semantics, the bearer requirement, and 200/401/429 (+ Retry-After)/500 responses with fictional examples.
4. Add web/api_docs.rs holding the ApiDoc OpenApi derive (info, tag, HTTP bearer scheme as a Modify hook) and the SwaggerUi router for /docs/rest and /api-docs/openapi.json, with authorization not persisted between sessions; mount it in web/mod.rs for every environment.
5. Add tests for the generated contract, the JSON and UI routes, and the 401/429 documents, reusing the existing API key and rate-limit fixtures.
6. Update docs/api.md and rust/README.md with the URLs, the Authorize flow, and how to document a new endpoint.
7. Run the focused tests, then mise run rust:check, and verify the release build embeds the assets with --locked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Steps 1-5 are implemented. Decisions: (a) the Swagger UI assets come from the vendored distribution (utoipa-swagger-ui-vendored ships res/v5.32.6.zip, extracted at build time by the crate itself), so the build downloads nothing and no asset is added to priv/static; (b) utoipa-axum was evaluated and rejected: the project keeps DTOs and #[utoipa::path] next to the handlers and mounts routers explicitly in web/mod.rs, so a second router abstraction would only shift where the two routes are registered; (c) the error envelope stopped being a hand-built json! literal and became ApiError/ApiErrorBody/ApiErrorCode, which the handler, the annotation examples, and the schemas all share.

Verified. Focused tests: cargo test -p manavault-server --lib api_docs and --test http api_docs (6 tests, all passing). Full gate: mise run rust:check -> exit 0, 25 suites, 844 tests passed, 0 failed (fmt --check and clippy -D warnings included). Browser: headless Chrome on the dev server rendered /docs/rest, opened Authorize with a real key (masked afterwards, absent from localStorage and from the page HTML), and Try it out -> Execute sent GET /api/v1/decks with Authorization: Bearer to the same origin and showed the real paginated body; the expanded operation rendered the 200 examples plus the 401, 429 (Retry-After), and 500 entries. Release: cargo build --release --locked with CARGO_NET_OFFLINE=true succeeded and the binary ran with MANAVAULT_ENV=prod, serving /api-docs/openapi.json (3.1.0, 7340 B), /docs/rest (303 -> 200), the embedded bundle (1526593 B, no asset in priv/static; the bytes come from utoipa-swagger-ui-vendored v5.32.6.zip), a 404 for an unknown asset, and 401 without a key. The temporary API key used for the browser check was revoked and both servers stopped.

Follow-up from review (validator badge): confirmed the finding, and it is worse than the localhost development path suggests. Swagger UI's default validatorUrl points at validator.swagger.io and OnlineValidatorBadge builds its URL from the absolute document URL, so on any non-localhost host the page requests https://validator.swagger.io/validator?url=<this instance's host + /api-docs/openapi.json>, and that service then fetches the document. Swagger UI exempts localhost/127.0.0.1 (requiresValidationURL), which is why the earlier browser checks never showed it. The security auditor's downgrade does not hold: utoipa's build script only rewrites the url/deep-linking/layout lines of swagger-initializer.js and its Config re-supplies layout: "StandaloneLayout", so the badge's layout is not removed and the badge does render. Recorded network requests with CDP on http://manavault.test:4000 (host-resolver-mapped; the validator host was mapped to 127.0.0.1 so nothing left the machine): before the fix, 10 requests including the validator.swagger.io one and the badge span in the DOM; after adding .validator_url("none") to the Swagger UI config, 8 requests, no off-origin request other than a data: URI, and no badge. The initializer test now asserts "validatorUrl": "none" and the absence of validator.swagger.io, and docs/api.md says why spec validation is off.

Release/prod confirmation of the validator fix: cargo build --release --locked with CARGO_NET_OFFLINE=true finished in 1m17s; the binary under MANAVAULT_ENV=prod serves /api-docs/openapi.json (200), /docs/rest (303 -> 200), and an initializer with "validatorUrl": "none"; the CDP request log for http://manavault.test:4100/docs/rest/#/Decks/listDecks shows 9 requests, none off-origin but a data: URI, and no badge in the DOM. mise run rust:check after the fix: exit 0, 25 suites, 844 tests, 0 failures. Both servers and the debug Chrome are stopped.

Review follow-up: 8 of the 9 items fixed; the compression item was declined deliberately (no gzip feature, no compression layer) and stays a known trade-off — the UI's ~4.3 MB of embedded assets and the uncompressed 1.5 MB bundle. (1) The served document is now validated against the official OpenAPI 3.1 meta-schemas, vendored under crates/manavault-server/tests/fixtures (3.1.0 / 2022-10-07, which the document declares, and the current 3.1 / 2025-09-15), through the jsonschema dev-dependency; the test also asserts the validator rejects a document missing 'info', so it cannot pass vacuously. The document satisfied both revisions unchanged. (2) A database failure during key lookup now answers 500 internal_error instead of 401 — the 401 description stays accurate and the 500 description covers both the lookup and the deck read; docs/api.md says why. Covered in tests/http/share/api_v1.rs (valid key, closed pool, full router) and in the in-module test that routes to decks without the auth layer, since a closed pool always fails auth first. (3) page/per_page became an utoipa::IntoParams type whose schema carries default/minimum/maximum, replacing the prose defaults; it deserializes from the raw query map so the extractor accepts exactly what it accepted before — pinned by tests for overflow, junk, zero/negative, and repeated parameters (last wins). (4) Every documented 200 example and the real response are checked against the schemas, including nullability, and the real-response test now uses a full deck (commander, 100 cards, share link) instead of the weakest case. (5) Test hygiene: one shared decks() helper in tests/http/share/mod.rs, the docs error test reuses the budget fixture and asserts only example equality, the hard-coded Retry-After: 60 and the brittle 'contains(http)' check are gone, attacker.example is asserted absent from the body, the 500 message is a shared const used by both the handler and the annotation, and a Prod-mode test guards the docs routes (Test and Prod are identical in the web layer today, so it is a regression guard, not a Prod-only path). Verification: mise run rust:check exit 0 with 25 suites / 851 tests / 0 failures (was 844); cargo build --release --locked offline succeeded and cargo tree confirms jsonschema is absent from the non-dev graph; the dev server renders the parameters with 'Default value : 1' and ': 50' taken from the schema.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The /api/v1 personal API now describes itself: utoipa annotations next to the handlers and ToSchema derives on the DTOs (serde names, nullability, and the second-precision timestamp preserved) generate the OpenAPI 3.1 document served at GET /api-docs/openapi.json, and utoipa-swagger-ui renders it at GET /docs/rest in every environment. Swagger UI's assets are embedded in the binary through the vendored feature, so nothing is downloaded at build time and no file is added to priv/static; an operator authorizes with a personal API key held only in the page and can execute the documented operation. The error envelope became reusable ApiError/ApiErrorBody/ApiErrorCode types shared by the handler, the schemas, and the examples, and docs/api.md and rust/README.md explain the URLs, the Authorize flow, and the steps to document another endpoint. Verified with three contract tests beside ApiDoc plus three HTTP tests through the full router (real 401/429 bodies equal the documented examples; a real response uses exactly the documented fields), headless-Chrome runs that authorized, executed, and rendered the documented responses, and an offline --locked release build of the binary running under MANAVAULT_ENV=prod that served the document, the UI, and the embedded assets.
<!-- SECTION:FINAL_SUMMARY:END -->
