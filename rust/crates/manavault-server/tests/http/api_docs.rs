//! The `OpenAPI` document and the Swagger UI, through the full router.
//!
//! The contract itself is asserted next to its types in
//! `manavault_server::web::api_docs`; these tests cover what the routes serve,
//! that the document is valid `OpenAPI` 3.1, and that the documented examples are
//! the responses the endpoint really returns.

use std::collections::BTreeSet;

use serde_json::{Value, json};

use manavault_server::test_support::TestApp;

use super::share::pages::shared_deck;
use super::share::protection::limited;
use super::share::{decks, get};

/// `GET /api-docs/openapi.json`.
async fn document(app: &TestApp) -> Value {
    let response = get(app, "/api-docs/openapi.json").await;
    assert_eq!(response.status, 200, "{}", response.text());
    assert_eq!(response.header("content-type"), Some("application/json"));
    response.json()
}

/// The named schema's properties, as a set.
fn properties(document: &Value, schema: &str) -> BTreeSet<String> {
    document["components"]["schemas"][schema]["properties"]
        .as_object()
        .unwrap_or_else(|| panic!("{schema} is not a documented object schema"))
        .keys()
        .cloned()
        .collect()
}

/// A `data`/`pagination` body uses exactly the documented fields, and a `null`
/// only where the document says a field can be null.
fn assert_index_matches_schemas(document: &Value, index: &Value, case: &str) {
    let deck_schema = properties(document, "ApiDeck");
    let page_schema = properties(document, "Pagination");
    for deck in index["data"].as_array().expect("data is an array") {
        let keys: BTreeSet<String> = deck
            .as_object()
            .expect("a deck is an object")
            .keys()
            .cloned()
            .collect();
        assert_eq!(keys, deck_schema, "{case}: a deck uses undocumented fields");
        assert_nulls_are_documented(document, "ApiDeck", deck, case);
    }
    let pagination = &index["pagination"];
    let keys: BTreeSet<String> = pagination
        .as_object()
        .expect("pagination is an object")
        .keys()
        .cloned()
        .collect();
    assert_eq!(
        keys, page_schema,
        "{case}: pagination uses undocumented fields"
    );
    assert_nulls_are_documented(document, "Pagination", pagination, case);
}

/// A `null` is only legitimate where the schema's type admits it.
fn assert_nulls_are_documented(document: &Value, schema: &str, object: &Value, case: &str) {
    let documented = &document["components"]["schemas"][schema]["properties"];
    for (field, value) in object.as_object().expect("an object") {
        if !value.is_null() {
            continue;
        }
        let types = &documented[field]["type"];
        let nullable = types == "null"
            || types
                .as_array()
                .is_some_and(|types| types.iter().any(|kind| kind == "null"));
        assert!(
            nullable,
            "{case}: {schema}.{field} is null, which the document does not allow"
        );
    }
}

/// The official `OpenAPI` 3.1 meta-schemas, vendored so the test needs no
/// network: the one published with 3.1.0, which the document declares, and the
/// current revision of 3.1.
const OPENAPI_3_1_SCHEMAS: [(&str, &str); 2] = [
    (
        "3.1.0 (2022-10-07)",
        include_str!("../fixtures/openapi-3.1.0-schema.json"),
    ),
    (
        "3.1 (2025-09-15)",
        include_str!("../fixtures/openapi-3.1-schema-2025-09-15.json"),
    ),
];

/// The served document is checked against the specification's own schema, so
/// "valid `OpenAPI` 3.1" is a fact about the bytes a client receives rather than
/// a claim about the annotations behind them.
#[tokio::test]
async fn the_served_document_is_valid_openapi_3_1() {
    let app = TestApp::new().await;
    let document = document(&app).await;

    for (revision, source) in OPENAPI_3_1_SCHEMAS {
        let schema: Value = serde_json::from_str(source).expect("the meta-schema parses");
        let validator = jsonschema::validator_for(&schema).expect("the meta-schema compiles");
        let errors: Vec<String> = validator
            .iter_errors(&document)
            .map(|error| format!("{error} (at {})", error.instance_path()))
            .collect();
        assert!(
            errors.is_empty(),
            "the served document is not valid `OpenAPI` {revision}:\n{}",
            errors.join("\n")
        );

        // Guard against a vacuous pass: the same validator has to reject a
        // document that is missing something the meta-schema requires.
        let mut broken = document.clone();
        broken.as_object_mut().unwrap().remove("info");
        assert!(
            validator.iter_errors(&broken).next().is_some(),
            "the {revision} validator accepted a document with no info object"
        );
    }
}

