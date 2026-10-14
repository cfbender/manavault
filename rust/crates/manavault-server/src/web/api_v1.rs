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
use utoipa::ToSchema;

use super::WebState;
use manavault_core::state::AppState;
use manavault_core::timestamp::Timestamp;
use manavault_core::web::client_ip;
use manavault_core::web::rate_limit::Admission;

/// The machine-readable `code` of an [`ApiError`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ApiErrorCode {
    /// The request had no usable `Authorization: Bearer mvk_...` key: missing,
    /// malformed, unknown, or revoked.
    Unauthorized,
    /// The client spent its share of the request budget; `Retry-After` says
    /// when the next attempt can succeed.
    RateLimited,
    /// The server could not answer the request.
    InternalError,
}

/// The `error` object every `/api/v1` failure returns.
#[derive(Debug, serde::Serialize, ToSchema)]
pub(crate) struct ApiError {
    error: ApiErrorBody,
}

#[derive(Debug, serde::Serialize, ToSchema)]
pub(crate) struct ApiErrorBody {
    /// Which failure this is.
    code: ApiErrorCode,
    /// A human-readable description; it is not stable enough to match on.
    message: String,
}

/// The messages the error responses carry. The document quotes them, so a
/// change here can never silently disagree with what the API answers.
pub(crate) const UNAUTHORIZED_MESSAGE: &str = "A valid Bearer API key is required";
pub(crate) const RATE_LIMITED_MESSAGE: &str = "Too many API requests";
pub(crate) const INTERNAL_ERROR_MESSAGE: &str = "Something went wrong";

fn error_response(status: StatusCode, code: ApiErrorCode, message: &str) -> Response {
    (
        status,
        axum::Json(ApiError {
            error: ApiErrorBody {
                code,
                message: message.to_owned(),
            },
        }),
    )
        .into_response()
}

fn unauthorized() -> Response {
    error_response(
        StatusCode::UNAUTHORIZED,
        ApiErrorCode::Unauthorized,
        UNAUTHORIZED_MESSAGE,
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
            ApiErrorCode::RateLimited,
            RATE_LIMITED_MESSAGE,
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
            // A lookup that fails is not a bad key: answering 401 would tell a
            // client holding a valid key to throw it away.
            tracing::error!(%error, "API key lookup failed");
            error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ApiErrorCode::InternalError,
                INTERNAL_ERROR_MESSAGE,
            )
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

/// The `page`/`per_page` query of `GET /api/v1/decks`.
///
/// Deserialized *from* the raw query map, so the extractor accepts exactly what
/// it accepted before the parameters were typed: a repeated parameter takes its
/// last value, and a missing, non-numeric, or non-positive value uses the
/// default rather than failing the request. The fields carry the same values
/// into the document, which is why the defaults and the cap live here and not
/// in prose.
#[derive(Debug, serde::Deserialize, utoipa::IntoParams)]
#[serde(from = "HashMap<String, String>")]
#[into_params(parameter_in = Query)]
pub(crate) struct PageQuery {
    /// 1-based page number. A missing value, a value that is not a positive
    /// integer, or a value below 1 all serve page 1.
    #[param(example = 1, default = 1, minimum = 1, required = false)]
    page: i64,
    /// Decks per page, capped at 100. A missing value, a value that is not a
    /// positive integer, or a value below 1 all use 50.
    #[param(
        example = 50,
        default = 50,
        minimum = 1,
        maximum = 100,
        required = false
    )]
    per_page: i64,
}

impl From<HashMap<String, String>> for PageQuery {
    fn from(query: HashMap<String, String>) -> Self {
        Self {
            page: positive_integer(query.get("page").map(String::as_str), 1),
            per_page: positive_integer(query.get("per_page").map(String::as_str), DEFAULT_PER_PAGE)
                .min(MAX_PER_PAGE),
        }
    }
}

