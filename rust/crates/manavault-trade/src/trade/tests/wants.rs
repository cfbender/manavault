//! The want list.

use serde_json::json;

use super::{app_with_cards, error_message};
use crate::test_support::fixtures;
use crate::trade::want::{self, CreateWantError, UpdateWantError};

#[tokio::test]
async fn creates_a_want_by_exact_name_case_insensitively_defaulting_to_one() {
    let app = app_with_cards().await;
    let want = want::create_by_name(app.db(), "Black Lotus", None)
        .await
        .unwrap();
    assert_eq!(want.quantity.get(), 1);
    assert_eq!(want.oracle_id.as_str(), "oracle-1");
    assert_eq!(want.preferred_printing_id, None);

    let walk = want::create_by_name(app.db(), "tIME wALK", Some(3))
        .await
        .unwrap();
    assert_eq!(walk.oracle_id.as_str(), "oracle-2");
    assert_eq!(walk.quantity.get(), 3);
}

#[tokio::test]
async fn matches_names_with_or_without_diacritics() {
    let app = app_with_cards().await;
    app.import_cards(&[fixtures::merge(
        fixtures::time_walk(),
        json!({
            "id": "scryfall-oin-the-brave",
            "oracle_id": "oracle-oin-the-brave",
            "name": "Óin the Brave",
            "collector_number": "12"
        }),
    )])
    .await;
    let first = want::create_by_name(app.db(), "Óin the Brave", None)
        .await
        .unwrap();
    assert_eq!(first.oracle_id.as_str(), "oracle-oin-the-brave");
    let second = want::create_by_name(app.db(), "Oin the brave", None)
        .await
        .unwrap();
    assert_eq!(second.id, first.id);
    assert_eq!(second.quantity.get(), 2);
}

#[tokio::test]
async fn bumps_the_generic_want_instead_of_duplicating_and_never_a_printing_want() {
    let app = app_with_cards().await;
    let specific = want::create_by_printing(app.db(), "scryfall-printing-1", Some(4))
        .await
        .unwrap();
    let first = want::create_by_name(app.db(), "Black Lotus", Some(1))
        .await
        .unwrap();
    let second = want::create_by_name(app.db(), "Black Lotus", Some(2))
        .await
        .unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(second.quantity.get(), 3);
    assert_eq!(second.preferred_printing_id, None);
    assert_ne!(second.id, specific.id);
    let specific = want::get(app.db(), specific.id).await.unwrap().unwrap();
    assert_eq!(specific.quantity.get(), 4);
    assert_eq!(want::list(app.db()).await.unwrap().len(), 2);
}

#[tokio::test]
async fn non_positive_quantities_count_as_one_on_create() {
    let app = app_with_cards().await;
    let want = want::create_by_name(app.db(), "Black Lotus", Some(0))
        .await
        .unwrap();
    assert_eq!(want.quantity.get(), 1);
    let want = want::create_by_name(app.db(), "Black Lotus", Some(-5))
        .await
        .unwrap();
    assert_eq!(want.quantity.get(), 2);
}

#[tokio::test]
async fn unknown_names_and_printings_are_not_found() {
    let app = app_with_cards().await;
    assert!(matches!(
        want::create_by_name(app.db(), "Definitely Not A Real Card", None).await,
        Err(CreateWantError::NotFound)
    ));
    assert!(matches!(
        want::create_by_printing(app.db(), "not-a-real-printing", None).await,
        Err(CreateWantError::NotFound)
    ));
}

#[tokio::test]
async fn printing_wants_bump_the_same_printing_and_coexist_with_others() {
    let app = app_with_cards().await;
    let first = want::create_by_printing(app.db(), "scryfall-printing-1", Some(2))
        .await
        .unwrap();
    assert_eq!(
        first.preferred_printing_id.as_ref().unwrap().as_str(),
        "scryfall-printing-1"
    );
    assert_eq!(first.oracle_id.as_str(), "oracle-1");
    let bumped = want::create_by_printing(app.db(), "scryfall-printing-1", Some(3))
        .await
        .unwrap();
    assert_eq!(bumped.id, first.id);
    assert_eq!(bumped.quantity.get(), 5);

    let other = want::create_by_printing(app.db(), "scryfall-printing-3", None)
        .await
        .unwrap();
    assert_ne!(other.id, first.id);
    let generic = want::create_by_name(app.db(), "Black Lotus", None)
        .await
        .unwrap();
    assert_ne!(generic.id, other.id);
    assert_eq!(want::list(app.db()).await.unwrap().len(), 3);
    assert_eq!(
        want::get(app.db(), first.id)
            .await
            .unwrap()
            .unwrap()
            .quantity
            .get(),
        5
    );
}

#[tokio::test]
async fn lists_newest_first_and_filters_by_oracle_id() {
    let app = app_with_cards().await;
    let lotus = want::create_by_name(app.db(), "Black Lotus", None)
        .await
        .unwrap();
    let walk = want::create_by_name(app.db(), "Time Walk", None)
        .await
        .unwrap();
    let ids: Vec<i64> = want::list(app.db())
        .await
        .unwrap()
        .iter()
        .map(|want| want.id)
        .collect();
    assert_eq!(ids, vec![walk.id, lotus.id]);

    let found = want::by_oracle_ids(app.db(), std::slice::from_ref(&lotus.oracle_id))
        .await
        .unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].id, lotus.id);
    assert_eq!(want::by_oracle_ids(app.db(), &[]).await.unwrap().len(), 0);
}

