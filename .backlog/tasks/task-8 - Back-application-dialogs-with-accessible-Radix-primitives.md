---
id: TASK-8
title: Back application dialogs with accessible Radix primitives
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-15 15:55'
updated_date: '2026-07-15 16:25'
labels:
  - frontend
  - accessibility
  - react
dependencies: []
references:
  - assets/react/src/components/ui/dialog.tsx
  - assets/react/src/components/ui/confirm-dialog.tsx
  - package.json
priority: high
type: bug
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shared Dialog component manually implements portals, Escape handling, backdrop dismissal, and body scroll locking, but it does not move focus into the modal, trap focus, make background content non-interactive, or restore focus to the trigger. The project already includes @radix-ui/react-dialog. Preserve the local design-system API and visual behavior while replacing the incomplete modal mechanics with the canonical accessible primitive.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening a dialog moves focus to an appropriate element inside it, Tab and Shift+Tab remain contained while open, and closing restores focus to the element that opened it.
- [ ] #2 Background page content is not reachable by keyboard or assistive technology while a modal is open, and page scrolling remains correctly locked for one or more open dialogs.
- [ ] #3 Escape, backdrop dismissal, explicit close controls, ConfirmDialog cancellation/confirmation, and Capacitor native-back behavior continue to follow the current product semantics without duplicate close events.
- [ ] #4 Each dialog has an accessible name and, where supplied, description; close controls have meaningful names and destructive confirmations retain their visual and semantic treatment.
- [ ] #5 User-event accessibility tests cover initial focus, forward and reverse focus containment, Escape, backdrop behavior, confirmation, cancellation, nested/stacked behavior where supported, and focus restoration; frontend lint, typecheck, and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reimplement the local Dialog API on Radix Dialog primitives while preserving styling and Capacitor close semantics.
2. Preserve ConfirmDialog behavior, accessible naming, destructive treatment, stacked scroll locking, and single close events.
3. Add user-event coverage for focus entry/trap/restoration, dismissal, confirmation, cancellation, and stacked behavior.
4. Verify focused tests, frontend format/lint/typecheck, and production build.
<!-- SECTION:PLAN:END -->
