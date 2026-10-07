//! Public GraphQL protection and the public access mutation guard.

use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::Request;
use serde_json::json;

use super::{add_card, insert_bulk_cards, insert_deck, post_graphql, public, send, share};
use manavault_server::test_support::TestApp;

async fn limited(per_ip: u32, global: u32) -> TestApp {
    TestApp::with_config(|config| {
        config.public_share_rate_limit.max_per_ip = per_ip;
        config.public_share_rate_limit.max_global = global;
    })
    .await
}

fn typename() -> serde_json::Value {
    json!({"query": "query { __typename }"})
}

#[tokio::test]
async fn rejects_json_transport_batches() {
    let app = limited(2, 2).await;
    let batch = post_graphql(&app, &json!([typename(), typename()])).await;
    assert_eq!(batch.status, 400);
    assert_eq!(
        batch.json(),
        json!({"errors": [{"message": "Batch requests are not supported"}]})
    );
    let single = post_graphql(&app, &typename()).await;
    assert_eq!(single.status, 200);
    assert_eq!(single.json(), json!({"data": {"__typename": "Query"}}));
}

#[tokio::test]
async fn only_json_bodies_are_accepted() {
    let app = TestApp::new().await;
    let operations = serde_json::to_string(&json!([typename()])).unwrap();
    let body = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("operations", &operations)
        .finish();
    let sent = send(
        &app,
        Request::post("/share/graphql")
            .header("content-type", "application/x-www-form-urlencoded")
            .body(Body::from(body))
            .unwrap(),
    )
    .await;
    assert_eq!(sent.status, 415);
    assert_eq!(
        sent.json()["errors"][0]["message"],
        "Expected an application/json request body"
    );
}

#[tokio::test]
async fn rate_limiting_happens_before_request_body_parsing() {
    let app = limited(1, 1).await;
    assert_eq!(post_graphql(&app, &typename()).await.status, 200);
    let sent = send(
        &app,
        Request::post("/share/graphql")
            .header("content-type", "application/json")
            .body(Body::from("{not valid json"))
            .unwrap(),
    )
    .await;
    assert_eq!(sent.status, 429);
    assert_eq!(
        sent.json(),
        json!({"errors": [{"message": "Too many public GraphQL requests"}]})
    );
}

#[tokio::test]
async fn rejects_token_heavy_documents() {
    let app = TestApp::new().await;
    let query = format!("query {{ {}}}", "__typename ".repeat(5_001));
    let response = public(&app, &query, json!({})).await;
    let errors = response["errors"].as_array().unwrap();
    assert_eq!(errors.len(), 1);
    assert!(
        errors[0]["message"]
            .as_str()
            .unwrap()
            .contains("Token limit exceeded")
    );
    assert!(response.get("data").is_none());
}

#[tokio::test]
async fn rejects_deeply_nested_documents() {
    let app = TestApp::new().await;
    let nested = format!("{}kind{}", "ofType { ".repeat(13), " }".repeat(13));
    let query =
        format!("query {{ __type(name: \"Printing\") {{ fields {{ type {{ {nested} }} }} }} }}");
    let response = public(&app, &query, json!({})).await;
    assert_eq!(
        response["errors"][0]["message"],
        "GraphQL operation exceeds maximum depth 12"
    );
    assert_eq!(response["errors"].as_array().unwrap().len(), 1);
    assert!(response.get("data").is_none());
}

#[tokio::test]
async fn rejects_connection_amplified_documents_by_complexity() {
    let app = TestApp::new().await;
    let connection = "deckCards(first: 500) { edges { node { quantity } } }";
    let selections = (1..=70)
        .map(|index| format!("cards{index}: {connection}"))
        .collect::<Vec<_>>()
        .join(" ");
    let token = "A".repeat(24);
    assert!(manavault_collection::decks::share_token::is_valid(&token));
    let query = format!("query {{ deck(id: \"{token}\") {{ {selections} }} }}");
    let response = public(&app, &query, json!({})).await;
    let errors = response["errors"].as_array().unwrap();
    assert_ne!(errors.len(), 0);
    assert!(errors.iter().all(|error| {
        error["message"]
            .as_str()
            .unwrap()
            .contains("maximum is 100000")
    }));
    assert!(response.get("data").is_none());
}

