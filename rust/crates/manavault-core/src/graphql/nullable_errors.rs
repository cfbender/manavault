//! Answers a failed nullable field with `null`, the way Absinthe (and the
//! GraphQL spec's "Handling Field Errors") does.
//!
//! async-graphql 7.2 drops a field whose resolver returned an error from the
//! response object (`resolver_utils::container::do_resolve_container`), and
//! answers an object whose every field failed with `null`. So a failed
//! mutation such as `{ createLocation(...) { location { id } } }` came back
//! as `{"data": null}` where Absinthe sends `{"data": {"createLocation":
//! null}}`, and `{ location(id: "missing") { id } pricingSettings { source } }`
//! lost the `location` key instead of setting it to `null`. Found by the
//! differential parity harness (`rust/scripts/parity`).
//!
//! This extension catches the error of every nullable field, records it, and
//! resolves the field to `null`; the recorded errors are appended to the
//! response after execution. Errors of non-null fields still propagate (and
//! async-graphql drops them as before).

use std::sync::{Arc, Mutex};

use async_graphql::extensions::{
    Extension, ExtensionContext, ExtensionFactory, NextExecute, NextResolve, ResolveInfo,
};
use async_graphql::{Response, ServerError, ServerResult, Value};

/// The extension factory to register on a schema.
pub struct NullableErrors;

impl ExtensionFactory for NullableErrors {
    fn create(&self) -> Arc<dyn Extension> {
        Arc::new(NullableErrorsExtension::default())
    }
}

/// One request's instance: the errors of fields answered with `null`.
#[derive(Default)]
struct NullableErrorsExtension {
    errors: Mutex<Vec<ServerError>>,
}

#[async_graphql::async_trait::async_trait]
impl Extension for NullableErrorsExtension {
    async fn execute(
        &self,
        ctx: &ExtensionContext<'_>,
        operation_name: Option<&str>,
        next: NextExecute<'_>,
    ) -> Response {
        let mut response = next.run(ctx, operation_name).await;
        let recorded = match self.errors.lock() {
            Ok(mut errors) => std::mem::take(&mut *errors),
            Err(poisoned) => std::mem::take(&mut *poisoned.into_inner()),
        };
        if !recorded.is_empty() {
            if response.data == Value::Null {
                response.data = Value::Object(async_graphql::indexmap::IndexMap::new());
            }
            response.errors.extend(recorded);
        }
        response
    }

    async fn resolve(
        &self,
        ctx: &ExtensionContext<'_>,
        info: ResolveInfo<'_>,
        next: NextResolve<'_>,
    ) -> ServerResult<Option<Value>> {
        let nullable = !info.return_type.ends_with('!');
        match next.run(ctx, info).await {
            Err(error) if nullable => {
                match self.errors.lock() {
                    Ok(mut errors) => errors.push(error),
                    Err(poisoned) => poisoned.into_inner().push(error),
                }
                Ok(Some(Value::Null))
            }
            result => result,
        }
    }
}

#[cfg(test)]
mod tests {
    use async_graphql::{EmptySubscription, Object, Schema};

    use super::*;

    struct Query;

    #[Object]
    impl Query {
        async fn ok(&self) -> i64 {
            1
        }

        async fn missing(&self) -> async_graphql::Result<Option<i64>> {
            Err("Location was not found.".into())
        }

        async fn required(&self) -> async_graphql::Result<i64> {
            Err("required failed".into())
        }
    }

    struct Mutation;

    #[Object]
    impl Mutation {
        async fn create(&self) -> async_graphql::Result<Option<i64>> {
            Err("Invalid printing ID".into())
        }
    }

    async fn run(query: &str) -> serde_json::Value {
        let schema = Schema::build(Query, Mutation, EmptySubscription)
            .extension(crate::graphql::order::ResponseOrder)
            .extension(NullableErrors)
            .finish();
        serde_json::to_value(schema.execute(query).await).unwrap()
    }

    #[tokio::test]
    async fn a_failed_nullable_field_is_null() {
        let response = run("{ missing ok }").await;
        assert_eq!(
            response["data"],
            serde_json::json!({"missing": null, "ok": 1})
        );
        assert_eq!(response["errors"][0]["message"], "Location was not found.");
        assert_eq!(
            response["errors"][0]["path"],
            serde_json::json!(["missing"])
        );
    }

    #[tokio::test]
    async fn a_failed_mutation_keeps_its_data_object() {
        let response = run("mutation { create }").await;
        assert_eq!(response["data"], serde_json::json!({"create": null}));
        assert_eq!(response["errors"][0]["message"], "Invalid printing ID");
        assert_eq!(response["errors"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_failed_non_null_field_still_errors() {
        let response = run("{ ok required }").await;
        assert_eq!(response["errors"][0]["message"], "required failed");
        assert_eq!(response["data"]["ok"], 1);
    }
}
