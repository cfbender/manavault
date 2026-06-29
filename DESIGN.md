---
name: ManaVault
description: Self-hosted Magic collection and deck workspace for exact physical inventory.
colors:
  claret: "oklch(50.09% 0.1967 13.12)"
  claret-dark: "oklch(61.28% 0.1407 4.1)"
  claret-content: "oklch(97% 0.01 15)"
  grove: "oklch(39.57% 0.1244 138.86)"
  brass: "oklch(53.27% 0.1137 72.57)"
  light-vault: "oklch(93.58% 0.0173 35.34)"
  light-panel: "oklch(90.1% 0.0196 33.37)"
  light-line: "oklch(86.7% 0.0155 37.87)"
  light-ink: "oklch(25.08% 0.0195 45.68)"
  dark-vault: "oklch(16.36% 0.0318 349.63)"
  dark-panel: "oklch(21.51% 0.0182 6.61)"
  dark-line: "oklch(25.49% 0.0193 1.93)"
  dark-ink: "oklch(87.16% 0.0197 72.55)"
  info: "oklch(35.08% 0.1518 263.92)"
  success: "oklch(39.57% 0.1244 138.86)"
  warning: "oklch(53.27% 0.1137 72.57)"
  error: "oklch(55.75% 0.2133 30.05)"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "normal"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "normal"
  metric:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.25
rounded:
  field: "4px"
  box: "8px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  page-sm: "32px"
  page-lg: "64px"
components:
  button-primary:
    backgroundColor: "{colors.claret}"
    textColor: "{colors.claret-content}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "40px"
  card:
    backgroundColor: "{colors.light-vault}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.box}"
    padding: "24px"
  input:
    backgroundColor: "{colors.light-vault}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.field}"
    padding: "0 12px"
    height: "40px"
  nav-active:
    backgroundColor: "{colors.claret}"
    textColor: "{colors.claret-content}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
---

# Design System: ManaVault

## 1. Overview

**Creative North Star: "The Collector's Vault"**

ManaVault's visual system treats the app as a secure, tactile workspace for real cardboard. It uses a claret vault cube, muted storage-surface layers, compact system type, and small-radius controls to make inventory feel physical without turning the interface into game-store decoration.

The product should feel collector-grade and confident: dense enough for expert collection work, calm enough for backup and allocation decisions, and touch-friendly enough for the PWA/native shell. It explicitly rejects generic hosted-SaaS dashboards, growth-product landing-page tropes, loud TCG marketplace clutter, over-saturated novelty treatment, and thin cloud-app minimalism.

**Key Characteristics:**

- Claret is the ownership/action color; it is strong, rare, and intentional.
- Surfaces are layered like storage trays: base, panel, line, content.
- Type is one disciplined system sans, with mono reserved for values and inventory numbers.
- Components are tactile but disciplined: 4px fields, 8px cards, clear borders, modest lift.
- Motion is product-state feedback, not page choreography.

## 2. Colors

The palette is a claret-centered vault system: warm neutral storage layers, a confident red-violet primary, and green/brass semantic accents for collection state.

### Primary

- **Claret Vault** (`claret`): Primary actions, active navigation, selected state, and the logo's dominant cube face. Use it sparingly so action remains obvious.
- **Dark Claret** (`claret-dark`): Dark-theme primary action color and glow source. It should never become decorative wash.
- **Claret Content** (`claret-content`): Text and icon color on claret surfaces.

### Secondary

- **Binder Grove** (`grove`): Success, storage/location state, and secondary action moments connected to organization.
- **Aged Brass** (`brass`): Warning, value emphasis, foil-adjacent moments, and the warm accent in card/collection affordances.

### Tertiary

- **Catalog Blue** (`info`): Informational states only. It should not compete with claret for primary action.
- **Error Red** (`error`): Destructive and failed states. Use with clear labels; never rely on color alone.

### Neutral

- **Light Vault** (`light-vault`): Light theme base surface.
- **Light Tray** (`light-panel`): Light theme raised/page-header panels.
- **Light Divider** (`light-line`): Light theme borders, separators, and subdued containers.
- **Light Ink** (`light-ink`): Primary text in light theme.
- **Dark Vault** (`dark-vault`): Dark theme base surface.
- **Dark Tray** (`dark-panel`): Dark theme raised panel layer.
- **Dark Divider** (`dark-line`): Dark theme borders and dividers.
- **Dark Ink** (`dark-ink`): Primary text in dark theme.

### Named Rules

**The Claret Rarity Rule.** Claret marks action, selection, and ownership; if it appears on inactive decoration, the screen loses trust.

**The No Game-Store Chaos Rule.** Brass, grove, foil shimmer, and card art must support state or card identity. They are forbidden as generic excitement.

## 3. Typography

