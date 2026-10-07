//! The `:browser` pipeline: `protect_from_forgery`,
//! `put_secure_browser_headers`, `Plugs.ContentSecurityPolicy`, and
//! `Plugs.CrossOriginIsolation` for the scanner page.

use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::params::{self, Params};
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

/// Phoenix's secure browser defaults plus the app's content security policy.
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

/// Whether a request's masked CSRF token (`_csrf_token` param or
/// `x-csrf-token` header) matches the session.
#[must_use]
pub fn csrf_token_valid(session: &Session, headers: &HeaderMap, params: &Params) -> bool {
    params
        .text("_csrf_token")
        .is_some_and(|token| session.csrf_valid(token))
        || headers
            .get_all("x-csrf-token")
            .iter()
            .filter_map(|value| value.to_str().ok())
            .any(|token| session.csrf_valid(token))
}

fn forbidden() -> Response {
    (
        StatusCode::FORBIDDEN,
        [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
        "Forbidden",
    )
        .into_response()
}

/// The `:browser` pipeline. Unsafe methods need a valid CSRF token
/// (`Plug.CSRFProtection` answers 403 otherwise); every response gets the
/// secure browser headers.
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
        let (request, params) = match params::parse(request).await {
            Ok(parsed) => parsed,
            Err(error) => return error.into_response(),
        };
        if !csrf_token_valid(&session, request.headers(), &params) {
            return forbidden();
        }
        request
    };
    let mut response = next.run(request).await;
    put_browser_headers(response.headers_mut(), state.config.vite_dev_server);
    response
}

/// `Plugs.CrossOriginIsolation`: lets the scanner run multi-threaded
/// WebAssembly (`SharedArrayBuffer`).
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