#[tokio::test]
async fn updates_and_deletes() {
    let app = app_with_cards().await;
    let want = want::create_by_name(app.db(), "Black Lotus", None)
        .await
        .unwrap();
    let updated = want::update_quantity(app.db(), want.id, 9)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(updated.quantity.get(), 9);
    assert!(matches!(
        want::update_quantity(app.db(), want.id, 0).await,
        Err(UpdateWantError::InvalidQuantity)
    ));
    assert!(want::delete(app.db(), want.id).await.unwrap());
    assert_eq!(want::list(app.db()).await.unwrap().len(), 0);
    assert!(!want::delete(app.db(), want.id).await.unwrap());
}

#[tokio::test]
async fn image_url_prefers_the_preferred_printing_over_the_latest_one() {
    let app = app_with_cards().await;
    let want = want::create_by_name(app.db(), "Black Lotus", None)
        .await
        .unwrap();
    assert_eq!(
        want.display_image_url().as_deref(),
        Some("https://example.test/black-lotus.jpg")
    );

    app.import_cards(&[fixtures::merge(
        fixtures::black_lotus_beta(),
        json!({
            "released_at": "1990-01-01",
            "image_uris": {"normal": "https://example.test/lotus-beta.jpg"}
        }),
    )])
    .await;
    let specific = want::create_by_printing(app.db(), "scryfall-printing-3", None)
        .await
        .unwrap();
    assert_eq!(
        specific.display_image_url().as_deref(),
        Some("https://example.test/lotus-beta.jpg")
    );
    // Without a preferred printing the latest release (alpha, 1993) wins.
    let generic = want::Want {
        preferred_printing_id: None,
        ..specific
    };
    assert_eq!(
        generic.display_image_url().as_deref(),
        Some("https://example.test/black-lotus.jpg")
    );
}

const WANT_FIELDS: &str = "id quantity imageUrl card { name } printing { setCode }";

#[tokio::test]
async fn graphql_want_crud() {
    let app = app_with_cards().await;
    let created = app
        .gql_data(
            &format!(
                "mutation {{ createTradeWant(name: \"black lotus\", quantity: 2) {{ tradeWant {{ {WANT_FIELDS} }} }} }}"
            ),
            json!({}),
        )
        .await;
    let want = &created["createTradeWant"]["tradeWant"];
    assert_eq!(want["quantity"], 2);
    assert_eq!(want["card"]["name"], "Black Lotus");
    assert_eq!(want["printing"], serde_json::Value::Null);
    assert_eq!(want["imageUrl"], "https://example.test/black-lotus.jpg");
    let id = want["id"].as_str().unwrap().to_owned();
    assert!(id.parse::<i64>().is_ok(), "raw integer ids: {id}");

    let specific = app
        .gql_data(
            &format!(
                "mutation {{ createTradeWant(scryfallId: \"scryfall-printing-3\") {{ tradeWant {{ {WANT_FIELDS} }} }} }}"
            ),
            json!({}),
        )
        .await;
    assert_eq!(
        specific["createTradeWant"]["tradeWant"]["printing"]["setCode"],
        "leb"
    );

    let listed = app
        .gql_data("{ tradeWants { id quantity } }", json!({}))
        .await;
    assert_eq!(listed["tradeWants"].as_array().unwrap().len(), 2);
    assert_eq!(listed["tradeWants"][1]["id"], id.as_str());

    let updated = app
        .gql_data(
            "mutation($id: ID!) { updateTradeWant(id: $id, quantity: 7) { tradeWant { id quantity } } }",
            json!({"id": id}),
        )
        .await;
    assert_eq!(updated["updateTradeWant"]["tradeWant"]["quantity"], 7);

    let invalid = app
        .gql(
            "mutation($id: ID!) { updateTradeWant(id: $id, quantity: 0) { tradeWant { id } } }",
            json!({"id": id}),
        )
        .await;
    assert_eq!(
        error_message(&invalid),
        "quantity must be greater than or equal to 1"
    );

    let deleted = app
        .gql_data(
            "mutation($id: ID!) { deleteTradeWant(id: $id) { deletedId } }",
            json!({"id": id}),
        )
        .await;
    assert_eq!(deleted["deleteTradeWant"]["deletedId"], id.as_str());

    for mutation in [
        "mutation($id: ID!) { deleteTradeWant(id: $id) { deletedId } }",
        "mutation($id: ID!) { updateTradeWant(id: $id, quantity: 0) { tradeWant { id } } }",
    ] {
        let missing = app.gql(mutation, json!({"id": id})).await;
        assert_eq!(error_message(&missing), "Want was not found.");
    }
    let bad = app
        .gql(
            "mutation { deleteTradeWant(id: \"abc\") { deletedId } }",
            json!({}),
        )
        .await;
    assert_eq!(error_message(&bad), "Invalid ID: abc");
}

#[tokio::test]
async fn graphql_create_want_argument_errors() {
    let app = app_with_cards().await;
    let cases = [
        (
            "mutation { createTradeWant(name: \"Black Lotus\", scryfallId: \"scryfall-printing-1\") { tradeWant { id } } }",
            "Provide either name or scryfall_id, not both.",
        ),
        (
            "mutation { createTradeWant(quantity: 2) { tradeWant { id } } }",
            "Provide a name or a scryfall_id.",
        ),
        (
            "mutation { createTradeWant(name: \"Nope\") { tradeWant { id } } }",
            "No card found named \"Nope\".",
        ),
        (
            "mutation { createTradeWant(scryfallId: \"missing\") { tradeWant { id } } }",
            "No printing found for \"missing\".",
        ),
    ];
    for (mutation, message) in cases {
        let response = app.gql(mutation, json!({})).await;
        assert_eq!(error_message(&response), message, "{mutation}");
    }
}