#[tokio::test]
async fn serves_the_document_and_the_swagger_ui_without_a_session() {
    let app = TestApp::new().await;

    let body = document(&app).await;
    assert_eq!(body["openapi"], "3.1.0");
    let operation = &body["paths"]["/api/v1/decks"]["get"];
    assert_eq!(operation["operationId"], "listDecks");
    assert_eq!(operation["security"], json!([{"bearer_auth": []}]));
    // The served document carries the fictional examples: a shared deck, a
    // commander deck with no share link, a private deck with no commander, and
    // an empty list.
    let examples = &operation["responses"]["200"]["content"]["application/json"]["examples"];
    assert_eq!(
        examples
            .as_object()
            .expect("the 200 has examples")
            .keys()
            .count(),
        4
    );

    // The UI lives under its own directory: the bare path redirects first.
    let root = get(&app, "/docs/rest").await;
    assert_eq!(root.status, 303);
    assert_eq!(root.header("location"), Some("/docs/rest/"));
    let page = get(&app, "/docs/rest/").await;
    assert_eq!(page.status, 200);
    assert!(page.text().contains(r#"<div id="swagger-ui">"#));
    let bundle = get(&app, "/docs/rest/swagger-ui-bundle.js").await;
    assert_eq!(bundle.status, 200);
    assert!(bundle.text().contains("SwaggerUIBundle"));

    // The initializer is templated with this instance's configuration: it
    // fetches the document from the same origin and keeps an entered key in
    // the page instead of browser storage. No CDN is involved anywhere, and
    // the spec-validator badge stays off: left at its default, Swagger UI would
    // ask validator.swagger.io to fetch this instance's document, in a URL that
    // names this instance's host.
    let initializer = get(&app, "/docs/rest/swagger-initializer.js").await;
    assert_eq!(initializer.status, 200);
    let initializer = initializer.text();
    assert!(initializer.contains("\"/api-docs/openapi.json\""));
    assert!(initializer.contains("\"persistAuthorization\": false"));
    assert!(initializer.contains("\"docExpansion\": \"list\""));
    assert!(initializer.contains("\"validatorUrl\": \"none\""));
    assert!(!initializer.contains("validator.swagger.io"));
    assert!(!initializer.contains("petstore.swagger.io"));
    // The page loads its styles, the bundle, and the icons from its own
    // directory: every reference is relative, so nothing points at another host.
    assert!(
        !page.text().contains("//"),
        "the Swagger UI page references an absolute URL"
    );

    assert_eq!(get(&app, "/docs/rest/missing-asset.js").await.status, 404);
}

/// `Env::Test` and `Env::Prod` behave identically in the web layer today, so
/// this is a guard against the documentation routes ever becoming available in
/// development only, not a Prod-specific code path.
#[tokio::test]
async fn serves_the_document_and_the_ui_in_production_mode() {
    let app = TestApp::with_config(|config| config.env = manavault_core::config::Env::Prod).await;

    assert_eq!(document(&app).await["openapi"], "3.1.0");
    assert_eq!(get(&app, "/docs/rest/").await.status, 200);
    assert_eq!(
        get(&app, "/docs/rest/swagger-ui-bundle.js").await.status,
        200
    );
}

#[tokio::test]
async fn docs_responses_have_browser_security_headers() {
    for vite_dev in [false, true] {
        let app = TestApp::with_config(|config| config.vite_dev_server = vite_dev).await;
        let policy = manavault_core::web::browser::content_security_policy(vite_dev);
        for path in [
            "/docs/rest",
            "/docs/rest/",
            "/docs/rest/swagger-ui-bundle.js",
            "/docs/rest/swagger-initializer.js",
            "/docs/rest/swagger-ui.css",
            "/docs/rest/missing-asset.js",
            "/api-docs/openapi.json",
        ] {
            let response = get(&app, path).await;
            assert_eq!(
                response.header("content-security-policy"),
                Some(policy.as_str()),
                "{path} (vite_dev={vite_dev})"
            );
            assert_eq!(response.header("x-content-type-options"), Some("nosniff"));
            assert_eq!(
                response.header("referrer-policy"),
                Some("strict-origin-when-cross-origin")
            );
            assert_eq!(
                response.header("x-permitted-cross-domain-policies"),
                Some("none")
            );
        }
    }
}

/// The budget is spent by the first request, so the second is limited. The
/// semantics of the budget itself are asserted in `share::api_v1`; what matters
/// here is that the bodies equal the documented examples.
#[tokio::test]
async fn the_documented_error_examples_are_the_bodies_the_endpoint_returns() {
    let app = limited(1, 10).await;
    let body = document(&app).await;
    let responses = &body["paths"]["/api/v1/decks"]["get"]["responses"];

    let unauthorized = decks(&app, "", None).await;
    assert_eq!(unauthorized.status, 401);
    assert_eq!(
        unauthorized.json(),
        responses["401"]["content"]["application/json"]["example"]
    );

    let rate_limited = decks(&app, "", None).await;
    assert_eq!(rate_limited.status, 429);
    assert_eq!(
        rate_limited.json(),
        responses["429"]["content"]["application/json"]["example"]
    );
    assert!(responses["429"]["headers"]["Retry-After"].is_object());
}

#[tokio::test]
async fn the_documented_500_is_what_a_failed_request_returns() {
    let app = TestApp::new().await;
    let (_key, secret) = manavault_core::api_keys::create(app.db(), "Docs")
        .await
        .unwrap();
    let body = document(&app).await;
    app.db().close().await;

    let failed = decks(&app, "", Some(&format!("Bearer {secret}"))).await;
    assert_eq!(failed.status, 500);
    assert_eq!(
        failed.json(),
        body["paths"]["/api/v1/decks"]["get"]["responses"]["500"]["content"]["application/json"]["example"]
    );
}

#[tokio::test]
async fn a_real_response_uses_exactly_the_documented_fields() {
    let app = TestApp::new().await;
    // A deck with everything a deck can have: a commander, 100 cards, and a
    // share link. The weakest case (no commander, no link) is covered by the
    // document's own examples, which the previous test checks against the types.
    let (deck, _token) = shared_deck(&app).await;
    let (_key, secret) = manavault_core::api_keys::create(app.db(), "Docs")
        .await
        .unwrap();

    let response = decks(&app, "", Some(&format!("Bearer {secret}"))).await;
    let body = response.json();
    let document = document(&app).await;

    assert_index_matches_schemas(&document, &body, "a real response");
    for (name, example) in document["paths"]["/api/v1/decks"]["get"]["responses"]["200"]["content"]
        ["application/json"]["examples"]
        .as_object()
        .expect("the 200 has examples")
    {
        assert_index_matches_schemas(&document, &example["value"], name);
    }

    let first = &body["data"][0];
    assert_eq!(first["id"], deck);
    assert_eq!(first["cardCount"], 100);
    assert_eq!(first["commanders"], json!(["Lotus Tutor"]));
    assert_eq!(first["commanderColorIdentity"], json!(["W"]));
    assert_eq!(first["publicly_shared"], true);
    let url = first["public_share_url"]
        .as_str()
        .expect("a shared deck has a share link");
    assert!(
        url.starts_with(&app.state.config.public_url),
        "the share link is not built from the configured host: {url}"
    );
    // The request asked as `attacker.example`; nothing may echo it back.
    assert!(!response.text().contains("attacker.example"));
}
