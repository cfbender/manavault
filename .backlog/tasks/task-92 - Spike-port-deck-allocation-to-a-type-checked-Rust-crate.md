---
id: TASK-92
title: 'Spike: port deck allocation to a type-checked Rust crate'
status: Review
assignee:
  - '@cfbender'
created_date: '2026-10-07 06:28'
updated_date: '2026-10-07 06:50'
labels:
  - rust
  - spike
dependencies: []
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
We are evaluating a Rust backend rewrite of ManaVault (and later the-gathering) mainly for compile-time type safety and higher confidence in AI-generated code. Deck allocation is the area with the most past bug fixes (26 fix commits under lib/manavault/catalog/decks), several of them in classes a type system catches (dropped purchase_price_cents when splitting items, considering-zone cards being allocated). This spike ports the single-card allocate/deallocate/status slice to Rust against the existing SQLite schema so the approach can be judged on real code. It also seeds a shared mtg-core crate for types both apps need, without deciding yet between a monorepo and git dependencies. It is not wired into the running app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Cargo workspace exists with an mtg-core crate (shared card id and finish/condition types) and a manavault-allocation crate, built with the pinned mise Rust toolchain
- [x] #2 allocate, deallocate, and single-deck-card allocation status match the Elixir behavior in DeckCardAllocation, AllocationItems, and AllocationStatus, including error cases
- [x] #3 Invalid states are unrepresentable or rejected at the type boundary: considering-zone and archived-deck cards cannot reach the allocation write path, quantities are positive by construction, and cloned collection items must set every field
- [x] #4 SQL is compile-time checked by sqlx against the schema dumped from the Ecto migrations, and builds work offline from committed query metadata
- [x] #5 Workspace lints forbid unsafe code and deny unwrap/expect/panic outside tests; cargo clippy and cargo test pass
- [x] #6 Rust tests port the relevant Elixir allocation scenarios and run against an in-memory database loaded from priv/repo/structure.sql
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin Rust and sqlite in mise.toml; dump the Ecto schema to priv/repo/structure.sql with mix ecto.dump.
2. Create rust/ Cargo workspace with workspace lints (forbid unsafe, deny unwrap/expect/panic, clippy pedantic warn).
3. mtg-core: OracleId/ScryfallId newtypes, Finish and Condition enums, optional sqlx feature.
4. manavault-allocation: id newtypes, Zone/DeckStatus/LocationKind/DeckCardTag enums, Quantity (positive), AllocatableDeckCard typestate, AllocationError mirroring Elixir error atoms, pure status computation plus sqlx loaders, allocate/deallocate in transactions with move_to_deck/restore_from_deck parity (for_trade sync, location_changed_at, timestamps).
5. sqlx compile-time checking against a schema DB built from structure.sql; commit .sqlx offline metadata; mise tasks for schema DB and prepare.
6. Port Elixir allocation scenarios to Rust integration tests over an in-memory DB; run clippy and tests.
7. Document workflow (README in rust/, AGENTS.md note about regenerating structure.sql).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: mise run rust:check passes (fmt, clippy -D warnings, 5 unit + 13 integration tests + 1 compile_fail doctest + 1 mtg-core test). Offline build verified after cargo clean. Negative checks: removing purchase_price_cents from the split, skipping DeckCard::allocatable, and querying a non-existent column each fail to compile.

Parity notes: Elixir validates quantities only via changesets; Rust takes Quantity (positive by construction). If both the deck card is considering and the item is missing, Rust returns considering_not_allocatable where Elixir raises. Snow basics ('Basic Snow Land') are not treated as basic lands in Elixir; Rust keeps that behavior deliberately.

Not ported: bulk/pull-list/proxy allocation, preferred-printing switching, bulk deallocation, GraphQL wiring. Transactions use sqlx's default deferred BEGIN, so concurrent writers with the Elixir app were not evaluated.

Snow basics now count as basic lands in both Elixir (shared Card.basic_land?/1 used by allocation status, buylist, bulk allocation, EDHREC collection status, deck legality) and Rust (mtg_core::is_basic_land). mix test: 853 passed; rust:check passes. Shared crate will live in cfbender/lotus as a git dependency instead of rust/crates/mtg-core.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added rust/ Cargo workspace with mtg-core (shared Scryfall id, finish, condition types) and manavault-allocation (allocate, deallocate, single-card status) over the existing SQLite schema. Queries are compile-time checked by sqlx against priv/repo/structure.sql (mix ecto.dump), with committed .sqlx metadata for offline builds; mise tasks rust:check and rust:sqlx-prepare and a CI job enforce fmt, strict clippy lints, and tests. Verified with mise run rust:check and negative compile checks reproducing past Elixir bugs.
<!-- SECTION:FINAL_SUMMARY:END -->
