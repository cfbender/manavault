//! The Scryfall asset route (`/scryfall-assets/{*path}`).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use manavault_core::testing::body_text;
use manavault_server::test_support::TestApp;

#[tokio::test]
async fn the_route_serves_svgs_without_auth() {
    let app = TestApp::new().await;
    let root = app.state.config.scryfall_assets_dir.clone();
    std::fs::create_dir_all(root.join("sets")).unwrap();
    std::fs::write(root.join("sets/lea.svg"), r#"<svg id="lea"/>"#).unwrap();

    let response = app
        .request(
            Request::get("/scryfall-assets/sets/lea.svg")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "image/svg+xml");
    assert_eq!(response.headers()["cache-control"], "public, max-age=86400");
    assert_eq!(body_text(response).await, r#"<svg id="lea"/>"#);

    let missing = app
        .request(
            Request::get("/scryfall-assets/sets/nope.svg")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    assert_eq!(body_text(missing).await, "Not found");
}
