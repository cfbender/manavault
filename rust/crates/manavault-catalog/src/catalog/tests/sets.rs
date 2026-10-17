//! The set browser's GraphQL fields: `cardSets` and `cardSet`.

use serde_json::{Value, json};

use super::{insert_collection_item, insert_location};
use crate::test_app::TestApp;
use crate::testing::fixtures::card;

/// A printing in `set` with its own card.
fn printing(set: &str, number: &str, name: &str, overrides: Value) -> Value {
    let mut value = card(json!({
        "id": format!("{set}-{number}"),
        "oracle_id": format!("oracle-{name}"),
        "name": name,
        "set": set,
        "set_name": format!("Set {}", set.to_uppercase()),
        "collector_number": number,
        "image_uris": {"normal": format!("https://example.test/{set}-{number}.jpg")},
    }));
    if let (Some(value), Value::Object(overrides)) = (value.as_object_mut(), overrides) {
        value.extend(overrides);
    }
    value
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item.as_str().unwrap().to_owned())
        .collect()
}

#[tokio::test]
async fn card_sets_list_newest_first_with_owned_counts_and_priciest_previews() {
    let app = TestApp::new().await;
    app.import_cards(&[
        printing(
            "old",
            "1",
            "Cheap",
            json!({"prices": {"usd": "0.10"}, "released_at": "2001-01-01"}),
        ),
        printing(
            "old",
            "2",
            "Foil Only",
            json!({"prices": {"usd": null, "usd_foil": "40.00"}, "released_at": "2001-01-01"}),
        ),
        printing(
            "old",
            "3",
            "Pricey",
            json!({"prices": {"usd": "90.00"}, "released_at": "2001-01-01"}),
        ),
        printing(
            "old",
            "4",
            "Middling",
            json!({"prices": {"usd": "5.00"}, "released_at": "2001-01-01"}),
        ),
        printing("new", "1", "Fresh", json!({"released_at": "2024-05-05"})),
    ])
    .await;
    let wishlist = insert_location(&app, "Wishlist", "list").await;
    insert_collection_item(&app, "old-1", 3, None).await;
    insert_collection_item(&app, "old-1", 1, None).await;
    insert_collection_item(&app, "old-3", 1, Some(wishlist)).await;

    let data = app
        .gql_data(
            "{ cardSets { code name releasedAt cardCount ownedCount previewImageUrls } }",
            json!({}),
        )
        .await;
    let sets = data["cardSets"].as_array().unwrap();
    assert_eq!(
        sets.iter()
            .map(|set| set["code"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["new", "old"]
    );
    let old = &sets[1];
    assert_eq!(old["name"], "Set OLD");
    assert_eq!(old["releasedAt"], "2001-01-01");
    assert_eq!(old["cardCount"], 4);
    // Two collection items of one printing count once; list locations do not count.
    assert_eq!(old["ownedCount"], 1);
    assert_eq!(
        strings(&old["previewImageUrls"]),
        [
            "https://example.test/old-3.jpg",
            "https://example.test/old-2.jpg",
            "https://example.test/old-4.jpg",
        ]
    );
}

#[tokio::test]
async fn card_set_printings_sort_by_collector_number_filter_and_carry_frames() {
    let app = TestApp::new().await;
    app.import_cards(&[
        printing("abc", "10", "Ten", json!({"prices": {"usd": "1.00"}})),
        printing(
            "abc",
            "2a",
            "Two A",
            json!({"prices": {"usd": "3.00"}, "type_line": "Creature"}),
        ),
        printing("abc", "2", "Two", json!({"prices": {"usd": "2.00"}})),
        printing(
            "abc",
            "300",
            "Showcase",
            json!({
                "prices": {"usd": "9.00"},
                "promo_types": ["fracturefoil", "boosterfun"],
                "frame_effects": ["showcase", "inverted"],
                "border_color": "borderless",
                "full_art": true
            }),
        ),
        printing("xyz", "1", "Elsewhere", json!({})),
    ])
    .await;
    let query = "query Set($code: String!, $q: String, $sort: CardSort) {
      cardSet(code: $code) {
        code cardCount
        printings(q: $q, sort: $sort) { collectorNumber promoTypes frameEffects borderColor fullArt }
      }
    }";
    let numbers = |data: &Value| -> Vec<String> {
        data["cardSet"]["printings"]
            .as_array()
            .unwrap()
            .iter()
            .map(|printing| printing["collectorNumber"].as_str().unwrap().to_owned())
            .collect()
    };

    let data = app.gql_data(query, json!({"code": "ABC"})).await;
    assert_eq!(data["cardSet"]["cardCount"], 4);
    assert_eq!(numbers(&data), ["2", "2a", "10", "300"]);
    let showcase = &data["cardSet"]["printings"][3];
    assert_eq!(strings(&showcase["frameEffects"]), ["showcase", "inverted"]);
    assert_eq!(showcase["borderColor"], "borderless");
    assert_eq!(showcase["fullArt"], true);
    assert_eq!(data["cardSet"]["printings"][0]["frameEffects"], json!([]));
    assert_eq!(data["cardSet"]["printings"][0]["fullArt"], false);

    let data = app
        .gql_data(
            query,
            json!({"code": "abc", "sort": {"field": "price", "direction": "desc"}}),
        )
        .await;
    assert_eq!(numbers(&data), ["300", "2a", "2", "10"]);

    let data = app
        .gql_data(query, json!({"code": "abc", "q": "t:creature"}))
        .await;
    assert_eq!(numbers(&data), ["2a"]);

    let data = app.gql_data(query, json!({"code": "nope"})).await;
    assert_eq!(data["cardSet"], Value::Null);
}
