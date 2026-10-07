//! Downloads new scanner bundles (`Manavault.Scanner.BundleUpdateWorker`),
//! at boot and every six hours, from the newest `scanner-bundle-*` GitHub
//! release or a direct `.../manifest.json` URL (`SCANNER_BUNDLE_SOURCE`).

use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use serde_json::Value;

use super::bundle;
use crate::config::ScannerBundleSource;
use crate::jobs::{Job, Outcome, Unique, Worker};
use crate::state::AppState;

/// What a check did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Status {
    Disabled,
    NoRelease,
    Current,
    Installed,
}

/// Why a check failed.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum UpdateError {
    #[error("invalid_source")]
    InvalidSource,
    #[error("invalid_release_response")]
    InvalidReleaseResponse,
    #[error("manifest_asset_missing")]
    ManifestAssetMissing,
    #[error("invalid_manifest")]
    InvalidManifest,
    #[error("http_error {0}")]
    Http(u16),
    #[error("request failed: {0}")]
    Request(String),
    #[error("asset_missing {0}")]
    AssetMissing(String),
    #[error("download_failed {0}: {1}")]
    DownloadFailed(String, Box<UpdateError>),
    #[error("install failed: {0}")]
    Install(#[from] bundle::InstallError),
    #[error("io: {0}")]
    Io(String),
}

enum Source {
    Off,
    Github,
    Direct(url::Url),
}

fn source(config: &ScannerBundleSource) -> Result<Source, UpdateError> {
    match config {
        ScannerBundleSource::Off => Ok(Source::Off),
        ScannerBundleSource::Github => Ok(Source::Github),
        ScannerBundleSource::Url(value) => match value.trim() {
            "" | "off" | "disabled" => Ok(Source::Off),
            "github" => Ok(Source::Github),
            value => url::Url::parse(value)
                .ok()
                .filter(|url| {
                    matches!(url.scheme(), "http" | "https")
                        && url.path().ends_with("/manifest.json")
                })
                .map(Source::Direct)
                .ok_or(UpdateError::InvalidSource),
        },
    }
}

async fn get(state: &AppState, url: &str) -> Result<reqwest::Response, UpdateError> {
    let response = state
        .http
        .get(url)
        .header("user-agent", "ManaVault scanner bundle updater")
        .timeout(Duration::from_secs(5 * 60))
        .send()
        .await
        .map_err(|error| UpdateError::Request(error.to_string()))?;
    if response.status().is_success() {
        Ok(response)
    } else {
        Err(UpdateError::Http(response.status().as_u16()))
    }
}

async fn get_json(state: &AppState, url: &str) -> Result<Value, UpdateError> {
    let bytes = get(state, url)
        .await?
        .bytes()
        .await
        .map_err(|error| UpdateError::Request(error.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|error| UpdateError::Request(error.to_string()))
}

async fn download(state: &AppState, url: &str, destination: &Path) -> Result<(), UpdateError> {
    use tokio::io::AsyncWriteExt as _;
    let mut response = get(state, url).await?;
    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|error| UpdateError::Io(error.to_string()))?;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| UpdateError::Request(error.to_string()))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|error| UpdateError::Io(error.to_string()))?;
    }
    file.flush()
        .await
        .map_err(|error| UpdateError::Io(error.to_string()))
}

fn latest_scanner_release(releases: &Value) -> Result<Option<&Value>, UpdateError> {
    let releases = releases
        .as_array()
        .ok_or(UpdateError::InvalidReleaseResponse)?;
    let mut best: Option<(&str, &Value)> = None;
    for release in releases {
        let draft = release.get("draft") == Some(&Value::Bool(true));
        let tag = release
            .get("tag_name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if draft || !tag.starts_with("scanner-bundle-") {
            continue;
        }
        let published = release
            .get("published_at")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if best.is_none_or(|(best_published, _)| published > best_published) {
            best = Some((published, release));
        }
    }
    Ok(best.map(|(_, release)| release))
}

async fn update_from_github(state: &AppState) -> Result<Status, UpdateError> {
    let releases = get_json(state, &state.config.platform_urls.scanner_releases).await?;
    let Some(release) = latest_scanner_release(&releases)? else {
        return Ok(Status::NoRelease);
    };
    let assets: HashMap<String, String> = release
        .get("assets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|asset| {
            Some((
                asset.get("name")?.as_str()?.to_owned(),
                asset.get("browser_download_url")?.as_str()?.to_owned(),
            ))
        })
        .collect();
    let manifest_url = assets
        .get("manifest.json")
        .cloned()
        .ok_or(UpdateError::ManifestAssetMissing)?;
    let manifest_url =
        url::Url::parse(&manifest_url).map_err(|_| UpdateError::ManifestAssetMissing)?;
    update_from_manifest(state, &manifest_url, Some(&assets)).await
}

