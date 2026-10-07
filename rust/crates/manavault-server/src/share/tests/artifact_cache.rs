//! The deck share preview artifact cache (the store's retention and
//! the cover fetcher are tested next to their modules).

use std::time::Duration;

use crate::share::preview::artifact_cache::{self, FingerprintOptions, PngError};
use crate::share::preview::renderer::RenderError;
use crate::share::preview::{DeckPreview, artifact_store, render_worker};
use crate::test_support::{TempDir, TestApp};

fn preview() -> DeckPreview {
    DeckPreview {
        token: None,
        deck_name: "Preview Deck".into(),
        image_alt: "Preview for Preview Deck".into(),
        // A data URI, so rendering never touches the network.
        cover_image_url: Some(
            "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"
                .into(),
        ),
        format_label: "Commander".into(),
        status_label: "Active".into(),
        card_count_label: "60 cards".into(),
        bracket_label: None,
        legality_label: "Legal".into(),
        price_label: Some("$1".into()),
        color_identity: vec!["W".into()],
    }
}

fn options() -> FingerprintOptions {
    FingerprintOptions::new("asset-v1")
}

async fn job_rows(app: &TestApp) -> Vec<(i64, String)> {
    sqlx::query_as("SELECT id, args FROM oban_jobs WHERE worker = ?1 ORDER BY id")
        .bind(render_worker::NAME)
        .fetch_all(app.db())
        .await
        .unwrap()
}

