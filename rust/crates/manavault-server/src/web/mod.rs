//! HTTP routes.
//!
//! Layers, outermost first: static files, request ids and request logging,
//! the cookie session, then per-scope pipelines (browser headers and CSRF,
//! owner authentication, GraphQL CSRF protection, API keys, scanner export
//! auth).

pub mod api_v1;
pub mod auth_controller;
pub mod pwa;
pub mod request_id;
pub mod share;
pub mod static_files;
pub mod subscriptions;
pub mod vendor;

#[cfg(test)]
mod tests;

use async_graphql::http::GraphQLPlaygroundConfig;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::header::ACCEPT;
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{from_fn, from_fn_with_state};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};

use manavault_core::state::AppState;
use manavault_core::web::{app_shell, browser, graphql, public_graphql, session};
use manavault_system::scanner;

use crate::graphql::AppSchema;

/// State for routes that need the schema as well as the app.
#[derive(Clone)]
pub struct WebState {
    pub app: AppState,
    pub schema: AppSchema,
}

impl axum::extract::FromRef<WebState> for AppState {
    fn from_ref(state: &WebState) -> Self {
        state.app.clone()
    }
}

/// `POST /api/graphql`.
async fn owner_graphql(
    State(state): State<WebState>,
    request: graphql::GraphQLRequest,
) -> Json<async_graphql::Response> {
    Json(state.schema.execute(request.into_inner()).await)
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({"status": "ok"}))
}

async fn graphiql() -> impl IntoResponse {
    Html(async_graphql::http::playground_source(
        GraphQLPlaygroundConfig::new("/api/graphql"),
    ))
}

/// The 404 page for unknown routes, as JSON or HTML.
async fn not_found(headers: HeaderMap) -> Response {
    let wants_json = headers
        .get(ACCEPT)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|accept| accept.contains("json"));
    if wants_json {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"errors": {"detail": "Not Found"}})),
        )
            .into_response()
    } else {
        (StatusCode::NOT_FOUND, "Not Found").into_response()
    }
}

/// Builds the router.
pub fn router(state: WebState) -> Router {
    let app = state.app.clone();
    let browser = from_fn_with_state(app.clone(), browser::pipeline);
    let owner_page = from_fn_with_state(app.clone(), session::require_browser);
    let owner_api = from_fn_with_state(app.clone(), session::require_api);

    // PWA files, share previews, and the subscription websocket (which checks
    // the origin and session itself), outside any pipeline.
    let mut public = Router::new()
        .route("/site.webmanifest", get(pwa::manifest))
        .route("/sw.js", get(pwa::service_worker))
        .route("/.well-known/assetlinks.json", get(pwa::asset_links))
        .route("/api/graphql/ws", get(subscriptions::websocket));
    public = share::public_routes(public);

    // The browser pipeline without owner authentication.
    let public_browser = share::browser_routes(
        Router::new()
            .route(
                "/login",
                get(auth_controller::new).post(auth_controller::create),
            )
            .route(
                "/vendors/star-city-games/deck-builder",
                post(vendor::star_city_games),
            )
            .route(
                "/scryfall-assets/{*path}",
                get(manavault_catalog::scryfall_assets::web::show),
            ),
    )
    .route_layer(browser.clone());

    // Owner pages.
    let mut owner_pages = Router::new();
    for path in [
        "/",
        "/settings",
        "/cards",
        "/cards/{id}",
        "/decks",
        "/decks/{id}",
        "/decks/{id}/playtest",
        "/collection",
        "/collection/new",
        "/collection/locations/{id}",
        "/collection/{id}/edit",
        "/trade",
    ] {
        owner_pages = owner_pages.route(path, get(app_shell::index));
    }
    let owner_pages = owner_pages
        .route("/logout", post(auth_controller::delete))
        .route_layer(owner_page.clone())
        .route_layer(browser.clone());

    // The scanner is the one cross-origin isolated page.
    let scan_page = Router::new()
        .route("/scan", get(app_shell::index))
        .route_layer(from_fn(browser::cross_origin_isolation))
        .route_layer(owner_page)
        .route_layer(browser);

    // Owner JSON endpoints: the session plus the page's CSRF token.
    let owner_graphql = Router::new()
        .route("/api/graphql", post(owner_graphql))
        .route(
            "/api/scanner/corrections",
            post(scanner::http::create_correction),
        )
        .route_layer(from_fn(graphql::csrf))
        .route_layer(from_fn(graphql::require_json))
        .route_layer(owner_api.clone());

    // Scanner correction export: the session or the export token.
    let scanner_export = Router::new()
        .route(
            "/api/scanner/corrections",
            get(scanner::http::index_corrections),
        )
        .route(
            "/api/scanner/corrections/{id}/crop",
            get(scanner::http::crop),
        )
        .route_layer(from_fn_with_state(app.clone(), scanner::http::export_auth));

    // Owner-only scanner bundle downloads.
    let scanner_read = Router::new()
        .route("/api/scanner/bundle", get(scanner::http::show))
        .route(
            "/api/scanner/bundles/{version}/{name}",
            get(scanner::http::file),
        )
        .route_layer(owner_api);

    let mut router = Router::new()
        .route("/health", get(health))
        .merge(public)
        .merge(public_browser)
        .merge(owner_pages)
        .merge(scan_page)
        .merge(owner_graphql)
        .merge(scanner_export)
        .merge(scanner_read);
    // `/api/v1`, personal API keys.
    router = router.merge(api_v1::scope(app.clone(), api_v1::routes()));
    router = router.route(
        "/share/graphql",
        share::graphql_route()
            .route_layer(from_fn(graphql::require_json))
            .route_layer(from_fn_with_state(app.clone(), public_graphql::admit)),
    );
    if app.config.env == manavault_core::config::Env::Dev {
        router = router.route("/dev/graphiql", get(graphiql));
    }
    router
        .fallback(not_found)
        .layer(DefaultBodyLimit::max(graphql::BODY_LIMIT))
        .layer(from_fn_with_state(app.clone(), session::middleware))
        .layer(from_fn(request_id::layer))
        .layer(from_fn_with_state(app, static_files::middleware))
        .with_state(state)
}