async fn update_from_manifest(
    state: &AppState,
    url: &url::Url,
    assets: Option<&HashMap<String, String>>,
) -> Result<Status, UpdateError> {
    let manifest = get_json(state, url.as_str()).await?;
    let (Some(version), Some(files)) = (
        manifest.get("version").and_then(Value::as_str),
        manifest.get("files").and_then(Value::as_object),
    ) else {
        return Err(UpdateError::InvalidManifest);
    };
    let root = &state.config.scanner_bundle_dir;
    let current = bundle::current_manifest(root)
        .and_then(|current| current.get("version")?.as_str().map(str::to_owned));
    if current.as_deref() == Some(version) {
        return Ok(Status::Current);
    }
    let incoming = root.join(".incoming").join(format!(
        "{version}-{}",
        hex::encode(crate::crypto::random_bytes::<6>())
    ));
    let mut names: Vec<String> = files.keys().cloned().collect();
    names.push("SHA256SUMS".to_owned());
    let result = async {
        tokio::fs::create_dir_all(&incoming)
            .await
            .map_err(|error| UpdateError::Io(error.to_string()))?;
        tokio::fs::write(incoming.join("manifest.json"), manifest.to_string())
            .await
            .map_err(|error| UpdateError::Io(error.to_string()))?;
        for name in &names {
            let file_url = match assets {
                Some(assets) => assets.get(name).cloned(),
                None => url.join(name).ok().map(String::from),
            };
            let Some(file_url) = file_url else {
                return Err(UpdateError::AssetMissing(name.clone()));
            };
            // Earlier releases wrote any manifest file name under the incoming directory
            // before verifying it, so `../` names escape it; refuse them first.
            if !bundle::FILES.contains(&name.as_str()) {
                return Err(UpdateError::Install(bundle::InstallError::InvalidFile(
                    name.clone(),
                )));
            }
            download(state, &file_url, &incoming.join(name))
                .await
                .map_err(|error| UpdateError::DownloadFailed(name.clone(), Box::new(error)))?;
        }
        bundle::install(root, &manifest, &incoming)?;
        Ok(Status::Installed)
    }
    .await;
    let _ = tokio::fs::remove_dir_all(&incoming).await;
    result
}

/// Checks the configured source and installs a newer bundle.
pub async fn check_for_update(state: &AppState) -> Result<Status, UpdateError> {
    match source(&state.config.scanner_bundle_source)? {
        Source::Off => Ok(Status::Disabled),
        Source::Github => update_from_github(state).await,
        Source::Direct(url) => update_from_manifest(state, &url, None).await,
    }
}

pub struct BundleUpdateWorker;

/// The worker name stored in `jobs`.
pub const WORKER: &str = "scanner_bundle";