/// One deck of `GET /api/v1/decks` (`DeckController.serialize_deck/2`).
/// Fields are in Jason's order for small maps (sorted keys).
#[derive(Debug, serde::Serialize, ToSchema)]
pub(crate) struct ApiDeck {
    /// How many cards the deck holds.
    #[serde(rename = "cardCount")]
    card_count: u32,
    /// The commander's color identity as WUBRG letters, `C` for a colorless
    /// commander, or `null` when the deck has no commander.
    #[serde(rename = "commanderColorIdentity")]
    commander_color_identity: Option<Vec<String>>,
    /// Commander names in the deterministic order the deck summary uses.
    commanders: Vec<String>,
    /// The deck's format.
    #[schema(value_type = String, example = "commander")]
    format: &'static str,
    /// The deck's id, stable for the life of the instance's database.
    id: i64,
    /// The deck's name.
    name: String,
    /// Absolute URL of the deck's public share page, or `null` when the deck
    /// is not shared. Built from the configured public host, never from the
    /// request's `Host` header.
    public_share_url: Option<String>,
    /// Whether the deck has a public share link.
    publicly_shared: bool,
    /// When the deck last changed, second-precision UTC
    /// (`YYYY-MM-DDTHH:MM:SSZ`).
    #[schema(value_type = String, format = DateTime, example = "2026-09-20T14:32:10Z")]
    updated_at: Timestamp,
}

/// The `pagination` object of [`DeckIndex`]. `per_page` is the page size the
/// server actually used, so it reflects the 100 cap.
#[derive(Debug, serde::Serialize, ToSchema)]
pub(crate) struct Pagination {
    /// The 1-based page number that was served.
    page: i64,
    /// The page size that was used.
    per_page: i64,
    /// How many decks the instance owns in total.
    total: i64,
    /// `total` divided by `per_page`, rounded up.
    total_pages: i64,
}

/// The body of a successful `GET /api/v1/decks`.
#[derive(Debug, serde::Serialize, ToSchema)]
pub(crate) struct DeckIndex {
    /// The decks of this page, ordered by name and then id.
    data: Vec<ApiDeck>,
    pagination: Pagination,
}

const DEFAULT_PER_PAGE: i64 = 50;
const MAX_PER_PAGE: i64 = 100;

