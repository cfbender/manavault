---
id: TASK-7
title: Eliminate per-request public deck preview rendering
status: To Do
assignee: []
created_date: '2026-07-15 15:55'
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
- [ ] #1 After a preview PNG has been generated for a deck revision, repeated requests return the same image bytes without another remote cover fetch, temporary SVG render, or rsvg-convert process.
- [ ] #2 The artifact key changes when any byte-affecting input changes, including deck preview data, selected cover image, rendering/assets version, or other renderer inputs; stale images are not served after those changes.
- [ ] #3 Concurrent requests for the same missing artifact coalesce into one render, and requests across different artifacts cannot exceed a documented application-wide render concurrency bound.
- [ ] #4 Remote cover retrieval has bounded connection/read timeouts and response-size/content-type checks, and an unavailable or invalid cover produces the existing safe preview fallback rather than an unbounded request or crash.
- [ ] #5 Render failures do not leave partial artifacts or temporary files, retain the established 404 versus 503 behavior, and can be retried by a later request.
- [ ] #6 Automated tests prove cache hits avoid rendering and network work, concurrent misses are coalesced/bounded, revision changes invalidate the artifact, and public response content type and cache headers remain correct.
<!-- AC:END -->
