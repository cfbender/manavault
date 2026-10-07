//! The browser pipeline: CSRF protection for form posts, secure browser
//! headers with the content security policy, and cross-origin isolation for
//! the scanner page.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::header::CONTENT_TYPE;
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::content_type_is;
use super::graphql::{BODY_LIMIT, csrf_header_valid};
use super::session::Session;
use crate::state::AppState;

const DEV_ORIGINS: &str = "http://localhost:5173 http://127.0.0.1:5173";

/// The content security policy (`ContentSecurityPolicy.policy/1`). The Vite
/// dev server additionally needs its origins, websocket, and `unsafe-eval`.
#[must_use]
pub fn content_security_policy(vite_dev: bool) -> String {
    let script_src = if vite_dev {
        format!("script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' {DEV_ORIGINS}")
    } else {
        "script-src 'self' 'wasm-unsafe-eval'".to_owned()
    };
    let connect_src = if vite_dev {
        format!(
            "connect-src 'self' https://api.github.com https://api.mtgstocks.com https://json-cloudflare.edhrec.com {DEV_ORIGINS} ws://localhost:* ws://127.0.0.1:* wss:"
        )
    } else {
        "connect-src 'self' https://api.github.com https://api.mtgstocks.com https://json-cloudflare.edhrec.com wss:".to_owned()
    };
    [
        "default-src 'self'".to_owned(),
        "base-uri 'self'".to_owned(),
        "object-src 'none'".to_owned(),
        "frame-ancestors 'self'".to_owned(),
        "form-action 'self'".to_owned(),
        script_src,
        "style-src 'self' 'unsafe-inline'".to_owned(),
        "img-src 'self' data: blob: https://*.scryfall.io https://*.scryfall.com https://*.edhrec.com https://*.recommander.cards".to_owned(),
        "font-src 'self' data:".to_owned(),
        connect_src,
        "worker-src 'self' blob:".to_owned(),
        "manifest-src 'self'".to_owned(),
        "media-src 'self' data: blob:".to_owned(),
    ]
    .join("; ")
}

fn put_if_absent(headers: &mut HeaderMap, name: &'static str, value: &str) {
    let name = HeaderName::from_static(name);
    if !headers.contains_key(&name)
        && let Ok(value) = HeaderValue::from_str(value)
    {
        headers.insert(name, value);
    }
}

/// Secure browser header defaults plus the app's content security policy.
pub fn put_browser_headers(headers: &mut HeaderMap, vite_dev: bool) {
    put_if_absent(
        headers,
        "content-security-policy",
        &content_security_policy(vite_dev),
    );
    put_if_absent(
        headers,
        "referrer-policy",
        "strict-origin-when-cross-origin",
    );
    put_if_absent(headers, "x-content-type-options", "nosniff");
    put_if_absent(headers, "x-permitted-cross-domain-policies", "none");
}

fn forbidden() -> Response {
    (
        StatusCode::FORBIDDEN,
        [(CONTENT_TYPE, "text/html; charset=utf-8")],
        "Forbidden",
    )
        .into_response()
}

/// Checks the CSRF token of an unsafe request: the `x-csrf-token` header or,
/// for a form post, its `_csrf_token` field. The body is buffered and handed
/// back for the handler to read again. The error is the status to answer
/// with: 403 for a missing or stale token, 413 for an oversized form.
async fn check_csrf(session: &Session, request: Request) -> Result<Request, StatusCode> {
    if csrf_header_valid(session, request.headers()) {
        return Ok(request);
    }
    if !content_type_is(request.headers(), "application/x-www-form-urlencoded") {
        return Err(StatusCode::FORBIDDEN);
    }
    let (parts, body) = request.into_parts();
    let bytes = axum::body::to_bytes(body, BODY_LIMIT)
        .await
        .map_err(|_| StatusCode::PAYLOAD_TOO_LARGE)?;
    let valid = url::form_urlencoded::parse(&bytes)
        .any(|(key, value)| key == "_csrf_token" && session.csrf_valid(&value));
    if valid {
        Ok(Request::from_parts(parts, Body::from(bytes)))
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

/// The browser pipeline. Unsafe methods need a valid CSRF token (403
/// otherwise); every response gets the secure browser headers.
pub async fn pipeline(
    State(state): State<AppState>,
    session: Session,
    request: Request,
    next: Next,
) -> Response {
    let request = if matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    ) {
        request
    } else {
        match check_csrf(&session, request).await {
            Ok(request) => request,
            Err(StatusCode::FORBIDDEN) => return forbidden(),
            Err(status) => return status.into_response(),
        }
    };
    let mut response = next.run(request).await;
    put_browser_headers(response.headers_mut(), state.config.vite_dev_server);
    response
}

/// Cross-origin isolation lets the scanner run multi-threaded WebAssembly
/// (`SharedArrayBuffer`).
pub async fn cross_origin_isolation(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "cross-origin-opener-policy",
        HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        "cross-origin-embedder-policy",
        HeaderValue::from_static("require-corp"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_policy_only_allows_vite_when_enabled() {
        let dev = content_security_policy(true);
        let prod = content_security_policy(false);
        assert!(
            dev.contains(
                "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' http://localhost:5173"
            )
        );
        assert!(dev.contains("ws://127.0.0.1:*"));
        assert!(prod.contains("script-src 'self' 'wasm-unsafe-eval';"));
        assert!(!prod.contains("'unsafe-eval'"));
        assert!(!prod.contains("5173"));
    }
}
