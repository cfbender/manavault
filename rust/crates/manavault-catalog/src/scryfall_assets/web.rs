//! `GET /scryfall-assets/*path` (`ManavaultWeb.ScryfallAssetController`).

use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};

use manavault_core::state::AppState;

/// Serves a downloaded symbol or set SVG, or 404s.
pub async fn show(State(state): State<AppState>, Path(path): Path<String>) -> Response {
    let segments: Vec<&str> = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    let Some(file) = super::local_path(&state.config.scryfall_assets_dir, &segments) else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    match tokio::fs::read(&file).await {
        Ok(body) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "image/svg+xml"),
                (header::CACHE_CONTROL, "public, max-age=86400"),
            ],
            body,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}
