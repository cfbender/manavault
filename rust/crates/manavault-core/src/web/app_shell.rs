//! The React shell page (`AppController.index` and `render_app/2`,
//! template `app_html/app.html.eex`).
//!
//! Every authenticated browser route renders the same shell. The public
//! share pages (`/share/decks/:token`, ...) render it too, with their own
//! [`SharePreview`]; they call [`render_app`] from the share module.

use std::fmt::Write as _;

use axum::extract::State;
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE, HOST};
use axum::http::{HeaderMap, Uri};
use axum::response::{IntoResponse, Response};

use super::session::{self, Session};
use crate::settings::appearance::{self, Appearance};
use crate::state::AppState;

/// Link preview metadata (`ManavaultWeb.DeckSharePreview`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharePreview {
    pub title: String,
    pub description: String,
    pub image_alt: Option<String>,
    pub image_type: Option<String>,
    pub image_url: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub url: Option<String>,
}

impl SharePreview {
    /// `DeckSharePreview.default/1` before the caller's overrides.
    #[must_use]
    pub fn base() -> Self {
        Self {
            title: "ManaVault".to_owned(),
            description: "Magic deck and collection manager.".to_owned(),
            image_alt: Some("ManaVault".to_owned()),
            image_type: None,
            image_url: None,
            image_width: Some(512),
            image_height: Some(512),
            url: None,
        }
    }

    /// `AppController.default_preview/2`: the page URL and the app icon,
    /// with absolute URLs built from the configured public URL rather than
    /// the request's `Host` header.
    #[must_use]
    pub fn default_for(state: &AppState, path: &str) -> Self {
        Self {
            url: Some(absolute_url(state, path)),
            image_url: Some(absolute_url(state, "/android-chrome-512x512.png")),
            image_type: Some("image/png".to_owned()),
            ..Self::base()
        }
    }
}

/// `ManavaultWeb.Endpoint.url() <> path`.
#[must_use]
pub fn absolute_url(state: &AppState, path: &str) -> String {
    format!("{}{path}", state.config.public_url.trim_end_matches('/'))
}

/// HTML-escapes text (`&`, `<`, `>`, `"`, and `'`).
#[must_use]
pub fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            other => out.push(other),
        }
    }
    out
}

fn request_host(headers: &HeaderMap) -> Option<String> {
    let host = headers.get(HOST)?.to_str().ok()?;
    let host = if let Some(rest) = host.strip_prefix('[') {
        rest.split(']').next().unwrap_or_default()
    } else {
        host.split(':').next().unwrap_or_default()
    };
    Some(host.to_ascii_lowercase())
}

fn vite_proxy(headers: &HeaderMap) -> bool {
    let values: Vec<&[u8]> = headers
        .get_all("x-manavault-vite-proxy")
        .iter()
        .map(axum::http::HeaderValue::as_bytes)
        .collect();
    values == [b"1".as_slice()]
}

/// Whether to load the page from the Vite dev server: enabled, and the
/// request is local or comes through the development proxy.
fn vite_dev_server(state: &AppState, headers: &HeaderMap) -> bool {
    state.config.vite_dev_server
        && (matches!(
            request_host(headers).as_deref(),
            Some("localhost" | "127.0.0.1" | "::1")
        ) || vite_proxy(headers))
}

struct Page<'a> {
    csrf_token: String,
    preview: &'a SharePreview,
    appearance: Option<Appearance>,
    asset_version: &'a str,
    vite_dev: bool,
    vite_origin: &'a str,
}

fn present(value: Option<&str>) -> Option<&str> {
    value.filter(|value| !value.is_empty())
}

