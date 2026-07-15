---
id: TASK-7
title: Eliminate per-request public deck preview rendering
status: Done
assignee:
  - '@codex'
created_date: '2026-07-15 15:55'
updated_date: '2026-07-15 18:51'
labels:
  - backend
  - availability
  - public-share
  - performance
dependencies: []
references:
  - lib/manavault_web/controllers/app_controller.ex
  - lib/manavault_web/deck_share_preview.ex
  - lib/manavault_web/router.ex
priority: high
type: bug
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The unauthenticated deck preview PNG route can synchronously fetch a remote cover image, write a temporary SVG, and start rsvg-convert for every request. Client Cache-Control headers do not protect the application from repeated direct requests or concurrent cache misses. Serve a reusable server-side preview artifact keyed by the inputs that determine image bytes, and ensure any unavoidable rendering work is single-flight and concurrency-bounded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a preview PNG has been generated for a deck revision, repeated requests return the same image bytes without another remote cover fetch, temporary SVG render, or rsvg-convert process.
- [x] #2 The artifact key changes when any byte-affecting input changes, including deck preview data, selected cover image, rendering/assets version, or other renderer inputs; stale images are not served after those changes.
- [x] #3 Concurrent requests for the same missing artifact coalesce into one render, and requests across different artifacts cannot exceed a documented application-wide render concurrency bound.
- [x] #4 Remote cover retrieval has bounded connection/read timeouts and response-size/content-type checks, and an unavailable or invalid cover produces the existing safe preview fallback rather than an unbounded request or crash.
- [x] #5 Render failures do not leave partial artifacts or temporary files, retain the established 404 versus 503 behavior, and can be retried by a later request.
- [x] #6 Automated tests prove cache hits avoid rendering and network work, concurrent misses are coalesced/bounded, revision changes invalidate the artifact, and public response content type and cache headers remain correct.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a deterministic artifact fingerprint from every byte-affecting deck, cover, renderer, and asset input and a bounded persistent artifact location.
2. Add a supervised single-flight preview artifact service with an application-wide render concurrency limit and atomic publication/cleanup.
3. Bound and validate remote cover downloads while retaining the safe fallback and established 404/503 behavior.
4. Route public PNG requests through the artifact service without changing content type or cache headers.
5. Add deterministic cache-hit, concurrent coalescing/bounding, invalidation, network validation, failure cleanup/retry, and response-contract coverage; verify full backend gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added a supervised content-addressed PNG artifact service with deterministic renderer/deck/cover/assets fingerprinting, same-key single flight, a two-render application-wide concurrency limit, atomic publication/cleanup/retry, and a configurable 500-artifact retention cap. Remote cover fetching now enforces connection/receive timeouts, byte limits, MIME/host validation, and safe fallback. Controller 404/503, image/png, and cache-header contracts remain. Verification: focused artifact/public-route suite passed 12 tests; full backend passed 317 tests; warnings-fatal compilation, strict Credo, and changed-file formatting passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Public deck PNG previews are now reusable bounded server artifacts rather than per-request remote fetch/render work. Concurrent misses coalesce under a global render limit; byte-affecting revisions invalidate by fingerprint; invalid covers and render failures retain safe fallback, retry, cleanup, and response semantics.
<!-- SECTION:FINAL_SUMMARY:END -->
