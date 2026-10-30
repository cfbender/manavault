---
id: TASK-98
title: Support the full Scryfall search syntax in card and collection search
status: To Do
assignee: []
created_date: '2026-10-29T21:31:00Z'
labels: []
dependencies: []
type: feature
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expand ManaVault's Scryfall query support (rust/crates/manavault-catalog/src/catalog/scryfall_query.rs, search/predicates.rs, collection/filters.rs) to cover https://scryfall.com/docs/syntax as far as the local paper catalog allows. Store the extra Scryfall card and printing fields the predicates need (power/toughness/loyalty, keywords, produced mana, reserved, artist, watermark, frame, security stamp, set type, games, reprint/booster/spotlight/hires flags, set blocks and parents) and re-run the catalog sync once after upgrade.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Color nicknames, comparisons, and counts work for c:/id: and produces:
- [ ] #2 Text, regex, keyword, mana, devotion, power/toughness/loyalty, legality, price, date, reprint, language, artist/flavor/watermark, border/frame/stamp, game, set/block/group, and in:/new: keywords filter cards
- [ ] #3 is:/not:/has: flags from the reference (layouts, spell/permanent groups, land cycles, commander roles, promo types, finishes) filter cards
- [ ] #4 Display keywords (order:, direction:, unique:, display:, prefer:, include:) no longer empty the results; order:/direction: sort card search
- [ ] #5 Data the catalog does not store (cubes, art tags, digital-only prints) fails closed instead of erroring
- [ ] #6 Collection search accepts the same syntax, with copy-specific overrides for finish and language
<!-- AC:END -->
