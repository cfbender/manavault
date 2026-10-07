//! `/api/scanner` handlers: the bundle, corrections, and export auth.

use axum::body::Body;
use axum::extract::{Json, Path, Query, Request, State};
use axum::http::header::{
    ACCEPT_ENCODING, AUTHORIZATION, CACHE_CONTROL, CONTENT_ENCODING, CONTENT_TYPE, VARY,
};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use super::{bundle, corrections};
use manavault_core::state::AppState;
use manavault_core::web::session::{self, Session};

fn errors(status: StatusCode, key: &str, message: &str) -> Response {
    (status, axum::Json(json!({"errors": [{key: message}]}))).into_response()
}

fn content_type(name: &str) -> &'static str {
    match name {
        "manifest.json" | "arts.json" | "printings.json" => "application/json",
        "SHA256SUMS" => "text/plain",
        _ => "application/octet-stream",
    }
}

/// `GET /api/scanner/bundle`: the active bundle and its file URLs.
pub async fn show(State(state): State<AppState>) -> Response {
    let Some(manifest) = bundle::current_manifest(&state.config.scanner_bundle_dir) else {
        return errors(StatusCode::NOT_FOUND, "detail", "Scanner bundle not found");
    };
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let names = bundle::FILES
        .iter()
        .filter(|name| **name != "printings.json");
    let files: Map<String, Value> = names
        .clone()
        .map(|name| {
            (
                (*name).to_owned(),
                json!(format!("/api/scanner/bundles/{version}/{name}")),
            )
        })
        .collect();
    // Decoded sizes let the browser report progress even for gzipped files.
    let sizes: Map<String, Value> = names
        .filter_map(|name| {
            let bytes = manifest.get("files")?.get(*name)?.get("bytes")?;
            Some(((*name).to_owned(), bytes.clone()))
        })
        .collect();
    let null = Value::Null;
    (
        [(CACHE_CONTROL, "private, no-cache")],
        axum::Json(json!({"data": {
            "version": version,
            "created": manifest.get("created").unwrap_or(&null),
            "gallery": manifest.get("gallery").unwrap_or(&null),
            "constants": manifest.get("constants").unwrap_or(&null),
            "files": files,
            "sizes": sizes,
        }})),
    )
        .into_response()
}

fn accepts_gzip(headers: &HeaderMap) -> bool {
    headers
        .get_all(ACCEPT_ENCODING)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .any(|encoding| {
            let encoding = encoding.trim().to_lowercase();
            encoding.starts_with("gzip") && !q_zero(&encoding)
        })
}

/// `~r/(?:^|;)\s*q\s*=\s*0(?:\.0*)?\s*$/`.
fn q_zero(encoding: &str) -> bool {
    encoding.split(';').skip(1).any(|parameter| {
        let Some((key, value)) = parameter.split_once('=') else {
            return false;
        };
        let value = value.trim();
        key.trim() == "q"
            && (value == "0"
                || value
                    .strip_prefix("0.")
                    .is_some_and(|rest| rest.chars().all(|c| c == '0')))
    })
}

