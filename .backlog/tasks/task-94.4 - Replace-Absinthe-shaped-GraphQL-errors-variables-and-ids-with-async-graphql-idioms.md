---
id: TASK-94.4
title: >-
  Replace Absinthe-shaped GraphQL errors, variables, and ids with async-graphql
  idioms
status: Done
assignee:
  - '@cfbender'
created_date: '2026-10-07 18:54'
updated_date: '2026-10-07 21:29'
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
- [x] #1 Mutations that leave out optional variables keep the stored values (updateAppearanceSettings, updateBackupSettings, updateAiSettings, and any others found) with tests
- [x] #2 Validation failures return a readable message and extensions {code: "VALIDATION", fields: [{field, message}]}; the frontend shows them
- [x] #3 The node root field, Absinthe error wording, and Absinthe root type names are gone; manavault sdl shows Query/Mutation/Subscription; codegen output is committed
- [x] #4 mise run precommit passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verified async-graphql 7.2.1 resolves an unprovided nullable variable to Null (VariableDefinition::default_value returns Null for nullable types; context.rs var_value / validation visitor), so MaybeUndefined cannot see absence through variables. Keep graphql/undefined_variables.rs as a GraphQL-spec fix (CoerceVariableValues leaves unprovided variables out), reword its docs to drop the Absinthe framing, and extend its test to updateAiSettings and updateBackupSettings.
2. Replace settings/changeset.rs (Ecto rendering: alphabetized fields, newest first) and the collection crate's duplicate FieldErrors with one manavault-core validation.rs: FieldError { field, message } and ValidationError(Vec<FieldError>) rendered in insertion order with humanized field names, plus From<ValidationError> for async_graphql::Error that sets extensions { code: VALIDATION, fields: [{ field (camelCase argument name), message }] }. Error enums that held rendered strings (ItemError, LocationError, AutoSortError, ImportError) hold ValidationError instead so extensions survive to the resolver boundary.
3. Delete manavault-server graphql/node.rs (Node interface, node root field) and relay::node_field_id/parse_internal_id; reword relay id errors ('Invalid deck ID: ...', 'Expected deck ID, got card ID'); drop the RootQueryType/RootMutationType/RootSubscriptionType names on the owner and share schemas.
4. Update tests (expected messages/order, node test removed, type names) and docs/notes; regenerate frontend types with aube run codegen and commit assets/react/src/gql; the frontend shows error.message already and parses no error strings, so no UI change beyond codegen.
5. mise run precommit; portal check of a validation error (e.g. blank palette) showing the readable message and extensions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
async-graphql 7.2.1 resolves an unprovided nullable variable to Null (parser VariableDefinition::default_value), so graphql/undefined_variables.rs stays as a GraphQL-spec (CoerceVariableValues) fix; its docs no longer frame it as Absinthe compatibility. settings/changeset.rs and the collection crate's FieldErrors are replaced by manavault-core validation.rs (ValidationError; messages in validator order with humanized field names; ErrorExtensions adds code VALIDATION and camelCase fields). ItemError/LocationError/AutoSortError/ImportError carry ValidationError (plus Item variants for wrapped item errors) so extensions reach the resolver boundary. Removed graphql/node.rs, relay::node_field_id/parse_internal_id, and the Absinthe root type names; relay id errors read 'Invalid deck ID: <id>' / 'Expected deck ID, got deck card ID'. Codegen only changed doc comments. Portal check: updateAppearanceSettings(palette: null, themeStyle: bogus) returns the message plus extensions, and the settings page shows the backup validation message.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Validation errors are a core ValidationError rendered as a readable message plus VALIDATION extensions; the Node interface/node field, Absinthe id wording, and RootQueryType/RootMutationType/RootSubscriptionType names are gone (schema is Query/Mutation/Subscription); undefined_variables.rs kept as a spec fix for an async-graphql deviation. precommit passes; frontend types regenerated.
<!-- SECTION:FINAL_SUMMARY:END -->
