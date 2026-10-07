//! Keeps response fields in the order the query selected them.
//!
//! async-graphql 7.2 resolves the fields of a query object concurrently and
//! inserts each result when it completes, so a slow field can move behind a
//! later one (`{ backupSettings appearanceSettings }` sometimes answered
//! `appearanceSettings` first). Absinthe, and the GraphQL spec's "Serialized
//! Map Ordering", keep the selection order. This extension remembers the
//! parsed document and, after execution, reorders every response object
//! along its selection sets (fields, fragment spreads, and inline fragments,
//! in `CollectFields` order).

use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

use async_graphql::extensions::{
    Extension, ExtensionContext, ExtensionFactory, NextExecute, NextParseQuery,
};
use async_graphql::indexmap::IndexMap;
use async_graphql::parser::types::{
    DocumentOperations, ExecutableDocument, OperationDefinition, Selection, SelectionSet,
};
use async_graphql::{Name, Response, ServerResult, Value, Variables};

/// The extension factory to register on a schema.
pub struct ResponseOrder;

impl ExtensionFactory for ResponseOrder {
    fn create(&self) -> Arc<dyn Extension> {
        Arc::new(ResponseOrderExtension::default())
    }
}

/// One request's instance: the document parsed for it.
#[derive(Default)]
struct ResponseOrderExtension {
    document: OnceLock<ExecutableDocument>,
}

#[async_graphql::async_trait::async_trait]
impl Extension for ResponseOrderExtension {
    async fn parse_query(
        &self,
        ctx: &ExtensionContext<'_>,
        query: &str,
        variables: &Variables,
        next: NextParseQuery<'_>,
    ) -> ServerResult<ExecutableDocument> {
        let document = next.run(ctx, query, variables).await?;
        // Only the first parse of a request is kept (there is only one).
        let _ = self.document.set(document.clone());
        Ok(document)
    }

    async fn execute(
        &self,
        ctx: &ExtensionContext<'_>,
        operation_name: Option<&str>,
        next: NextExecute<'_>,
    ) -> Response {
        let mut response = next.run(ctx, operation_name).await;
        if let Some(document) = self.document.get()
            && let Some(operation) = operation(document, operation_name)
        {
            reorder(
                &mut response.data,
                &[&operation.selection_set.node],
                document,
            );
        }
        response
    }
}

/// The executed operation: the named one, or the only one.
fn operation<'a>(
    document: &'a ExecutableDocument,
    name: Option<&str>,
) -> Option<&'a OperationDefinition> {
    match (&document.operations, name) {
        (DocumentOperations::Single(operation), _) => Some(&operation.node),
        (DocumentOperations::Multiple(operations), Some(name)) => operations
            .iter()
            .find(|(key, _)| key.as_str() == name)
            .map(|(_, operation)| &operation.node),
        (DocumentOperations::Multiple(operations), None) if operations.len() == 1 => {
            operations.values().next().map(|operation| &operation.node)
        }
        (DocumentOperations::Multiple(_), None) => None,
    }
}

/// Reorders `value` (an object, or a list of them) along the merged
/// `selection_sets` that produced it.
fn reorder(value: &mut Value, selection_sets: &[&SelectionSet], document: &ExecutableDocument) {
    match value {
        Value::List(items) => {
            for item in items {
                reorder(item, selection_sets, document);
            }
        }
        Value::Object(fields) => {
            let mut order: IndexMap<Name, Vec<&SelectionSet>> = IndexMap::new();
            let mut visited = HashSet::new();
            for selection_set in selection_sets {
                collect(selection_set, document, &mut order, &mut visited);
            }
            let mut unordered = std::mem::take(fields);
            for (key, children) in order {
                if let Some(mut child) = unordered.shift_remove(&key) {
                    reorder(&mut child, &children, document);
                    fields.insert(key, child);
                }
            }
            // Anything the walk did not name keeps its place at the end.
            fields.extend(unordered);
        }
        _ => {}
    }
}

/// `CollectFields`: response keys in selection order, each with the
/// sub-selections of every field that answers to it.
fn collect<'a>(
    selection_set: &'a SelectionSet,
    document: &'a ExecutableDocument,
    order: &mut IndexMap<Name, Vec<&'a SelectionSet>>,
    visited: &mut HashSet<&'a str>,
) {
    for selection in &selection_set.items {
        match &selection.node {
            Selection::Field(field) => {
                order
                    .entry(field.node.response_key().node.clone())
                    .or_default()
                    .push(&field.node.selection_set.node);
            }
            Selection::FragmentSpread(spread) => {
                let name = spread.node.fragment_name.node.as_str();
                if visited.insert(name)
                    && let Some(fragment) = document.fragments.get(&spread.node.fragment_name.node)
                {
                    collect(&fragment.node.selection_set.node, document, order, visited);
                }
            }
            Selection::InlineFragment(fragment) => {
                collect(&fragment.node.selection_set.node, document, order, visited);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use async_graphql::{EmptyMutation, EmptySubscription, Object, Schema, SimpleObject};

    use super::*;

    #[derive(SimpleObject)]
    struct Pair {
        slow: i64,
        fast: i64,
    }

    struct Query;

    async fn sleep(ms: u64) {
        tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
    }

    #[Object]
    impl Query {
        async fn slow(&self) -> i64 {
            sleep(30).await;
            1
        }

        async fn fast(&self) -> i64 {
            2
        }

        async fn pairs(&self) -> Vec<Pair> {
            vec![Pair { slow: 1, fast: 2 }]
        }
    }

    fn schema(ordered: bool) -> Schema<Query, EmptyMutation, EmptySubscription> {
        let builder = Schema::build(Query, EmptyMutation, EmptySubscription);
        if ordered {
            builder.extension(ResponseOrder).finish()
        } else {
            builder.finish()
        }
    }

    async fn run(ordered: bool, query: &str) -> String {
        let response = schema(ordered).execute(query).await;
        serde_json::to_string(&response.data).unwrap()
    }

    #[tokio::test]
    async fn fields_keep_the_selection_order() {
        // Without the extension the slow field completes last and moves
        // behind the fast one.
        assert_eq!(run(false, "{ slow fast }").await, r#"{"fast":2,"slow":1}"#);
        assert_eq!(run(true, "{ slow fast }").await, r#"{"slow":1,"fast":2}"#);
    }

    #[tokio::test]
    async fn aliases_fragments_and_lists_are_ordered() {
        let query = r"
            query Named { b: slow ...F pairs { ... on Pair { slow } fast } a: fast }
            fragment F on Query { fast }
        ";
        assert_eq!(
            run(true, query).await,
            r#"{"b":1,"fast":2,"pairs":[{"slow":1,"fast":2}],"a":2}"#
        );
    }
}
