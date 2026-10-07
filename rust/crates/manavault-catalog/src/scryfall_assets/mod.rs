//! Local copies of Scryfall's card-symbol and set-icon SVGs
//! (`Manavault.ScryfallAssets`), served at `/scryfall-assets/*path`.
//!
//! A sync downloads the symbology and set lists, saves every SVG that is not
//! already on disk under `symbols/` and `sets/`, and writes a manifest next
//! to them (`symbology.json`, `sets.json`) whose entries carry the local URI.

pub mod web;
pub mod worker;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, RwLock};

use serde_json::{Map, Value, json};
use time::OffsetDateTime;

pub const SYMBOLOGY_URL: &str = "https://api.scryfall.com/symbology";
pub const SETS_URL: &str = "https://api.scryfall.com/sets";

/// Where a sync fetches the lists from.
#[derive(Debug, Clone)]
pub struct AssetUrls {
    pub symbology_url: String,
    pub sets_url: String,
}

impl Default for AssetUrls {
    fn default() -> Self {
        Self {
            symbology_url: SYMBOLOGY_URL.to_owned(),
            sets_url: SETS_URL.to_owned(),
        }
    }
}

/// How many entries a sync saved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AssetCounts {
    pub symbols_count: usize,
    pub sets_count: usize,
}

#[must_use]
pub fn symbols_dir(root: &Path) -> PathBuf {
    root.join("symbols")
}

#[must_use]
pub fn sets_dir(root: &Path) -> PathBuf {
    root.join("sets")
}

#[derive(Debug, Default)]
struct Manifests {
    symbols: HashMap<String, Value>,
    sets: HashMap<String, Value>,
}

/// Loaded manifests by asset root.
static MANIFESTS: LazyLock<RwLock<HashMap<PathBuf, Arc<Manifests>>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

fn read_manifest(path: &Path) -> Vec<Value> {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|value| match value {
            Value::Object(mut map) => match map.remove("data") {
                Some(Value::Array(entries)) => Some(entries),
                _ => None,
            },
            _ => None,
        })
        .unwrap_or_default()
}

fn normalize_symbol(symbol: &str) -> String {
    if symbol.starts_with('{') {
        symbol.to_owned()
    } else {
        format!("{{{symbol}}}")
    }
}

fn manifests(root: &Path) -> Arc<Manifests> {
    if let Some(loaded) = MANIFESTS
        .read()
        .ok()
        .and_then(|cache| cache.get(root).cloned())
    {
        return loaded;
    }
    let symbols = read_manifest(&symbols_dir(root).join("symbology.json"))
        .into_iter()
        .map(|entry| {
            let key = normalize_symbol(
                entry
                    .get("symbol")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            );
            (key, entry)
        })
        .collect();
    let sets = read_manifest(&sets_dir(root).join("sets.json"))
        .into_iter()
        .map(|entry| {
            let key = entry
                .get("code")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            (key, entry)
        })
        .collect();
    let loaded = Arc::new(Manifests { symbols, sets });
    if let Ok(mut cache) = MANIFESTS.write() {
        cache.insert(root.to_path_buf(), Arc::clone(&loaded));
    }
    loaded
}

/// Forgets the loaded manifests for `root`.
pub fn clear_cache(root: &Path) {
    if let Ok(mut cache) = MANIFESTS.write() {
        cache.remove(root);
    }
}

/// The manifest entry for a mana symbol, with or without braces (`"W"` or
/// `"{W}"`).
#[must_use]
pub fn symbol(root: &Path, symbol: &str) -> Option<Value> {
    manifests(root)
        .symbols
        .get(&normalize_symbol(symbol))
        .cloned()
}

/// The manifest entry for a set code, in any case.
#[must_use]
pub fn set(root: &Path, code: &str) -> Option<Value> {
    manifests(root).sets.get(&code.to_lowercase()).cloned()
}

fn safe_filename(name: &str) -> Option<&str> {
    let base = name.rsplit('/').next().unwrap_or_default();
    (!base.is_empty() && base != "." && base != "..").then_some(base)
}

/// The file for a `/scryfall-assets/{symbols|sets}/<file>` request, if it
/// exists. Only the final path component of the file name is used.
#[must_use]
pub fn local_path(root: &Path, segments: &[&str]) -> Option<PathBuf> {
    let (dir, filename) = match segments {
        ["symbols", filename] => (symbols_dir(root), *filename),
        ["sets", filename] => (sets_dir(root), *filename),
        _ => return None,
    };
    let path = dir.join(safe_filename(filename)?);
    path.is_file().then_some(path)
}