/// `GET /api/scanner/bundles/:version/:name`: an immutable bundle file.
pub async fn file(
    State(state): State<AppState>,
    Path((version, name)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    let root = &state.config.scanner_bundle_dir;
    let path = if name == "arts.json" && accepts_gzip(&headers) {
        bundle::ensure_gzip(root, &version, &name)
    } else {
        bundle::file_path(root, &version, &name)
    };
    let Some(path) = path else {
        return errors(
            StatusCode::NOT_FOUND,
            "detail",
            "Scanner bundle file not found",
        );
    };
    let Ok(bytes) = tokio::fs::read(&path).await else {
        return errors(
            StatusCode::NOT_FOUND,
            "detail",
            "Scanner bundle file not found",
        );
    };
    let mut response = (
        [
            (CONTENT_TYPE, content_type(&name)),
            (CACHE_CONTROL, "private, max-age=31536000, immutable"),
        ],
        Body::from(bytes),
    )
        .into_response();
    if path.extension().is_some_and(|ext| ext == "gz") {
        let headers = response.headers_mut();
        headers.insert(CONTENT_ENCODING, HeaderValue::from_static("gzip"));
        headers.insert(VARY, HeaderValue::from_static("accept-encoding"));
    }
    response
}

/// `POST /api/scanner/corrections`.
pub async fn create_correction(
    State(state): State<AppState>,
    Json(correction): Json<Map<String, Value>>,
) -> Response {
    match corrections::save(&state.config.scanner_bundle_dir, &Value::Object(correction)).await {
        Ok(Some(capture_id)) => (
            StatusCode::CREATED,
            axum::Json(json!({"data": {"capture_id": capture_id}})),
        )
            .into_response(),
        Ok(None) => errors(StatusCode::BAD_REQUEST, "message", "Invalid correction"),
        Err(error) => {
            tracing::error!(%error, "could not save scanner correction");
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error").into_response()
        }
    }
}

/// The corrections page query string.
#[derive(Debug, Default, serde::Deserialize)]
pub struct CorrectionsQuery {
    cursor: Option<String>,
}

/// `GET /api/scanner/corrections?cursor=n`.
pub async fn index_corrections(
    State(state): State<AppState>,
    query: Result<Query<CorrectionsQuery>, axum::extract::rejection::QueryRejection>,
) -> Response {
    let cursor = query.ok().and_then(|Query(query)| match query.cursor {
        None => Some(0),
        Some(text) => text.parse::<usize>().ok(),
    });
    let Some(cursor) = cursor else {
        return errors(StatusCode::BAD_REQUEST, "message", "Invalid cursor");
    };
    match corrections::page(&state.config.scanner_bundle_dir, cursor).await {
        Ok(page) => axum::Json(json!({"data": page})).into_response(),
        Err(error) => {
            tracing::error!(%error, "could not read scanner corrections");
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error").into_response()
        }
    }
}

/// `GET /api/scanner/corrections/:id/crop`.
pub async fn crop(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(path) = corrections::crop_path(&state.config.scanner_bundle_dir, &id) else {
        return errors(StatusCode::NOT_FOUND, "message", "Not found");
    };
    match tokio::fs::read(path).await {
        Ok(bytes) => ([(CONTENT_TYPE, "image/jpeg")], bytes).into_response(),
        Err(_) => errors(StatusCode::NOT_FOUND, "message", "Not found"),
    }
}

const TOKEN_DISABLED: &str = "Token export is disabled: set SCANNER_CORRECTIONS_TOKEN (32+ characters) on the server and restart it";

fn authorize(state: &AppState, session: &Session, headers: &HeaderMap) -> Result<(), &'static str> {
    let values: Vec<&HeaderValue> = headers.get_all(AUTHORIZATION).iter().collect();
    match values.as_slice() {
        [] => {
            if session::authenticated(state, session) {
                Ok(())
            } else {
                Err("Authentication required")
            }
        }
        [value] => {
            let Some(token) = value.to_str().ok().and_then(|v| v.strip_prefix("Bearer ")) else {
                return Err("Expected an Authorization: Bearer token");
            };
            match state
                .config
                .scanner_corrections_token
                .as_deref()
                .filter(|expected| expected.len() >= 32)
            {
                Some(expected) => {
                    if manavault_core::crypto::secure_compare(
                        token.trim().as_bytes(),
                        expected.as_bytes(),
                    ) {
                        Ok(())
                    } else {
                        Err("Invalid scanner corrections token")
                    }
                }
                None => Err(TOKEN_DISABLED),
            }
        }
        _ => Err("Expected an Authorization: Bearer token"),
    }
}

/// `Plugs.ScannerExportAuth`: the owner's session or the read-only
/// `SCANNER_CORRECTIONS_TOKEN` bearer token.
pub async fn export_auth(
    State(state): State<AppState>,
    session: Session,
    request: Request,
    next: Next,
) -> Response {
    match authorize(&state, &session, request.headers()) {
        Ok(()) => {
            let mut response = next.run(request).await;
            response
                .headers_mut()
                .entry(CACHE_CONTROL)
                .or_insert(HeaderValue::from_static("private, no-store"));
            response
        }
        Err(message) => errors(StatusCode::UNAUTHORIZED, "message", message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gzip_negotiation_honors_q_zero() {
        let headers = |value: &str| {
            let mut headers = HeaderMap::new();
            headers.insert(ACCEPT_ENCODING, HeaderValue::from_str(value).unwrap());
            headers
        };
        assert!(accepts_gzip(&headers("br, gzip")));
        assert!(accepts_gzip(&headers("gzip;q=0.5")));
        assert!(!accepts_gzip(&headers("gzip;q=0")));
        assert!(!accepts_gzip(&headers("gzip; q=0.000")));
        assert!(!accepts_gzip(&headers("br")));
    }
}
