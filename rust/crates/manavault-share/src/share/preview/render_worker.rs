//! Renders one preview PNG into the artifact store on the `preview` queue,
//! then tells waiting requests.

use std::future::Future;
use std::path::Path;
use std::sync::LazyLock;
use std::time::Duration;

use serde::Deserialize;
use tokio::sync::broadcast;

use super::renderer::RenderError;
use super::{DeckPreview, artifact_store, cover_fetcher, renderer};
use manavault_core::jobs::{Job, Outcome, Unique, Worker};
use manavault_core::state::AppState;

/// The worker name stored in `jobs`.
pub const NAME: &str = "share_preview_render";

/// A finished render, broadcast to requests waiting for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rendered {
    pub fingerprint: String,
    pub ok: bool,
}

static RENDERED: LazyLock<broadcast::Sender<Rendered>> =
    LazyLock::new(|| broadcast::channel(256).0);

/// Listens for finished renders (`Oban.Notifier.listen(:preview_rendered)`).
#[must_use]
pub fn subscribe() -> broadcast::Receiver<Rendered> {
    RENDERED.subscribe()
}

fn notify(fingerprint: &str, ok: bool) {
    // Nobody may be listening; that is fine.
    let _ = RENDERED.send(Rendered {
        fingerprint: fingerprint.to_owned(),
        ok,
    });
}

/// Why a render failed.
#[derive(Debug, thiserror::Error)]
pub enum RenderJobError {
    #[error("artifact store: {0}")]
    Store(#[from] std::io::Error),
    #[error(transparent)]
    Render(#[from] RenderError),
}

/// `RenderWorker.render/3` with injectable cover fetching and rendering:
/// prepares the store, embeds the cover, renders, and publishes.
pub async fn render_with<C, CF, R, RF>(
    preview: DeckPreview,
    fingerprint: &str,
    cache_dir: &Path,
    max_artifacts: usize,
    cover_fetcher: C,
    renderer: R,
) -> Result<Vec<u8>, RenderJobError>
where
    C: FnOnce(Option<String>) -> CF,
    CF: Future<Output = Option<String>>,
    R: FnOnce(DeckPreview) -> RF,
    RF: Future<Output = Result<Vec<u8>, RenderError>>,
{
    artifact_store::prepare(cache_dir, max_artifacts)?;
    let cover_image_url = cover_fetcher(preview.cover_image_url.clone()).await;
    let png = renderer(DeckPreview {
        cover_image_url,
        ..preview
    })
    .await?;
    artifact_store::write(cache_dir, fingerprint, &png, max_artifacts)?;
    Ok(png)
}

/// `RenderWorker.render/2` with the configured store, the Scryfall cover
/// fetcher, and resvg; waiting requests are told how it went.
pub async fn render(
    state: &AppState,
    preview: DeckPreview,
    fingerprint: &str,
) -> Result<Vec<u8>, RenderJobError> {
    let assets_dir = state.config.scryfall_assets_dir.clone();
    let result = render_with(
        preview,
        fingerprint,
        &state.config.share_preview_cache_dir,
        artifact_store::DEFAULT_MAX_ARTIFACTS,
        |url| async move { cover_fetcher::prepare(url.as_deref()).await },
        |preview| async move { renderer::render(&preview, &assets_dir).await },
    )
    .await;
    notify(fingerprint, result.is_ok());
    result
}

#[derive(Deserialize)]
struct Args {
    fingerprint: String,
    preview: DeckPreview,
}

/// The worker.
pub struct RenderWorker;

impl Worker for RenderWorker {
    fn name(&self) -> &'static str {
        NAME
    }

    fn queue(&self) -> &'static str {
        "preview"
    }

    fn max_attempts(&self) -> i64 {
        3
    }

    /// Oban: `unique: [keys: [:fingerprint], states: :incomplete]`. The
    /// fingerprint covers every preview field in the args, so comparing
    /// whole args is the same rule.
    fn unique(&self) -> Option<Unique> {
        Some(Unique::WorkerArgs)
    }

    fn timeout(&self) -> Duration {
        Duration::from_secs(120)
    }

    async fn perform(&self, state: &AppState, job: &Job) -> Outcome {
        let Ok(Args {
            fingerprint,
            preview,
        }) = serde_json::from_value::<Args>(job.args.clone())
        else {
            return Outcome::Cancel("invalid preview job args".to_owned());
        };
        match render(
            state,
            DeckPreview {
                token: None,
                ..preview
            },
            &fingerprint,
        )
        .await
        {
            Ok(_) => Outcome::Done,
            Err(error) => Outcome::Retry(error.to_string()),
        }
    }
}
