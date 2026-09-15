---
id: TASK-31
title: Add Liquid Glass theme style with settings selector
status: Done
assignee:
  - '@cfbender'
created_date: '2026-08-04 15:53'
updated_date: '2026-08-04 16:04'
labels: []
dependencies: []
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a second visual theme that emulates modern macOS Liquid Glass (translucent, blurred, highly rounded surfaces over an ambient backdrop). Users pick between the existing Classic look and Liquid Glass via a selector on the Settings page. The style is orthogonal to the existing System/Light/Dark color-scheme toggle so glass works in both light and dark.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings page has an Appearance section with a selector offering Classic and Liquid Glass
- [x] #2 Selecting Liquid Glass applies translucent blurred surfaces, rounder radii, and an ambient backdrop across the app shell, cards, dialogs, dropdowns, and form controls
- [x] #3 Choice persists across reloads and tabs and composes with the existing system/light/dark theme toggle
- [x] #4 Reduced-transparency/motion preferences and browsers without backdrop-filter still get readable UI
- [x] #5 Typecheck and react tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend ThemeProvider (assets/react/src/lib/theme.tsx) with an orthogonal themeStyle dimension: classic | glass, persisted to localStorage key manavault:theme-style, applied as data-theme-style on <html>, synced across tabs like theme.
2. Add glass CSS in assets/css/app.css scoped to html[data-theme-style=glass]: rounder daisyUI radius tokens, ambient fixed multi-hue backdrop derived from theme tokens, translucent blurred surfaces (backdrop-filter blur+saturate) for header, cards, dropdown/menu, modal boxes, inputs/selects/buttons, with inset highlight rims; fallbacks via @supports and prefers-reduced-transparency.
3. Add AppearanceSection to Settings (assets/react/src/pages/settings/) using PageSection + card pattern with two selectable style options (Classic, Liquid Glass) wired to useTheme().
4. Verify: aube typecheck/tests, visual check in browser in light+dark.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Theme style is orthogonal to light/dark: data-theme-style on <html>, localStorage key manavault:theme-style (absent = classic), bootstrapped pre-React in app_controller.ex to avoid style flash and synced across tabs via storage events. Glass CSS targets .card/.dropdown-content/Radix dialog panels/inputs plus app-shell header; card tiles do not use .card so grid perf is unaffected; fullscreen-printing-dialog keeps its bespoke background. Verified via headless Chrome CDP screenshots: classic light unchanged, glass light+dark on /settings and /decks, prefers-reduced-transparency emulation renders opaque panels.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a Liquid Glass interface style: ThemeProvider gained themeStyle (classic|glass) persisted and tab-synced; app.css defines glass tokens, palette-derived ambient backdrop, and translucent blurred panels with rounder radii plus @supports and prefers-reduced-transparency fallbacks; Settings gained an Appearance section with Classic/Liquid Glass selector; Phoenix shell bootstraps data-theme-style before hydration. Verified with typecheck, lint, react tests (15 passed), mix compile --warnings-as-errors, and headless-Chrome screenshots in light/dark/reduced-transparency.
<!-- SECTION:FINAL_SUMMARY:END -->
