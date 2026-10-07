---
id: TASK-93
title: Port the backend to Rust with full feature parity
status: Review
assignee:
  - '@cfbender'
created_date: '2026-10-07 12:27'
labels:
  - rust
  - backend
dependencies: []
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the Elixir/Phoenix backend with a Rust backend (rust/crates/manavault-server) that serves the same owner and public GraphQL schemas, routes, sessions, and Oban-compatible jobs over the same SQLite database, using the shared lotus crate for Magic domain code, Scryfall parsing/sync, and decklist sources. Branch rust-backend. Follows TASK-92.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Owner and public GraphQL SDLs match Absinthe with zero differences
- [ ] #2 All 146 frontend GraphQL operations validate and behave the same as on the Elixir backend (differential harness rust/scripts/parity, no unexplained differences)
- [ ] #3 Runs against databases created by the Elixir app; sessions, CSRF tokens, encrypted credentials, and backups are interchangeable
- [ ] #4 Scryfall sync, pricing, assets, scanner, backups, external deck sync, AI, and share preview jobs run on the oban_jobs table with the Elixir worker names and crontab
- [ ] #5 mtg-core replaced by lotus; Elixir Scryfall and decklist-source code replaced by lotus at the app boundary
- [ ] #6 Orb setup, mise tasks, services.yaml, CI, and Dockerfile build, test, and run the Rust backend
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Area notes live in rust/notes/*.md (catalog, scryfall, platform, collection, decks, allocation, trade, ai, integration, share, infra, parity). Verified: cargo test --workspace (759 server + 45 allocation + doctest), clippy -D warnings, fmt; mix test 853 passed; aube run test:react 189 passed; differential harness 145/146 operations (ServerLog is a websocket subscription covered by socket tests), 533 identical steps, 24 documented differences (Elixir 500s/bugs), 0 unexplained; browser walkthrough of every page against the Rust stack (palette regression found and fixed). Decisions: multi-faced cards store NULL instead of "" for missing flavor/oracle text; lotus Archidekt zone semantics, quantity clamping, unknown-zone mapping, and 401-as-403 adopted and documented.
<!-- SECTION:NOTES:END -->