fn render(page: &Page<'_>) -> String {
    let preview = page.preview;
    let e = |text: &str| escape(text);
    let mut html = String::with_capacity(4096);
    let theme_style = page
        .appearance
        .map_or("glass", |appearance| appearance.theme_style.as_str());
    let _ = write!(
        html,
        "<!DOCTYPE html>\n<html lang=\"en\" class=\"h-screen w-screen overflow-hidden\" data-theme-style=\"{}\"",
        e(theme_style)
    );
    if let Some(appearance) = page.appearance {
        let _ = write!(
            html,
            " data-palette=\"{}\" data-appearance-source=\"account\"",
            e(appearance.palette.as_str())
        );
    }
    html.push_str(">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\" />\n");
    let _ = write!(
        html,
        "    <meta name=\"csrf-token\" content=\"{}\" />\n    <meta name=\"manavault-asset-version\" content=\"{}\" />\n    ",
        e(&page.csrf_token),
        e(page.asset_version)
    );
    if page.vite_dev {
        let _ = write!(
            html,
            "<meta name=\"manavault-vite-origin\" content=\"{}\" />",
            e(page.vite_origin)
        );
    }
    let url = preview.url.as_deref().unwrap_or_default();
    let _ = write!(
        html,
        "\n    <meta name=\"description\" content=\"{description}\" />\n    <meta property=\"og:site_name\" content=\"ManaVault\" />\n    <meta property=\"og:type\" content=\"website\" />\n    <meta property=\"og:title\" content=\"{title}\" />\n    <meta property=\"og:description\" content=\"{description}\" />\n    <meta property=\"og:url\" content=\"{url}\" />\n    ",
        description = e(&preview.description),
        title = e(&preview.title),
        url = e(url),
    );
    let image_url = present(preview.image_url.as_deref());
    let image_width = preview.image_width.map(|w| w.to_string());
    let image_height = preview.image_height.map(|h| h.to_string());
    for (property, value) in [
        ("og:image", image_url),
        ("og:image:type", present(preview.image_type.as_deref())),
        ("og:image:width", present(image_width.as_deref())),
        ("og:image:height", present(image_height.as_deref())),
        ("og:image:alt", present(preview.image_alt.as_deref())),
    ] {
        if let Some(value) = value {
            let _ = write!(
                html,
                "<meta property=\"{property}\" content=\"{}\" />",
                e(value)
            );
        }
        html.push_str("\n    ");
    }
    let _ = write!(
        html,
        "<meta name=\"twitter:card\" content=\"{}\" />\n    <meta name=\"twitter:title\" content=\"{}\" />\n    <meta name=\"twitter:description\" content=\"{}\" />\n    ",
        if image_url.is_some() {
            "summary_large_image"
        } else {
            "summary"
        },
        e(&preview.title),
        e(&preview.description),
    );
    if let Some(image_url) = image_url {
        let _ = write!(
            html,
            "<meta name=\"twitter:image\" content=\"{}\" />",
            e(image_url)
        );
    }
    let version = e(page.asset_version);
    let _ = write!(
        html,
        "\n    <meta name=\"application-name\" content=\"ManaVault\" />\n    <meta name=\"mobile-web-app-capable\" content=\"yes\" />\n    <meta name=\"apple-mobile-web-app-title\" content=\"ManaVault\" />\n    <meta name=\"apple-mobile-web-app-capable\" content=\"yes\" />\n    <meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\" />\n    <meta name=\"theme-color\" content=\"#166534\" />\n    <title>{title}</title>\n    <script src=\"/shell/js/theme.js?v={version}\"></script>\n    <script src=\"/shell/js/pwa-install.js?v={version}\"></script>\n    <link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/apple-touch-icon.png\" />\n    <link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/favicon-32x32.png\" />\n    <link rel=\"icon\" type=\"image/png\" sizes=\"16x16\" href=\"/favicon-16x16.png\" />\n    <link rel=\"manifest\" href=\"/site.webmanifest?v={version}\" crossorigin=\"use-credentials\" />\n    \n    <link rel=\"stylesheet\" href=\"/assets/css/app.css?v={version}\" />\n    ",
        title = e(&preview.title),
    );
    if page.vite_dev {
        html.push_str(
            "\n      <script type=\"module\" src=\"/shell/js/vite-bootstrap.js\"></script>\n    ",
        );
    } else {
        html.push_str(
            "\n      <script defer type=\"module\" src=\"/assets/react/app.js\"></script>\n    ",
        );
    }
    html.push_str("\n  </head>\n  <body class=\"h-screen w-screen overflow-hidden\">\n    <div id=\"manavault-root\"></div>\n  </body>\n</html>\n");
    html
}

/// Renders the shell with a preview (`AppController.render_app/2`). Only the
/// signed-in owner (or everyone, with auth disabled) gets the account's
/// saved appearance; anonymous share visitors keep their own.
pub async fn render_app(
    state: &AppState,
    session: &Session,
    headers: &HeaderMap,
    preview: &SharePreview,
) -> Response {
    let vite_dev = vite_dev_server(state, headers);
    let appearance = if session::authenticated(state, session) {
        match appearance::settings(&state.db).await {
            Ok(appearance) => Some(appearance),
            Err(error) => {
                tracing::error!(%error, "could not load appearance settings");
                Some(Appearance::default())
            }
        }
    } else {
        None
    };
    let page = Page {
        csrf_token: session.csrf_token(),
        preview,
        appearance,
        asset_version: &state.config.asset_version,
        vite_dev,
        vite_origin: if vite_dev && !vite_proxy(headers) {
            "http://127.0.0.1:5173"
        } else {
            ""
        },
    };
    (
        [
            (CONTENT_TYPE, "text/html; charset=utf-8"),
            (CACHE_CONTROL, "no-cache, no-store, must-revalidate"),
            (axum::http::header::PRAGMA, "no-cache"),
        ],
        render(&page),
    )
        .into_response()
}

/// `AppController.index/2`.
pub async fn index(
    State(state): State<AppState>,
    session: Session,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    let preview = SharePreview::default_for(&state, uri.path());
    render_app(&state, &session, &headers, &preview).await
}
