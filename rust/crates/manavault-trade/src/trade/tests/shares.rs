//! Trade share tokens and lists, public wants and binder shares (run against
//! the owner schema's identical `wantsList`/`binderList` fields), and the
//! deck share lifecycle.

use serde_json::{Value, json};

use super::{Item, app_with_cards, insert_location};
use crate::test_support::TestApp;
use crate::trade::share::{self, ShareKind};
use crate::trade::want;

async fn insert_token(app: &TestApp, kind: ShareKind, token: &str) {
    let table = match kind {
        ShareKind::Wants => "trade_want_shares",
        ShareKind::Binder => "trade_binder_shares",
    };
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO {table} (token, inserted_at, updated_at) VALUES (?1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
    )))
    .bind(token)
    .execute(app.db())
    .await
    .unwrap();
}

async fn tokens(app: &TestApp, kind: ShareKind) -> Vec<String> {
    let table = match kind {
        ShareKind::Wants => "trade_want_shares",
        ShareKind::Binder => "trade_binder_shares",
    };
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT token FROM {table} ORDER BY id"
    )))
    .fetch_all(app.db())
    .await
    .unwrap()
}

#[test]
fn generated_tokens_are_valid_and_validation_rejects_other_shapes() {
    let token = share::generate_token();
    assert_eq!(token.len(), 24);
    assert!(share::valid_token(&token));
    assert_ne!(token, share::generate_token());
    assert!(!share::valid_token("not-a-real-token"));
    assert!(!share::valid_token("AbCdEfGhIjKlMnOpQrStUvW+"));
    assert!(!share::valid_token(""));
}

#[tokio::test]
async fn token_lifecycle_for_both_kinds() {
    let app = TestApp::new().await;
    for kind in [ShareKind::Wants, ShareKind::Binder] {
        assert_eq!(share::token(app.db(), kind).await.unwrap(), None);
        let token = share::ensure_token(app.db(), kind).await.unwrap();
        assert!(share::valid_token(&token));
        assert_eq!(
            share::token(app.db(), kind).await.unwrap().as_deref(),
            Some(token.as_str())
        );
        assert_eq!(share::ensure_token(app.db(), kind).await.unwrap(), token);
    }
    // The two kinds are independent.
    assert_ne!(
        share::token(app.db(), ShareKind::Wants).await.unwrap(),
        share::token(app.db(), ShareKind::Binder).await.unwrap()
    );
}

#[tokio::test]
async fn disable_deletes_duplicates_and_rotate_replaces_them_with_one_fresh_row() {
    let app = TestApp::new().await;
    for kind in [ShareKind::Wants, ShareKind::Binder] {
        let old = [share::generate_token(), share::generate_token()];
        for token in &old {
            insert_token(&app, kind, token).await;
        }
        assert_eq!(share::disable(app.db(), kind).await.unwrap(), 2);
        assert_eq!(tokens(&app, kind).await.len(), 0);

        for token in &old {
            insert_token(&app, kind, token).await;
        }
        let fresh = share::rotate(app.db(), kind).await.unwrap();
        assert_eq!(tokens(&app, kind).await, vec![fresh.clone()]);
        assert!(!old.contains(&fresh));
        for token in &old {
            assert!(!share::matches(app.db(), kind, token).await.unwrap());
        }
        assert!(share::matches(app.db(), kind, &fresh).await.unwrap());
    }
}

#[tokio::test]
async fn ensure_returns_the_earliest_row() {
    let app = TestApp::new().await;
    let first = share::generate_token();
    insert_token(&app, ShareKind::Wants, &first).await;
    insert_token(&app, ShareKind::Wants, &share::generate_token()).await;
    assert_eq!(
        share::ensure_token(app.db(), ShareKind::Wants)
            .await
            .unwrap(),
        first
    );
}

