//! Protection for the public share GraphQL endpoint
//! (`Plugs.PublicGraphQLProtection`), as reusable middleware:
//!
//! - [`admit`] rate-limits per client and globally before the body is read.
//! - [`validate`] rejects transport batches (`_json` arrays, `operations`).
//! - [`check_depth`] is the `MaxDepth` phase for the executor to run before
//!   resolving (depth 12).
//!
//! The public schema and its route (`/share/graphql`) are added by the share
//! module, wrapped in these layers.

use axum::extract::{Request, State};
use axum::http::header::RETRY_AFTER;
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::client_ip;
use super::params;
use super::rate_limit::Admission;
use crate::state::AppState;

/// The public schema's maximum selection depth.
pub const MAX_DEPTH: usize = 12;

fn reject(status: StatusCode, message: &str) -> Response {
    (
        status,
        axum::Json(serde_json::json!({"errors": [{"message": message}]})),
    )
        .into_response()
}

/// Middleware: the shared request budget (`:admit`).
pub async fn admit(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let client_id = client_ip::for_request(&state.config, &request);
    match state
        .public_requests
        .check(&state.config.public_share_rate_limit, &client_id)
    {
        Admission::Ok => next.run(request).await,
        Admission::RateLimited(retry_after) => {
            let mut response = reject(
                StatusCode::TOO_MANY_REQUESTS,
                "Too many public GraphQL requests",
            );
            response
                .headers_mut()
                .insert(RETRY_AFTER, HeaderValue::from(retry_after));
            response
        }
    }
}

/// Middleware: no batches (`:validate`). Parses the body, leaving
/// [`params::Params`] in the request extensions.
pub async fn validate(request: Request, next: Next) -> Response {
    let (request, params) = match params::parse(request).await {
        Ok(parsed) => parsed,
        Err(error) => return error.into_response(),
    };
    if params.contains("_json") || params.contains("operations") {
        return reject(
            StatusCode::BAD_REQUEST,
            "GraphQL request batches are not supported",
        );
    }
    next.run(request).await
}

/// The depth of the selected operation, counting fields only; fragment
/// spreads and inline fragments add no level and recursive spreads stop.
#[must_use]
pub fn operation_depth(
    document: &async_graphql::parser::types::ExecutableDocument,
    operation_name: Option<&str>,
) -> usize {
    use async_graphql::parser::types::DocumentOperations;
    let operation = match (&document.operations, operation_name) {
        (DocumentOperations::Single(operation), _) => Some(operation),
        (DocumentOperations::Multiple(operations), Some(name)) => operations.get(name),
        (DocumentOperations::Multiple(operations), None) => operations.values().next(),
    };
    operation.map_or(0, |operation| {
        selections_depth(
            document,
            &operation.node.selection_set.node,
            0,
            &mut Vec::new(),
        )
    })
}

fn selections_depth(
    document: &async_graphql::parser::types::ExecutableDocument,
    set: &async_graphql::parser::types::SelectionSet,
    parent: usize,
    visiting: &mut Vec<String>,
) -> usize {
    use async_graphql::parser::types::Selection;
    set.items.iter().fold(parent, |deepest, selection| {
        let depth = match &selection.node {
            Selection::Field(field) => selections_depth(
                document,
                &field.node.selection_set.node,
                parent + 1,
                visiting,
            ),
            Selection::InlineFragment(fragment) => selections_depth(
                document,
                &fragment.node.selection_set.node,
                parent,
                visiting,
            ),
            Selection::FragmentSpread(spread) => {
                let name = spread.node.fragment_name.node.as_str();
                match document.fragments.get(name) {
                    Some(fragment) if !visiting.iter().any(|v| v == name) => {
                        visiting.push(name.to_owned());
                        let depth = selections_depth(
                            document,
                            &fragment.node.selection_set.node,
                            parent,
                            visiting,
                        );
                        visiting.pop();
                        depth
                    }
                    _ => parent,
                }
            }
        };
        deepest.max(depth)
    })
}

/// `MaxDepth`: an error message when the operation is deeper than
/// [`MAX_DEPTH`]. Unparseable documents pass (the executor reports them).
pub fn check_depth(query: &str, operation_name: Option<&str>) -> Result<(), String> {
    let Ok(document) = async_graphql::parser::parse_query(query) else {
        return Ok(());
    };
    if operation_depth(&document, operation_name) <= MAX_DEPTH {
        Ok(())
    } else {
        Err(format!(
            "GraphQL operation exceeds maximum depth {MAX_DEPTH}"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{TestApp, body_text};
    use axum::body::Body;
    use axum::routing::post;

    #[test]
    fn depth_counts_fields_through_fragments() {
        let nested = format!("{}kind{}", "ofType { ".repeat(13), " }".repeat(13));
        let query = format!(
            "query {{ __type(name: \"Printing\") {{ fields {{ type {{ {nested} }} }} }} }}"
        );
        assert_eq!(
            check_depth(&query, None),
            Err("GraphQL operation exceeds maximum depth 12".to_owned())
        );
        assert_eq!(check_depth("query { a { b { c } } }", None), Ok(()));
        let document = async_graphql::parser::parse_query(
            "query { a { ...F ... on X { b { c } } } } fragment F on A { d { e { f } } ...F }",
        )
        .unwrap();
        assert_eq!(operation_depth(&document, None), 4);
    }

    fn app_router(app: &TestApp) -> axum::Router {
        let state = app.state.clone();
        axum::Router::new()
            .route("/share/graphql", post(|| async { "ok" }))
            .route_layer(axum::middleware::from_fn(validate))
            .route_layer(axum::middleware::from_fn_with_state(state.clone(), admit))
            .with_state(state)
    }

    async fn send(router: &axum::Router, content_type: &str, body: &str) -> Response {
        use tower::ServiceExt as _;
        router
            .clone()
            .oneshot(
                Request::post("/share/graphql")
                    .header("content-type", content_type)
                    .body(Body::from(body.to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn rejects_batches_and_rate_limits_before_parsing() {
        let app = TestApp::with_config(|config| {
            config.public_share_rate_limit.max_per_ip = 3;
            config.public_share_rate_limit.max_global = 3;
        })
        .await;
        let router = app_router(&app);
        let batch = send(
            &router,
            "application/json",
            r#"[{"query": "{ a }"}, {"query": "{ b }"}]"#,
        )
        .await;
        assert_eq!(batch.status(), 400);
        assert!(
            body_text(batch)
                .await
                .contains("GraphQL request batches are not supported")
        );
        let operations = send(
            &router,
            "application/x-www-form-urlencoded",
            "operations=%5B%5D",
        )
        .await;
        assert_eq!(operations.status(), 400);
        let ok = send(&router, "application/json", r#"{"query": "{ a }"}"#).await;
        assert_eq!(ok.status(), 200);
        let limited = send(&router, "application/json", "{not valid json").await;
        assert_eq!(limited.status(), 429);
        assert!(limited.headers().get("retry-after").is_some());
        assert!(
            body_text(limited)
                .await
                .contains("Too many public GraphQL requests")
        );
    }
}
