//! Shares rendered preview PNGs (`DeckSharePreview.ArtifactCache`).
//!
//! A preview's fingerprint covers everything that changes the PNG bytes
//! (the drawn fields, the share token, and the asset, renderer, and source
//! versions). Completed artifacts are served from the store; a miss queues
//! one unique render job per fingerprint and waits for it.
//!
//! The fingerprint hashes canonical JSON, unlike earlier releases, so
//! artifacts they rendered are never reused; previews are rendered anew.

use std::time::Duration;

use serde_json::json;
use sha2::{Digest as _, Sha256};
use tokio::sync::broadcast::error::RecvError;

use super::render_worker::{self, NAME as RENDER_WORKER};
use super::{DeckPreview, IMAGE_HEIGHT, IMAGE_WIDTH, SOURCE_VERSION, artifact_store, renderer};
use manavault_core::state::AppState;

/// `@default_assets_version`.
pub const ASSETS_VERSION: &str = "scryfall-symbols-v1";
const AWAIT_TIMEOUT: Duration = Duration::from_secs(120);
const POLL_INTERVAL: Duration = Duration::from_millis(100);

/// Versions mixed into the fingerprint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FingerprintOptions {
    pub assets_version: String,
    pub asset_version: String,
    pub renderer_version: String,
    pub source_version: String,
}

impl FingerprintOptions {
    /// The defaults with the app's asset version.
    #[must_use]
    pub fn new(asset_version: &str) -> Self {
        Self {
            assets_version: ASSETS_VERSION.to_owned(),
            asset_version: asset_version.to_owned(),
            renderer_version: renderer::RENDERER_VERSION.to_owned(),
            source_version: SOURCE_VERSION.to_owned(),
        }
    }
}

/// `fingerprint/2`: lowercase hex SHA-256 of the canonical payload.
#[must_use]
pub fn fingerprint(preview: &DeckPreview, options: &FingerprintOptions) -> String {
    let payload = json!({
        "artifact_format": "png",
        "assets_version": options.assets_version,
        "asset_version": options.asset_version,
        "dimensions": {"height": IMAGE_HEIGHT, "width": IMAGE_WIDTH},
        "preview": {
            "token": preview.token,
            "card_count_label": preview.card_count_label,
            "color_identity": preview.color_identity,
            "cover_image_url": preview.cover_image_url,
            "deck_name": preview.deck_name,
            "format_label": preview.format_label,
            "image_alt": preview.image_alt,
            "bracket_label": preview.bracket_label,
            "legality_label": preview.legality_label,
            "price_label": preview.price_label,
            "status_label": preview.status_label,
        },
        "renderer_options": {
            "symbol_embedding": "data-uri",
            "version": options.renderer_version,
        },
        "source_version": options.source_version,
    });
    hex::encode(Sha256::digest(payload.to_string().as_bytes()))
}

/// Why no PNG could be served.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum PngError {
    #[error("enqueue_failed")]
    EnqueueFailed,
    #[error("render_failed")]
    RenderFailed,
    #[error("render_timeout")]
    RenderTimeout,
}

/// The render job's args: the preview without its token.
#[must_use]
pub fn job_args(preview: &DeckPreview, fingerprint: &str) -> serde_json::Value {
    let preview = DeckPreview {
        token: None,
        ..preview.clone()
    };
    json!({"fingerprint": fingerprint, "preview": preview})
}

/// `ArtifactCache.png/2`: the stored PNG, else a render.
///
/// With background jobs disabled nothing would run the queue, so the
/// request renders inline (like Oban's `:inline` testing mode).
pub async fn png(state: &AppState, preview: &DeckPreview) -> Result<Vec<u8>, PngError> {
    let fingerprint = fingerprint(
        preview,
        &FingerprintOptions::new(&state.config.asset_version),
    );
    let cache_dir = &state.config.share_preview_cache_dir;
    if let Ok(png) = artifact_store::read(cache_dir, &fingerprint) {
        return Ok(png);
    }
    if !state.config.jobs_enabled {
        return render_worker::render(
            state,
            DeckPreview {
                token: None,
                ..preview.clone()
            },
            &fingerprint,
        )
        .await
        .map_err(|error| {
            tracing::warn!(%error, "share preview render failed");
            PngError::RenderFailed
        });
    }
    enqueue_and_await(state, preview, &fingerprint).await
}

async fn enqueue_and_await(
    state: &AppState,
    preview: &DeckPreview,
    fingerprint: &str,
) -> Result<Vec<u8>, PngError> {
    let cache_dir = &state.config.share_preview_cache_dir;
    let mut rendered = render_worker::subscribe();
    if let Ok(png) = artifact_store::read(cache_dir, fingerprint) {
        return Ok(png);
    }
    if let Err(error) = state
        .jobs
        .enqueue(RENDER_WORKER, job_args(preview, fingerprint))
        .await
    {
        tracing::error!(%error, "could not queue a share preview render");
        return Err(PngError::EnqueueFailed);
    }
    let deadline = tokio::time::Instant::now() + AWAIT_TIMEOUT;
    loop {
        if let Ok(png) = artifact_store::read(cache_dir, fingerprint) {
            return Ok(png);
        }
        let now = tokio::time::Instant::now();
        if now >= deadline {
            return Err(PngError::RenderTimeout);
        }
        let wait = POLL_INTERVAL.min(deadline - now);
        match tokio::time::timeout(wait, rendered.recv()).await {
            Ok(Ok(notice)) if notice.fingerprint == fingerprint && !notice.ok => {
                return Err(PngError::RenderFailed);
            }
            Ok(Err(RecvError::Closed)) => tokio::time::sleep(wait).await,
            // Our success (read on the next turn), someone else's render,
            // a lagged receiver, or the poll interval.
            _ => {}
        }
    }
}
