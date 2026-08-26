---
id: TASK-59
title: Add live server logs to settings
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-26 00:20'
updated_date: '2026-08-26 00:34'
labels: []
dependencies: []
type: feature
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let the self-hosted owner inspect new server log events from the Settings page without attaching to the host process.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The bottom of Settings shows each new server log event with timestamp, level, and message
- [x] #2 Log events arrive live through an authenticated GraphQL subscription
- [x] #3 The client keeps a bounded log history and supports clearing the visible buffer
- [x] #4 Backend and frontend tests cover event publication and rendering
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an authenticated Absinthe subscription socket and logger event bridge that publishes sanitized events.
2. Split Apollo traffic between HTTP and the subscription socket.
3. Add a bounded, accessible live-log section at the bottom of Settings.
4. Run backend, frontend, type, format, and visual checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented an OTP Logger handler that asynchronously publishes ANSI-free log events through an authenticated Absinthe/Phoenix socket. Apollo now routes subscriptions over the Phoenix socket while preserving HTTP and CSRF behavior for queries and mutations. Settings renders a responsive 200-event browser buffer with live/error/empty states and Clear.

Validation: mix test (638 passed); test:react (196 Node tests and 90 Vitest tests passed); production Vite build passed; typecheck, lint, Credo, compile warnings-as-errors, targeted formatting, detector, desktop/mobile browser checks, and Impeccable verdict all passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a live, authenticated GraphQL server-log stream at the bottom of Settings with bounded client history, clear controls, responsive log rows, ANSI cleanup, and end-to-end backend/frontend coverage.
<!-- SECTION:FINAL_SUMMARY:END -->
