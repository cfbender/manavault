---
id: TASK-69
title: >-
  Render the login page and app shell from templates, use the configured host
  for absolute URLs, and add a CSP
status: Done
assignee:
  - '@cody'
created_date: '2026-09-20 16:34'
updated_date: '2026-09-20 16:57'
labels: []
dependencies: []
modified_files:
  - lib/manavault_web.ex
  - lib/manavault_web/router.ex
  - lib/manavault_web/controllers/auth_controller.ex
  - lib/manavault_web/controllers/auth_return_path.ex
  - lib/manavault_web/controllers/auth_html.ex
  - lib/manavault_web/controllers/auth_html/login.html.eex
  - lib/manavault_web/controllers/app_controller.ex
  - lib/manavault_web/controllers/app_html.ex
  - lib/manavault_web/controllers/app_html/app.html.eex
  - lib/manavault_web/controllers/api/v1/deck_controller.ex
  - priv/static/assets/css/login.css
  - priv/static/assets/js/theme.js
  - priv/static/assets/js/pwa-install.js
  - priv/static/assets/js/vite-bootstrap.js
  - vite.config.ts
  - test/manavault_web/controllers/app_controller_test.exs
  - test/manavault_web/controllers/api/v1/deck_controller_test.exs
  - test/manavault_web/controllers/static_asset_test.exs
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
- [x] #1 Login page and app shell render via HEEx templates or components with no HTML string literals left in controllers, and controllers are under 150 lines
- [x] #2 Theme, PWA install capture, and Vite bootstrap scripts are served as static files or nonce-tagged scripts
- [x] #3 Responses carry a Content-Security-Policy that the SPA, service worker, Scryfall images, and Vite dev server all work under, verified in a browser
- [x] #4 Share and og:url absolute URLs come from the endpoint URL config, covered by a controller test with a spoofed Host header
- [x] #5 Existing controller and share tests pass and the login page looks the same, verified by screenshot
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture the current login page and characterize existing controller/template, asset, URL, and CSP behavior.
2. Move login and SPA shell rendering into AuthHTML/AppHTML HEEx templates; extract login CSS and app bootstrap/theme/PWA JavaScript to static assets while preserving Vite proxy behavior and early theme application.
3. Add a narrowly scoped browser CSP and build absolute preview/share URLs from endpoint configuration.
4. Add focused controller coverage for templates, CSP/static scripts, Vite modes, and spoofed Host headers.
5. Run formatter, targeted tests, full mix test, and browser checks across login/home/collection/deck/settings; capture and compare the login result.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rendered the full documents with Phoenix.Template HTML-safe .html.eex templates because this application does not depend on Phoenix LiveView/Phoenix.Component, so HEEx is unavailable without adding an unrelated dependency. Theme and PWA scripts remain blocking and early; the development Vite bootstrap is a static module that sequences React Refresh, Vite client, and the React entrypoint. CSP uses unsafe-eval only for Vite development and unsafe-inline styles for Vite/style-attribute compatibility; scripts themselves remain same-origin or explicit Vite origins.

Validation: focused controller suite 31/31; full ExUnit suite 676/676; Vite+ format/lint passed. Browser exercised login, home, collection, settings, deck list, and a real deck detail route with Vite HMR connected and no console CSP violations or page errors. CSRF, theme, PWA capture, and asset-version values were present. Login before/after PNG comparison was pixel-identical (RMSE 0).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved login and SPA shell markup into HTML-safe Phoenix templates, extracted login CSS and all inline bootstraps to static assets, added a browser CSP compatible with Vite/Phoenix websockets, service workers, card images, blobs/data, and browser-side APIs, and switched social/share absolute URLs to Endpoint.url/0. Verified spoofed-host coverage, all 676 ExUnit tests, Vite+ checks, browser routes without CSP violations, and pixel-identical login captures.
<!-- SECTION:FINAL_SUMMARY:END -->