**Display Font:** System sans (`ui-sans-serif, system-ui, sans-serif`)  
**Body Font:** System sans (`ui-sans-serif, system-ui, sans-serif`)  
**Label/Mono Font:** System mono (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`) for values and inventory metrics.

**Character:** The type system is blunt, legible, and tool-like. Weight creates hierarchy; font variety does not.

### Hierarchy

- **Display** (900, `3.75rem`, line-height 1): Home hero only. Keep letter spacing normal; no cramped display tracking.
- **Headline** (900, `3rem`, line-height 1): Page-level titles and major empty-state headings.
- **Title** (900, `1.5rem`, line-height 1.2): Section headings, dialog titles, and card titles.
- **Body** (400, `1rem`, line-height 1.5): App prose, descriptions, helper text, and form copy. Cap long explanatory prose at 65-75ch.
- **Label** (700, `0.875rem`, normal tracking): Buttons, nav, field labels, and compact UI text.
- **Metric** (900, `1.5rem`, mono): Collection value and count summaries where exactness matters.

### Named Rules

**The One-Sans Rule.** Do not introduce display fonts for UI labels, buttons, tables, or forms. Product trust comes from consistent type, not type novelty.

## 4. Elevation

ManaVault is tactile and lightly lifted. Resting depth comes from tonal layers and 1.5px borders; shadows are small, structural, and tied to affordance. Cards and dialogs can lift; dense table/list rows should stay flatter.

### Shadow Vocabulary

- **Surface Rest** (`0 1px 3px rgb(0 0 0 / 0.10), 0 1px 2px -1px rgb(0 0 0 / 0.10)`): Default card and summary surface lift.
- **Action Depth** (`inset 0 0.5px 0 0.5px rgb(255 255 255 / 0.06), 0 3px 2px -2px color-mix(in oklch, var(--color-primary), transparent 70%), 0 4px 3px -2px color-mix(in oklch, var(--color-primary), transparent 70%)`): Primary buttons and active claret controls.
- **Dialog Lift** (`shadow-2xl` equivalent): Modal surfaces only; paired with the black 65% overlay and safe-area-aware full-height mobile behavior.
- **Foil Moment** (`0 0 0 1px color-mix(in oklch, var(--color-primary) 44%, transparent), 0 12px 30px rgb(0 0 0 / 0.28), 0 0 26px color-mix(in oklch, var(--color-primary) 28%, transparent)`): Reserved for foil card imagery, never generic cards.

### Named Rules

**The Lift Means Affordance Rule.** If a shadow is not explaining hover, modal focus, primary action, or foil material, remove it and use a tonal layer instead.

## 5. Components

Components should feel tactile but disciplined: small-radius controls, visible borders, clear focus rings, and restrained claret state.

### Buttons

- **Shape:** Small rectangular controls (`4px` radius) or square icon buttons; avoid over-rounded cards and fields.
- **Primary:** Claret background with claret-content text, bold 14px label, and compact horizontal padding (`0 16px`, 40px default height).
- **Hover / Focus:** Hover may deepen the claret or shift one tonal layer. Focus always uses a visible claret ring (`2px`, translucent). Disabled buttons lower opacity and remove pointer events.
- **Secondary / Ghost:** Secondary uses the grove token for committed non-primary actions. Ghost buttons stay transparent until hover and are for navigation, icon actions, and low-risk controls.

### Chips

- **Style:** Small outlined badges with medium weight. Primary, success, warning, and error tones borrow semantic tokens but stay outlined unless they represent active selection.
- **State:** Active chips must be readable without color alone; include label, count, icon, or selected placement.

### Cards / Containers

- **Corner Style:** Gently tactile (`8px` radius), never 24px+ product blobs.
- **Background:** Use base-vault for content cards and tray/panel for headers or grouped controls.
- **Shadow Strategy:** Resting cards use Surface Rest at most. High-density rows and filter panels can be border-only.
- **Border:** Use the theme divider (`--color-base-300`) with the project border width (`1.5px`).
- **Internal Padding:** Standard cards use 24px; utility cards can use 16px; dense controls can use 12px.

### Inputs / Fields

- **Style:** Full-width base-vault field, 4px radius, 1.5px border, 40px height, 12px horizontal padding.
- **Focus:** Border shifts to claret and adds a 2px translucent claret ring.
- **Error / Disabled:** Error state uses the error token plus explanatory copy. Disabled state must keep text legible, not fade below contrast.

### Navigation

- **Style:** Top navigation is bold, compact, and pill-active. Active links use claret with claret-content text; inactive links are ink-colored and only shift toward claret on hover.
- **Mobile:** The dropdown is a bordered base-vault panel with a strong z-layer. Touch targets should stay at least 44px.

### Dialogs

- **Style:** Dialogs render in a portal above a black 65% overlay with safe-area padding. Mobile dialogs are full-height with square top-level edges; desktop dialogs return to 8px corners.
- **Behavior:** Close affordances must be explicit. Dialogs are for interruptive confirmation or deep editing, not as the first answer for every workflow.

### Signature Component: Card Tile Foil

Foil treatment belongs only to Magic card imagery. The animated shimmer pauses by default, runs on hover-capable pointer hover, and disables under reduced motion.

## 6. Do's and Don'ts

### Do:

- **Do** keep claret rare and meaningful: primary action, active route, selected state, ownership emphasis.
- **Do** preserve the tactile vault language with 4px fields, 8px cards, 1.5px borders, and small structural shadows.
- **Do** use mono type for exact values, prices, quantities, and counts where auditability matters.
- **Do** make mobile/PWA flows first-class: safe-area padding, 44px touch targets, full-height mobile dialogs, and persistent navigation clarity.
- **Do** meet WCAG AA contrast, visible keyboard focus, reduced-motion alternatives, and non-color-only status communication.

### Don't:

- **Don't** make ManaVault look like generic hosted-SaaS dashboards or growth-product landing-page tropes.
- **Don't** create loud TCG marketplace clutter, over-saturated novelty treatment, or game-store chaos.
- **Don't** turn claret, brass, foil gradients, or card art into generic decoration.
- **Don't** use side-stripe borders, gradient text, decorative glassmorphism, hero-metric templates, or identical icon-card grids as default scaffolding.
- **Don't** over-round product surfaces; cards stop at 8px unless a control is deliberately pill-shaped.
