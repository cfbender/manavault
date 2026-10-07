//! The trade share pages.

use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::Request;

use manavault_core::testing::body_text;
use manavault_server::test_support::TestApp;
use manavault_trade::trade::share::{self, ShareKind};

async fn get(app: &TestApp, path: &str) -> (u16, String) {
    let mut request = Request::get(path).body(Body::empty()).unwrap();
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 40_000))));
    let response = app.request(request).await;
    let status = response.status().as_u16();
    (status, body_text(response).await)
}

fn with_password(config: &mut manavault_core::config::Config) {
    config.auth_disabled = false;
    config.admin_password_hash = Some(manavault_core::auth::hash_password_with(
        "secret", 1, b"salt",
    ));
}

#[tokio::test]
async fn valid_wants_and_binder_tokens_serve_the_app_shell() {
    let app = TestApp::new().await;
    let wants = share::ensure_token(app.db(), ShareKind::Wants)
        .await
        .unwrap();
    let binder = share::ensure_token(app.db(), ShareKind::Binder)
        .await
        .unwrap();
    for path in [
        format!("/share/wants/{wants}"),
        format!("/share/binder/{binder}"),
    ] {
        let (status, body) = get(&app, &path).await;
        assert_eq!(status, 200, "{path}: {body}");
        assert!(body.contains("manavault-root"));
        assert!(body.contains(r#"data-theme-style="glass""#));
        let url = manavault_core::web::app_shell::absolute_url(&app.state, &path);
        assert!(body.contains(&format!(r#"property="og:url" content="{url}""#)));
    }
}

#[tokio::test]
async fn anonymous_share_visitors_keep_their_own_appearance_with_auth_enabled() {
    let app = TestApp::with_config(with_password).await;
    let wants = share::ensure_token(app.db(), ShareKind::Wants)
        .await
        .unwrap();
    let (status, body) = get(&app, &format!("/share/wants/{wants}")).await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains(r#"data-theme-style="glass""#));
    assert!(!body.contains("data-palette"));
    assert!(!body.contains("data-appearance-source"));
}

#[tokio::test]
async fn share_shells_reject_revoked_wrong_kind_and_malformed_tokens() {
    let app = TestApp::with_config(with_password).await;
    let wants = share::ensure_token(app.db(), ShareKind::Wants)
        .await
        .unwrap();
    share::disable(app.db(), ShareKind::Wants).await.unwrap();
    let binder = share::ensure_token(app.db(), ShareKind::Binder)
        .await
        .unwrap();
    share::disable(app.db(), ShareKind::Binder).await.unwrap();
    let current_wants = share::ensure_token(app.db(), ShareKind::Wants)
        .await
        .unwrap();
    for path in [
        format!("/share/wants/{wants}"),
        format!("/share/binder/{binder}"),
        // A wants token does not open the binder.
        format!("/share/binder/{current_wants}"),
        "/share/wants/malformed".to_owned(),
        "/share/binder/malformed".to_owned(),
    ] {
        let (status, body) = get(&app, &path).await;
        assert_eq!((status, body.as_str()), (404, ""), "{path}");
    }
}