#[tokio::test]
async fn printing_card_summaries_cannot_recurse_back_into_printings() {
    let app = TestApp::new().await;
    let data = public(
        &app,
        "query {
          printing: __type(name: \"Printing\") { fields { name type { name kind } } }
          summary: __type(name: \"PublicCardSummary\") { fields { name } }
        }",
        json!({}),
    )
    .await["data"]
        .clone();
    let card = data["printing"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["name"] == "card")
        .unwrap();
    assert_eq!(card["type"]["name"], "PublicCardSummary");
    assert!(
        !data["summary"]["fields"]
            .as_array()
            .unwrap()
            .iter()
            .any(|field| field["name"] == "printings")
    );
}

#[tokio::test]
async fn public_deck_connections_clamp_oversized_page_requests() {
    let app = TestApp::new().await;
    let deck = insert_deck(&app, "Clamp Test", "commander", "brewing").await;
    let token = share(&app, deck).await;
    for oracle_id in insert_bulk_cards(&app, "clamp", 501).await {
        add_card(&app, deck, &oracle_id, 1, "mainboard", "nonfoil", None).await;
    }
    let query = "query($id: ID!) { deck(id: $id) {
        deckCards(first: 10000) { edges { node { quantity } } pageInfo { hasNextPage } } } }";
    let data = public(&app, query, json!({"id": token})).await["data"].clone();
    assert_eq!(
        data["deck"]["deckCards"]["edges"].as_array().unwrap().len(),
        500
    );
    assert_eq!(data["deck"]["deckCards"]["pageInfo"]["hasNextPage"], true);
    let query = "query($id: ID!) { deck(id: $id) { deckCards(first: -3) { edges { node { quantity } } } } }";
    let data = public(&app, query, json!({"id": token})).await["data"].clone();
    assert_eq!(data["deck"]["deckCards"]["edges"], json!([]));
}

#[tokio::test]
async fn per_ip_limits_bound_repeated_missing_token_lookups() {
    let app = limited(2, 10).await;
    let token = "A".repeat(24);
    let body = json!({"query": format!("query {{ deck(id: \"{token}\") {{ name }} }}")});
    let mut statuses = Vec::new();
    let mut last = None;
    for _ in 0..3 {
        let sent = post_graphql(&app, &body).await;
        statuses.push(sent.status);
        last = Some(sent);
    }
    assert_eq!(statuses, vec![200, 200, 429]);
    assert!(last.unwrap().header("retry-after").is_some());
}

#[tokio::test]
async fn global_limits_apply_across_client_ips() {
    let app = limited(10, 2).await;
    let mut statuses = Vec::new();
    for octet in 1..=3u8 {
        let mut request = Request::post("/share/graphql")
            .header("content-type", "application/json")
            .body(Body::from(typename().to_string()))
            .unwrap();
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([10, 0, 0, octet], 4000))));
        statuses.push(send(&app, request).await.status);
    }
    assert_eq!(statuses, vec![200, 200, 429]);
}

// Public access mutation guard.

#[test]
fn the_public_schema_exposes_no_mutation_fields() {
    let sdl = manavault_share::share::sdl();
    assert!(!sdl.contains("type Mutation"));
    assert!(!sdl.contains("mutation:"));
    assert!(manavault_server::graphql::sdl().contains("type Mutation"));
}

#[tokio::test]
async fn public_share_graphql_rejects_mutation_operations() {
    let app = TestApp::new().await;
    let response = public(&app, "mutation { __typename }", json!({})).await;
    let message = response["errors"][0]["message"].as_str().unwrap();
    assert!(
        message.contains("Operation \"mutation\" not supported"),
        "{message}"
    );
    assert!(response.get("data").is_none());
}

#[tokio::test]
async fn get_requests_are_not_allowed() {
    let app = TestApp::new().await;
    let sent = super::get(&app, "/share/graphql?query=%7B__typename%7D").await;
    assert_eq!(sent.status, 405);
    assert_eq!(sent.header("allow"), Some("POST"));
}