/// When the last sync finished: the older manifest's modification time.
#[must_use]
pub fn latest_sync_completed_at(root: &Path) -> Option<OffsetDateTime> {
    let mtime = |path: PathBuf| -> Option<OffsetDateTime> {
        let modified = std::fs::metadata(path).ok()?.modified().ok()?;
        Some(OffsetDateTime::from(modified))
    };
    let symbols = mtime(symbols_dir(root).join("symbology.json"))?;
    let sets = mtime(sets_dir(root).join("sets.json"))?;
    Some(symbols.min(sets).replace_nanosecond(0).unwrap_or(symbols))
}

async fn fetch(http: &reqwest::Client, url: &str) -> Result<bytes::Bytes, String> {
    let response = http
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Scryfall request failed with HTTP {}",
            status.as_u16()
        ));
    }
    response.bytes().await.map_err(|error| error.to_string())
}

async fn fetch_list(http: &reqwest::Client, url: &str, what: &str) -> Result<Vec<Value>, String> {
    let body = fetch(http, url).await?;
    let value: Value = serde_json::from_slice(&body).map_err(|error| error.to_string())?;
    match value {
        Value::Object(mut map) => match map.remove("data") {
            Some(Value::Array(entries)) => Ok(entries),
            _ => Err(format!("Scryfall {what} response did not include data")),
        },
        _ => Err(format!("Scryfall {what} response did not include data")),
    }
}

fn filename_from_url(url: &Value) -> Result<String, String> {
    let Some(url) = url.as_str() else {
        return Err(format!("Scryfall asset URL was invalid: {url}"));
    };
    let path =
        url::Url::parse(url).map_or_else(|_| url.to_owned(), |parsed| parsed.path().to_owned());
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .and_then(safe_filename)
        .map(str::to_owned)
        .ok_or_else(|| format!("Scryfall asset URL did not include a filename: {url}"))
}

/// Saves the SVG unless it is already on disk and returns its local URI.
async fn download_svg(
    http: &reqwest::Client,
    url: Option<&Value>,
    dir: &Path,
    uri_prefix: &str,
) -> Result<Option<String>, String> {
    let Some(url) = url.filter(|url| !url.is_null()) else {
        return Ok(None);
    };
    let filename = filename_from_url(url)?;
    let path = dir.join(&filename);
    if !path.exists() {
        let body = fetch(http, url.as_str().unwrap_or_default()).await?;
        tokio::fs::write(&path, &body)
            .await
            .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    }
    Ok(Some(format!("{uri_prefix}/{filename}")))
}

fn take(entry: &Value, keys: &[&str]) -> Map<String, Value> {
    keys.iter()
        .filter_map(|key| {
            entry
                .get(*key)
                .map(|value| ((*key).to_owned(), value.clone()))
        })
        .collect()
}

async fn write_manifest(path: PathBuf, entries: Vec<Value>) -> Result<usize, String> {
    let count = entries.len();
    let text = serde_json::to_string_pretty(&json!({"data": entries}))
        .map_err(|error| error.to_string())?;
    tokio::fs::write(&path, text)
        .await
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    Ok(count)
}

/// Downloads the symbology and set icons into `root`.
pub async fn sync(
    http: &reqwest::Client,
    root: &Path,
    urls: &AssetUrls,
) -> Result<AssetCounts, String> {
    let symbols = symbols_dir(root);
    let sets = sets_dir(root);
    for dir in [&symbols, &sets] {
        tokio::fs::create_dir_all(dir)
            .await
            .map_err(|error| format!("could not create {}: {error}", dir.display()))?;
    }

    let mut symbol_entries = Vec::new();
    for entry in fetch_list(http, &urls.symbology_url, "symbology").await? {
        let local = download_svg(
            http,
            entry.get("svg_uri"),
            &symbols,
            "/scryfall-assets/symbols",
        )
        .await?;
        let mut manifest = take(
            &entry,
            &["symbol", "english", "colors", "represents_mana", "svg_uri"],
        );
        manifest.insert(
            "local_uri".to_owned(),
            local.map_or(Value::Null, Value::String),
        );
        symbol_entries.push(Value::Object(manifest));
    }
    let symbols_count = write_manifest(symbols.join("symbology.json"), symbol_entries).await?;

    let mut set_entries = Vec::new();
    for entry in fetch_list(http, &urls.sets_url, "sets").await? {
        let local = download_svg(
            http,
            entry.get("icon_svg_uri"),
            &sets,
            "/scryfall-assets/sets",
        )
        .await?;
        let mut manifest = take(&entry, &["code", "name", "set_type", "icon_svg_uri"]);
        manifest.insert(
            "local_uri".to_owned(),
            local.map_or(Value::Null, Value::String),
        );
        set_entries.push(Value::Object(manifest));
    }
    let sets_count = write_manifest(sets.join("sets.json"), set_entries).await?;

    clear_cache(root);
    Ok(AssetCounts {
        symbols_count,
        sets_count,
    })
}

