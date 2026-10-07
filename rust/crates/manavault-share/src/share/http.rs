//! `POST /share/graphql`: the public share schema over HTTP. The router
//! wraps the handler in [`crate::web::public_graphql::admit`] (rate
//! limiting) and [`crate::web::graphql::require_json`]; the
//! [`GraphQLRequest`] extractor accepts one request per body, so batches
//! are refused before anything runs.

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use super::protection::{self, Rejection};
use crate::state::AppState;
use crate::web::graphql::GraphQLRequest;
use crate::web::public_graphql::check_depth;

fn rejected(errors: &[Rejection]) -> Response {
    axum::Json(json!({"errors": errors.iter().map(Rejection::to_json).collect::<Vec<_>>()}))
        .into_response()
}

/// Runs the document checks that precede resolving: the token limit,
/// query-only operations, the depth limit, and the complexity limit.
fn check_document(query: &str, operation_name: Option<&str>) -> Result<(), Vec<Rejection>> {
    protection::check_tokens(query).map_err(|rejection| vec![rejection])?;
    let Ok(document) = async_graphql::parser::parse_query(query) else {
        // The executor reports syntax errors.
        return Ok(());
    };
    protection::check_operation_type(&document, operation_name)
        .map_err(|rejection| vec![rejection])?;
    check_depth(query, operation_name).map_err(|message| {
        vec![Rejection {
            message,
            locations: Vec::new(),
        }]
    })?;
    protection::check_complexity(&document, operation_name)
}

/// Executes one request against the public schema. Responses that failed
/// before execution carry no `data`.
pub async fn execute(state: &AppState, request: async_graphql::Request) -> Response {
    if let Err(errors) = check_document(&request.query, request.operation_name.as_deref()) {
        return rejected(&errors);
    }
    let request = request
        .data(state.clone())
        .data(crate::catalog::loader::data_loader(state.db.clone()));
    let response = super::schema::schema().execute(request).await;
    if response.data == async_graphql::Value::Null && !response.errors.is_empty() {
        return axum::Json(json!({"errors": response.errors})).into_response();
    }
    axum::Json(response).into_response()
}

/// The `/share/graphql` handler.
pub async fn handler(State(state): State<AppState>, request: GraphQLRequest) -> Response {
    execute(&state, request.into_inner()).await
}