// "a cache miss queues one unique render job and reuses the artifact"
#[tokio::test]
async fn a_cache_miss_queues_one_unique_render_job_and_reuses_the_artifact() {
    let app = TestApp::with_config(|config| config.jobs_enabled = true).await;
    let state = app.state.clone();
    let preview = DeckPreview {
        token: Some(crate::decks::share_token::generate()),
        ..preview()
    };
    let caller = {
        let state = state.clone();
        let preview = preview.clone();
        tokio::spawn(async move { artifact_cache::png(&state, &preview).await })
    };
    let mut jobs = Vec::new();
    for _ in 0..100 {
        jobs = job_rows(&app).await;
        if !jobs.is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(jobs.len(), 1);
    let (job_id, args) = &jobs[0];
    let args: serde_json::Value = serde_json::from_str(args).unwrap();
    assert!(args["preview"].get("token").is_none());
    assert_eq!(args["preview"]["deck_name"], "Preview Deck");
    let fingerprint = args["fingerprint"].as_str().unwrap().to_owned();
    assert_eq!(
        fingerprint,
        artifact_cache::fingerprint(
            &preview,
            &FingerprintOptions::new(&state.config.asset_version)
        )
    );
    let duplicate = state.jobs.enqueue(render_worker::NAME, args).await.unwrap();
    assert_eq!(duplicate, *job_id);

    let drained = state.jobs.drain_queue(&state, "preview", false).await;
    assert_eq!(drained.success, 1);
    let png = caller.await.unwrap().unwrap();
    assert!(png.starts_with(b"\x89PNG"));

    assert_eq!(artifact_cache::png(&state, &preview).await.unwrap(), png);
    assert_eq!(job_rows(&app).await.len(), 1);
    assert_eq!(
        artifact_store::read(&state.config.share_preview_cache_dir, &fingerprint).unwrap(),
        png
    );
}

// "inline render failures return an error and the next request may retry"
#[tokio::test]
async fn inline_render_failures_return_an_error_and_the_next_request_retries() {
    let app = TestApp::new().await;
    assert!(!app.state.config.jobs_enabled);
    let cache_dir = app.state.config.share_preview_cache_dir.clone();
    // The store cannot be prepared while a file sits where its directory goes.
    let _ = std::fs::remove_dir_all(&cache_dir);
    std::fs::write(&cache_dir, "not a directory").unwrap();
    assert_eq!(
        artifact_cache::png(&app.state, &preview()).await,
        Err(PngError::RenderFailed)
    );
    std::fs::remove_file(&cache_dir).unwrap();
    let png = artifact_cache::png(&app.state, &preview()).await.unwrap();
    let fingerprint = artifact_cache::fingerprint(
        &preview(),
        &FingerprintOptions::new(&app.state.config.asset_version),
    );
    assert_eq!(artifact_store::read(&cache_dir, &fingerprint).unwrap(), png);
}

#[tokio::test]
async fn a_failed_queued_render_fails_the_waiting_request() {
    let app = TestApp::with_config(|config| config.jobs_enabled = true).await;
    let state = app.state.clone();
    let cache_dir = state.config.share_preview_cache_dir.clone();
    let _ = std::fs::remove_dir_all(&cache_dir);
    std::fs::write(&cache_dir, "not a directory").unwrap();
    let preview = DeckPreview {
        deck_name: "Failing Deck".into(),
        ..preview()
    };
    let caller = {
        let state = state.clone();
        tokio::spawn(async move { artifact_cache::png(&state, &preview).await })
    };
    for _ in 0..100 {
        if !job_rows(&app).await.is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let drained = state.jobs.drain_queue(&state, "preview", false).await;
    assert_eq!(drained.failure, 1);
    assert_eq!(caller.await.unwrap(), Err(PngError::RenderFailed));
}

// "the fingerprint changes for every byte-affecting preview and renderer input"
#[test]
fn the_fingerprint_changes_for_every_byte_affecting_input() {
    let base = preview();
    let fingerprint = artifact_cache::fingerprint(&base, &options());
    assert_eq!(fingerprint.len(), 64);
    assert_eq!(
        fingerprint,
        artifact_cache::fingerprint(&base.clone(), &options())
    );
    let changed = [
        DeckPreview {
            card_count_label: "61 cards".into(),
            ..base.clone()
        },
        DeckPreview {
            color_identity: vec!["U".into()],
            ..base.clone()
        },
        DeckPreview {
            cover_image_url: Some("https://cards.scryfall.io/another.png".into()),
            ..base.clone()
        },
        DeckPreview {
            deck_name: "Another Deck".into(),
            ..base.clone()
        },
        DeckPreview {
            format_label: "Modern".into(),
            ..base.clone()
        },
        DeckPreview {
            image_alt: "Another preview".into(),
            ..base.clone()
        },
        DeckPreview {
            bracket_label: Some("Bracket 3 · Pace 2".into()),
            ..base.clone()
        },
        DeckPreview {
            legality_label: "Illegal".into(),
            ..base.clone()
        },
        DeckPreview {
            price_label: Some("$2".into()),
            ..base.clone()
        },
        DeckPreview {
            status_label: "Archived".into(),
            ..base.clone()
        },
    ];
    for preview in changed {
        assert_ne!(
            artifact_cache::fingerprint(&preview, &options()),
            fingerprint
        );
    }
    let mut changed_options = Vec::new();
    for change in 0..4 {
        let mut options = options();
        match change {
            0 => options.asset_version = "asset-v2".into(),
            1 => options.assets_version = "symbols-v2".into(),
            2 => options.renderer_version = "rsvg-v2".into(),
            _ => options.source_version = "preview-v3".into(),
        }
        changed_options.push(options);
    }
    for options in changed_options {
        assert_ne!(artifact_cache::fingerprint(&base, &options), fingerprint);
    }
}

// "the fingerprint changes when the bearer token rotates"
#[test]
fn the_fingerprint_changes_when_the_token_rotates() {
    let base = DeckPreview {
        token: Some(crate::decks::share_token::generate()),
        ..preview()
    };
    let rotated = DeckPreview {
        token: Some(crate::decks::share_token::generate()),
        ..preview()
    };
    assert_ne!(
        artifact_cache::fingerprint(&base, &options()),
        artifact_cache::fingerprint(&rotated, &options())
    );
}

// "render startup removes stale partial artifacts"
#[tokio::test]
async fn render_startup_removes_stale_partial_artifacts() {
    let dir = TempDir::new();
    let stale = dir.path().join("orphan.png.tmp-interrupted");
    std::fs::write(&stale, "partial").unwrap();
    let fingerprint = artifact_cache::fingerprint(&preview(), &options());
    let result = render_worker::render_with(
        preview(),
        &fingerprint,
        dir.path(),
        500,
        |_| async { None },
        |_| async { Err(RenderError::RendererUnavailable) },
    )
    .await;
    assert!(matches!(
        result,
        Err(render_worker::RenderJobError::Render(
            RenderError::RendererUnavailable
        ))
    ));
    assert!(!stale.exists());
    assert!(artifact_store::read(dir.path(), &fingerprint).is_err());
}

#[tokio::test]
async fn render_embeds_the_fetched_cover_and_publishes_the_artifact() {
    let dir = TempDir::new();
    let fingerprint = artifact_cache::fingerprint(&preview(), &options());
    let png = render_worker::render_with(
        preview(),
        &fingerprint,
        dir.path(),
        500,
        |url| async move {
            assert!(url.unwrap().starts_with("data:image/svg+xml"));
            Some("data:image/png;base64,Y292ZXI=".to_owned())
        },
        |preview| async move {
            assert_eq!(
                preview.cover_image_url.as_deref(),
                Some("data:image/png;base64,Y292ZXI=")
            );
            Ok(format!("png:{}", preview.deck_name).into_bytes())
        },
    )
    .await
    .unwrap();
    assert_eq!(png, b"png:Preview Deck");
    assert_eq!(
        artifact_store::read(dir.path(), &fingerprint).unwrap(),
        b"png:Preview Deck"
    );
}
