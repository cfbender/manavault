//! The shared deck page and previews: the share-deck parts of
//! `app_controller_test.exs` and the HTTP surfaces of
//! `public_share_cache_test.exs`.

use serde_json::json;

use super::{add_card, get, insert_deck, post_graphql, share};
use crate::test_support::{TestApp, fixtures};

fn preview_cover_data_uri() -> String {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#31203a" /><circle cx="980" cy="120" r="220" fill="#f59e0b" opacity="0.7" /></svg>"##;
    let encoded: String = url::form_urlencoded::byte_serialize(svg.as_bytes())
        .collect::<String>()
        .replace('+', "%20");
    format!("data:image/svg+xml;utf8,{encoded}")
}

/// `shared_deck_token/0`: "Lotus Lessons", a legal 100-card Commander deck.
async fn shared_deck(app: &TestApp) -> (i64, String) {
    app.import_cards(&[
        fixtures::merge(
            fixtures::legal_commander_card(),
            json!({
                "id": "scryfall-preview-commander",
                "oracle_id": "oracle-preview-commander",
                "name": "Lotus Tutor",
                "image_uris": {"art_crop": preview_cover_data_uri()},
                "prices": {"usd": "256.76"}
            }),
        ),
        fixtures::merge(
            fixtures::plains(),
            json!({
                "id": "scryfall-preview-plains",
                "oracle_id": "oracle-preview-plains",
                "legalities": {"commander": "legal"},
                "prices": {}
            }),
        ),
    ])
    .await;
    let deck = insert_deck(app, "Lotus Lessons", "commander", "active").await;
    add_card(
        app,
        deck,
        "oracle-preview-commander",
        1,
        "commander",
        "nonfoil",
        Some("scryfall-preview-commander"),
    )
    .await;
    add_card(
        app,
        deck,
        "oracle-preview-plains",
        99,
        "mainboard",
        "nonfoil",
        Some("scryfall-preview-plains"),
    )
    .await;
    (deck, share(app, deck).await)
}

