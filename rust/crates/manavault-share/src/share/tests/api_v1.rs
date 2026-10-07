//! The `/api/v1` deck endpoints.

use axum::body::Body;
use axum::http::Request;
use serde_json::json;

use super::{add_card, insert_deck, send, share};
use crate::test_support::{TestApp, fixtures};

async fn decks(app: &TestApp, query: &str, authorization: Option<&str>) -> super::Sent {
    let mut request =
        Request::get(format!("/api/v1/decks{query}")).header("host", "attacker.example");
    if let Some(value) = authorization {
        request = request.header("authorization", value);
    }
    send(app, request.body(Body::empty()).unwrap()).await
}

#[tokio::test]
async fn requires_a_valid_non_revoked_bearer_key() {
    let app = TestApp::new().await;
    let missing = decks(&app, "", None).await;
    assert_eq!(missing.status, 401);
    assert_eq!(missing.json()["error"]["code"], "unauthorized");
    assert_eq!(decks(&app, "", Some("Bearer invalid")).await.status, 401);
    let (key, token) = crate::api_keys::create(app.db(), "Revoked").await.unwrap();
    crate::api_keys::revoke(app.db(), key.id).await.unwrap();
    let revoked = decks(&app, "", Some(&format!("Bearer {token}"))).await;
    assert_eq!(revoked.status, 401);
    assert_eq!(revoked.json()["error"]["code"], "unauthorized");
}

#[tokio::test]
async fn lists_the_owners_decks_with_a_stable_shape_and_pagination() {
    let app = TestApp::new().await;
    app.import_cards(&[fixtures::legal_commander_card(), fixtures::black_lotus()])
        .await;
    let alpha = insert_deck(&app, "Alpha", "commander", "brewing").await;
    add_card(
        &app,
        alpha,
        "oracle-test-commander",
        1,
        "commander",
        "nonfoil",
        None,
    )
    .await;
    add_card(&app, alpha, "oracle-1", 2, "mainboard", "nonfoil", None).await;
    add_card(&app, alpha, "oracle-1", 4, "considering", "nonfoil", None).await;
    let token = share(&app, alpha).await;
    insert_deck(&app, "Beta", "modern", "brewing").await;
    let (key, secret) = crate::api_keys::create(app.db(), "The Gathering")
        .await
        .unwrap();
    let bearer = format!("Bearer {secret}");

    let first = decks(&app, "?page=1&per_page=1", Some(&bearer)).await;
    assert_eq!(first.status, 200);
    let body = first.json();
    assert_eq!(
        body["pagination"],
        json!({"page": 1, "per_page": 1, "total": 2, "total_pages": 2})
    );
    let deck = &body["data"][0];
    let updated_at = deck["updated_at"].as_str().unwrap().to_owned();
    assert_eq!(
        deck,
        &json!({
            "cardCount": 3,
            "commanderColorIdentity": ["W"],
            "commanders": ["Test Commander"],
            "format": "commander",
            "id": alpha,
            "name": "Alpha",
            "public_share_url": format!("{}/share/decks/{token}", app.state.config.public_url),
            "publicly_shared": true,
            "updated_at": updated_at,
        })
    );
    assert!(updated_at.ends_with('Z') && crate::timefmt::parse(&updated_at).is_some());
    assert!(!first.text().contains("attacker.example"));
    let used = crate::api_keys::authenticate(app.db(), &secret)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(used.id, key.id);
    assert!(used.last_used_at.is_some());

    let second = decks(&app, "?page=2&per_page=1", Some(&bearer))
        .await
        .json();
    assert_eq!(second["data"].as_array().unwrap().len(), 1);
    assert_eq!(second["data"][0]["name"], "Beta");
    assert_eq!(second["data"][0]["publicly_shared"], false);
    assert_eq!(
        second["data"][0]["public_share_url"],
        serde_json::Value::Null
    );
    assert_eq!(second["data"][0]["commanders"], json!([]));
    assert_eq!(
        second["data"][0]["commanderColorIdentity"],
        serde_json::Value::Null
    );

    // Bad values fall back to the defaults; `per_page` is capped at 100.
    let defaults = decks(&app, "?page=zero&per_page=-4", Some(&bearer))
        .await
        .json();
    assert_eq!(
        defaults["pagination"],
        json!({"page": 1, "per_page": 50, "total": 2, "total_pages": 1})
    );
    let capped = decks(&app, "?per_page=500", Some(&bearer)).await.json();
    assert_eq!(capped["pagination"]["per_page"], 100);
    let beyond = decks(&app, "?page=9", Some(&bearer)).await.json();
    assert_eq!(beyond["data"], json!([]));
}

#[tokio::test]
async fn shares_the_public_endpoint_abuse_protection_budget() {
    let app = TestApp::with_config(|config| {
        config.public_share_rate_limit.max_per_ip = 1;
        config.public_share_rate_limit.max_global = 10;
    })
    .await;
    assert_eq!(decks(&app, "", None).await.status, 401);
    let limited = decks(&app, "", None).await;
    assert_eq!(limited.status, 429);
    assert_eq!(limited.header("retry-after"), Some("60"));
    assert_eq!(limited.json()["error"]["code"], "rate_limited");
}
