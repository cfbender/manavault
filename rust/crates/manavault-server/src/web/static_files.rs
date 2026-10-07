//! Static files from `priv/static` (the three `Plug.Static` plugs in
//! `ManavaultWeb.Endpoint`).
//!
//! - `/assets/react/*` and its legacy alias `/assets/*` (Vite entries and
//!   chunks) must revalidate on every load: `no-cache, no-store,
//!   must-revalidate`, `pragma: no-cache`, `expires: 0`, plus
//!   `cross-origin-embedder-policy: require-corp` for the scanner's worker.
//! - Everything else under the allow-listed top-level paths is served with
//!   `cache-control: public` and an `ETag`.
//!
//! Like Plug.Static, a precompressed `.gz` sibling is served to clients that
//! accept gzip (outside development), with `vary: Accept-Encoding`, and a
//! single `range` is honored for uncompressed responses.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::header::{
    ACCEPT_ENCODING, ACCEPT_RANGES, CACHE_CONTROL, CONTENT_ENCODING, CONTENT_RANGE, CONTENT_TYPE,
    ETAG, IF_NONE_MATCH, RANGE, VARY,
};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::config::Env;
use crate::state::AppState;

/// `ManavaultWeb.static_paths/0`: top-level entries served from the root.
///
/// The maskable icons are added: the PWA manifest references them, but the
/// list of earlier releases omitted them, so both answered 404 (a bug fixed
/// here).
pub const STATIC_PATHS: [&str; 15] = [
    "assets",
    "shell",
    "fonts",
    "images",
    "screenshots",
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "android-chrome-192x192.png",
    "android-chrome-512x512.png",
    "android-chrome-192x192-maskable.png",
    "android-chrome-512x512-maskable.png",
    "offline.html",
    "robots.txt",
];

const FRESH_CACHE_CONTROL: &str = "no-cache, no-store, must-revalidate";

struct Mount {
    at: &'static [&'static str],
    from: &'static str,
    only: Option<&'static [&'static str]>,
    fresh: bool,
}

const MOUNTS: [Mount; 3] = [
    Mount {
        at: &["assets", "react"],
        from: "assets/react",
        only: None,
        fresh: true,
    },
    Mount {
        at: &["assets"],
        from: "assets/react/assets",
        only: None,
        fresh: true,
    },
    Mount {
        at: &[],
        from: "",
        only: Some(&STATIC_PATHS),
        fresh: false,
    },
];

/// The MIME type Plug's `MIME.from_path/1` gives a file name.
#[must_use]
pub fn content_type(filename: &str) -> &'static str {
    let extension = filename
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "html" | "htm" => "text/html",
        "json" | "map" => "application/json",
        "webmanifest" => "application/manifest+json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "ico" => "image/vnd.microsoft.icon",
        "txt" => "text/plain",
        "xml" => "text/xml",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "wasm" => "application/wasm",
        "gz" => "application/gzip",
        "zip" => "application/zip",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

enum Lookup {
    NotMine,
    Invalid,
    Found(Vec<String>),
}

