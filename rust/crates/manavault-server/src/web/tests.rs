//! Router-level tests ported from `test/manavault_web/controllers/*`,
//! `graphql_csrf_protection_test.exs`, and `session_options_test.exs`.

use std::net::{IpAddr, SocketAddr};

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, Response};
use serde_json::{Value, json};

use crate::config::Config;
use crate::test_support::{TestApp, body_text};

pub const PASSWORD_SALT: &[u8] = b"test-salt";

/// A fast (one-iteration) owner password hash.
pub fn password_hash(password: &str) -> String {
    crate::auth::hash_password_with(password, 1, PASSWORD_SALT)
}

/// Turns owner authentication on with `password`.
pub fn with_password(password: &str) -> impl FnOnce(&mut Config) {
    let hash = password_hash(password);
    move |config| {
        config.auth_disabled = false;
        config.admin_password_hash = Some(hash);
    }
}

/// A response with its body read.
pub struct Page {
    pub status: u16,
    pub headers: axum::http::HeaderMap,
    pub body: String,
}

impl Page {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|value| value.to_str().ok())
    }

    pub fn headers_all(&self, name: &str) -> Vec<&str> {
        self.headers
            .get_all(name)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .collect()
    }

    pub fn json(&self) -> Value {
        serde_json::from_str(&self.body).unwrap()
    }

    pub fn location(&self) -> Option<&str> {
        assert_eq!(
            self.status, 302,
            "expected a redirect, got {}: {}",
            self.status, self.body
        );
        self.header("location")
    }

    /// The `<meta name="csrf-token">` value.
    pub fn csrf_token(&self) -> String {
        let (marker, skip) = [
            (r#"<meta name="csrf-token" content=""#, 33),
            (r#"name="_csrf_token" value=""#, 26),
        ]
        .into_iter()
        .find(|(marker, _)| self.body.contains(marker))
        .unwrap();
        let start = self.body.find(marker).unwrap() + skip;
        let end = start + self.body[start..].find('"').unwrap();
        self.body[start..end].to_owned()
    }
}

/// A browser with a cookie jar and a peer address.
pub struct Browser<'a> {
    pub app: &'a TestApp,
    pub cookie: Option<String>,
    pub ip: IpAddr,
}

impl<'a> Browser<'a> {
    pub fn new(app: &'a TestApp) -> Self {
        Self {
            app,
            cookie: None,
            ip: "127.0.0.1".parse().unwrap(),
        }
    }

    pub fn from_ip(app: &'a TestApp, ip: &str) -> Self {
        Self {
            ip: ip.parse().unwrap(),
            ..Self::new(app)
        }
    }

    pub async fn send(&mut self, builder: axum::http::request::Builder, body: Body) -> Page {
        let builder = match &self.cookie {
            Some(cookie) => builder.header("cookie", format!("_manavault_key={cookie}")),
            None => builder,
        };
        let mut request = builder.body(body).unwrap();
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::new(self.ip, 40_000)));
        let response: Response<Body> = self.app.request(request).await;
        let status = response.status().as_u16();
        let headers = response.headers().clone();
        for cookie in headers.get_all("set-cookie") {
            let cookie = cookie.to_str().unwrap();
            if let Some(rest) = cookie.strip_prefix("_manavault_key=") {
                let value = rest.split(';').next().unwrap();
                self.cookie = if cookie.contains("max-age=0") || value.is_empty() {
                    None
                } else {
                    Some(value.to_owned())
                };
            }
        }
        Page {
            status,
            headers,
            body: body_text(response).await,
        }
    }

    pub async fn get(&mut self, path: &str) -> Page {
        self.send(Request::get(path), Body::empty()).await
    }

    pub async fn get_with(&mut self, path: &str, headers: &[(&str, &str)]) -> Page {
        let mut builder = Request::get(path);
        for (name, value) in headers {
            builder = builder.header(*name, *value);
        }
        self.send(builder, Body::empty()).await
    }

    pub async fn post_form(&mut self, path: &str, fields: &[(&str, &str)]) -> Page {
        let body = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(fields)
            .finish();
        self.send(
            Request::post(path).header("content-type", "application/x-www-form-urlencoded"),
            Body::from(body),
        )
        .await
    }

    pub async fn post_json(&mut self, path: &str, payload: &Value, csrf: Option<&str>) -> Page {
        let mut builder = Request::post(path).header("content-type", "application/json");
        if let Some(token) = csrf {
            builder = builder.header("x-csrf-token", token);
        }
        self.send(builder, Body::from(payload.to_string())).await
    }

    /// Loads a page and returns its CSRF token.
    pub async fn token(&mut self, path: &str) -> String {
        let page = self.get(path).await;
        assert_eq!(page.status, 200, "{}", page.body);
        page.csrf_token()
    }

    /// Signs in through the login form.
    pub async fn login(&mut self, password: &str, return_to: &str) -> Page {
        let token = self.token("/login").await;
        self.post_form(
            "/login",
            &[
                ("_csrf_token", &token),
                ("password", password),
                ("return_to", return_to),
            ],
        )
        .await
    }
}

const PRIVATE_BROWSER_PATHS: [&str; 12] = [
    "/",
    "/settings",
    "/cards",
    "/cards/card-id",
    "/decks",
    "/decks/deck-id",
    "/decks/deck-id/playtest",
    "/collection",
    "/collection/new",
    "/collection/locations/location-id",
    "/collection/item-id/edit",
    "/trade",
];

mod app_controller {
    use super::*;
    use async_graphql::MaybeUndefined;

