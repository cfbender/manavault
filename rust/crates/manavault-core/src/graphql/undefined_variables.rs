//! Treats arguments bound to unprovided variables as absent, like Absinthe.
//!
//! The frontend declares optional variables and leaves out the ones it does
//! not want to change, e.g. `UpdateAppearanceSettings($palette: String,
//! $themeStyle: String)` sent with only `{"palette": "nord"}`. Absinthe drops
//! an argument whose variable was not provided, so the resolver sees only
//! `palette` and keeps the stored theme style. async-graphql instead resolves
//! the unprovided variable to `null`, which resolvers read as "clear this
//! value" (`theme_style can't be blank`). Found in the browser walkthrough of
//! the React frontend against the Rust backend.
//!
//! This extension rewrites the parsed document before validation: every
//! field argument and input-object field whose value is exactly `$name`,
//! where `$name` is a nullable variable without a default that the request
//! did not provide, is removed. A variable definition left unused by that is
//! removed too, so validation does not report it. Variables used inside list
//! values stay, and resolve to `null` as before. Non-null variables are left
//! alone so validation still rejects them when they are missing.

use std::collections::HashSet;
use std::sync::Arc;

use async_graphql::extensions::{Extension, ExtensionContext, ExtensionFactory, NextParseQuery};
use async_graphql::parser::Positioned;
use async_graphql::parser::types::Directive;
use async_graphql::parser::types::{
    DocumentOperations, ExecutableDocument, OperationDefinition, Selection, SelectionSet,
};
use async_graphql::{Name, ServerResult, Variables};
use async_graphql_value::Value;

/// The extension factory to register on a schema.
pub struct UndefinedVariables;

impl ExtensionFactory for UndefinedVariables {
    fn create(&self) -> Arc<dyn Extension> {
        Arc::new(UndefinedVariablesExtension)
    }
}

struct UndefinedVariablesExtension;

#[async_graphql::async_trait::async_trait]
impl Extension for UndefinedVariablesExtension {
    async fn parse_query(
        &self,
        ctx: &ExtensionContext<'_>,
        query: &str,
        variables: &Variables,
        next: NextParseQuery<'_>,
    ) -> ServerResult<ExecutableDocument> {
        let mut document = next.run(ctx, query, variables).await?;
        drop_undefined(&mut document, variables);
        Ok(document)
    }
}

fn operations_mut(document: &mut ExecutableDocument) -> Vec<&mut OperationDefinition> {
    match &mut document.operations {
        DocumentOperations::Single(operation) => vec![&mut operation.node],
        DocumentOperations::Multiple(operations) => operations
            .values_mut()
            .map(|operation| &mut operation.node)
            .collect(),
    }
}

/// Rewrites `document` in place. Fragments are shared between operations,
/// so a variable counts as undefined only if no operation provides it.
pub fn drop_undefined(document: &mut ExecutableDocument, variables: &Variables) {
    let mut undefined: HashSet<Name> = HashSet::new();
    for operation in operations_mut(document) {
        for definition in &operation.variable_definitions {
            let definition = &definition.node;
            let nullable = definition.var_type.node.nullable;
            let name = &definition.name.node;
            if nullable && definition.default_value.is_none() && !variables.contains_key(name) {
                undefined.insert(name.clone());
            }
        }
    }
    if undefined.is_empty() {
        return;
    }
    for operation in operations_mut(document) {
        strip_selection_set(&mut operation.selection_set.node, &undefined);
    }
    for fragment in document.fragments.values_mut() {
        strip_selection_set(&mut fragment.node.selection_set.node, &undefined);
    }

    let mut still_used: HashSet<Name> = HashSet::new();
    for operation in operations_mut(document) {
        collect_selection_set(&operation.selection_set.node, &mut still_used);
    }
    for fragment in document.fragments.values() {
        collect_selection_set(&fragment.node.selection_set.node, &mut still_used);
    }
    for operation in operations_mut(document) {
        operation.variable_definitions.retain(|definition| {
            let name = &definition.node.name.node;
            !undefined.contains(name) || still_used.contains(name)
        });
    }
}

