//! Protection for the public share GraphQL endpoint:
//!
//! - [`admit`] rate-limits per client and globally before the body is read.
//! - [`check_depth`] is the depth limit for the executor to run before
//!   resolving (depth 12).
//!
//! The public schema and its route (`/share/graphql`) are added by the share
//! module, wrapped in [`admit`].

use axum::extract::{Request, State};
use axum::http::header::RETRY_AFTER;
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::client_ip;
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

/// Middleware: the shared request budget.
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

/// An error message when the operation is deeper than [`MAX_DEPTH`].
/// Unparseable documents pass (the executor reports them).
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
    use crate::test_support::body_text;
    use crate::testing::TestState;
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

    fn app_router(app: &TestState) -> axum::Router {
        let state = app.state.clone();
        axum::Router::new()
            .route("/share/graphql", post(|| async { "ok" }))
            .route_layer(axum::middleware::from_fn_with_state(state.clone(), admit))
            .with_state(state)
    }

    async fn send(router: &axum::Router) -> Response {
        use tower::ServiceExt as _;
        router
            .clone()
            .oneshot(
                Request::post("/share/graphql")
                    .header("content-type", "application/json")
                    .body(Body::from("{not valid json"))
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn rate_limits_before_the_body_is_read() {
        let app = TestState::with_config(|config| {
            config.public_share_rate_limit.max_per_ip = 2;
            config.public_share_rate_limit.max_global = 2;
        })
        .await;
        let router = app_router(&app);
        assert_eq!(send(&router).await.status(), 200);
        assert_eq!(send(&router).await.status(), 200);
        let limited = send(&router).await;
        assert_eq!(limited.status(), 429);
        assert!(limited.headers().get("retry-after").is_some());
        assert!(
            body_text(limited)
                .await
                .contains("Too many public GraphQL requests")
        );
    }
}
