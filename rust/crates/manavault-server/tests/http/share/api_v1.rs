//! The `/api/v1` deck endpoints.

use serde_json::json;

use super::{add_card, decks, insert_deck, share};
use manavault_catalog::testing::fixtures;
use manavault_server::test_support::TestApp;

#[tokio::test]
async fn requires_a_valid_non_revoked_bearer_key() {
    let app = TestApp::new().await;
    let missing = decks(&app, "", None).await;
    assert_eq!(missing.status, 401);
    assert_eq!(missing.json()["error"]["code"], "unauthorized");
    assert_eq!(decks(&app, "", Some("Bearer invalid")).await.status, 401);
    let (key, token) = manavault_core::api_keys::create(app.db(), "Revoked")
        .await
        .unwrap();
    manavault_core::api_keys::revoke(app.db(), key.id)
        .await
        .unwrap();
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
    let (key, secret) = manavault_core::api_keys::create(app.db(), "The Gathering")
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
    assert!(updated_at.ends_with('Z') && manavault_core::timestamp::parse(&updated_at).is_some());
    assert!(!first.text().contains("attacker.example"));
    let used = manavault_core::api_keys::authenticate(app.db(), &secret)
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
    // The document's schema says the parameters are integers of at least 1
    // (and at most 100); values that do not fit are still answered, not
    // rejected, because the handler falls back to the default instead.
    let overflow = decks(&app, "?page=99999999999999999999", Some(&bearer))
        .await
        .json();
    assert_eq!(overflow["pagination"]["page"], 1);
    let fractional = decks(&app, "?per_page=1.5", Some(&bearer)).await.json();
    assert_eq!(fractional["pagination"]["per_page"], 50);
    // A repeated parameter takes its last value, as the raw query map did.
    let repeated = decks(&app, "?per_page=1&per_page=2", Some(&bearer))
        .await
        .json();
    assert_eq!(repeated["pagination"]["per_page"], 2);
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
    assert_eq!(limited.json()["error"]["code"], "rate_limited");
    // `Retry-After` is the time left in the window, so it is bounded by the
    // window rather than equal to it.
    let retry_after: u64 = limited
        .header("retry-after")
        .expect("a limited response says when to retry")
        .parse()
        .expect("Retry-After is a whole number of seconds");
    let window = app.state.config.public_share_rate_limit.window.as_secs();
    assert!(
        (1..=window).contains(&retry_after),
        "Retry-After: {retry_after}"
    );
}

/// A key that cannot be looked up is a server failure, not a revoked key: a
/// client that reads 401 would throw away a valid key.
#[tokio::test]
async fn a_database_failure_is_not_reported_as_a_revoked_key() {
    let app = TestApp::new().await;
    let (_key, secret) = manavault_core::api_keys::create(app.db(), "The Gathering")
        .await
        .unwrap();
    app.db().close().await;

    let failed = decks(&app, "", Some(&format!("Bearer {secret}"))).await;
    assert_eq!(failed.status, 500);
    assert_eq!(failed.json()["error"]["code"], "internal_error");
}
