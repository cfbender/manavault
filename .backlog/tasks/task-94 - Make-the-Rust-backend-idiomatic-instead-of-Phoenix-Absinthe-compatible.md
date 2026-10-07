---
id: TASK-94
title: Make the Rust backend idiomatic instead of Phoenix/Absinthe-compatible
status: To Do
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:53'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Rust backend (axum, async-graphql, sqlx) was ported 1:1 from the Elixir app and still emulates Phoenix/Absinthe/Plug/Oban wire formats and conventions: Plug signed-cookie sessions in Erlang external term format, Phoenix masked CSRF tokens, Absinthe.Plug request parsing, Phoenix Channels for GraphQL subscriptions, an Oban-shaped `oban_jobs` table, Ecto changeset error strings, Absinthe Relay error wording, `SECRET_KEY_BASE`/`PHX_HOST` config names, string timestamps in Ecto formats, and crate re-exports that keep the old `crate::...` paths. Now that the Elixir app is gone from main, the owner wants the server shaped as if written in Rust from scratch, keeping the current libraries (no ORM switch, sqlx stays) and keeping PBKDF2 password hashes so operators never re-hash. Subtasks are the independently shippable phases; each must pass `mise run precommit`. No coordination with lotus or the-gathering is needed. Keep the `NullableErrors` and `ResponseOrder` extensions: they fix async-graphql spec deviations, not Absinthe quirks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is Done
- [ ] #2 rust/README.md describes the architecture without references to the Elixir port, and rust/notes and rust/scripts/parity are removed or replaced by one architecture doc
<!-- AC:END -->
