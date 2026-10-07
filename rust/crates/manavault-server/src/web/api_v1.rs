//! The personal, read-only API under `/api/v1`
//! (`Plugs.ApiKeyAuthentication`). Requests share the public request budget
//! and need `Authorization: Bearer mvk_...`; the authenticated
//! [`crate::api_keys::ApiKey`] is left in the request extensions.

use axum::Router;
use axum::extract::{Request, State};
use axum::http::header::{AUTHORIZATION, RETRY_AFTER};
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::{Next, from_fn_with_state};
use axum::response::{IntoResponse, Response};

use super::client_ip;
use super::rate_limit::Admission;
use crate::state::AppState;

fn error(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        axum::Json(serde_json::json!({"error": {"code": code, "message": message}})),
    )
        .into_response()
}

fn unauthorized() -> Response {
    error(
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "A valid Bearer API key is required",
    )
}

fn bearer_token(request: &Request) -> Option<String> {
    let mut values = request.headers().get_all(AUTHORIZATION).iter();
    let (Some(value), None) = (values.next(), values.next()) else {
        return None;
    };
    value
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
}

/// The middleware.
pub async fn authenticate(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let client_id = client_ip::for_request(&state.config, &request);
    if let Admission::RateLimited(retry_after) = state
        .public_requests
        .check(&state.config.public_share_rate_limit, &client_id)
    {
        let mut response = error(
            StatusCode::TOO_MANY_REQUESTS,
            "rate_limited",
            "Too many API requests",
        );
        response
            .headers_mut()
            .insert(RETRY_AFTER, HeaderValue::from(retry_after));
        return response;
    }
    let Some(token) = bearer_token(&request) else {
        return unauthorized();
    };
    match crate::api_keys::authenticate(&state.db, &token).await {
        Ok(Some(api_key)) => {
            request.extensions_mut().insert(api_key);
            next.run(request).await
        }
        Ok(None) => unauthorized(),
        Err(error) => {
            tracing::error!(%error, "API key lookup failed");
            unauthorized()
        }
    }
}

/// Placeholder for `GET /api/v1/decks` (`Api.V1.DeckController.index`).
async fn decks_placeholder() -> Response {
    error(
        StatusCode::NOT_IMPLEMENTED,
        "not_implemented",
        "The decks API is not available yet",
    )
}

/// The `/api/v1` routes.
pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    // TODO(decks): replace with the deck module's `DeckController.index` port.
    Router::new().route("/api/v1/decks", axum::routing::get(decks_placeholder))
}

/// Wraps `/api/v1` routes in the API key middleware.
pub fn scope<S: Clone + Send + Sync + 'static>(state: AppState, routes: Router<S>) -> Router<S> {
    routes.route_layer(from_fn_with_state(state, authenticate))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{TestApp, body_text};
    use axum::body::Body;
    use axum::routing::get;
    use tower::ServiceExt as _;

    async fn call(router: &Router, authorization: Option<&str>) -> Response {
        let mut builder = Request::get("/api/v1/ping");
        if let Some(value) = authorization {
            builder = builder.header("authorization", value);
        }
        router
            .clone()
            .oneshot(builder.body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn requires_a_valid_bearer_key_and_shares_the_budget() {
        let app =
            TestApp::with_config(|config| config.public_share_rate_limit.max_per_ip = 3).await;
        let (_key, token) = crate::api_keys::create(app.db(), "Test").await.unwrap();
        let router = scope(
            app.state.clone(),
            Router::new().route("/api/v1/ping", get(|| async { "pong" })),
        );
        let missing = call(&router, None).await;
        assert_eq!(missing.status(), 401);
        assert_eq!(
            body_text(missing).await,
            r#"{"error":{"code":"unauthorized","message":"A valid Bearer API key is required"}}"#
        );
        assert_eq!(call(&router, Some("Bearer mvk_wrong")).await.status(), 401);
        let ok = call(&router, Some(&format!("Bearer {token}"))).await;
        assert_eq!(body_text(ok).await, "pong");
        let limited = call(&router, Some(&format!("Bearer {token}"))).await;
        assert_eq!(limited.status(), 429);
        assert!(body_text(limited).await.contains("rate_limited"));
    }
}