#[tokio::test]
async fn lists_are_none_for_missing_wrong_or_malformed_tokens() {
    let app = app_with_cards().await;
    assert_eq!(share::wants_list(app.db(), "anything").await.unwrap(), None);
    assert_eq!(
        share::binder_list(app.db(), "anything").await.unwrap(),
        None
    );
    for kind in [ShareKind::Wants, ShareKind::Binder] {
        let token = share::ensure_token(app.db(), kind).await.unwrap();
        let wrong: String = token.chars().rev().collect::<String>().replace('A', "B");
        let wrong = if wrong == token {
            share::generate_token()
        } else {
            wrong
        };
        assert!(!share::matches(app.db(), kind, &wrong).await.unwrap());
        assert!(
            !share::matches(app.db(), kind, "not-a-real-token")
                .await
                .unwrap()
        );
    }
    let wants_token = share::token(app.db(), ShareKind::Wants)
        .await
        .unwrap()
        .unwrap();
    // A wants token is not a binder token.
    assert_eq!(
        share::binder_list(app.db(), &wants_token).await.unwrap(),
        None
    );
}

const WANTS_QUERY: &str = "query WantsList($id: ID!) {
  wantsList(id: $id) { entries { cardName quantity typeLine setCode collectorNumber imageUrl } }
}";

const BINDER_QUERY: &str = "query BinderList($id: ID!) {
  binderList(id: $id) { entries { cardName quantity typeLine setCode collectorNumber imageUrl finish condition } }
}";

fn find(entries: &Value, predicate: impl Fn(&Value) -> bool) -> &Value {
    entries
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| predicate(entry))
        .unwrap()
}

#[tokio::test]
async fn wants_list_shows_printing_detail_only_for_printing_wants() {
    let app = app_with_cards().await;
    want::create_by_name(app.db(), "Time Walk", Some(3))
        .await
        .unwrap();
    want::create_by_printing(app.db(), "scryfall-printing-3", Some(1))
        .await
        .unwrap();
    let token = share::ensure_token(app.db(), ShareKind::Wants)
        .await
        .unwrap();
    let data = app.gql_data(WANTS_QUERY, json!({"id": token})).await;
    let entries = &data["wantsList"]["entries"];
    assert_eq!(entries.as_array().unwrap().len(), 2);
    // Creation order.
    assert_eq!(entries[0]["cardName"], "Time Walk");
    assert_eq!(
        find(entries, |e| e["cardName"] == "Time Walk"),
        &json!({
            "cardName": "Time Walk", "quantity": 3, "typeLine": "Sorcery",
            "setCode": null, "collectorNumber": null, "imageUrl": null
        })
    );
    assert_eq!(
        find(entries, |e| e["cardName"] == "Black Lotus"),
        &json!({
            "cardName": "Black Lotus", "quantity": 1, "typeLine": "Artifact",
            "setCode": "leb", "collectorNumber": "233",
            "imageUrl": "https://example.test/black-lotus.jpg"
        })
    );
}

#[tokio::test]
async fn rotated_wants_and_binder_tokens_immediately_stop_resolving() {
    let app = app_with_cards().await;
    for (kind, query, field) in [
        (ShareKind::Wants, WANTS_QUERY, "wantsList"),
        (ShareKind::Binder, BINDER_QUERY, "binderList"),
    ] {
        let old = share::ensure_token(app.db(), kind).await.unwrap();
        let new = share::rotate(app.db(), kind).await.unwrap();
        let data = app.gql_data(query, json!({"id": old})).await;
        assert_eq!(data[field], Value::Null);
        let data = app.gql_data(query, json!({"id": new})).await;
        assert_eq!(data[field], json!({"entries": []}));
        let data = app.gql_data(query, json!({"id": "not-a-real-token"})).await;
        assert_eq!(data[field], Value::Null);
    }
}

