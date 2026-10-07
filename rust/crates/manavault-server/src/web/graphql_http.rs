//! GraphQL over HTTP the way `Absinthe.Plug` takes it: JSON (single or a
//! `_json` transport batch), URL-encoded, multipart, or `application/graphql`
//! bodies; `variables` as an object or a JSON string.
//!
//! [`csrf`] is `Plugs.GraphQLCSRFProtection`: POST only, with a masked token
//! in `x-csrf-token`, the `_csrf_token` body field, or the query string.

use async_graphql::{ObjectType, Schema, SubscriptionType};
use axum::extract::{Request, State};
use axum::http::header::{ALLOW, CONTENT_TYPE};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use super::WebState;
use super::browser::csrf_token_valid;
use super::params::{self, Params};
use super::session::Session;

fn json_error(status: StatusCode, message: &str) -> Response {
    (
        status,
        axum::Json(json!({"errors": [{"message": message}]})),
    )
        .into_response()
}

/// Middleware: POST with a valid CSRF token.
pub async fn csrf(session: Session, request: Request, next: Next) -> Response {
    if request.method() != Method::POST {
        let mut response = json_error(StatusCode::METHOD_NOT_ALLOWED, "Method not allowed");
        response
            .headers_mut()
            .insert(ALLOW, HeaderValue::from_static("POST"));
        return response;
    }
    let (request, params) = match params::parse(request).await {
        Ok(parsed) => parsed,
        Err(error) => return error.into_response(),
    };
    if csrf_token_valid(&session, request.headers(), &params) {
        next.run(request).await
    } else {
        json_error(StatusCode::FORBIDDEN, "Invalid CSRF token")
    }
}

/// Builds one request from a parameter object.
pub fn build_request(params: &Map<String, Value>) -> Result<async_graphql::Request, String> {
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .filter(|query| !query.trim().is_empty())
        .ok_or_else(|| "No query document supplied".to_owned())?;
    let mut request = async_graphql::Request::new(query);
    if let Some(name) = params.get("operationName").and_then(Value::as_str) {
        request = request.operation_name(name);
    }
    let variables = match params.get("variables") {
        Some(Value::String(text)) if !text.trim().is_empty() => serde_json::from_str(text)
            .map_err(|_| "Could not parse variables as a JSON object".to_owned())?,
        Some(Value::Object(object)) => Value::Object(object.clone()),
        _ => Value::Object(Map::new()),
    };
    Ok(request.variables(async_graphql::Variables::from_json(variables)))
}

/// Runs the request(s) in `params` against a schema.
pub async fn execute<Q, M, S>(schema: &Schema<Q, M, S>, params: &Params) -> Response
where
    Q: ObjectType + 'static,
    M: ObjectType + 'static,
    S: SubscriptionType + 'static,
{
    if let Some(batch) = params.0.get("_json") {
        let Some(items) = batch.as_array() else {
            return json_error(
                StatusCode::BAD_REQUEST,
                "Invalid request structure. Expecting an object or list of objects.",
            );
        };
        let mut results = Vec::with_capacity(items.len());
        for item in items {
            let Some(object) = item.as_object() else {
                return json_error(
                    StatusCode::BAD_REQUEST,
                    "Invalid request structure. Expecting a list of objects.",
                );
            };
            // Serialized as text so fields keep the query's order.
            let payload = match build_request(object) {
                Ok(request) => serde_json::to_string(&schema.execute(request).await)
                    .unwrap_or_else(|_| "null".to_owned()),
                Err(message) => json!({"errors": [{"message": message}]}).to_string(),
            };
            let extra: Map<String, Value> = object
                .iter()
                .filter(|(key, _)| !matches!(key.as_str(), "query" | "variables" | "payload"))
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect();
            let extra = Value::Object(extra).to_string();
            let fields = extra
                .strip_prefix('{')
                .and_then(|rest| rest.strip_suffix('}'))
                .unwrap_or_default();
            let separator = if fields.is_empty() { "" } else { "," };
            results.push(format!("{{{fields}{separator}\"payload\":{payload}}}"));
        }
        return (
            [(CONTENT_TYPE, "application/json")],
            format!("[{}]", results.join(",")),
        )
            .into_response();
    }
    match build_request(&params.0) {
        Ok(request) => axum::Json(schema.execute(request).await).into_response(),
        Err(message) => json_error(StatusCode::BAD_REQUEST, &message),
    }
}

/// `POST /api/graphql`.
pub async fn owner(State(state): State<WebState>, params: Params) -> Response {
    execute(&state.schema, &params).await
}
