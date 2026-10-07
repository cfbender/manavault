//! Web helpers shared by the routes of every crate: sessions, CSRF and
//! browser headers, the app shell, GraphQL over HTTP, and public request
//! admission.

pub mod allowed_origins;
pub mod app_shell;
pub mod asset_version;
pub mod browser;
pub mod client_ip;
pub mod graphql;
pub mod public_graphql;
pub mod rate_limit;
pub mod return_path;
pub mod session;

use axum::http::header::{CONTENT_TYPE, LOCATION};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};

use app_shell::escape;

/// Whether the request's `Content-Type` is `media_type` (parameters such as
/// `charset` aside).
#[must_use]
pub fn content_type_is(headers: &HeaderMap, media_type: &str) -> bool {
    headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|essence| essence.trim().eq_ignore_ascii_case(media_type))
}

/// A redirect to `path`: 302 with a small HTML body.
#[must_use]
pub fn redirect(to: &str) -> Response {
    let body = format!(
        "<html><body>You are being <a href=\"{}\">redirected</a>.</body></html>",
        escape(to)
    );
    let mut response = (
        StatusCode::FOUND,
        [(CONTENT_TYPE, "text/html; charset=utf-8")],
        body,
    )
        .into_response();
    if let Ok(location) = HeaderValue::from_str(to) {
        response.headers_mut().insert(LOCATION, location);
    }
    response
}
