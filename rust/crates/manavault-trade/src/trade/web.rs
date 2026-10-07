//! The public want-list and trade-binder share pages
//! (`AppController.share_wants/2`, `share_binder/2`): the React shell for
//! the current, well-formed token, else an empty 404.

use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;

use crate::trade::share::{self, ShareKind};
use manavault_core::state::AppState;
use manavault_core::web::app_shell::{SharePreview, render_app};
use manavault_core::web::session::Session;

/// Adds `GET /share/wants/{token}` and `GET /share/binder/{token}` to the
/// `:browser` router.
pub fn routes<S>(router: Router<S>) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    AppState: axum::extract::FromRef<S>,
{
    router
        .route("/share/wants/{token}", get(share_wants))
        .route("/share/binder/{token}", get(share_binder))
}

async fn share_wants(
    State(state): State<AppState>,
    session: Session,
    uri: Uri,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> Response {
    render_valid_share(&state, &session, &uri, &headers, ShareKind::Wants, &token).await
}

async fn share_binder(
    State(state): State<AppState>,
    session: Session,
    uri: Uri,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> Response {
    render_valid_share(&state, &session, &uri, &headers, ShareKind::Binder, &token).await
}

async fn render_valid_share(
    state: &AppState,
    session: &Session,
    uri: &Uri,
    headers: &HeaderMap,
    kind: ShareKind,
    token: &str,
) -> Response {
    match share::matches(&state.db, kind, token).await {
        Ok(true) => {
            let preview = SharePreview::default_for(state, uri.path());
            render_app(state, session, headers, &preview).await
        }
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            tracing::error!(%error, "could not load the share token");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