#[cfg(test)]
mod tests {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;
    use manavault_core::testing::TempDir;

    async fn mount(server: &MockServer, route: &str, body: ResponseTemplate, hits: u64) {
        Mock::given(method("GET"))
            .and(path(route))
            .respond_with(body)
            .expect(hits)
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn sync_downloads_symbol_and_set_manifests_with_local_svgs() {
        let server = MockServer::start().await;
        let base = server.uri();
        mount(
            &server,
            "/symbology",
            ResponseTemplate::new(200).set_body_json(json!({"data": [{
                "symbol": "{W}", "english": "White", "colors": ["W"], "represents_mana": true,
                "svg_uri": format!("{base}/card-symbols/W.svg"), "loose_variant": "W"
            }]})),
            2,
        )
        .await;
        mount(
            &server,
            "/sets",
            ResponseTemplate::new(200).set_body_json(json!({"data": [{
                "code": "LEA", "name": "Limited Edition Alpha", "set_type": "core",
                "icon_svg_uri": format!("{base}/sets/lea.svg")
            }]})),
            2,
        )
        .await;
        mount(
            &server,
            "/card-symbols/W.svg",
            ResponseTemplate::new(200).set_body_string(r#"<svg id="white"/>"#),
            1,
        )
        .await;
        mount(
            &server,
            "/sets/lea.svg",
            ResponseTemplate::new(200).set_body_string(r#"<svg id="lea"/>"#),
            1,
        )
        .await;

        let dir = TempDir::new();
        let root = dir.path().join("assets");
        let urls = AssetUrls {
            symbology_url: format!("{base}/symbology"),
            sets_url: format!("{base}/sets"),
        };
        assert_eq!(symbol(&root, "W"), None);
        let counts = sync(&reqwest::Client::new(), &root, &urls).await.unwrap();
        assert_eq!(
            counts,
            AssetCounts {
                symbols_count: 1,
                sets_count: 1
            }
        );

        assert_eq!(
            std::fs::read_to_string(root.join("symbols/W.svg")).unwrap(),
            r#"<svg id="white"/>"#
        );
        assert_eq!(
            std::fs::read_to_string(root.join("sets/lea.svg")).unwrap(),
            r#"<svg id="lea"/>"#
        );
        let white = symbol(&root, "W").unwrap();
        assert_eq!(white["english"], "White");
        assert_eq!(white["local_uri"], "/scryfall-assets/symbols/W.svg");
        assert!(white.get("loose_variant").is_none());
        assert_eq!(symbol(&root, "{W}"), Some(white));
        let lea = set(&root, "lea").unwrap();
        assert_eq!(lea["name"], "Limited Edition Alpha");
        assert_eq!(lea["local_uri"], "/scryfall-assets/sets/lea.svg");
        assert!(latest_sync_completed_at(&root).is_some());

        // Existing SVGs are not downloaded again (each SVG mock expects one hit).
        sync(&reqwest::Client::new(), &root, &urls).await.unwrap();
    }

    #[tokio::test]
    async fn sync_fails_when_scryfall_omits_symbology_data() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"object": "error"})))
            .mount(&server)
            .await;
        let dir = TempDir::new();
        let urls = AssetUrls {
            symbology_url: format!("{}/symbology", server.uri()),
            sets_url: format!("{}/sets", server.uri()),
        };
        assert_eq!(
            sync(&reqwest::Client::new(), dir.path(), &urls).await,
            Err("Scryfall symbology response did not include data".to_owned())
        );
    }

    #[test]
    fn local_paths_stay_inside_the_asset_directories() {
        let dir = TempDir::new();
        let root = dir.path();
        std::fs::create_dir_all(root.join("symbols")).unwrap();
        std::fs::write(root.join("symbols/W.svg"), "<svg/>").unwrap();
        std::fs::write(root.join("secret.txt"), "x").unwrap();
        assert_eq!(
            local_path(root, &["symbols", "W.svg"]),
            Some(root.join("symbols/W.svg"))
        );
        assert_eq!(local_path(root, &["symbols", "missing.svg"]), None);
        assert_eq!(local_path(root, &["symbols", ".."]), None);
        assert_eq!(local_path(root, &["other", "W.svg"]), None);
        assert_eq!(local_path(root, &["symbols", "W.svg", "x"]), None);
    }
}
