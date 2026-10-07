//! GraphQL over HTTP: one JSON request per `POST`, parsed by
//! `async-graphql-axum`, with JSON error bodies.
//!
//! [`require_json`] refuses other bodies (415) before they are read, and
//! [`csrf`] guards the owner endpoint with the page's CSRF token in the
//! `x-csrf-token` header, in every authentication mode.

use async_graphql::ParseRequestError;
use axum::extract::Request;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::content_type_is;
use super::session::Session;

/// The size limit for request bodies (8 MB; scanner corrections carry a JPEG).
pub const BODY_LIMIT: usize = 8_000_000;

/// A GraphQL request from a JSON `POST` body.
pub type GraphQLRequest = async_graphql_axum::GraphQLRequest<Rejection>;

/// A JSON `{"errors": [{"message": ..}]}` response.
#[must_use]
pub fn json_error(status: StatusCode, message: &str) -> Response {
    (
        status,
        axum::Json(serde_json::json!({"errors": [{"message": message}]})),
    )
        .into_response()
}

/// Why a request body was not a GraphQL request.
#[derive(Debug)]
pub struct Rejection(pub ParseRequestError);

impl From<ParseRequestError> for Rejection {
    fn from(error: ParseRequestError) -> Self {
        Self(error)
    }
}

impl IntoResponse for Rejection {
    fn into_response(self) -> Response {
        let status = match self.0 {
            ParseRequestError::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            _ => StatusCode::BAD_REQUEST,
        };
        json_error(status, &self.0.to_string())
    }
}

/// Whether the method carries no body and needs no CSRF token; the route
/// answers 405 for those.
fn safe_method(request: &Request) -> bool {
    matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    )
}

/// Middleware: only `application/json` bodies.
pub async fn require_json(request: Request, next: Next) -> Response {
    if safe_method(&request) || content_type_is(request.headers(), "application/json") {
        next.run(request).await
    } else {
        json_error(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Expected an application/json request body",
        )
    }
}

/// Whether an `x-csrf-token` header carries the session's token.
#[must_use]
pub fn csrf_header_valid(session: &Session, headers: &HeaderMap) -> bool {
    headers
        .get_all("x-csrf-token")
        .iter()
        .filter_map(|value| value.to_str().ok())
        .any(|token| session.csrf_valid(token))
}

/// Middleware: a valid `x-csrf-token` header on every request with a body.
pub async fn csrf(session: Session, request: Request, next: Next) -> Response {
    if safe_method(&request) || csrf_header_valid(&session, request.headers()) {
        next.run(request).await
    } else {
        json_error(StatusCode::FORBIDDEN, "Invalid CSRF token")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::header::CONTENT_TYPE;

    fn headers(content_type: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, content_type.parse().unwrap());
        headers
    }

    #[test]
    fn only_json_media_types_count_as_json() {
        let json = |headers: &HeaderMap| content_type_is(headers, "application/json");
        assert!(json(&headers("application/json")));
        assert!(json(&headers("Application/JSON; charset=utf-8")));
        assert!(!json(&headers("application/graphql-response+json")));
        assert!(!json(&headers("application/x-www-form-urlencoded")));
        assert!(!json(&headers("multipart/form-data; boundary=x")));
        assert!(!json(&HeaderMap::new()));
    }
}
