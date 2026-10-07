//! `/share/graphql` (`forward "/share/graphql", Absinthe.Plug, schema:
//! ManavaultWeb.PublicShareSchema`). The router wraps it in
//! [`crate::web::public_graphql::admit`] and
//! [`crate::web::public_graphql::validate`], so batches are already refused
//! and the parsed body is in [`Params`].

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use super::protection::{self, Rejection};
use crate::state::AppState;
use crate::web::graphql_http::build_request;
use crate::web::params::Params;
use crate::web::public_graphql::check_depth;

fn rejected(errors: &[Rejection]) -> Response {
    axum::Json(json!({"errors": errors.iter().map(Rejection::to_json).collect::<Vec<_>>()}))
        .into_response()
}

/// Runs the document checks Absinthe runs before resolving: the token
/// limit, query-only operations, the depth limit, and the complexity limit.
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
/// before execution carry no `data`, as Absinthe's do.
pub async fn execute(state: &AppState, params: &serde_json::Map<String, Value>) -> Response {
    let request = match build_request(params) {
        Ok(request) => request,
        Err(message) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"errors": [{"message": message}]})),
            )
                .into_response();
        }
    };
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

/// The `/share/graphql` handler (GET or POST).
pub async fn handler(State(state): State<AppState>, params: Params) -> Response {
    execute(&state, &params.0).await
}
