---
id: TASK-69
title: >-
  Render the login page and app shell from templates, use the configured host
  for absolute URLs, and add a CSP
status: To Do
assignee: []
created_date: '2026-09-20 16:34'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ManavaultWeb.AuthController (442 lines) and ManavaultWeb.AppController embed roughly 450 lines of HTML, CSS, and JavaScript in string literals, which violates the project Elixir standard (thin entrypoints, rendering in templates) and blocks a Content-Security-Policy because the theme and PWA bootstrap scripts are inline. AppController.absolute_url/2 and Api.V1.DeckController.absolute_share_url/2 derive og:url and share URLs from the request Host header instead of the configured PHX_HOST. Coordinate: do not modify lib/manavault_web/plugs/*, lib/manavault_web/channels/user_socket.ex, or lib/manavault/auth.ex; another task owns the session and CSRF changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Login page and app shell render via HEEx templates or components with no HTML string literals left in controllers, and controllers are under 150 lines
- [ ] #2 Theme, PWA install capture, and Vite bootstrap scripts are served as static files or nonce-tagged scripts
- [ ] #3 Responses carry a Content-Security-Policy that the SPA, service worker, Scryfall images, and Vite dev server all work under, verified in a browser
- [ ] #4 Share and og:url absolute URLs come from the endpoint URL config, covered by a controller test with a spoofed Host header
- [ ] #5 Existing controller and share tests pass and the login page looks the same, verified by screenshot
<!-- AC:END -->
