//! Progressive web app endpoints (`ManavaultWeb.PwaController`): the
//! manifest, the service worker, and Android app links.

use axum::extract::State;
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE, EXPIRES, PRAGMA};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use manavault_core::state::AppState;

const NO_STORE: [(axum::http::HeaderName, &str); 3] = [
    (CACHE_CONTROL, "no-cache, no-store, must-revalidate"),
    (PRAGMA, "no-cache"),
    (EXPIRES, "0"),
];
const ANDROID_PACKAGE_NAME: &str = "dev.cfb.manavault";
const OFFICIAL_ANDROID_CERT_FINGERPRINTS: [&str; 1] = [
    "6B:3F:13:D6:6A:11:BB:49:FE:D8:64:5C:7D:26:B8:2E:BD:FC:8C:14:19:53:1C:A3:35:E6:68:DF:F7:4E:13:89",
];

fn versioned(path: &str, version: &str) -> String {
    format!("{path}?v={version}")
}

fn icon(src: &str, sizes: &str, purpose: &str, version: &str) -> Value {
    json!({"src": versioned(src, version), "sizes": sizes, "type": "image/png", "purpose": purpose})
}

/// The web app manifest.
#[must_use]
pub fn manifest_json(version: &str) -> Value {
    json!({
        "name": "ManaVault",
        "short_name": "ManaVault",
        "description": "Local Magic collection management with deck allocation and import workflows.",
        "id": "/",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "prefer_related_applications": false,
        "background_color": "#0f172a",
        "theme_color": "#166534",
        "categories": ["utilities", "productivity"],
        "icons": [
            icon("/android-chrome-192x192.png", "192x192", "any", version),
            icon("/android-chrome-512x512.png", "512x512", "any", version),
            icon("/android-chrome-192x192-maskable.png", "192x192", "maskable", version),
            icon("/android-chrome-512x512-maskable.png", "512x512", "maskable", version),
        ],
        "screenshots": [{
            "src": versioned("/screenshots/desktop-collection.png", version),
            "sizes": "1280x720",
            "type": "image/png",
            "form_factor": "wide",
            "label": "Collection dashboard"
        }],
        "shortcuts": [{
            "name": "Collection",
            "short_name": "Collection",
            "description": "Open the card collection.",
            "url": "/collection",
            "icons": [{
                "src": versioned("/android-chrome-192x192.png", version),
                "sizes": "192x192",
                "type": "image/png"
            }]
        }]
    })
}

/// `GET /site.webmanifest`.
pub async fn manifest(State(state): State<AppState>) -> Response {
    (
        NO_STORE,
        [(CONTENT_TYPE, "application/manifest+json; charset=utf-8")],
        manifest_json(&state.config.asset_version).to_string(),
    )
        .into_response()
}

/// The service worker source for an asset version.
#[must_use]
pub fn service_worker_js(version: &str) -> String {
    format!(
        r#"const CACHE_NAME = "manavault-pwa-v{version}"
const OFFLINE_URL = "/offline.html"
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/favicon-32x32.png",
]

self.addEventListener("install", (event) => {{
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
}})

self.addEventListener("activate", (event) => {{
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("manavault-pwa-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
}})

self.addEventListener("fetch", (event) => {{
  if (event.request.method !== "GET") return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === "navigate") {{
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
    return
  }}

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((response) => response || Response.error()),
    ),
  )
}})
"#
    )
}

/// `GET /sw.js`.
pub async fn service_worker(State(state): State<AppState>) -> Response {
    (
        NO_STORE,
        [
            (CONTENT_TYPE, "text/javascript; charset=utf-8"),
            (
                axum::http::HeaderName::from_static("service-worker-allowed"),
                "/",
            ),
        ],
        service_worker_js(&state.config.asset_version),
    )
        .into_response()
}

/// `GET /.well-known/assetlinks.json`.
pub async fn asset_links(State(state): State<AppState>) -> Response {
    let configured = &state.config.android_cert_fingerprints;
    let fingerprints: Vec<&str> = if configured.is_empty() {
        OFFICIAL_ANDROID_CERT_FINGERPRINTS.to_vec()
    } else {
        configured.iter().map(String::as_str).collect()
    };
    let links: Vec<Value> = fingerprints
        .into_iter()
        .map(|fingerprint| {
            json!({
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": ANDROID_PACKAGE_NAME,
                    "sha256_cert_fingerprints": [fingerprint]
                }
            })
        })
        .collect();
    (
        NO_STORE,
        [(CONTENT_TYPE, "application/json; charset=utf-8")],
        Value::Array(links).to_string(),
    )
        .into_response()
}
