//! Request parameters as `Plug.Parsers` builds them: query string merged
//! with a URL-encoded, multipart, JSON, or raw GraphQL body (body wins). The
//! body is buffered so handlers can read it again.

use axum::body::{Body, Bytes};
use axum::extract::{FromRequestParts, Request};
use axum::http::StatusCode;
use axum::http::header::CONTENT_TYPE;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value};

/// Plug.Parsers' default body limit (8 MB).
pub const BODY_LIMIT: usize = 8_000_000;

/// The merged parameters. A JSON array body is stored under `_json`.
#[derive(Debug, Clone, Default)]
pub struct Params(pub Map<String, Value>);

impl Params {
    /// A string parameter.
    #[must_use]
    pub fn text(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(Value::as_str)
    }

    #[must_use]
    pub fn contains(&self, key: &str) -> bool {
        self.0.contains_key(key)
    }
}

impl<S: Send + Sync> FromRequestParts<S> for Params {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(parts.extensions.get::<Self>().cloned().unwrap_or_else(|| {
            let mut params = Map::new();
            merge_query(&mut params, parts.uri.query());
            Self(params)
        }))
    }
}

fn merge_query(params: &mut Map<String, Value>, query: Option<&str>) {
    if let Some(query) = query {
        for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
            params.insert(key.into_owned(), Value::String(value.into_owned()));
        }
    }
}

fn mime(request: &Request) -> String {
    request
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

async fn multipart_fields(content_type: &str, bytes: Bytes) -> Option<Map<String, Value>> {
    let boundary = multer::parse_boundary(content_type).ok()?;
    let stream = futures_util::stream::once(async move { Ok::<Bytes, std::io::Error>(bytes) });
    let mut multipart = multer::Multipart::new(stream, boundary);
    let mut fields = Map::new();
    while let Ok(Some(field)) = multipart.next_field().await {
        let Some(name) = field.name().map(str::to_owned) else {
            continue;
        };
        if field.file_name().is_some() {
            continue;
        }
        if let Ok(text) = field.text().await {
            fields.insert(name, Value::String(text));
        }
    }
    Some(fields)
}

/// Why a body could not be parsed.
#[derive(Debug)]
pub enum ParseError {
    TooLarge,
    Malformed,
}

impl IntoResponse for ParseError {
    fn into_response(self) -> Response {
        match self {
            Self::TooLarge => (StatusCode::PAYLOAD_TOO_LARGE, "Request Entity Too Large"),
            Self::Malformed => (StatusCode::BAD_REQUEST, "Bad Request"),
        }
        .into_response()
    }
}

/// Buffers and parses the body, returning the rebuilt request (with
/// [`Params`] in its extensions) and the parameters.
pub async fn parse(request: Request) -> Result<(Request, Params), ParseError> {
    let content_type = mime(&request);
    let (mut parts, body) = request.into_parts();
    let bytes = axum::body::to_bytes(body, BODY_LIMIT)
        .await
        .map_err(|_| ParseError::TooLarge)?;
    let mut params = Map::new();
    merge_query(&mut params, parts.uri.query());
    let essence = content_type.split(';').next().unwrap_or_default().trim();
    match essence {
        "application/json" if !bytes.is_empty() => {
            match serde_json::from_slice::<Value>(&bytes).map_err(|_| ParseError::Malformed)? {
                Value::Object(object) => params.extend(object),
                other => {
                    params.insert("_json".to_owned(), other);
                }
            }
        }
        "application/x-www-form-urlencoded" => {
            for (key, value) in url::form_urlencoded::parse(&bytes) {
                params.insert(key.into_owned(), Value::String(value.into_owned()));
            }
        }
        "multipart/form-data" => {
            let fields = multipart_fields(&content_type, bytes.clone())
                .await
                .ok_or(ParseError::Malformed)?;
            params.extend(fields);
        }
        "application/graphql" => {
            params.insert(
                "query".to_owned(),
                Value::String(String::from_utf8_lossy(&bytes).into_owned()),
            );
        }
        _ => {}
    }
    let params = Params(params);
    parts.extensions.insert(params.clone());
    Ok((Request::from_parts(parts, Body::from(bytes)), params))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn params(content_type: &str, body: &str, uri: &str) -> Params {
        let request = Request::post(uri)
            .header(CONTENT_TYPE, content_type)
            .body(Body::from(body.to_owned()))
            .unwrap();
        parse(request).await.unwrap().1
    }

    #[tokio::test]
    async fn parses_each_body_type() {
        let p = params("application/json", r#"{"a": "1", "n": 2}"#, "/x?a=q&b=2").await;
        assert_eq!(p.text("a"), Some("1"));
        assert_eq!(p.text("b"), Some("2"));
        assert_eq!(p.0["n"], 2);
        let p = params("application/json", r"[1, 2]", "/x").await;
        assert!(p.contains("_json"));
        let p = params("application/x-www-form-urlencoded", "a=x%20y&b=", "/x").await;
        assert_eq!(p.text("a"), Some("x y"));
        let body =
            "--b\r\ncontent-disposition: form-data; name=\"query\"\r\n\r\n{ x }\r\n--b--\r\n";
        let p = params("multipart/form-data; boundary=b", body, "/x").await;
        assert_eq!(p.text("query"), Some("{ x }"));
        let p = params("application/graphql", "{ y }", "/x").await;
        assert_eq!(p.text("query"), Some("{ y }"));
    }
}