fn decode_segment(segment: &str) -> Option<String> {
    let bytes = segment.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        if byte == b'%' {
            let hex = segment.get(index + 1..index + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            out.push(byte);
            index += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn invalid_segment(segment: &str) -> bool {
    segment == ".." || segment.contains(['/', '\\', ':', '\0'])
}

fn lookup(mount: &Mount, segments: &[&str]) -> Lookup {
    let Some(rest) = segments.strip_prefix(mount.at) else {
        return Lookup::NotMine;
    };
    let Some(first) = rest.first() else {
        return Lookup::NotMine;
    };
    if let Some(only) = mount.only
        && !only.contains(first)
    {
        return Lookup::NotMine;
    }
    let mut decoded = Vec::with_capacity(rest.len());
    for segment in rest {
        match decode_segment(segment) {
            Some(segment) if !invalid_segment(&segment) => decoded.push(segment),
            _ => return Lookup::Invalid,
        }
    }
    Lookup::Found(decoded)
}

async fn regular_file(path: &Path) -> Option<std::fs::Metadata> {
    tokio::fs::metadata(path)
        .await
        .ok()
        .filter(std::fs::Metadata::is_file)
}

fn accepts_gzip(headers: &HeaderMap) -> bool {
    headers
        .get_all(ACCEPT_ENCODING)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .any(|encoding| encoding.contains("gzip") || encoding.contains('*'))
}

fn etag(metadata: &std::fs::Metadata) -> String {
    let mtime = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_secs());
    let digest = crate::crypto::sha256_hex(format!("{}:{mtime}", metadata.len()).as_bytes());
    format!("\"{}\"", digest.get(..16).unwrap_or_default())
}

/// Parses a single `bytes=` range against a file size.
fn parse_range(range: &str, size: u64) -> Option<Result<(u64, u64), ()>> {
    let bytes = range.trim().strip_prefix("bytes=")?;
    if bytes.len() > 41 || size == 0 {
        return None;
    }
    if let Some(last) = bytes.strip_prefix('-') {
        let last: u64 = last.parse().ok()?;
        return (last > 0 && last <= size).then(|| Ok((size - last, size - 1)));
    }
    let (first, end) = bytes.split_once('-')?;
    let first: u64 = first.parse().ok()?;
    if first >= size {
        return Some(Err(()));
    }
    if end.is_empty() {
        return Some(Ok((first, size - 1)));
    }
    let end: u64 = end.parse().ok()?;
    (end >= first).then(|| Ok((first, end.min(size - 1))))
}

fn header(value: &str) -> HeaderValue {
    HeaderValue::from_str(value).unwrap_or_else(|_| HeaderValue::from_static(""))
}

async fn serve(
    state: &AppState,
    mount: &Mount,
    segments: Vec<String>,
    request_headers: &HeaderMap,
    head: bool,
) -> Option<Response> {
    let mut path: PathBuf = state.config.static_dir.join(mount.from);
    for segment in &segments {
        path.push(segment);
    }
    let filename = segments.last()?.clone();
    let gzip_allowed = state.config.env != Env::Dev;
    let ranged = request_headers.get(RANGE).is_some();
    let gzip_path = PathBuf::from(format!("{}.gz", path.display()));
    let (file_path, metadata, encoded) = if let (true, Some(metadata)) = (
        gzip_allowed && !ranged && accepts_gzip(request_headers),
        regular_file(&gzip_path).await,
    ) {
        (gzip_path, metadata, true)
    } else {
        let metadata = regular_file(&path).await?;
        (path, metadata, false)
    };

    let mut headers = HeaderMap::new();
    let tag = etag(&metadata);
    headers.insert(
        CACHE_CONTROL,
        HeaderValue::from_static(if mount.fresh {
            FRESH_CACHE_CONTROL
        } else {
            "public"
        }),
    );
    headers.insert(ETAG, header(&tag));
    if gzip_allowed {
        headers.insert(VARY, HeaderValue::from_static("Accept-Encoding"));
    }
    let fresh = request_headers
        .get_all(IF_NONE_MATCH)
        .iter()
        .any(|value| value.as_bytes() == tag.as_bytes());
    if fresh {
        return Some((StatusCode::NOT_MODIFIED, headers).into_response());
    }
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static(content_type(&filename)),
    );
    headers.insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if encoded {
        headers.insert(CONTENT_ENCODING, HeaderValue::from_static("gzip"));
    }
    if mount.fresh {
        headers.insert("pragma", HeaderValue::from_static("no-cache"));
        headers.insert("expires", HeaderValue::from_static("0"));
        headers.insert(
            "cross-origin-embedder-policy",
            HeaderValue::from_static("require-corp"),
        );
    }

    let size = metadata.len();
    let range = request_headers
        .get(RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_range(value, size));
    let bytes = tokio::fs::read(&file_path).await.ok()?;
    let (status, body) = match range {
        Some(Err(())) => {
            headers.insert(CONTENT_RANGE, header(&format!("bytes */{size}")));
            headers.remove(CONTENT_TYPE);
            (StatusCode::RANGE_NOT_SATISFIABLE, Vec::new())
        }
        Some(Ok((start, end))) if !(start == 0 && end + 1 == size) => {
            headers.insert(
                CONTENT_RANGE,
                header(&format!("bytes {start}-{end}/{size}")),
            );
            let start = usize::try_from(start).ok()?;
            let end = usize::try_from(end).ok()?;
            (
                StatusCode::PARTIAL_CONTENT,
                bytes.get(start..=end)?.to_vec(),
            )
        }
        _ => (StatusCode::OK, bytes),
    };
    let body = if head {
        Body::empty()
    } else {
        Body::from(body)
    };
    Some((status, headers, body).into_response())
}

/// Middleware: answers GET and HEAD requests for existing static files and
/// passes everything else on.
pub async fn middleware(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let method = request.method().clone();
    if method != Method::GET && method != Method::HEAD {
        return next.run(request).await;
    }
    let path = request.uri().path().to_owned();
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    for mount in &MOUNTS {
        match lookup(mount, &segments) {
            Lookup::NotMine => {}
            Lookup::Invalid => {
                return (StatusCode::BAD_REQUEST, "Bad Request").into_response();
            }
            Lookup::Found(decoded) => {
                if let Some(response) = serve(
                    &state,
                    mount,
                    decoded,
                    request.headers(),
                    method == Method::HEAD,
                )
                .await
                {
                    return response;
                }
            }
        }
    }
    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{TestApp, body_text};
    use axum::http::Request;

    fn write(app: &TestApp, relative: &str, contents: &str) {
        let path = app.state.config.static_dir.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, contents).unwrap();
    }

    async fn get(app: &TestApp, path: &str) -> Response<Body> {
        app.request(Request::get(path).body(Body::empty()).unwrap())
            .await
    }

    fn header_value<'a>(response: &'a Response<Body>, name: &str) -> Option<&'a str> {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
    }

    #[tokio::test]
    async fn serves_vite_entry_modules_with_no_store_headers() {
        let app = TestApp::new().await;
        write(
            &app,
            "assets/react/entry.js",
            "import './assets/chunk.js'\n",
        );
        let response = get(&app, "/assets/react/entry.js").await;
        assert_eq!(response.status(), 200);
        assert_eq!(
            header_value(&response, "content-type"),
            Some("text/javascript")
        );
        assert_eq!(
            header_value(&response, "cache-control"),
            Some(FRESH_CACHE_CONTROL)
        );
        assert_eq!(header_value(&response, "pragma"), Some("no-cache"));
        assert_eq!(header_value(&response, "expires"), Some("0"));
        assert_eq!(
            header_value(&response, "cross-origin-embedder-policy"),
            Some("require-corp")
        );
        assert!(response.headers().get("set-cookie").is_none());
    }

    #[tokio::test]
    async fn serves_vite_chunks_from_canonical_and_legacy_paths() {
        let app = TestApp::new().await;
        write(&app, "assets/react/assets/chunk.js", "export default 1\n");
        let canonical = get(&app, "/assets/react/assets/chunk.js").await;
        let legacy = get(&app, "/assets/chunk.js").await;
        assert_eq!(
            header_value(&legacy, "content-type"),
            Some("text/javascript")
        );
        assert_eq!(
            header_value(&legacy, "cache-control"),
            Some(FRESH_CACHE_CONTROL)
        );
        assert_eq!(header_value(&legacy, "expires"), Some("0"));
        assert_eq!(header_value(&canonical, "pragma"), Some("no-cache"));
        assert_eq!(body_text(canonical).await, "export default 1\n");
        assert_eq!(body_text(legacy).await, "export default 1\n");
    }

    #[tokio::test]
    async fn serves_allow_listed_root_files_with_etags() {
        let app = TestApp::new().await;
        write(&app, "offline.html", "ManaVault is offline");
        write(&app, "android-chrome-192x192.png", "png");
        write(&app, "android-chrome-512x512-maskable.png", "png");
        write(&app, "assets/css/app.css", "body{}");
        write(&app, "secret.txt", "nope");
        let response = get(&app, "/offline.html").await;
        assert_eq!(response.status(), 200);
        assert_eq!(header_value(&response, "cache-control"), Some("public"));
        assert_eq!(header_value(&response, "content-type"), Some("text/html"));
        let etag = header_value(&response, "etag").unwrap().to_owned();
        assert_eq!(body_text(response).await, "ManaVault is offline");
        let cached = app
            .request(
                Request::get("/offline.html")
                    .header("if-none-match", &etag)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await;
        assert_eq!(cached.status(), 304);
        assert_eq!(get(&app, "/android-chrome-192x192.png").await.status(), 200);
        assert_eq!(
            get(&app, "/android-chrome-512x512-maskable.png")
                .await
                .status(),
            200
        );
        let css = get(&app, "/assets/css/app.css").await;
        assert_eq!(header_value(&css, "content-type"), Some("text/css"));
        assert_eq!(header_value(&css, "cache-control"), Some("public"));
        assert_eq!(get(&app, "/secret.txt").await.status(), 404);
        assert_eq!(get(&app, "/shell/%2e%2e/secret.txt").await.status(), 400);
    }

    #[tokio::test]
    async fn serves_precompressed_files_and_ranges_outside_development() {
        let app = TestApp::new().await;
        write(&app, "assets/react/app.js", "0123456789");
        write(&app, "assets/react/app.js.gz", "gzipped");
        let gzip = app
            .request(
                Request::get("/assets/react/app.js")
                    .header("accept-encoding", "gzip, br")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await;
        assert_eq!(header_value(&gzip, "content-encoding"), Some("gzip"));
        assert_eq!(header_value(&gzip, "vary"), Some("Accept-Encoding"));
        assert_eq!(header_value(&gzip, "content-type"), Some("text/javascript"));
        assert_eq!(body_text(gzip).await, "gzipped");
        let ranged = app
            .request(
                Request::get("/assets/react/app.js")
                    .header("range", "bytes=2-4")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await;
        assert_eq!(ranged.status(), 206);
        assert_eq!(header_value(&ranged, "content-range"), Some("bytes 2-4/10"));
        assert_eq!(body_text(ranged).await, "234");
    }

    #[test]
    fn ranges_parse_like_plug_static() {
        assert_eq!(parse_range("bytes=0-", 10), Some(Ok((0, 9))));
        assert_eq!(parse_range("bytes=-3", 10), Some(Ok((7, 9))));
        assert_eq!(parse_range("bytes=5-100", 10), Some(Ok((5, 9))));
        assert_eq!(parse_range("bytes=10-", 10), Some(Err(())));
        assert_eq!(parse_range("bytes=5-2", 10), None);
        assert_eq!(parse_range("items=1-2", 10), None);
    }
}