impl Worker for BundleUpdateWorker {
    fn name(&self) -> &'static str {
        WORKER
    }

    fn queue(&self) -> &'static str {
        "catalog"
    }

    fn max_attempts(&self) -> i64 {
        3
    }

    fn unique(&self) -> Option<Unique> {
        Some(Unique::Worker)
    }

    fn timeout(&self) -> Duration {
        Duration::from_secs(15 * 60)
    }

    async fn perform(&self, state: &AppState, _job: &Job) -> Outcome {
        match check_for_update(state).await {
            Ok(Status::Installed) => {
                tracing::info!("Scanner bundle update installed");
                Outcome::Done
            }
            Ok(_) => Outcome::Done,
            Err(error) => {
                tracing::warn!("Scanner bundle update failed: {error}");
                Outcome::Retry(error.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::bundle::tests::sha;
    use crate::test_support::TestApp;
    use serde_json::json;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn bodies() -> [(&'static str, &'static str); 4] {
        [
            ("arts.json", "[]"),
            ("detector.onnx", "d"),
            ("embed.onnx", "e"),
            ("search.onnx", "s"),
        ]
    }

    fn manifest(version: &str) -> Value {
        json!({
            "version": version,
            "created": "now",
            "files": bodies().iter().map(|(name, body)| {
                ((*name).to_owned(), json!({"bytes": body.len(), "sha256": sha(body)}))
            }).collect::<serde_json::Map<_, _>>()
        })
    }

    async fn serve_files(server: &MockServer, prefix: &str, manifest: &Value) {
        Mock::given(method("GET"))
            .and(path(format!("{prefix}/manifest.json")))
            .respond_with(ResponseTemplate::new(200).set_body_string(manifest.to_string()))
            .mount(server)
            .await;
        for (name, body) in bodies() {
            Mock::given(method("GET"))
                .and(path(format!("{prefix}/{name}")))
                .respond_with(ResponseTemplate::new(200).set_body_string(body))
                .mount(server)
                .await;
        }
        Mock::given(method("GET"))
            .and(path(format!("{prefix}/SHA256SUMS")))
            .respond_with(ResponseTemplate::new(200).set_body_string("checksums"))
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn off_makes_no_request() {
        let app = TestApp::new().await;
        assert_eq!(check_for_update(&app.state).await, Ok(Status::Disabled));
        let app = TestApp::with_config(|config| {
            config.scanner_bundle_source = ScannerBundleSource::Url("https://x.test/bundle".into());
        })
        .await;
        assert_eq!(
            check_for_update(&app.state).await,
            Err(UpdateError::InvalidSource)
        );
    }

    #[tokio::test]
    async fn installs_from_a_direct_manifest_and_skips_the_same_version() {
        let server = MockServer::start().await;
        serve_files(&server, "/v1", &manifest("v1")).await;
        let url = format!("{}/v1/manifest.json", server.uri());
        let app = TestApp::with_config(|config| {
            config.scanner_bundle_source = ScannerBundleSource::Url(url);
        })
        .await;
        assert_eq!(check_for_update(&app.state).await, Ok(Status::Installed));
        let root = &app.state.config.scanner_bundle_dir;
        assert_eq!(bundle::current_manifest(root).unwrap()["version"], "v1");
        assert_eq!(check_for_update(&app.state).await, Ok(Status::Current));
        assert!(!root.join(".incoming").read_dir().unwrap().any(|_| true));
    }

    #[tokio::test]
    async fn selects_the_newest_scanner_github_release() {
        let server = MockServer::start().await;
        serve_files(&server, "/downloads", &manifest("v2")).await;
        let mut names: Vec<&str> = vec!["manifest.json", "SHA256SUMS"];
        names.extend(bodies().iter().map(|(name, _)| *name));
        let assets: Vec<Value> = names
            .iter()
            .map(|name| json!({"name": name, "browser_download_url": format!("{}/downloads/{name}", server.uri())}))
            .collect();
        Mock::given(method("GET"))
            .and(path("/repos/cfbender/manavault/releases"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!([
                {"draft": false, "tag_name": "scanner-bundle-old", "published_at": "2026-01-01", "assets": []},
                {"draft": false, "tag_name": "scanner-bundle-v2", "published_at": "2026-02-01", "assets": assets},
            ])))
            .mount(&server)
            .await;
        let releases = format!(
            "{}/repos/cfbender/manavault/releases?per_page=30",
            server.uri()
        );
        let app = TestApp::with_config(|config| {
            config.scanner_bundle_source = ScannerBundleSource::Github;
            config.platform_urls.scanner_releases = releases;
        })
        .await;
        assert_eq!(check_for_update(&app.state).await, Ok(Status::Installed));
        assert_eq!(
            bundle::current_manifest(&app.state.config.scanner_bundle_dir).unwrap()["version"],
            "v2"
        );
    }

    #[tokio::test]
    async fn a_repository_without_scanner_releases_is_up_to_date() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/releases"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!([
                {"tag_name": "scanner-bundle-draft", "draft": true, "assets": []},
                {"tag_name": "v1.3.0", "draft": false, "assets": []}
            ])))
            .mount(&server)
            .await;
        let releases = format!("{}/releases", server.uri());
        let app = TestApp::with_config(|config| {
            config.scanner_bundle_source = ScannerBundleSource::Github;
            config.platform_urls.scanner_releases = releases;
        })
        .await;
        assert_eq!(check_for_update(&app.state).await, Ok(Status::NoRelease));
        let job = Job {
            id: 1,
            worker: WORKER.into(),
            args: json!({}),
            attempt: 1,
            max_attempts: 3,
        };
        assert!(matches!(
            BundleUpdateWorker.perform(&app.state, &job).await,
            Outcome::Done
        ));
    }
}
