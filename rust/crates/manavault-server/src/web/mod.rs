//! HTTP routes (`ManavaultWeb.Router`).

pub mod session;

use async_graphql::http::GraphQLPlaygroundConfig;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::State;
use axum::middleware::from_fn_with_state;
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};

use crate::graphql::AppSchema;
use crate::state::AppState;

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

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({"status": "ok"}))
}

async fn graphql(State(state): State<WebState>, request: GraphQLRequest) -> GraphQLResponse {
    state.schema.execute(request.into_inner()).await.into()
}

async fn graphiql() -> impl IntoResponse {
    Html(async_graphql::http::playground_source(
        GraphQLPlaygroundConfig::new("/api/graphql"),
    ))
}

/// Builds the router.
pub fn router(state: WebState) -> Router {
    let app = state.app.clone();
    let owner_graphql = Router::new()
        .route("/api/graphql", post(graphql).get(graphql))
        .route_layer(from_fn_with_state(app.clone(), session::require_api))
        .route_layer(axum::middleware::from_fn(session::require_csrf_post));

    let mut router = Router::new()
        .route("/health", get(health))
        .merge(owner_graphql);
    if app.config.env == crate::config::Env::Dev {
        router = router.route("/dev/graphiql", get(graphiql));
    }
    router
        .layer(from_fn_with_state(app, session::middleware))
        .with_state(state)
}
