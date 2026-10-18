//! Card rulings, read from the imported rulings table.

use serde_json::json;

use crate::catalog::scryfall::rulings::{BulkRuling, replace};
use crate::test_app::TestApp;
use crate::testing::fixtures::card;

fn ruling(oracle_id: &str, published_at: Option<&str>, comment: &str) -> BulkRuling {
    BulkRuling {
        oracle_id: oracle_id.to_owned(),
        source: published_at.map(|_| "wotc".to_owned()),
        published_at: published_at.map(str::to_owned),
        comment: comment.to_owned(),
    }
}

#[tokio::test]
async fn card_rulings_resolve_newest_first_from_the_rulings_table() {
    let app = TestApp::new().await;
    app.import_cards(&[card(json!({}))]).await;
    replace(
        app.db(),
        &[
            ruling("oracle-1", None, "Undated."),
            ruling("oracle-1", Some("2019-05-01"), "Older."),
            ruling("oracle-other", Some("2023-01-01"), "Another card's ruling."),
            ruling("oracle-1", Some("2024-01-02"), "Newer."),
        ],
    )
    .await
    .unwrap();

    let query = r#"{ card(id: "oracle-1") { rulings { source publishedAt comment } } }"#;
    assert_eq!(
        app.gql_data(query, json!({})).await["card"]["rulings"],
        json!([
            {"source": "wotc", "publishedAt": "2024-01-02", "comment": "Newer."},
            {"source": "wotc", "publishedAt": "2019-05-01", "comment": "Older."},
            {"source": null, "publishedAt": null, "comment": "Undated."}
        ])
    );
}
