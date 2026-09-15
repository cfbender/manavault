# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ManaVault serves Magic: The Gathering players who self-host their collection and deck workspace. They care about exact physical printings, storage locations, deck allocations, mobile access, and repeatable workflows without giving collection data to a hosted service.

## Product Purpose

ManaVault is the local source of truth for owned cards, where they live, which decks reserve them, and what still needs to be bought or pulled from storage. Success means users can trust the app to connect physical inventory, deck demand, missing-card actions, and backups without ambiguity.

## Positioning

Unlike a hosted collection tracker, ManaVault is a self-hosted workspace that keeps physical inventory, storage locations, deck allocations, missing-card actions, and backups connected under the user's control.

## Operating Context

Users move between browsing exact Magic printings, cataloging cards into physical storage locations, allocating owned copies to decks, and acting on cards that still need to be bought or pulled. The same responsive web interface runs in browsers, as a PWA, and inside the Capacitor mobile shell.

## Capabilities and Constraints

- Tracks exact printings, quantities, finishes, storage locations, and deck allocations.
- Supports dense collection and deck workflows, including filtering and bulk actions.
- Connects deck demand to owned inventory and missing-card actions.
- Supports backup and restore workflows for self-hosted data.
- Uses one responsive web interface across desktop, touch, PWA, and native-shell contexts.

## Brand Commitments

Collector, tactile, confident. The interface should feel like a serious vault for real cardboard: concrete, organized, and respectful of the hobby without becoming novelty merchandise.

Avoid generic hosted-SaaS dashboards, growth-product landing-page tropes, and loud TCG marketplace clutter. Do not let visual style drift into game-store chaos, over-saturated novelty treatment, or thin cloud-app minimalism that makes physical inventory feel abstract.

## Evidence on Hand

- Product and setup documentation in `README.md`.
- The implemented React interface and component system in `assets/react`.
- The established visual system in `DESIGN.md` and `.impeccable/design.json`.
- ManaVault logo assets in `priv/static/images`.
- No testimonials, customer claims, or external benchmarks are established; future work must not fabricate them.

## Product Principles

- Make ownership concrete: exact printings, quantities, locations, allocation status, and deck gaps should stay visible and trustworthy.
- Keep expert workflows fast: dense views, bulk actions, filters, and mobile paths should reduce repeated work rather than decorate it.
- Earn tactility through structure: use card imagery, storage concepts, state, and hierarchy instead of ornamental fantasy styling.
- Preserve calm confidence: highlight primary actions and statuses clearly while keeping inactive UI restrained.
- Protect continuity across devices: PWA and native-shell flows should feel like the same vault on desktop and touch screens.

## Accessibility & Inclusion

Target WCAG AA for contrast and keyboard access. Support responsive and touch-friendly interaction, reduced-motion preferences, readable dense data, and clear non-color-only status communication.