#[tokio::test]
async fn the_share_page_has_deck_specific_link_preview_metadata() {
    let app = TestApp::new().await;
    let (_, token) = shared_deck(&app).await;
    let page = get(&app, &format!("/share/decks/{token}")).await;
    assert_eq!(page.status, 200);
    let html = page.text();
    let base = &app.state.config.public_url;
    for expected in [
        "<title>Lotus Lessons · ManaVault</title>".to_owned(),
        r#"property="og:title" content="Lotus Lessons · ManaVault""#.to_owned(),
        r#"property="og:description" content="Commander deck, 100 cards, Legal, $256.76.""#
            .to_owned(),
        format!(r#"property="og:image" content="{base}/share/decks/{token}/preview.png""#),
        format!(r#"property="og:url" content="{base}/share/decks/{token}""#),
        r#"property="og:image:type" content="image/png""#.to_owned(),
        r#"property="og:image:width" content="1200""#.to_owned(),
        r#"property="og:image:height" content="630""#.to_owned(),
        r#"property="og:image:alt" content="Preview for Lotus Lessons""#.to_owned(),
        r#"name="twitter:card" content="summary_large_image""#.to_owned(),
        r#"id="manavault-root""#.to_owned(),
        r#"data-theme-style="glass""#.to_owned(),
    ] {
        assert!(html.contains(&expected), "missing {expected}");
    }
    assert!(!html.contains("unique"));
    assert_eq!(
        page.header("cache-control"),
        Some("no-cache, no-store, must-revalidate")
    );
}

#[tokio::test]
async fn revoked_and_malformed_deck_tokens_are_not_found() {
    let app = TestApp::new().await;
    let (deck, token) = shared_deck(&app).await;
    crate::decks::records::disable_sharing(app.db(), crate::decks::DeckId(deck))
        .await
        .unwrap();
    for path in [
        format!("/share/decks/{token}"),
        format!("/share/decks/{token}/preview.svg"),
        format!("/share/decks/{token}/preview.png"),
        "/share/decks/malformed".to_owned(),
    ] {
        let sent = get(&app, &path).await;
        assert_eq!(sent.status, 404, "{path}");
        assert_eq!(sent.text(), "", "{path}");
    }
}

#[tokio::test]
async fn the_svg_preview_renders_the_deck_header() {
    let app = TestApp::new().await;
    let (_, token) = shared_deck(&app).await;
    let sent = get(&app, &format!("/share/decks/{token}/preview.svg")).await;
    assert_eq!(sent.status, 200);
    assert_eq!(
        sent.header("content-type"),
        Some("image/svg+xml; charset=utf-8")
    );
    assert_eq!(sent.header("cache-control"), Some("public, max-age=300"));
    let svg = sent.text();
    assert!(svg.contains("<svg"));
    for expected in [
        "Lotus Lessons",
        "Commander",
        "100 cards",
        "Legal",
        "$256.76",
        "data:image/svg+xml",
        r#"<clipPath id="cardClip">"#,
        r#"clip-path="url(#cardClip)""#,
        r#"href="/scryfall-assets/symbols/W.svg""#,
        r#"font-size="22" font-weight="750">Commander</text>"#,
    ] {
        assert!(svg.contains(expected), "missing {expected}");
    }
    assert!(!svg.contains("unique"));
    assert!(!svg.contains(r##"fill="#10141a""##));
    assert!(!svg.contains("· · ·"));
    assert!(!svg.contains("Bracket"));
}

#[tokio::test]
async fn the_svg_preview_renders_the_saved_bracket() {
    let app = TestApp::new().await;
    let (deck, token) = shared_deck(&app).await;
    sqlx::query(
        "UPDATE decks SET ai_analysis = 'A slow deck.', commander_bracket = 3,
           commander_bracket_estimate = 2, commander_bracket_rating = '3+' WHERE id = ?1",
    )
    .bind(deck)
    .execute(app.db())
    .await
    .unwrap();
    let svg = get(&app, &format!("/share/decks/{token}/preview.svg"))
        .await
        .text();
    assert!(svg.contains("Bracket 3+"));
    assert!(!svg.contains("Pace"));
    let html = get(&app, &format!("/share/decks/{token}")).await.text();
    assert!(html.contains("Commander deck, 100 cards, Bracket 3+, Legal, $256.76."));
}

#[tokio::test]
async fn the_png_preview_is_a_1200_by_630_png_served_from_the_cache() {
    let app = TestApp::new().await;
    let (_, token) = shared_deck(&app).await;
    let sent = get(&app, &format!("/share/decks/{token}/preview.png")).await;
    assert_eq!(sent.status, 200);
    assert_eq!(sent.header("content-type"), Some("image/png"));
    assert_eq!(sent.header("cache-control"), Some("public, max-age=300"));
    let png = &sent.body;
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    assert_eq!(&png[8..16], b"\x00\x00\x00\x0dIHDR");
    assert_eq!(&png[16..24], &[0, 0, 4, 176, 0, 0, 2, 118]);
    let artifacts: Vec<_> = std::fs::read_dir(&app.state.config.share_preview_cache_dir)
        .unwrap()
        .collect();
    assert_eq!(artifacts.len(), 1);
    let again = get(&app, &format!("/share/decks/{token}/preview.png")).await;
    assert_eq!(&again.body, png);
}

// public_share_cache_test.exs

async fn every_surface(app: &TestApp, token: &str) -> [u16; 3] {
    [
        get(app, &format!("/share/decks/{token}")).await.status,
        get(app, &format!("/share/decks/{token}/preview.svg"))
            .await
            .status,
        get(app, &format!("/share/decks/{token}/preview.png"))
            .await
            .status,
    ]
}

async fn shared_deck_request(app: &TestApp, token: &str) -> serde_json::Value {
    let sent = post_graphql(
        app,
        &json!({
            "query": "query SharedDeck($id: ID!) { deck(id: $id) { name } }",
            "variables": {"id": token}
        }),
    )
    .await;
    assert_eq!(sent.status, 200);
    sent.json()
}

#[tokio::test]
async fn malformed_and_missing_tokens_keep_their_not_found_contracts() {
    let app = TestApp::new().await;
    for token in ["not-a-share-token".to_owned(), "A".repeat(24)] {
        assert_eq!(every_surface(&app, &token).await, [404, 404, 404]);
        assert_eq!(
            shared_deck_request(&app, &token).await,
            json!({"data": {"deck": null}})
        );
    }
}

#[tokio::test]
async fn every_public_surface_serves_a_shared_deck() {
    let app = TestApp::new().await;
    let deck = insert_deck(&app, "Public Cache Deck", "commander", "brewing").await;
    let token = share(&app, deck).await;
    let html = get(&app, &format!("/share/decks/{token}")).await;
    assert_eq!(html.status, 200);
    assert!(html.text().contains("Public Cache Deck"));
    let svg = get(&app, &format!("/share/decks/{token}/preview.svg")).await;
    assert!(svg.text().contains("Public Cache Deck"));
    let png = get(&app, &format!("/share/decks/{token}/preview.png")).await;
    assert_eq!(png.header("content-type"), Some("image/png"));
    assert!(png.body.starts_with(b"\x89PNG\r\n\x1a\n"));
    assert_eq!(
        shared_deck_request(&app, &token).await,
        json!({"data": {"deck": {"name": "Public Cache Deck"}}})
    );
}

#[tokio::test]
async fn rotation_invalidates_every_public_surface() {
    let app = TestApp::new().await;
    let deck = insert_deck(&app, "Rotated Share", "commander", "brewing").await;
    let old = share(&app, deck).await;
    assert_eq!(every_surface(&app, &old).await, [200, 200, 200]);
    let rotated = crate::decks::records::rotate_share_token(app.db(), crate::decks::DeckId(deck))
        .await
        .unwrap()
        .share_token
        .unwrap();
    assert_ne!(rotated, old);
    assert_eq!(every_surface(&app, &old).await, [404, 404, 404]);
    assert_eq!(
        shared_deck_request(&app, &old).await,
        json!({"data": {"deck": null}})
    );
    assert_eq!(every_surface(&app, &rotated).await, [200, 200, 200]);
}

#[tokio::test]
async fn anonymous_share_visitors_keep_their_own_appearance() {
    let hash = crate::auth::hash_password_with("secret", 1, b"test-salt");
    let app = TestApp::with_config(|config| {
        config.auth_disabled = false;
        config.admin_password_hash = Some(hash);
    })
    .await;
    let deck = insert_deck(&app, "Appearance", "commander", "brewing").await;
    let token = share(&app, deck).await;
    let html = get(&app, &format!("/share/decks/{token}")).await.text();
    assert!(html.contains(r#"data-theme-style="glass""#));
    assert!(!html.contains("data-palette"));
    assert!(!html.contains("data-appearance-source"));
}