async fn deck_index(state: &AppState, query: &PageQuery) -> Result<DeckIndex, sqlx::Error> {
    let page = query.page;
    let per_page = query.per_page;
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
#[utoipa::path(
    get,
    path = "/api/v1/decks",
    tag = "Decks",
    operation_id = "listDecks",
    summary = "List the instance owner's decks",
    description = "Returns the decks owned by this ManaVault instance, ordered by name and \
                   then by id, with a public share link wherever the deck has one. The \
                   `pagination` object reports the page and page size that were actually used.",
    params(PageQuery),
    security(("bearer_auth" = [])),
    responses(
        (
            status = 200,
            description = "The requested page of decks.",
            body = DeckIndex,
            content_type = "application/json",
            examples(
                (
                    "Shared commander deck" = (
                        summary = "A publicly shared deck with a commander",
                        value = json!({
                            "data": [
                                {
                                    "cardCount": 100,
                                    "commanderColorIdentity": ["U", "B", "G"],
                                    "commanders": ["Muldrotha, the Gravetide"],
                                    "format": "commander",
                                    "id": 42,
                                    "name": "Muldrotha Reanimator",
                                    "public_share_url": "https://manavault.example.com/share/decks/AbCdEf123456",
                                    "publicly_shared": true,
                                    "updated_at": "2026-09-20T14:32:10Z"
                                }
                            ],
                            "pagination": {
                                "page": 1,
                                "per_page": 50,
                                "total": 1,
                                "total_pages": 1
                            }
                        })
                    )
                ),
                (
                    "Private deck without a commander" = (
                        summary = "An unshared deck: no commander and no share link",
                        value = json!({
                            "data": [
                                {
                                    "cardCount": 60,
                                    "commanderColorIdentity": null,
                                    "commanders": [],
                                    "format": "modern",
                                    "id": 7,
                                    "name": "Burn",
                                    "public_share_url": null,
                                    "publicly_shared": false,
                                    "updated_at": "2026-08-02T09:15:00Z"
                                }
                            ],
                            "pagination": {
                                "page": 1,
                                "per_page": 50,
                                "total": 2,
                                "total_pages": 1
                            }
                        })
                    )
                ),
                (
                    "Commander deck without a share link" = (
                        summary = "A deck that has commanders but is not shared",
                        value = json!({
                            "data": [
                                {
                                    "cardCount": 99,
                                    "commanderColorIdentity": ["R", "G"],
                                    "commanders": ["Atla Palani, Nest Tender"],
                                    "format": "commander",
                                    "id": 12,
                                    "name": "Atla Palani Eggs",
                                    "public_share_url": null,
                                    "publicly_shared": false,
                                    "updated_at": "2026-09-01T08:05:44Z"
                                }
                            ],
                            "pagination": {
                                "page": 1,
                                "per_page": 50,
                                "total": 3,
                                "total_pages": 1
                            }
                        })
                    )
                ),
                (
                    "Empty list" = (
                        summary = "An instance that owns no decks yet",
                        value = json!({
                            "data": [],
                            "pagination": {
                                "page": 1,
                                "per_page": 50,
                                "total": 0,
                                "total_pages": 0
                            }
                        })
                    )
                )
            )
        ),
        (
            status = 401,
            description = "The `Authorization` header is missing, is not a single \
                           `Bearer mvk_...` credential, or names a key that is unknown or \
                           revoked.",
            body = ApiError,
            content_type = "application/json",
            example = json!({
                "error": {
                    "code": "unauthorized",
                    "message": UNAUTHORIZED_MESSAGE
                }
            })
        ),
        (
            status = 429,
            description = "This client, or the instance as a whole, spent the shared request \
                           budget. `Retry-After` holds the whole number of seconds to wait.",
            body = ApiError,
            content_type = "application/json",
            headers(("Retry-After" = u64, description = "Seconds until the next attempt can succeed.")),
            example = json!({
                "error": {
                    "code": "rate_limited",
                    "message": RATE_LIMITED_MESSAGE
                }
            })
        ),
        (
            status = 500,
            description = "The server could not complete the request: it could not look the \
                           key up, or it could not read the deck list.",
            body = ApiError,
            content_type = "application/json",
            example = json!({
                "error": {
                    "code": "internal_error",
                    "message": INTERNAL_ERROR_MESSAGE
                }
            })
        )
    )
)]
async fn decks(State(state): State<AppState>, Query(query): Query<PageQuery>) -> Response {
    match deck_index(&state, &query).await {
        Ok(index) => axum::Json(index).into_response(),
        Err(error) => {
            tracing::error!(%error, "could not list decks for the API");
            error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ApiErrorCode::InternalError,
                INTERNAL_ERROR_MESSAGE,
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

    /// A database that cannot answer the key lookup is a server failure, not a
    /// bad key: a client that reads 401 would throw away a valid key.
    #[tokio::test]
    async fn a_failed_key_lookup_is_a_500_and_not_a_401() {
        let app = TestApp::new().await;
        let (_key, token) = manavault_core::api_keys::create(app.db(), "Test")
            .await
            .unwrap();
        let router = scope(
            app.state.clone(),
            Router::new().route("/api/v1/ping", get(|| async { "pong" })),
        );
        app.db().close().await;

        let response = call(&router, Some(&format!("Bearer {token}"))).await;
        assert_eq!(response.status(), 500);
        assert_eq!(
            body_text(response).await,
            r#"{"error":{"code":"internal_error","message":"Something went wrong"}}"#
        );
    }

    /// The handler's own failure path. The auth layer runs first, so a closed
    /// pool never reaches here in a full-router test; routing to `decks`
    /// directly is what exercises the response it returns.
    #[tokio::test]
    async fn a_database_failure_while_listing_decks_is_a_500() {
        let app = TestApp::new().await;
        let router = Router::new()
            .route("/api/v1/decks", get(decks))
            .with_state(app.state.clone());
        app.db().close().await;

        let response = router
            .oneshot(Request::get("/api/v1/decks").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), 500);
        assert_eq!(
            body_text(response).await,
            r#"{"error":{"code":"internal_error","message":"Something went wrong"}}"#
        );
    }

    /// `positive_integer/2` as the query type applies it: a value that is not a
    /// positive integer falls back to the default, and `per_page` is capped.
    #[test]
    fn page_query_falls_back_to_the_defaults() {
        let query = |raw: &[(&str, &str)]| {
            let map: HashMap<String, String> = raw
                .iter()
                .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
                .collect();
            PageQuery::from(map)
        };

        let defaults = query(&[]);
        assert_eq!((defaults.page, defaults.per_page), (1, 50));
        for page in ["", "abc", "0", "-4", "99999999999999999999", "1.5"] {
            assert_eq!(query(&[("page", page)]).page, 1, "page={page}");
        }
        for per_page in ["", "abc", "0", "-4", "99999999999999999999"] {
            assert_eq!(
                query(&[("per_page", per_page)]).per_page,
                50,
                "per_page={per_page}"
            );
        }
        assert_eq!(query(&[("page", "7"), ("per_page", "3")]).page, 7);
        assert_eq!(query(&[("page", "7"), ("per_page", "3")]).per_page, 3);
        assert_eq!(query(&[("per_page", "500")]).per_page, 100);
        // A repeated parameter takes its last value, as the raw map did.
        assert_eq!(query(&[("per_page", "1"), ("per_page", "2")]).per_page, 2);
    }
}
