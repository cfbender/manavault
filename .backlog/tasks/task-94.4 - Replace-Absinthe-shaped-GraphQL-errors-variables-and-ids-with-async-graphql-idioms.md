---
id: TASK-94.4
title: >-
  Replace Absinthe-shaped GraphQL errors, variables, and ids with async-graphql
  idioms
status: To Do
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
labels: []
dependencies:
  - TASK-94.1
parent_task_id: TASK-94
priority: medium
type: enhancement
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Several GraphQL behaviors exist only to match Absinthe: manavault-core/src/graphql/undefined_variables.rs rewrites documents so an unprovided nullable variable means "argument absent"; manavault-core/src/settings/changeset.rs renders Ecto changeset strings ("theme_style can't be blank, palette is invalid", fields alphabetized, newest first); graphql/relay.rs reproduces Absinthe.Relay error wording ("Could not decode ID value `x'"); manavault-server/src/graphql/node.rs exposes a `node(id:)` root field the frontend never calls; root types are named RootQueryType/RootMutationType/RootSubscriptionType. Keep base64 `Type:id` global ids and `arrayconnection:N` cursors (they are in URLs and Apollo's cache). Use MaybeUndefined<T> for arguments whose absence differs from null and delete the extension if async-graphql reports unbound variables as Undefined (verify; if it reports Null, keep the extension and note it as an upstream issue). Introduce a ValidationError { field, message } type rendered as a readable message plus GraphQL error extensions (code, fields). Keep NullableErrors and ResponseOrder (they fix async-graphql spec deviations). Regenerate the frontend types with codegen and adjust any UI that parses error strings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mutations that leave out optional variables keep the stored values (updateAppearanceSettings, updateBackupSettings, updateAiSettings, and any others found) with tests
- [ ] #2 Validation failures return a readable message and extensions {code: "VALIDATION", fields: [{field, message}]}; the frontend shows them
- [ ] #3 The node root field, Absinthe error wording, and Absinthe root type names are gone; manavault sdl shows Query/Mutation/Subscription; codegen output is committed
- [ ] #4 mise run precommit passes
<!-- AC:END -->