fn is_undefined(value: &Value, undefined: &HashSet<Name>) -> bool {
    matches!(value, Value::Variable(name) if undefined.contains(name))
}

fn strip_value(value: &mut Value, undefined: &HashSet<Name>) {
    match value {
        Value::Object(fields) => {
            fields.retain(|_, field| !is_undefined(field, undefined));
            for field in fields.values_mut() {
                strip_value(field, undefined);
            }
        }
        Value::List(items) => {
            for item in items {
                strip_value(item, undefined);
            }
        }
        _ => {}
    }
}

fn strip_arguments(
    arguments: &mut Vec<(Positioned<Name>, Positioned<Value>)>,
    undefined: &HashSet<Name>,
) {
    arguments.retain(|(_, value)| !is_undefined(&value.node, undefined));
    for (_, value) in arguments {
        strip_value(&mut value.node, undefined);
    }
}

fn strip_selection_set(selection_set: &mut SelectionSet, undefined: &HashSet<Name>) {
    for selection in &mut selection_set.items {
        match &mut selection.node {
            Selection::Field(field) => {
                strip_arguments(&mut field.node.arguments, undefined);
                strip_selection_set(&mut field.node.selection_set.node, undefined);
            }
            Selection::InlineFragment(fragment) => {
                strip_selection_set(&mut fragment.node.selection_set.node, undefined);
            }
            Selection::FragmentSpread(_) => {}
        }
    }
}

fn collect_value(value: &Value, used: &mut HashSet<Name>) {
    match value {
        Value::Variable(name) => {
            used.insert(name.clone());
        }
        Value::Object(fields) => fields.values().for_each(|field| collect_value(field, used)),
        Value::List(items) => items.iter().for_each(|item| collect_value(item, used)),
        _ => {}
    }
}

fn collect_directives(directives: &[Positioned<Directive>], used: &mut HashSet<Name>) {
    for directive in directives {
        for (_, value) in &directive.node.arguments {
            collect_value(&value.node, used);
        }
    }
}

fn collect_selection_set(selection_set: &SelectionSet, used: &mut HashSet<Name>) {
    for selection in &selection_set.items {
        match &selection.node {
            Selection::Field(field) => {
                for (_, value) in &field.node.arguments {
                    collect_value(&value.node, used);
                }
                collect_directives(&field.node.directives, used);
                collect_selection_set(&field.node.selection_set.node, used);
            }
            Selection::InlineFragment(fragment) => {
                collect_directives(&fragment.node.directives, used);
                collect_selection_set(&fragment.node.selection_set.node, used);
            }
            Selection::FragmentSpread(spread) => {
                collect_directives(&spread.node.directives, used);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::test_support::TestApp;

    #[tokio::test]
    async fn unprovided_variables_leave_settings_unchanged_like_absinthe() {
        let app = TestApp::new().await;
        let mutation = "mutation UpdateAppearanceSettings($palette: String, $themeStyle: String) {
            updateAppearanceSettings(palette: $palette, themeStyle: $themeStyle) {
              appearanceSettings { palette themeStyle }
            }
          }";
        let data = app.gql_data(mutation, json!({"palette": "nord"})).await;
        assert_eq!(
            data["updateAppearanceSettings"]["appearanceSettings"],
            json!({"palette": "nord", "themeStyle": "glass"})
        );
        let data = app
            .gql_data(mutation, json!({"themeStyle": "classic"}))
            .await;
        assert_eq!(
            data["updateAppearanceSettings"]["appearanceSettings"],
            json!({"palette": "nord", "themeStyle": "classic"})
        );
        // An explicit null is still an explicit null.
        let response = app
            .gql(mutation, json!({"palette": null, "themeStyle": "classic"}))
            .await;
        assert_eq!(
            response["errors"][0]["message"],
            json!("palette can't be blank")
        );
    }

    #[tokio::test]
    async fn missing_non_null_variables_are_still_rejected() {
        let app = TestApp::new().await;
        let response = app
            .gql("query Card($id: ID!) { card(id: $id) { name } }", json!({}))
            .await;
        assert!(response["errors"].is_array(), "{response}");
    }
}
