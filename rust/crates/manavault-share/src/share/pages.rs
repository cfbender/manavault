//! The shared deck page and its preview images (`AppController.share_deck`,
//! `share_deck_preview_image`, `share_deck_preview_png`). Each request
//! checks the token against the database again, so a rotated or disabled
//! share stops resolving everywhere at once.

use std::fmt::Write as _;

use axum::Router;
use axum::extract::{Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;

use super::preview::{DeckPage, IMAGE_HEIGHT, IMAGE_WIDTH, artifact_cache};
use crate::state::AppState;
use crate::web::app_shell::{SharePreview, absolute_url, render_app};
use crate::web::session::Session;

/// `GET /share/decks/{token}` (in the `:browser` pipeline).
pub fn browser_routes<S>(router: Router<S>) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    AppState: axum::extract::FromRef<S>,
{
    router.route("/share/decks/{token}", get(share_deck))
}

/// `GET /share/decks/{token}/preview.svg` and `preview.png` (no pipeline).
pub fn public_routes<S>(router: Router<S>) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    AppState: axum::extract::FromRef<S>,
{
    router
        .route("/share/decks/{token}/preview.svg", get(preview_svg))
        .route("/share/decks/{token}/preview.png", get(preview_png))
}

/// `encode_path_segment/1`: percent-encodes all but unreserved characters.
#[must_use]
pub fn encode_path_segment(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for byte in segment.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(char::from(byte));
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

/// `share_preview/2` for a deck: `None` for malformed, unknown, or revoked
/// tokens (malformed ones never query).
async fn deck_page(state: &AppState, token: &str) -> Result<Option<DeckPage>, sqlx::Error> {
    let Some(deck) = crate::decks::records::get_by_share_token(&state.db, token).await? else {
        return Ok(None);
    };
    let contents = crate::decks::contents::load_deck_contents(&state.db, deck.id).await?;
    Ok(Some(DeckPage::from_deck(
        &deck,
        &contents,
        &state.prices,
        token,
    )))
}

fn not_found() -> Response {
    StatusCode::NOT_FOUND.into_response()
}

fn server_error(error: &sqlx::Error) -> Response {
    tracing::error!(%error, "could not load the shared deck");
    StatusCode::INTERNAL_SERVER_ERROR.into_response()
}

async fn share_deck(
    State(state): State<AppState>,
    session: Session,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> Response {
    let page = match deck_page(&state, &token).await {
        Ok(Some(page)) => page,
        Ok(None) => return not_found(),
        Err(error) => return server_error(&error),
    };
    let encoded = encode_path_segment(&token);
    let preview = SharePreview {
        title: page.title,
        description: page.description,
        image_alt: Some(page.preview.image_alt),
        image_type: Some("image/png".to_owned()),
        image_url: Some(absolute_url(
            &state,
            &format!("/share/decks/{encoded}/preview.png"),
        )),
        image_width: Some(IMAGE_WIDTH),
        image_height: Some(IMAGE_HEIGHT),
        url: Some(absolute_url(&state, &format!("/share/decks/{encoded}"))),
    };
    render_app(&state, &session, &headers, &preview).await
}

async fn preview_svg(State(state): State<AppState>, Path(token): Path<String>) -> Response {
    match deck_page(&state, &token).await {
        Ok(Some(page)) => (
            [
                (CONTENT_TYPE, "image/svg+xml; charset=utf-8"),
                (CACHE_CONTROL, "public, max-age=300"),
            ],
            page.preview.svg(),
        )
            .into_response(),
        Ok(None) => not_found(),
        Err(error) => server_error(&error),
    }
}

async fn preview_png(State(state): State<AppState>, Path(token): Path<String>) -> Response {
    let page = match deck_page(&state, &token).await {
        Ok(Some(page)) => page,
        Ok(None) => return not_found(),
        Err(error) => return server_error(&error),
    };
    match artifact_cache::png(&state, &page.preview).await {
        Ok(png) => (
            [
                (CONTENT_TYPE, "image/png"),
                (CACHE_CONTROL, "public, max-age=300"),
            ],
            png,
        )
            .into_response(),
        Err(error) => {
            tracing::warn!(%error, "share preview PNG unavailable");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}