#[tokio::test]
async fn binder_list_aggregates_by_printing_finish_and_condition() {
    let app = app_with_cards().await;
    Item::new("scryfall-printing-1", 2)
        .for_trade(1)
        .insert(&app)
        .await;
    Item::new("scryfall-printing-1", 1)
        .for_trade(1)
        .insert(&app)
        .await;
    Item::new("scryfall-printing-1", 1)
        .for_trade(1)
        .condition("lightly_played")
        .insert(&app)
        .await;
    // Not for trade.
    Item::new("scryfall-printing-1", 5).insert(&app).await;
    Item::new("scryfall-printing-2", 4)
        .for_trade(4)
        .finish("foil")
        .insert(&app)
        .await;

    let token = share::ensure_token(app.db(), ShareKind::Binder)
        .await
        .unwrap();
    let data = app.gql_data(BINDER_QUERY, json!({"id": token})).await;
    let entries = &data["binderList"]["entries"];
    assert_eq!(
        entries,
        &json!([
            {
                "cardName": "Black Lotus", "quantity": 1, "typeLine": "Artifact",
                "setCode": "lea", "collectorNumber": "232",
                "imageUrl": "https://example.test/black-lotus.jpg",
                "finish": "nonfoil", "condition": "lightly_played"
            },
            {
                "cardName": "Black Lotus", "quantity": 2, "typeLine": "Artifact",
                "setCode": "lea", "collectorNumber": "232",
                "imageUrl": "https://example.test/black-lotus.jpg",
                "finish": "nonfoil", "condition": "near_mint"
            },
            {
                "cardName": "Time Walk", "quantity": 4, "typeLine": "Sorcery",
                "setCode": "lea", "collectorNumber": "84", "imageUrl": null,
                "finish": "foil", "condition": "near_mint"
            }
        ])
    );
}

#[tokio::test]
async fn binder_list_excludes_items_in_list_locations() {
    let app = app_with_cards().await;
    let wishlist = insert_location(&app, "Wishlist", "list").await;
    let binder = insert_location(&app, "Binder", "binder").await;
    Item::new("scryfall-printing-1", 3)
        .for_trade(3)
        .location(wishlist)
        .insert(&app)
        .await;
    let token = share::ensure_token(app.db(), ShareKind::Binder)
        .await
        .unwrap();
    assert_eq!(
        share::binder_list(app.db(), &token).await.unwrap(),
        Some(vec![])
    );
    Item::new("scryfall-printing-1", 2)
        .for_trade(2)
        .location(binder)
        .insert(&app)
        .await;
    let entries = share::binder_list(app.db(), &token).await.unwrap().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].quantity, 2);
}

#[tokio::test]
async fn graphql_share_token_lifecycle() {
    let app = TestApp::new().await;
    let data = app
        .gql_data("{ tradeWantsShareToken tradeBinderShareToken }", json!({}))
        .await;
    assert_eq!(
        data,
        json!({"tradeWantsShareToken": null, "tradeBinderShareToken": null})
    );

    let ensured = app
        .gql_data(
            "mutation { ensureTradeWantsShareToken { token } ensureTradeBinderShareToken { token } }",
            json!({}),
        )
        .await;
    let wants = ensured["ensureTradeWantsShareToken"]["token"]
        .as_str()
        .unwrap()
        .to_owned();
    let binder = ensured["ensureTradeBinderShareToken"]["token"]
        .as_str()
        .unwrap()
        .to_owned();
    let data = app
        .gql_data("{ tradeWantsShareToken tradeBinderShareToken }", json!({}))
        .await;
    assert_eq!(
        data,
        json!({"tradeWantsShareToken": wants, "tradeBinderShareToken": binder})
    );

    let rotated = app
        .gql_data(
            "mutation { rotateTradeWantsShareToken { token } rotateTradeBinderShareToken { token } }",
            json!({}),
        )
        .await;
    let rotated_wants = rotated["rotateTradeWantsShareToken"]["token"]
        .as_str()
        .unwrap();
    let rotated_binder = rotated["rotateTradeBinderShareToken"]["token"]
        .as_str()
        .unwrap();
    assert_ne!(rotated_wants, wants);
    assert_ne!(rotated_binder, binder);

    let disabled = app
        .gql_data(
            "mutation { disableTradeWantsSharing { success } disableTradeBinderSharing { success } }",
            json!({}),
        )
        .await;
    assert_eq!(
        disabled,
        json!({
            "disableTradeWantsSharing": {"success": true},
            "disableTradeBinderSharing": {"success": true}
        })
    );
    let data = app
        .gql_data("{ tradeWantsShareToken tradeBinderShareToken }", json!({}))
        .await;
    assert_eq!(
        data,
        json!({"tradeWantsShareToken": null, "tradeBinderShareToken": null})
    );
}
