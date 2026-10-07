//! Card rulings.

use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use crate::catalog::card::CardRuling;
use crate::catalog::invalidate_after_import;
use crate::catalog::scryfall::rulings::card_rulings;
use crate::test_support::TestApp;
use crate::test_support::fixtures::card;

#[tokio::test]
async fn maps_rulings_and_tolerates_unavailable_data() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/cards/oracle-1/rulings"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": [{"source": "wotc", "published_at": "2024-01-02", "comment": "Activated abilities follow normal timing rules."}]
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/error"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/not-json"))
        .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/bad-data"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": "bad"})))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/missing-comment"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"data": [{"source": "wotc"}]})),
        )
        .mount(&server)
        .await;

    let app = TestApp::new().await;
    let uri = format!("{}/cards/oracle-1/rulings", server.uri());
    let expected = vec![CardRuling {
        source: Some("wotc".to_owned()),
        published_at: Some("2024-01-02".to_owned()),
        comment: "Activated abilities follow normal timing rules.".to_owned(),
    }];
    assert_eq!(card_rulings(&app.state, Some(&uri)).await, expected);
    // Cached: the mock expects exactly one request.
    assert_eq!(card_rulings(&app.state, Some(&uri)).await, expected);

    assert_eq!(card_rulings(&app.state, None).await.len(), 0);
    assert_eq!(card_rulings(&app.state, Some("")).await.len(), 0);
    for bad in ["/error", "/not-json", "/bad-data", "/missing-comment"] {
        let uri = format!("{}{bad}", server.uri());
        assert!(
            card_rulings(&app.state, Some(&uri)).await.is_empty(),
            "{bad}"
        );
    }
}

#[tokio::test]
async fn card_rulings_resolve_over_graphql_and_refresh_after_imports() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/rulings"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": [{"source": "wotc", "published_at": "2024-01-02", "comment": "First."}]
        })))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/rulings"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": [{"comment": "Second."}]
        })))
        .mount(&server)
        .await;
    let app = TestApp::new().await;
    app.import_cards(&[card(
        json!({"rulings_uri": format!("{}/rulings", server.uri())}),
    )])
    .await;
    let query = r#"{ card(id: "oracle-1") { rulings { source publishedAt comment } } }"#;
    let data = app.gql_data(query, json!({})).await;
    assert_eq!(
        data["card"]["rulings"],
        json!([{"source": "wotc", "publishedAt": "2024-01-02", "comment": "First."}])
    );
    let data = app.gql_data(query, json!({})).await;
    assert_eq!(data["card"]["rulings"][0]["comment"], "First.");
    invalidate_after_import(&app.state).await;
    let data = app.gql_data(query, json!({})).await;
    assert_eq!(
        data["card"]["rulings"],
        json!([{"source": null, "publishedAt": null, "comment": "Second."}])
    );
}
