//! `GET /api/graphql/ws`: GraphQL subscriptions over WebSocket
//! (`graphql-transport-ws`, with the older `graphql-ws` protocol also
//! accepted), served by `async-graphql-axum`.
//!
//! The upgrade needs an allowed `Origin` and, unless auth is disabled, the
//! owner's session cookie. The `connection_init` payload must then carry the
//! page's CSRF token as `csrfToken`; otherwise the socket closes
//! before any operation runs.

use std::time::Duration;

use async_graphql::Data;
use async_graphql_axum::{GraphQLProtocol, GraphQLWebSocket};
use axum::extract::State;
use axum::extract::ws::WebSocketUpgrade;
use axum::http::header::ORIGIN;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::Value;

use super::WebState;
use manavault_core::state::AppState;
use manavault_core::web::allowed_origins::OriginPolicy;
use manavault_core::web::session::{self, Session};

/// A socket that sends nothing (not even pings) for this long is closed.
const KEEPALIVE_TIMEOUT: Duration = Duration::from_secs(60);

fn origin_allowed(state: &AppState, headers: &HeaderMap) -> bool {
    let origin = headers.get(ORIGIN).and_then(|value| value.to_str().ok());
    match OriginPolicy::from_config(&state.config) {
        Ok(policy) if policy.allows(origin) => true,
        Ok(_) => {
            tracing::warn!(
                origin = origin.unwrap_or_default(),
                "refused a websocket from a disallowed origin"
            );
            false
        }
        Err(error) => {
            tracing::error!(%error, "invalid websocket origin configuration");
            false
        }
    }
}

/// Checks the `connection_init` payload: `csrfToken` must be the session's
/// token unless auth is disabled.
fn connection_init(
    state: &AppState,
    session: &Session,
    payload: &Value,
) -> async_graphql::Result<Data> {
    let token = payload.get("csrfToken").and_then(Value::as_str);
    if state.config.auth_disabled || token.is_some_and(|token| session.csrf_valid(token)) {
        Ok(Data::default())
    } else {
        Err(async_graphql::Error::new("Forbidden"))
    }
}

/// The upgrade handler.
pub async fn websocket(
    State(web): State<WebState>,
    session: Session,
    headers: HeaderMap,
    protocol: GraphQLProtocol,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !origin_allowed(&web.app, &headers) || !session::authenticated(&web.app, &session) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let state = web.app.clone();
    let schema = web.schema.clone();
    upgrade
        .protocols(async_graphql::http::ALL_WEBSOCKET_PROTOCOLS)
        .on_upgrade(move |socket| async move {
            GraphQLWebSocket::new(socket, schema, protocol)
                .on_connection_init(move |payload| async move {
                    connection_init(&state, &session, &payload)
                })
                .keepalive_timeout(KEEPALIVE_TIMEOUT)
                .serve()
                .await;
        })
}
