//! The personal, read-only API under `/api/v1`
//! (`Plugs.ApiKeyAuthentication`). Requests share the public request budget
//! and need `Authorization: Bearer mvk_...`; the authenticated
//! [`manavault_core::api_keys::ApiKey`] is left in the request extensions.

use axum::Router;
use std::collections::HashMap;

use axum::extract::{Query, Request, State};
use axum::http::header::{AUTHORIZATION, RETRY_AFTER};
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::{Next, from_fn_with_state};
use axum::response::{IntoResponse, Response};

use super::WebState;
use manavault_core::state::AppState;
use manavault_core::timestamp::Timestamp;
use manavault_core::web::client_ip;
use manavault_core::web::rate_limit::Admission;

fn error_response(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        axum::Json(serde_json::json!({"error": {"code": code, "message": message}})),
    )
        .into_response()
}

fn unauthorized() -> Response {
    error_response(
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
        let mut response = error_response(
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
    match manavault_core::api_keys::authenticate(&state.db, &token).await {
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

/// `page`/`per_page` query values (`positive_integer/2`): a positive
/// integer, else the default.
fn positive_integer(value: Option<&str>, default: i64) -> i64 {
    value
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|number| *number > 0)
        .unwrap_or(default)
}

/// One deck of `GET /api/v1/decks` (`DeckController.serialize_deck/2`).
/// Fields are in Jason's order for small maps (sorted keys).
#[derive(Debug, serde::Serialize)]
struct ApiDeck {
    #[serde(rename = "cardCount")]
    card_count: u32,
    #[serde(rename = "commanderColorIdentity")]
    commander_color_identity: Option<Vec<String>>,
    commanders: Vec<String>,
    format: &'static str,
    id: i64,
    name: String,
    public_share_url: Option<String>,
    publicly_shared: bool,
    updated_at: Timestamp,
}

#[derive(Debug, serde::Serialize)]
struct Pagination {
    page: i64,
    per_page: i64,
    total: i64,
    total_pages: i64,
}

#[derive(Debug, serde::Serialize)]
struct DeckIndex {
    data: Vec<ApiDeck>,
    pagination: Pagination,
}

const DEFAULT_PER_PAGE: i64 = 50;
const MAX_PER_PAGE: i64 = 100;

async fn deck_index(
    state: &AppState,
    query: &HashMap<String, String>,
) -> Result<DeckIndex, sqlx::Error> {
    let page = positive_integer(query.get("page").map(String::as_str), 1);
    let per_page = positive_integer(query.get("per_page").map(String::as_str), DEFAULT_PER_PAGE)
        .min(MAX_PER_PAGE);
    let total = manavault_collection::decks::records::count_decks(&state.db).await?;
    let offset = page.saturating_sub(1).saturating_mul(per_page);
    let decks =
        manavault_collection::decks::records::list_decks(&state.db, offset, per_page).await?;
    let ids: Vec<_> = decks.iter().map(|deck| deck.id).collect();
    let mut contents =
        manavault_collection::decks::contents::load_contents(&state.db, &ids).await?;
    let data = decks
        .into_iter()
        .map(|deck| {
            let contents = contents.remove(&deck.id).unwrap_or_default();
            let summary = contents.summary(deck.cover_deck_card_id);
            let public_share_url = deck.share_token.as_deref().map(|token| {
                manavault_core::web::app_shell::absolute_url(
                    state,
                    &format!(
                        "/share/decks/{}",
                        manavault_share::share::pages::encode_path_segment(token)
                    ),
                )
            });
            ApiDeck {
                card_count: summary.card_count,
                commander_color_identity: summary.commander_color_identity,
                commanders: contents
                    .cards
                    .iter()
                    .filter(|card| card.row.zone == lotus::Zone::Commander)
                    .map(|card| card.card.name.clone())
                    .collect(),
                format: deck.format.as_str(),
                id: deck.id.0,
                name: deck.name,
                publicly_shared: public_share_url.is_some(),
                public_share_url,
                updated_at: deck.updated_at,
            }
        })
        .collect();
    Ok(DeckIndex {
        data,
        pagination: Pagination {
            page,
            per_page,
            total,
            // `ceil(total / per_page)`.
            total_pages: (total + per_page - 1) / per_page,
        },
    })
}

/// `GET /api/v1/decks` (`Api.V1.DeckController.index`): the owner's decks
/// by name, paginated, with public share links built from the configured
/// URL (never the request's `Host`).
async fn decks(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    match deck_index(&state, &query).await {
        Ok(index) => axum::Json(index).into_response(),
        Err(error) => {
            tracing::error!(%error, "could not list decks for the API");
            error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Something went wrong",
            )
        }
    }
}

/// The `/api/v1` routes.
pub fn routes() -> Router<WebState> {
    Router::new().route("/api/v1/decks", axum::routing::get(decks))
}

/// Wraps `/api/v1` routes in the API key middleware.
pub fn scope<S: Clone + Send + Sync + 'static>(state: AppState, routes: Router<S>) -> Router<S> {
    routes.route_layer(from_fn_with_state(state, authenticate))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestApp;
    use axum::body::Body;
    use axum::routing::get;
    use manavault_core::testing::body_text;
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
        let (_key, token) = manavault_core::api_keys::create(app.db(), "Test")
            .await
            .unwrap();
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