    #[tokio::test]
    async fn get_root_serves_the_react_mount() {
        let app = TestApp::new().await;
        let page = Browser::new(&app).get("/").await;
        assert_eq!(page.status, 200);
        let body = &page.body;
        assert!(body.contains(r#"id="manavault-root""#));
        assert!(body.contains(r#"name="csrf-token""#));
        assert!(body.contains(r#"src="/shell/js/theme.js?v=test-asset-version""#));
        assert!(body.contains(r#"src="/shell/js/pwa-install.js?v=test-asset-version""#));
        assert!(!body.contains("<script>"));
        assert!(body.contains(r#"data-theme-style="glass""#));
        assert!(body.contains(r#"<html lang="en" class="h-screen w-screen overflow-hidden""#));
        assert!(body.contains(r#"<body class="h-screen w-screen overflow-hidden">"#));
        let csp = page.header("content-security-policy").unwrap();
        assert!(csp.contains("default-src 'self'"));
        assert!(csp.contains("worker-src 'self' blob:"));
        assert!(csp.contains("https://*.scryfall.io"));
        assert!(!csp.contains("'unsafe-eval'"));
        assert!(!csp.contains("5173"));
        assert!(!csp.contains("ws://"));
        assert_eq!(page.header("cross-origin-embedder-policy"), None);
        assert_eq!(page.header("cross-origin-opener-policy"), None);
        assert_eq!(page.header("x-content-type-options"), Some("nosniff"));
        assert_eq!(
            page.header("referrer-policy"),
            Some("strict-origin-when-cross-origin")
        );
        assert_eq!(
            page.header("cache-control"),
            Some("no-cache, no-store, must-revalidate")
        );
        assert!(
            page.header("set-cookie").is_some(),
            "the CSRF token is stored in the session"
        );
    }

    #[tokio::test]
    async fn scan_is_the_cross_origin_isolated_page() {
        let app = TestApp::new().await;
        let page = Browser::new(&app).get("/scan").await;
        assert!(page.body.contains(r#"id="manavault-root""#));
        assert_eq!(
            page.header("cross-origin-opener-policy"),
            Some("same-origin")
        );
        assert_eq!(
            page.header("cross-origin-embedder-policy"),
            Some("require-corp")
        );
        assert!(page.header("content-security-policy").is_some());
    }

    async fn save_kanagawa(app: &TestApp) {
        crate::settings::appearance::update(
            app.db(),
            MaybeUndefined::Value("kanagawa".into()),
            MaybeUndefined::Value("classic".into()),
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn the_owners_appearance_is_written_on_html_for_first_paint() {
        let app = TestApp::new().await;
        save_kanagawa(&app).await;
        let page = Browser::new(&app).get("/").await;
        assert!(page.body.contains(
            r#"<html lang="en" class="h-screen w-screen overflow-hidden" data-theme-style="classic" data-palette="kanagawa" data-appearance-source="account">"#
        ));
    }

    #[tokio::test]
    async fn a_signed_in_owner_gets_the_account_appearance_and_anonymous_visitors_do_not() {
        let app = TestApp::with_config(with_password("secret")).await;
        save_kanagawa(&app).await;
        let mut browser = Browser::new(&app);
        assert_eq!(
            browser.login("secret", "/settings").await.location(),
            Some("/settings")
        );
        let page = browser.get("/settings").await;
        assert!(page.body.contains(r#"data-palette="kanagawa""#));
        assert!(page.body.contains(r#"data-appearance-source="account""#));

        // Share pages render the same shell for anonymous visitors.
        let session = crate::web::session::Session::default();
        let preview =
            crate::web::app_shell::SharePreview::default_for(&app.state, "/share/wants/t");
        let response = crate::web::app_shell::render_app(
            &app.state,
            &session,
            &axum::http::HeaderMap::new(),
            &preview,
        )
        .await;
        let body = body_text(response).await;
        assert!(body.contains(r#"data-theme-style="glass""#));
        assert!(!body.contains("data-palette"));
        assert!(!body.contains("data-appearance-source"));
    }

    #[tokio::test]
    async fn absolute_metadata_urls_ignore_a_spoofed_host() {
        let app = TestApp::new().await;
        let page = Browser::new(&app)
            .get_with("/", &[("host", "attacker.example")])
            .await;
        assert!(
            page.body
                .contains(r#"property="og:url" content="http://localhost:4002/""#)
        );
        assert!(page.body.contains(
            r#"property="og:image" content="http://localhost:4002/android-chrome-512x512.png""#
        ));
        assert!(
            page.body
                .contains(r#"property="og:image:width" content="512""#)
        );
        assert!(
            page.body
                .contains(r#"name="twitter:card" content="summary_large_image""#)
        );
        assert!(!page.body.contains("attacker.example"));
    }

    #[tokio::test]
    async fn every_shell_route_serves_the_react_mount() {
        let app = TestApp::new().await;
        let mut browser = Browser::new(&app);
        for path in PRIVATE_BROWSER_PATHS {
            let page = browser.get(path).await;
            assert_eq!(page.status, 200, "{path}");
            assert!(page.body.contains(r#"id="manavault-root""#), "{path}");
        }
    }

    #[tokio::test]
    async fn built_assets_for_non_local_dev_hosts() {
        let app = TestApp::with_config(|config| config.vite_dev_server = true).await;
        let page = Browser::new(&app)
            .get_with("/", &[("host", "manavault.example.com")])
            .await;
        // The ESM entry stays at the unversioned URL Vite chunks use.
        assert!(page.body.contains(r#"src="/assets/react/app.js""#));
        assert!(!page.body.contains(r#"src="/assets/react/app.js?"#));
        assert!(!page.body.contains("127.0.0.1:5173"));
        assert!(
            page.body
                .contains(r#"href="/assets/css/app.css?v=test-asset-version""#)
        );
        let csp = page.header("content-security-policy").unwrap();
        assert!(csp.contains("'unsafe-eval'"));
    }

    #[tokio::test]
    async fn vite_assets_for_local_hosts_and_behind_the_dev_proxy() {
        let app = TestApp::with_config(|config| config.vite_dev_server = true).await;
        let local = Browser::new(&app)
            .get_with("/", &[("host", "localhost:4000")])
            .await;
        assert!(
            local
                .body
                .contains(r#"name="manavault-vite-origin" content="http://127.0.0.1:5173""#)
        );
        assert!(local.body.contains(r#"src="/shell/js/vite-bootstrap.js""#));
        let proxied = Browser::new(&app)
            .get_with(
                "/",
                &[
                    ("host", "review.onamp.dev"),
                    ("x-manavault-vite-proxy", "1"),
                ],
            )
            .await;
        assert!(
            proxied
                .body
                .contains(r#"name="manavault-vite-origin" content="""#)
        );
        assert!(
            proxied
                .body
                .contains(r#"src="/shell/js/vite-bootstrap.js""#)
        );
        assert!(!proxied.body.contains(r#"src="/assets/react/app.js""#));
        assert!(!proxied.body.contains("127.0.0.1:5173"));
    }

    #[tokio::test]
    async fn root_layout_includes_mobile_install_metadata() {
        let app = TestApp::new().await;
        let page = Browser::new(&app).get("/").await;
        for expected in [
            r#"name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover""#,
            r#"name="apple-mobile-web-app-capable" content="yes""#,
            r#"name="mobile-web-app-capable" content="yes""#,
            r##"name="theme-color" content="#166534""##,
            r#"rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png""#,
            r#"rel="manifest" href="/site.webmanifest?v=test-asset-version""#,
            r#"name="manavault-asset-version" content="test-asset-version""#,
            r#"src="/assets/react/app.js""#,
            "<title>ManaVault</title>",
            r#"name="description" content="Magic deck and collection manager.""#,
        ] {
            assert!(page.body.contains(expected), "{expected}");
        }
        assert!(!page.body.contains("data-pwa-install-debug"));
    }

    #[tokio::test]
    async fn health_and_unknown_routes() {
        let app = TestApp::new().await;
        let mut browser = Browser::new(&app);
        let health = browser.get("/health").await;
        assert_eq!(health.json(), json!({"status": "ok"}));
        let missing = browser.get("/nope").await;
        assert_eq!((missing.status, missing.body.as_str()), (404, "Not Found"));
        let missing = browser
            .get_with("/nope", &[("accept", "application/json")])
            .await;
        assert_eq!(missing.json(), json!({"errors": {"detail": "Not Found"}}));
    }
}

mod pwa {
    use super::*;

    #[tokio::test]
    async fn serves_the_manifest_with_install_metadata() {
        let app = TestApp::new().await;
        let page = Browser::new(&app).get("/site.webmanifest").await;
        assert_eq!(page.status, 200);
        assert_eq!(
            page.header("content-type"),
            Some("application/manifest+json; charset=utf-8")
        );
        assert_eq!(
            page.header("cache-control"),
            Some("no-cache, no-store, must-revalidate")
        );
        let manifest = page.json();
        assert_eq!(manifest["name"], "ManaVault");
        assert_eq!(manifest["short_name"], "ManaVault");
        assert_eq!(manifest["id"], "/");
        assert_eq!(manifest["display"], "standalone");
        assert_eq!(manifest["prefer_related_applications"], false);
        assert_eq!(manifest["start_url"], "/");
        assert_eq!(manifest["scope"], "/");
        assert_eq!(manifest["categories"], json!(["utilities", "productivity"]));
        let icons = manifest["icons"].as_array().unwrap();
        let srcs: Vec<&str> = icons
            .iter()
            .map(|icon| icon["src"].as_str().unwrap())
            .collect();
        assert!(srcs.contains(&"/android-chrome-192x192.png?v=test-asset-version"));
        assert!(srcs.contains(&"/android-chrome-512x512.png?v=test-asset-version"));
        assert!(
            srcs.iter()
                .any(|src| src.contains("android-chrome-192x192-maskable.png"))
        );
        assert!(
            srcs.iter()
                .any(|src| src.contains("android-chrome-512x512-maskable.png"))
        );
        assert!(icons.iter().any(|icon| icon["purpose"] == "any"));
        assert!(icons.iter().any(|icon| icon["purpose"] == "maskable"));
        assert_eq!(manifest["screenshots"][0]["form_factor"], "wide");
        assert_eq!(manifest["shortcuts"][0]["url"], "/collection");
    }

    #[tokio::test]
    async fn serves_the_service_worker_at_root_scope() {
        let app = TestApp::new().await;
        let page = Browser::new(&app).get("/sw.js").await;
        assert_eq!(page.status, 200);
        assert_eq!(
            page.header("cache-control"),
            Some("no-cache, no-store, must-revalidate")
        );
        assert_eq!(page.header("expires"), Some("0"));
        assert_eq!(page.header("service-worker-allowed"), Some("/"));
        assert_eq!(
            page.header("content-type"),
            Some("text/javascript; charset=utf-8")
        );
        assert!(page.body.contains(r#"self.addEventListener("fetch""#));
        assert!(
            page.body
                .contains(r#"CACHE_NAME = "manavault-pwa-vtest-asset-version""#)
        );
        assert!(page.body.contains(r#"OFFLINE_URL = "/offline.html""#));
        // Scanner model caches (manavault-scanner-*) must survive app updates.
        assert!(
            page.body
                .contains(r#"name.startsWith("manavault-pwa-") && name !== CACHE_NAME"#)
        );
    }

    #[tokio::test]
    async fn asset_links_default_and_custom_fingerprints() {
        let app = TestApp::new().await;
        let links = Browser::new(&app)
            .get("/.well-known/assetlinks.json")
            .await
            .json();
        assert_eq!(
            links[0]["target"]["sha256_cert_fingerprints"],
            json!([
                "6B:3F:13:D6:6A:11:BB:49:FE:D8:64:5C:7D:26:B8:2E:BD:FC:8C:14:19:53:1C:A3:35:E6:68:DF:F7:4E:13:89"
            ])
        );
        let app = TestApp::with_config(|config| {
            config.android_cert_fingerprints = vec!["AA:BB:CC:DD".into()];
        })
        .await;
        let links = Browser::new(&app)
            .get("/.well-known/assetlinks.json")
            .await
            .json();
        assert_eq!(links.as_array().unwrap().len(), 1);
        let link = &links[0];
        assert_eq!(
            link["relation"],
            json!(["delegate_permission/common.handle_all_urls"])
        );
        assert_eq!(link["target"]["namespace"], "android_app");
        assert_eq!(link["target"]["package_name"], "dev.cfb.manavault");
        assert_eq!(
            link["target"]["sha256_cert_fingerprints"],
            json!(["AA:BB:CC:DD"])
        );
    }
}

mod auth_controller {
    use super::*;

    #[tokio::test]
    async fn private_routes_require_auth_by_default_without_a_hash() {
        let app = TestApp::with_config(|config| {
            config.auth_disabled = false;
            config.admin_password_hash = None;
        })
        .await;
        let mut browser = Browser::new(&app);
        assert_eq!(
            browser.get("/collection").await.location(),
            Some("/login?return_to=%2Fcollection")
        );
        let login = browser.get("/login").await;
        assert_eq!(login.status, 503);
        assert!(login.body.contains("MANAVAULT_ADMIN_PASSWORD_HASH"));
    }

    #[tokio::test]
    async fn private_routes_allow_opt_out_auth() {
        let app = TestApp::new().await;
        let page = Browser::new(&app).get("/collection").await;
        assert!(page.body.contains(r#"id="manavault-root""#));
        let login = Browser::new(&app).get("/login?return_to=/decks").await;
        assert_eq!(login.location(), Some("/decks"));
    }

    #[tokio::test]
    async fn every_private_route_redirects_to_login_when_auth_is_configured() {
        let app = TestApp::with_config(with_password("secret")).await;
        for path in PRIVATE_BROWSER_PATHS {
            let expected = if path == "/" {
                "/login".to_owned()
            } else {
                format!(
                    "/login?{}",
                    url::form_urlencoded::Serializer::new(String::new())
                        .append_pair("return_to", path)
                        .finish()
                )
            };
            let page = Browser::new(&app).get(path).await;
            assert_eq!(page.location(), Some(expected.as_str()), "{path}");
        }
        let scan = Browser::new(&app).get("/scan").await;
        assert_eq!(scan.location(), Some("/login?return_to=%2Fscan"));
    }

    #[tokio::test]
    async fn login_page_uses_home_branding() {
        let app = TestApp::with_config(with_password("secret")).await;
        let page = Browser::new(&app).get("/login").await;
        assert_eq!(page.status, 200);
        assert!(page.body.contains(r#"src="/images/logo.png""#));
        assert!(page.body.contains("Your Magic vault, secured."));
        assert!(page.body.contains("Owner access"));
        assert!(page.header("content-security-policy").is_some());
    }

    #[tokio::test]
    async fn login_creates_a_session_for_private_routes() {
        let app = TestApp::with_config(with_password("secret")).await;
        let mut browser = Browser::new(&app);
        let login = browser.login("secret", "/collection").await;
        assert_eq!(login.location(), Some("/collection"));
        let session = app
            .state
            .sessions
            .decode(browser.cookie.as_ref().unwrap())
            .unwrap();
        assert_eq!(
            session.get("manavault_authenticated"),
            Some(&crate::crypto::SessionValue::Bool(true))
        );
        assert_eq!(
            session.get("manavault_auth_fingerprint"),
            Some(&crate::crypto::SessionValue::Text(
                crate::auth::admin_password_fingerprint(&app.state.config).unwrap()
            ))
        );
        let page = browser.get("/collection").await;
        assert!(page.body.contains(r#"id="manavault-root""#));
    }

    #[tokio::test]
    async fn login_requires_a_csrf_token() {
        let app = TestApp::with_config(with_password("secret")).await;
        let mut browser = Browser::new(&app);
        let page = browser
            .post_form("/login", &[("password", "secret"), ("return_to", "/")])
            .await;
        assert_eq!(page.status, 403);
        assert!(browser.cookie.is_none());
    }

    #[tokio::test]
    async fn rotating_the_password_hash_invalidates_existing_sessions() {
        let first = TestApp::with_config(with_password("first password")).await;
        let mut browser = Browser::new(&first);
        browser.login("first password", "/collection").await;
        let cookie = browser.cookie.clone();
        let rotated = TestApp::with_config(with_password("replacement password")).await;
        let mut browser = Browser::new(&rotated);
        browser.cookie = cookie;
        assert_eq!(
            browser.get("/collection").await.location(),
            Some("/login?return_to=%2Fcollection")
        );
    }

    #[tokio::test]
    async fn logout_drops_the_complete_session() {
        let app = TestApp::with_config(with_password("secret")).await;
        let mut browser = Browser::new(&app);
        browser.login("secret", "/collection").await;
        let token = browser.token("/collection").await;
        let page = browser
            .post_form("/logout", &[("_csrf_token", &token)])
            .await;
        assert_eq!(page.location(), Some("/login"));
        let cookie = page.header("set-cookie").unwrap();
        assert!(cookie.starts_with("_manavault_key=;"));
        assert!(cookie.contains("max-age=0"));
        assert!(browser.cookie.is_none());
    }

    #[tokio::test]
    async fn login_renders_and_redirects_only_to_safe_local_destinations() {
        let app = TestApp::with_config(with_password("secret")).await;
        for (label, return_to, expected) in crate::web::return_path::tests::CASES {
            let query = url::form_urlencoded::Serializer::new(String::new())
                .append_pair("return_to", return_to)
                .finish();
            let page = Browser::new(&app).get(&format!("/login?{query}")).await;
            let start = page.body.find(r#"name="return_to" value=""#).unwrap() + 24;
            let end = start + page.body[start..].find('"').unwrap();
            assert_eq!(
                &page.body[start..end],
                crate::web::app_shell::escape(expected),
                "GET {label}"
            );
            let page = Browser::new(&app).login("secret", return_to).await;
            let location = page.location().unwrap();
            assert_eq!(location, expected, "POST {label}");
            let resolved = url::Url::parse("https://manavault.test")
                .unwrap()
                .join(location)
                .unwrap();
            assert_eq!(resolved.host_str(), Some("manavault.test"));
        }
    }

    #[tokio::test]
    async fn login_sets_a_persistent_session_cookie() {
        let app = TestApp::with_config(with_password("secret")).await;
        let page = Browser::new(&app).login("secret", "/collection").await;
        let cookies = page.headers_all("set-cookie");
        assert_eq!(cookies.len(), 1);
        assert!(cookies[0].contains("max-age=15552000"));
        assert!(cookies[0].contains("SameSite=Lax"));
        assert!(cookies[0].contains("HttpOnly"));
        assert!(!cookies[0].contains("secure"));

        let secure = TestApp::with_config(|config| {
            with_password("secret")(config);
            config.secure_cookies = true;
            config.session_max_age_days = 7;
        })
        .await;
        let page = Browser::new(&secure).login("secret", "/collection").await;
        let cookie = page.header("set-cookie").unwrap();
        assert!(cookie.contains("; secure"));
        assert!(cookie.contains(&format!("max-age={}", 7 * 24 * 60 * 60)));
    }

    #[tokio::test]
    async fn login_rejects_an_incorrect_password_and_requires_one() {
        let app = TestApp::with_config(with_password("secret")).await;
        let page = Browser::new(&app).login("wrong", "/collection").await;
        assert_eq!(page.status, 401);
        assert!(page.body.contains("Incorrect password"));
        let mut browser = Browser::new(&app);
        let token = browser.token("/login").await;
        let page = browser
            .post_form("/login", &[("_csrf_token", &token)])
            .await;
        assert_eq!(page.status, 400);
        assert!(page.body.contains("Password is required"));
    }

    fn rate_limited(per_ip: u32, global: u32, ban: u32) -> impl FnOnce(&mut Config) {
        move |config| {
            with_password("secret")(config);
            config.auth_rate_limit.limit.window = std::time::Duration::from_secs(60);
            config.auth_rate_limit.limit.max_per_ip = per_ip;
            config.auth_rate_limit.limit.max_global = global;
            config.auth_rate_limit.permanent_ban_after_failures = ban;
        }
    }

    #[tokio::test]
    async fn login_rate_limits_repeated_incorrect_passwords() {
        let app = TestApp::with_config(rate_limited(2, 100, 30)).await;
        let mut browser = Browser::new(&app);
        assert_eq!(browser.login("wrong", "/").await.status, 401);
        assert_eq!(browser.login("still wrong", "/").await.status, 401);
        let page = browser.login("secret", "/").await;
        assert_eq!(page.status, 429);
        assert_eq!(page.header("retry-after"), Some("60"));
        assert!(page.body.contains("Too many incorrect password attempts"));
    }

    #[tokio::test]
    async fn login_has_a_global_failed_attempt_budget() {
        let app = TestApp::with_config(rate_limited(10, 2, 100)).await;
        assert_eq!(
            Browser::from_ip(&app, "127.0.0.1")
                .login("wrong", "/")
                .await
                .status,
            401
        );
        assert_eq!(
            Browser::from_ip(&app, "127.0.0.2")
                .login("wrong", "/")
                .await
                .status,
            401
        );
        let blocked = Browser::from_ip(&app, "127.0.0.3")
            .login("secret", "/")
            .await;
        assert_eq!(blocked.status, 429);
    }

    #[tokio::test]
    async fn login_permanently_bans_a_client() {
        let app = TestApp::with_config(rate_limited(10, 100, 3)).await;
        let attempt = |password: &'static str| {
            let app = &app;
            async move {
                Browser::from_ip(app, "127.0.0.9")
                    .login(password, "/")
                    .await
            }
        };
        assert_eq!(attempt("wrong").await.status, 401);
        assert_eq!(attempt("wrong again").await.status, 401);
        let banned = attempt("still wrong").await;
        assert_eq!(banned.status, 403);
        assert!(banned.body.contains("permanently blocked"));
        let banned_at: Option<String> = sqlx::query_scalar(
            "SELECT banned_at FROM auth_client_failures WHERE client_id = '127.0.0.9'",
        )
        .fetch_one(app.db())
        .await
        .unwrap();
        assert!(banned_at.is_some());
        assert_eq!(attempt("secret").await.status, 403);
        // Other clients are unaffected.
        assert_eq!(
            Browser::from_ip(&app, "127.0.0.8")
                .login("secret", "/")
                .await
                .status,
            302
        );
    }

    #[tokio::test]
    async fn successful_login_clears_prior_failures() {
        let app = TestApp::with_config(rate_limited(2, 100, 2)).await;
        let mut browser = Browser::new(&app);
        assert_eq!(browser.login("wrong", "/").await.status, 401);
        assert_eq!(browser.login("secret", "/").await.location(), Some("/"));
        let mut other = Browser::new(&app);
        assert_eq!(other.login("wrong", "/").await.status, 401);
    }

    #[tokio::test]
    async fn trusted_proxy_headers_identify_clients() {
        let app = TestApp::with_config(|config| {
            rate_limited(10, 100, 1)(config);
            config.trust_proxy_headers = true;
        })
        .await;
        let mut browser = Browser::new(&app);
        let token = browser.token("/login").await;
        let page = browser
            .send(
                Request::post("/login")
                    .header("content-type", "application/x-www-form-urlencoded")
                    .header("x-forwarded-for", "1.1.1.1, 203.0.113.7"),
                Body::from(format!("_csrf_token={token}&password=wrong")),
            )
            .await;
        assert_eq!(page.status, 403);
        let client: String = sqlx::query_scalar("SELECT client_id FROM auth_client_failures")
            .fetch_one(app.db())
            .await
            .unwrap();
        assert_eq!(client, "203.0.113.7");
    }

    #[tokio::test]
    async fn private_graphql_returns_json_401() {
        let app = TestApp::with_config(with_password("secret")).await;
        let page = Browser::new(&app)
            .post_json("/api/graphql", &json!({"query": "{ __typename }"}), None)
            .await;
        assert_eq!(page.status, 401);
        assert_eq!(
            page.json(),
            json!({"errors": [{"message": "Authentication required"}]})
        );
    }
}

mod graphql_csrf {
    use super::*;

    const MUTATION: &str = r#"mutation CreateCsrfKey { createApiKey(name: "CSRF protected key") { apiKey { id name } } }"#;
    const QUERY: &str = "query Appearance { appearanceSettings { palette themeStyle } }";
    const FORBIDDEN: &str = r#"{"errors":[{"message":"Invalid CSRF token"}]}"#;

    async fn key_count(app: &TestApp) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM api_keys")
            .fetch_one(app.db())
            .await
            .unwrap()
    }

    async fn signed_in(app: &TestApp) -> (Browser<'_>, String) {
        let mut browser = Browser::new(app);
        browser.login("secret", "/collection").await;
        let token = browser.token("/collection").await;
        (browser, token)
    }

    #[tokio::test]
    async fn session_authenticated_queries_require_a_valid_token() {
        let app = TestApp::with_config(with_password("secret")).await;
        let (mut browser, token) = signed_in(&app).await;
        let payload =
            json!({"query": format!("{QUERY}\n{MUTATION}"), "operationName": "Appearance"});
        let missing = browser.post_json("/api/graphql", &payload, None).await;
        assert_eq!((missing.status, missing.body.as_str()), (403, FORBIDDEN));
        let valid = browser
            .post_json("/api/graphql", &payload, Some(&token))
            .await;
        assert_eq!(valid.status, 200);
        assert_eq!(
            valid.json(),
            json!({"data": {"appearanceSettings": {"palette": "claret", "themeStyle": "glass"}}})
        );
        assert_eq!(key_count(&app).await, 0);
    }

    #[tokio::test]
    async fn auth_disabled_form_posts_still_require_a_token() {
        let app = TestApp::new().await;
        let body = format!(
            "query={}",
            url::form_urlencoded::byte_serialize(MUTATION.as_bytes()).collect::<String>()
        );
        let page = Browser::new(&app)
            .send(
                Request::post("/api/graphql")
                    .header("content-type", "application/x-www-form-urlencoded")
                    .header("origin", "https://evil.example"),
                Body::from(body),
            )
            .await;
        assert_eq!((page.status, page.body.as_str()), (403, FORBIDDEN));
        assert_eq!(key_count(&app).await, 0);
    }

    #[tokio::test]
    async fn graphql_rejects_get() {
        let app = TestApp::with_config(with_password("secret")).await;
        let (mut browser, _token) = signed_in(&app).await;
        let query: String = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("query", QUERY)
            .finish();
        let page = browser.get(&format!("/api/graphql?{query}")).await;
        assert_eq!(page.status, 405);
        assert_eq!(page.header("allow"), Some("POST"));
        assert_eq!(
            page.json(),
            json!({"errors": [{"message": "Method not allowed"}]})
        );
    }

    #[tokio::test]
    async fn missing_and_forged_tokens_reject_mutations() {
        let app = TestApp::with_config(with_password("secret")).await;
        let (mut browser, token) = signed_in(&app).await;
        let payload = json!({"query": MUTATION});
        assert_eq!(
            browser
                .post_json("/api/graphql", &payload, None)
                .await
                .status,
            403
        );
        assert_eq!(
            browser
                .post_json("/api/graphql", &payload, Some("forged-token"))
                .await
                .status,
            403
        );
        assert_eq!(key_count(&app).await, 0);
        let valid = browser
            .post_json("/api/graphql", &payload, Some(&token))
            .await;
        assert_eq!(
            valid.json()["data"]["createApiKey"]["apiKey"]["name"],
            "CSRF protected key"
        );
        assert_eq!(key_count(&app).await, 1);
    }

    fn multipart(fields: &[(&str, &str)]) -> (String, String) {
        let boundary = "manavault-csrf-boundary";
        let mut parts: Vec<String> = fields
            .iter()
            .map(|(name, value)| {
                format!("--{boundary}\r\ncontent-disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n")
            })
            .collect();
        parts.push(format!("--{boundary}--\r\n"));
        let body = parts.concat();
        (format!("multipart/form-data; boundary={boundary}"), body)
    }

    #[tokio::test]
    async fn no_body_encoding_bypasses_csrf() {
        let app = TestApp::with_config(with_password("secret")).await;
        let (mut browser, token) = signed_in(&app).await;
        // Drop the header-less defaults: every request below carries no header token.
        let json_missing = browser
            .post_json("/api/graphql", &json!({"query": MUTATION}), None)
            .await;
        assert_eq!(json_missing.status, 403);
        let form_missing = browser
            .post_form("/api/graphql", &[("query", MUTATION)])
            .await;
        assert_eq!(form_missing.status, 403);
        let (content_type, body) = multipart(&[("query", MUTATION)]);
        let multipart_missing = browser
            .send(
                Request::post("/api/graphql").header("content-type", content_type),
                Body::from(body),
            )
            .await;
        assert_eq!(multipart_missing.status, 403);
        let operations = json!({"query": MUTATION}).to_string();
        let (content_type, body) = multipart(&[("operations", &operations)]);
        let operations_missing = browser
            .send(
                Request::post("/api/graphql").header("content-type", content_type),
                Body::from(body),
            )
            .await;
        assert_eq!(operations_missing.status, 403);
        let raw_missing = browser
            .send(
                Request::post("/api/graphql").header("content-type", "application/graphql"),
                Body::from(MUTATION),
            )
            .await;
        assert_eq!(raw_missing.status, 403);
        assert_eq!(key_count(&app).await, 0);

        let json_valid = browser
            .post_json(
                "/api/graphql",
                &json!({"query": MUTATION, "_csrf_token": token}),
                None,
            )
            .await;
        assert!(json_valid.json()["data"]["createApiKey"]["apiKey"]["id"].is_string());
        let form_valid = browser
            .post_form(
                "/api/graphql",
                &[("query", MUTATION), ("_csrf_token", &token)],
            )
            .await;
        assert!(form_valid.json()["data"]["createApiKey"]["apiKey"]["id"].is_string());
        let (content_type, body) = multipart(&[("query", MUTATION), ("_csrf_token", &token)]);
        let multipart_valid = browser
            .send(
                Request::post("/api/graphql").header("content-type", content_type),
                Body::from(body),
            )
            .await;
        assert!(multipart_valid.json()["data"]["createApiKey"]["apiKey"]["id"].is_string());
        assert_eq!(key_count(&app).await, 3);
    }

    #[tokio::test]
    async fn a_token_from_the_prior_session_is_rejected_after_login() {
        let app = TestApp::with_config(with_password("secret")).await;
        let (mut browser, stale) = signed_in(&app).await;
        let page = browser
            .post_form(
                "/login",
                &[
                    ("password", "secret"),
                    ("return_to", "/collection"),
                    ("_csrf_token", &stale),
                ],
            )
            .await;
        assert_eq!(page.location(), Some("/collection"));
        let current = browser.token("/collection").await;
        let payload = json!({"query": MUTATION});
        assert_eq!(
            browser
                .post_json("/api/graphql", &payload, Some(&stale))
                .await
                .status,
            403
        );
        assert_eq!(key_count(&app).await, 0);
        let ok = browser
            .post_json("/api/graphql", &payload, Some(&current))
            .await;
        assert!(ok.json()["data"]["createApiKey"]["apiKey"]["id"].is_string());
    }

    #[tokio::test]
    async fn transport_batches_run_each_query() {
        let app = TestApp::new().await;
        let mut browser = Browser::new(&app);
        let token = browser.token("/").await;
        let page = browser
            .post_json(
                "/api/graphql",
                &json!([{"id": "a", "query": QUERY}, {"id": "b", "query": "{ appearanceSettings { palette } }"}]),
                Some(&token),
            )
            .await;
        assert_eq!(
            page.json(),
            json!([
                {"id": "a", "payload": {"data": {"appearanceSettings": {"palette": "claret", "themeStyle": "glass"}}}},
                {"id": "b", "payload": {"data": {"appearanceSettings": {"palette": "claret"}}}}
            ])
        );
        // Fields keep the query's order, as in Absinthe.
        let ordered = browser
            .post_json(
                "/api/graphql",
                &json!({"query": "{ backupSettings { provider cron } appearanceSettings { palette } }"}),
                Some(&token),
            )
            .await;
        assert!(
            ordered
                .body
                .starts_with(r#"{"data":{"backupSettings":{"provider":"none","cron""#),
            "{}",
            ordered.body
        );
        let missing = browser
            .post_json("/api/graphql", &json!({}), Some(&token))
            .await;
        assert_eq!(missing.status, 400);
        assert_eq!(
            missing.json(),
            json!({"errors": [{"message": "No query document supplied"}]})
        );
    }
}

mod vendor {
    use super::*;
    use wiremock::matchers::{body_json, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn app_with(server: &MockServer) -> TestApp {
        let url = format!("{}/affiliate", server.uri());
        TestApp::with_config(|config| config.platform_urls.star_city_games_affiliate = url).await
    }

    #[tokio::test]
    async fn creates_and_redirects_to_an_scg_decklist() {
        let server = MockServer::start().await;
        let id = "f60354c7-727e-4950-ad33-b458600be376";
        Mock::given(method("POST"))
            .and(path("/affiliate"))
            .and(body_json(json!({"data": "2 Sol Ring\n1 Lightning Bolt"})))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"affiliateDataID": id})))
            .mount(&server)
            .await;
        let app = app_with(&server).await;
        let mut browser = Browser::new(&app);
        let token = browser.token("/").await;
        let page = browser
            .post_form(
                "/vendors/star-city-games/deck-builder",
                &[
                    ("_csrf_token", &token),
                    ("data", "2 Sol Ring\n1 Lightning Bolt"),
                ],
            )
            .await;
        let expected = format!("https://starcitygames.com/shop/deck-builder/?data={id}");
        assert_eq!(page.location(), Some(expected.as_str()));
    }

    #[tokio::test]
    async fn reports_vendor_failures_and_missing_decklists() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(503).set_body_string("unavailable"))
            .mount(&server)
            .await;
        let app = app_with(&server).await;
        let mut browser = Browser::new(&app);
        let token = browser.token("/").await;
        let page = browser
            .post_form(
                "/vendors/star-city-games/deck-builder",
                &[("_csrf_token", &token), ("data", "1 Sol Ring")],
            )
            .await;
        assert_eq!(page.status, 502);
        assert_eq!(
            page.body,
            "StarCityGames is unavailable. Please try again later."
        );
        let page = browser
            .post_form(
                "/vendors/star-city-games/deck-builder",
                &[("_csrf_token", &token)],
            )
            .await;
        assert_eq!(
            (page.status, page.body.as_str()),
            (422, "A decklist is required.")
        );
        let page = browser
            .post_form(
                "/vendors/star-city-games/deck-builder",
                &[("data", "1 Sol Ring")],
            )
            .await;
        assert_eq!(page.status, 403);
    }
}

mod scanner {
    use super::*;
    use crate::scanner::bundle;
    use base64::Engine as _;

    fn install(app: &TestApp) {
        let root = &app.state.config.scanner_bundle_dir;
        let files = [
            ("arts.json", "[]"),
            ("detector.onnx", "d"),
            ("embed.onnx", "e"),
            ("search.onnx", "s"),
        ];
        let manifest = json!({
            "version": "v1",
            "created": "now",
            "gallery": {},
            "constants": {},
            "files": files.iter().map(|(name, body)| {
                ((*name).to_owned(), json!({"bytes": body.len(), "sha256": crate::crypto::sha256_hex(body.as_bytes())}))
            }).collect::<serde_json::Map<_, _>>()
        });
        let incoming = root.join(".incoming/v1");
        std::fs::create_dir_all(&incoming).unwrap();
        for (name, body) in files {
            std::fs::write(incoming.join(name), body).unwrap();
        }
        std::fs::write(incoming.join("manifest.json"), manifest.to_string()).unwrap();
        std::fs::write(incoming.join("SHA256SUMS"), "checksums").unwrap();
        bundle::install(root, &manifest, &incoming).unwrap();
    }

    #[tokio::test]
    async fn bundle_is_404_until_installed_then_served_immutably() {
        let app = TestApp::new().await;
        let mut browser = Browser::new(&app);
        let missing = browser.get("/api/scanner/bundle").await;
        assert_eq!(missing.status, 404);
        assert!(missing.json()["errors"].is_array());
        install(&app);
        let page = browser.get("/api/scanner/bundle").await;
        let data = &page.json()["data"];
        assert_eq!(data["version"], "v1");
        assert_eq!(
            data["files"]["arts.json"],
            "/api/scanner/bundles/v1/arts.json"
        );
        assert!(data["files"].get("printings.json").is_none());
        assert_eq!(
            data["sizes"],
            json!({"arts.json": 2, "detector.onnx": 1, "embed.onnx": 1, "search.onnx": 1})
        );
        assert_eq!(page.header("cache-control"), Some("private, no-cache"));
        let file = browser.get("/api/scanner/bundles/v1/arts.json").await;
        assert_eq!(file.body, "[]");
        assert_eq!(file.header("content-encoding"), None);
        assert_eq!(file.header("content-type"), Some("application/json"));
        assert_eq!(
            file.header("cache-control"),
            Some("private, max-age=31536000, immutable")
        );
        assert_eq!(
            browser
                .get("/api/scanner/bundles/v1/unknown.exe")
                .await
                .status,
            404
        );
    }

    #[tokio::test]
    async fn serves_gzip_and_recreates_it_for_older_bundles() {
        let app = TestApp::new().await;
        install(&app);
        let gzip_path = app.state.config.scanner_bundle_dir.join("v1/arts.json.gz");
        std::fs::remove_file(&gzip_path).unwrap();
        let mut request = Request::get("/api/scanner/bundles/v1/arts.json")
            .header("accept-encoding", "br, gzip")
            .body(Body::empty())
            .unwrap();
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 1))));
        let response = app.request(request).await;
        assert_eq!(response.headers()["content-encoding"], "gzip");
        assert_eq!(response.headers()["vary"], "accept-encoding");
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let mut decoded = String::new();
        std::io::Read::read_to_string(&mut flate2::read::GzDecoder::new(&bytes[..]), &mut decoded)
            .unwrap();
        assert_eq!(decoded, "[]");
        assert!(gzip_path.is_file());
    }

    const CAPTURE: &str = "11111111-2222-4333-8444-555555555555";
    const LABEL: &str = "54772e15-d99d-4eec-ba8d-b9202a7e318b";
    const TOKEN: &str = "tttttttttttttttttttttttttttttttttttttttt";

    fn frame() -> Vec<u8> {
        std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../test/support/fixtures/scanner-frame.jpg"
        ))
        .unwrap()
    }

    fn payload(overrides: &Value) -> Value {
        let mut payload = json!({
            "capture_id": CAPTURE,
            "label": LABEL,
            "top1": LABEL,
            "click": [32, 32],
            "quad": [[4, 4], [60, 4], [60, 60], [4, 60]],
            "up_vote": 1.0,
            "similarity": 0.91,
            "margin": 0.3,
            "finish": "foil",
            "bundle_version": "retrain-20260925T043526910942Z",
            "image": format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(frame()))
        });
        for (key, value) in overrides.as_object().unwrap() {
            if value == "__delete__" {
                payload.as_object_mut().unwrap().remove(key);
            } else {
                payload[key] = value.clone();
            }
        }
        payload
    }

    async fn corrections(app: &TestApp) -> Vec<Value> {
        let page = crate::scanner::corrections::page(&app.state.config.scanner_bundle_dir, 0)
            .await
            .unwrap();
        page["corrections"].as_array().unwrap().clone()
    }

    async fn post(browser: &mut Browser<'_>, token: &str, payload: &Value) -> Page {
        browser
            .post_json("/api/scanner/corrections", payload, Some(token))
            .await
    }

    #[tokio::test]
    async fn stores_labelled_frames_relabels_and_skips() {
        let app = TestApp::new().await;
        let mut browser = Browser::new(&app);
        let token = browser.token("/").await;
        let created = post(&mut browser, &token, &payload(&json!({}))).await;
        assert_eq!(created.status, 201);
        assert_eq!(created.json(), json!({"data": {"capture_id": CAPTURE}}));
        let dir = crate::scanner::corrections::directory(&app.state.config.scanner_bundle_dir)
            .join(CAPTURE);
        assert_eq!(std::fs::read(dir.join("crop.jpg")).unwrap(), frame());
        let rows = corrections(&app).await;
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["label"], LABEL);
        assert_eq!(rows[0]["source"], "manavault-scanner");
        assert_eq!(rows[0]["finish"], "foil");
        assert!(["train", "eval"].contains(&rows[0]["split"].as_str().unwrap()));
        assert!(rows[0].get("image").is_none());

        let other = "db6358cf-fcb9-42af-9755-dd1f39bfc8ff";
        let relabel = payload(&json!({"label": other, "image": "__delete__"}));
        assert_eq!(post(&mut browser, &token, &relabel).await.status, 201);
        // Identical resubmissions are not appended again.
        assert_eq!(post(&mut browser, &token, &relabel).await.status, 201);
        let labels: Vec<Value> = corrections(&app)
            .await
            .iter()
            .map(|row| row["label"].clone())
            .collect();
        assert_eq!(labels, vec![json!(LABEL), json!(other)]);

        let drawn = json!([[5, 3], [61, 5], [59, 61], [3, 59]]);
        let checked = payload(
            &json!({"label": other, "quad": drawn, "quad_source": "manual", "image": "__delete__"}),
        );
        assert_eq!(post(&mut browser, &token, &checked).await.status, 201);
        let rows = corrections(&app).await;
        assert!(rows[0].get("quad_source").is_none());
        assert_eq!(rows[2]["quad"], drawn);
        assert_eq!(rows[2]["quad_source"], "manual");

        let skipped = payload(&json!({"label": null, "image": "__delete__"}));
        assert_eq!(post(&mut browser, &token, &skipped).await.status, 201);
        let rows = corrections(&app).await;
        assert_eq!(rows.last().unwrap().get("label"), Some(&Value::Null));
        // The first crop is never overwritten.
        assert_eq!(std::fs::read(dir.join("crop.jpg")).unwrap(), frame());
    }

    #[tokio::test]
    async fn rejects_malformed_corrections_and_image_less_new_captures() {
        let app = TestApp::new().await;
        let mut browser = Browser::new(&app);
        let token = browser.token("/").await;
        for bad in [
            json!({"label": "not-a-uuid"}),
            json!({"click": [900, 10]}),
            json!({"finish": "shiny"}),
            json!({"quad_source": "guessed"}),
            json!({"quad_source": "manual", "quad": null}),
            json!({"image": "data:image/jpeg;base64,bm90IGEganBlZw=="}),
            json!({"image": "__delete__"}),
        ] {
            let page = post(&mut browser, &token, &payload(&bad)).await;
            assert_eq!(page.status, 400, "{bad}");
            assert_eq!(
                page.json(),
                json!({"errors": [{"message": "Invalid correction"}]})
            );
        }
        assert_eq!(corrections(&app).await, Vec::<Value>::new());
        let unprotected = browser
            .post_json("/api/scanner/corrections", &payload(&json!({})), None)
            .await;
        assert_eq!(unprotected.status, 403);
    }

    #[tokio::test]
    async fn exports_with_the_bearer_token_only_when_auth_is_on() {
        let setup = TestApp::new().await;
        let mut browser = Browser::new(&setup);
        let token = browser.token("/").await;
        post(&mut browser, &token, &payload(&json!({}))).await;
        let source = setup.state.config.scanner_bundle_dir.clone();

        let configure = |token: Option<&str>| {
            let source = source.clone();
            let token = token.map(str::to_owned);
            move |config: &mut Config| {
                with_password("secret")(config);
                config.scanner_bundle_dir = source;
                config.scanner_corrections_token = token;
            }
        };
        let app = TestApp::with_config(configure(Some(TOKEN))).await;
        let mut anonymous = Browser::new(&app);
        let page = anonymous.get("/api/scanner/corrections").await;
        assert_eq!(page.status, 401);
        assert_eq!(
            page.json(),
            json!({"errors": [{"message": "Authentication required"}]})
        );
        let wrong = anonymous
            .get_with(
                "/api/scanner/corrections",
                &[("authorization", "Bearer wrong")],
            )
            .await;
        assert_eq!(
            wrong.json(),
            json!({"errors": [{"message": "Invalid scanner corrections token"}]})
        );

        let disabled = TestApp::with_config(configure(None)).await;
        let page = Browser::new(&disabled)
            .get_with(
                "/api/scanner/corrections",
                &[("authorization", &format!("Bearer {TOKEN}"))],
            )
            .await;
        assert_eq!(page.status, 401);
        assert!(
            page.json()["errors"][0]["message"]
                .as_str()
                .unwrap()
                .starts_with("Token export is disabled")
        );

        let bearer = format!("Bearer {TOKEN}");
        let auth = [("authorization", bearer.as_str())];
        let page = anonymous.get_with("/api/scanner/corrections", &auth).await;
        let data = &page.json()["data"];
        assert_eq!(data["cursor"], 1);
        assert_eq!(data["has_more"], false);
        assert_eq!(data["corrections"][0]["capture_id"], CAPTURE);
        assert_eq!(page.header("cache-control"), Some("private, no-store"));
        let crop = anonymous
            .get_with(&format!("/api/scanner/corrections/{CAPTURE}/crop"), &auth)
            .await;
        assert_eq!(crop.status, 200);
        assert_eq!(crop.header("content-type"), Some("image/jpeg"));
        assert_eq!(crop.header("cache-control"), Some("private, no-store"));
        assert_eq!(
            anonymous
                .get_with("/api/scanner/corrections?cursor=-1", &auth)
                .await
                .status,
            400
        );
        assert_eq!(
            anonymous
                .get_with("/api/scanner/corrections/../crop", &auth)
                .await
                .status,
            404
        );
        assert_eq!(
            anonymous
                .get_with("/api/scanner/corrections?cursor=1", &auth)
                .await
                .json()["data"]["corrections"],
            json!([])
        );
        // The owner's session works without a token.
        let mut owner = Browser::new(&app);
        owner.login("secret", "/").await;
        assert_eq!(owner.get("/api/scanner/corrections").await.status, 200);
    }
}

mod socket {
    use super::*;
    use futures_util::{SinkExt as _, StreamExt as _};
    use tokio_tungstenite::tungstenite::Message;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest as _;
    use tracing_subscriber::layer::SubscriberExt as _;

    type Client = tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >;

    async fn serve(app: &TestApp) -> SocketAddr {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let router = app.router();
        tokio::spawn(async move {
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .unwrap();
        });
        addr
    }

    async fn connect(
        addr: SocketAddr,
        query: &str,
        headers: &[(&str, &str)],
    ) -> Result<Client, u16> {
        let mut request = format!("ws://{addr}/socket/websocket?{query}")
            .into_client_request()
            .unwrap();
        for (name, value) in headers {
            request.headers_mut().insert(
                axum::http::HeaderName::from_bytes(name.as_bytes()).unwrap(),
                value.parse().unwrap(),
            );
        }
        match tokio_tungstenite::connect_async(request).await {
            Ok((client, _)) => Ok(client),
            Err(tokio_tungstenite::tungstenite::Error::Http(response)) => {
                Err(response.status().as_u16())
            }
            Err(error) => unreachable!("unexpected websocket error: {error}"),
        }
    }

    async fn send(client: &mut Client, frame: Value) {
        client.send(Message::text(frame.to_string())).await.unwrap();
    }

    async fn receive(client: &mut Client) -> Value {
        loop {
            let message = tokio::time::timeout(std::time::Duration::from_secs(5), client.next())
                .await
                .expect("a frame within five seconds")
                .unwrap()
                .unwrap();
            if let Message::Text(text) = message {
                return serde_json::from_str(text.as_str()).unwrap();
            }
        }
    }

    const SERVER_LOG: &str = "subscription { serverLog { timestamp level message } }";

    #[tokio::test]
    async fn server_logs_are_delivered_through_the_subscription() {
        let app = TestApp::new().await;
        let addr = serve(&app).await;
        let mut client = connect(addr, "vsn=2.0.0", &[]).await.unwrap();

        send(&mut client, json!([null, "1", "phoenix", "heartbeat", {}])).await;
        assert_eq!(
            receive(&mut client).await,
            json!([null, "1", "phoenix", "phx_reply", {"status": "ok", "response": {}}])
        );
        send(&mut client, json!(["3", "3", "elsewhere", "phx_join", {}])).await;
        assert_eq!(
            receive(&mut client).await[4],
            json!({"status": "error", "response": {"reason": "unmatched topic"}})
        );
        send(
            &mut client,
            json!(["4", "4", "__absinthe__:control", "doc", {"query": "{ __typename }"}]),
        )
        .await;
        assert_eq!(
            receive(&mut client).await[4]["response"],
            json!({"reason": "unmatched topic"})
        );

        send(
            &mut client,
            json!(["5", "5", "__absinthe__:control", "phx_join", {}]),
        )
        .await;
        assert_eq!(
            receive(&mut client).await,
            json!(["5", "5", "__absinthe__:control", "phx_reply", {"status": "ok", "response": {}}])
        );
        send(
            &mut client,
            json!(["5", "6", "__absinthe__:control", "doc", {"query": "{ appearanceSettings { palette } }", "variables": {}}]),
        )
        .await;
        assert_eq!(
            receive(&mut client).await[4],
            json!({"status": "ok", "response": {"data": {"appearanceSettings": {"palette": "claret"}}}})
        );
        send(
            &mut client,
            json!(["5", "7", "__absinthe__:control", "doc", {"query": "subscription { nope }"}]),
        )
        .await;
        let invalid = receive(&mut client).await;
        assert_eq!(invalid[4]["status"], "error");
        assert!(invalid[4]["response"]["errors"].is_array());

        send(
            &mut client,
            json!(["5", "8", "__absinthe__:control", "doc", {"query": SERVER_LOG}]),
        )
        .await;
        let reply = receive(&mut client).await;
        assert_eq!(reply[1], "8");
        assert_eq!(reply[4]["status"], "ok");
        let subscription_id = reply[4]["response"]["subscriptionId"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(subscription_id.starts_with("__absinthe__:doc:"));

        let message = format!(
            "server log subscription test {}",
            hex::encode(crate::crypto::random_bytes::<4>())
        );
        let subscriber = tracing_subscriber::registry().with(app.state.logs.layer());
        tracing::subscriber::with_default(subscriber, || {
            tracing::warn!("\u{1b}[33m{message}\u{1b}[0m");
        });
        let push = receive(&mut client).await;
        assert_eq!(push[0], Value::Null);
        assert_eq!(push[2], json!(subscription_id));
        assert_eq!(push[3], "subscription:data");
        assert_eq!(push[4]["subscriptionId"], json!(subscription_id));
        let event = &push[4]["result"]["data"]["serverLog"];
        assert_eq!(event["level"], "warning");
        assert_eq!(event["message"], json!(message));
        assert!(crate::timefmt::parse(event["timestamp"].as_str().unwrap()).is_some());

        send(
            &mut client,
            json!(["5", "9", "__absinthe__:control", "unsubscribe", {"subscriptionId": subscription_id}]),
        )
        .await;
        assert_eq!(
            receive(&mut client).await[4],
            json!({"status": "ok", "response": {"subscriptionId": subscription_id}})
        );
        send(
            &mut client,
            json!(["5", "10", "__absinthe__:control", "phx_leave", {}]),
        )
        .await;
        assert_eq!(receive(&mut client).await[4]["status"], "ok");
        assert_eq!(
            receive(&mut client).await,
            json!(["5", "5", "__absinthe__:control", "phx_close", {}])
        );
    }

    #[tokio::test]
    async fn the_v1_serializer_is_used_without_vsn() {
        let app = TestApp::new().await;
        let addr = serve(&app).await;
        let mut client = connect(addr, "", &[]).await.unwrap();
        send(
            &mut client,
            json!({"topic": "phoenix", "event": "heartbeat", "payload": {}, "ref": "1"}),
        )
        .await;
        let reply = receive(&mut client).await;
        assert_eq!(reply["event"], "phx_reply");
        assert_eq!(reply["ref"], "1");
    }

    #[tokio::test]
    async fn rejects_unauthenticated_connections_when_auth_is_enabled() {
        let app = TestApp::with_config(with_password("first")).await;
        let addr = serve(&app).await;
        assert_eq!(connect(addr, "vsn=2.0.0", &[]).await.err(), Some(403));

        let mut browser = Browser::new(&app);
        browser.login("first", "/").await;
        let token = browser.token("/").await;
        let cookie = format!("_manavault_key={}", browser.cookie.clone().unwrap());
        // Phoenix exposes the session only with the page's CSRF token.
        assert_eq!(
            connect(addr, "vsn=2.0.0", &[("cookie", &cookie)])
                .await
                .err(),
            Some(403)
        );
        let query = format!(
            "vsn=2.0.0&_csrf_token={}",
            url::form_urlencoded::byte_serialize(token.as_bytes()).collect::<String>()
        );
        let mut client = connect(addr, &query, &[("cookie", &cookie)]).await.unwrap();
        send(&mut client, json!([null, "1", "phoenix", "heartbeat", {}])).await;
        assert_eq!(receive(&mut client).await[3], "phx_reply");

        let rotated = TestApp::with_config(with_password("replacement")).await;
        let rotated_addr = serve(&rotated).await;
        assert_eq!(
            connect(rotated_addr, &query, &[("cookie", &cookie)])
                .await
                .err(),
            Some(403)
        );
    }

    #[tokio::test]
    async fn checks_the_origin() {
        let app = TestApp::new().await;
        let addr = serve(&app).await;
        assert_eq!(
            connect(addr, "vsn=2.0.0", &[("origin", "https://evil.example")])
                .await
                .err(),
            Some(403)
        );
        assert!(
            connect(addr, "vsn=2.0.0", &[("origin", "http://localhost:4002")])
                .await
                .is_ok()
        );
        let listed = TestApp::with_config(|config| {
            config.allowed_origins = Some(vec!["https://manavault.mytailnet.ts.net".into()]);
        })
        .await;
        let addr = serve(&listed).await;
        assert!(
            connect(
                addr,
                "vsn=2.0.0",
                &[("origin", "https://manavault.mytailnet.ts.net")]
            )
            .await
            .is_ok()
        );
        assert!(
            connect(addr, "vsn=2.0.0", &[("origin", "http://localhost:4000")])
                .await
                .is_ok()
        );
        assert_eq!(
            connect(
                addr,
                "vsn=2.0.0",
                &[("origin", "http://manavault.mytailnet.ts.net")]
            )
            .await
            .err(),
            Some(403)
        );
    }
}
