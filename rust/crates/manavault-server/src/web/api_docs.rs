//! The `OpenAPI` description of the personal API and the Swagger UI that
//! renders it.
//!
//! [`ApiDoc`] is assembled from the `#[utoipa::path]` annotation next to each
//! `/api/v1` handler and the `ToSchema` derives on the DTOs those handlers
//! serialize, so the document follows the code instead of drifting from it.
//! `GET /api-docs/openapi.json` serves the document itself and `GET
//! /docs/rest` serves Swagger UI over assets embedded in the binary: nothing
//! is downloaded at build time or fetched from a CDN at serve time.
//!
//! Both routes are available in every environment, because they only contain
//! the contract and fictional examples. Exercising an operation still needs
//! its API key. `docs/api.md` explains how to document another endpoint.

use axum::Router;
use axum::extract::{Request, State};
use axum::middleware::{Next, from_fn_with_state};
use axum::response::Response;
use manavault_core::web::browser::put_browser_headers;
use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};
use utoipa::{Modify, OpenApi as _};
use utoipa_swagger_ui::{Config, SwaggerUi};

use super::WebState;
use super::api_v1;

/// Where the `OpenAPI` document is served as JSON.
pub const OPENAPI_PATH: &str = "/api-docs/openapi.json";

/// Where the Swagger UI is served.
pub const UI_PATH: &str = "/docs/rest";

/// The `OpenAPI` document of the personal API.
///
/// Documenting a route means adding its handler to `paths`, its DTOs to
/// `components(schemas(...))`, and, for a new area, a `tags` entry matching
/// the handler's `tag`.
#[derive(utoipa::OpenApi)]
#[openapi(
    info(
        title = "ManaVault personal API",
        version = env!("CARGO_PKG_VERSION"),
        description = "The read-only HTTP API for trusted applications that need the state of \
                       one ManaVault instance. A personal API key grants read access to the \
                       decks owned by that instance and nothing else: there is no access to \
                       another instance and no way to change anything.\n\n\
                       Every operation needs `Authorization: Bearer mvk_...`. Cookies and CSRF \
                       headers play no part, so a server-side client can call the API \
                       directly. Create a key under Settings and select **Authorize** above to \
                       try an operation against this instance; the key is held in the page only \
                       and is not written to browser storage."
    ),
    tags((
        name = "Decks",
        description = "The decks owned by this ManaVault instance."
    )),
    paths(api_v1::decks),
    components(schemas(
        api_v1::DeckIndex,
        api_v1::ApiDeck,
        api_v1::Pagination,
        api_v1::ApiError,
        api_v1::ApiErrorBody,
        api_v1::ApiErrorCode
    )),
    modifiers(&BearerAuth)
)]
pub struct ApiDoc;

/// Declares the HTTP bearer scheme that the `/api/v1` middleware reads.
struct BearerAuth;

impl Modify for BearerAuth {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let Some(components) = openapi.components.as_mut() else {
            return;
        };
        components.add_security_scheme(
            "bearer_auth",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("mvk_...")
                    .description(Some(
                        "A personal API key created under Settings. Send it as \
                         `Authorization: Bearer mvk_...`.",
                    ))
                    .build(),
            ),
        );
    }
}

/// The Swagger UI and its document, for merging into the main router.
///
/// Requests go to the origin the page was loaded from, so the UI talks to
/// whichever instance serves it, and they carry no cookie, so the requests
/// the UI makes are the same ones any client would make.
pub fn router(vite_dev: bool) -> Router<WebState> {
    Router::<WebState>::from(
        SwaggerUi::new(UI_PATH)
            .url(OPENAPI_PATH, ApiDoc::openapi())
            .config(
                Config::default()
                    // Swagger UI's spec-validator badge has
                    // `validator.swagger.io` fetch this instance's document, and
                    // the badge's URL carries the instance's hostname and spec
                    // path. `none` disables it, so the page never talks to a
                    // third party. Swagger UI exempts `localhost`, so the badge
                    // is invisible while developing and shows up only in a real
                    // deployment.
                    .validator_url("none")
                    // A key entered in the Authorize dialog lives in the page,
                    // not in localStorage, so a later visit starts locked.
                    .persist_authorization(false)
                    .display_request_duration(true)
                    .doc_expansion("list"),
            ),
    )
    .layer(from_fn_with_state(vite_dev, browser_headers))
}

/// The docs accept API keys in the browser, so protect the page with the
/// same headers as the app's other pages without adding form CSRF checks.
async fn browser_headers(State(vite_dev): State<bool>, request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    put_browser_headers(response.headers_mut(), vite_dev);
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    /// The document as it is served, so these assertions describe what a
    /// client of `GET /api-docs/openapi.json` receives.
    fn document() -> Value {
        serde_json::to_value(ApiDoc::openapi()).expect("the document serializes")
    }

    fn at<'a>(value: &'a Value, pointer: &str) -> &'a Value {
        assert!(
            value.pointer(pointer).is_some(),
            "the document is missing {pointer}"
        );
        value.pointer(pointer).unwrap()
    }

    /// The media type object of one documented response.
    fn media<'a>(document: &'a Value, status: &str) -> &'a Value {
        at(
            document,
            &format!("/paths/~1api~1v1~1decks/get/responses/{status}/content/application~1json"),
        )
    }

    /// A parameter's description with its line wrapping flattened, so an
    /// assertion does not depend on where the doc comment happens to break.
    fn prose(parameter: &Value) -> String {
        parameter["description"]
            .as_str()
            .expect("the parameter has a description")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn describes_the_decks_operation() {
        let document = document();
        assert_eq!(document["openapi"], "3.1.0");
        assert_eq!(at(&document, "/info/title"), "ManaVault personal API");
        assert_eq!(at(&document, "/info/version"), env!("CARGO_PKG_VERSION"));

        let operation = at(&document, "/paths/~1api~1v1~1decks/get");
        assert_eq!(operation["operationId"], "listDecks");
        assert_eq!(operation["tags"], json!(["Decks"]));
        // The API key, and nothing else: no cookie, no CSRF token.
        assert_eq!(operation["security"], json!([{"bearer_auth": []}]));
        let scheme = at(&document, "/components/securitySchemes/bearer_auth");
        assert_eq!(scheme["type"], "http");
        assert_eq!(scheme["scheme"], "bearer");
        assert_eq!(scheme["bearerFormat"], "mvk_...");

        let parameters = operation["parameters"]
            .as_array()
            .expect("parameters is an array");
        let names: Vec<&str> = parameters
            .iter()
            .map(|parameter| parameter["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, ["page", "per_page"]);
        assert!(
            parameters
                .iter()
                .all(|parameter| parameter["in"] == "query" && parameter["required"] == false)
        );
        assert_eq!(parameters[0]["example"], 1);
        assert_eq!(parameters[1]["example"], 50);
        // The bounds come from the type the handler parses into, not from prose:
        // this is what a client (and Swagger UI's own validation) reads.
        assert_eq!(parameters[0]["schema"]["type"], "integer");
        assert_eq!(parameters[0]["schema"]["default"], 1);
        assert_eq!(parameters[0]["schema"]["minimum"], 1);
        assert!(parameters[0]["schema"].get("maximum").is_none());
        assert_eq!(parameters[1]["schema"]["type"], "integer");
        assert_eq!(parameters[1]["schema"]["default"], 50);
        assert_eq!(parameters[1]["schema"]["minimum"], 1);
        assert_eq!(parameters[1]["schema"]["maximum"], 100);
        // Both describe what happens to a value the schema calls invalid, since
        // such a value falls back to the default instead of failing the request.
        // (The bounds themselves are the schema's job; the fallback is behaviour
        // a schema cannot express, so it stays prose.)
        assert!(prose(&parameters[0]).contains("not a positive integer"));
        assert!(prose(&parameters[1]).contains("capped at 100"));
    }

    #[test]
    fn documents_the_responses_the_endpoint_returns() {
        let document = document();
        let responses = at(&document, "/paths/~1api~1v1~1decks/get/responses");
        let mut statuses: Vec<&str> = responses
            .as_object()
            .expect("responses is an object")
            .keys()
            .map(String::as_str)
            .collect();
        statuses.sort_unstable();
        assert_eq!(statuses, ["200", "401", "429", "500"]);

        let ok = media(&document, "200");
        assert_eq!(
            ok["schema"],
            json!({"$ref": "#/components/schemas/DeckIndex"})
        );
        let examples = ok["examples"].as_object().expect("the 200 has examples");
        let mut names: Vec<&str> = examples.keys().map(String::as_str).collect();
        names.sort_unstable();
        assert_eq!(
            names,
            [
                "Commander deck without a share link",
                "Empty list",
                "Private deck without a commander",
                "Shared commander deck"
            ]
        );
        assert_eq!(examples["Empty list"]["value"]["data"], json!([]));
        let private = &examples["Private deck without a commander"]["value"]["data"][0];
        assert_eq!(private["commanderColorIdentity"], Value::Null);
        assert_eq!(private["public_share_url"], Value::Null);
        assert_eq!(private["publicly_shared"], false);
        let shared = &examples["Shared commander deck"]["value"]["data"][0];
        assert_eq!(shared["publicly_shared"], true);
        assert_eq!(shared["commanders"], json!(["Muldrotha, the Gravetide"]));
        assert!(
            shared["public_share_url"]
                .as_str()
                .is_some_and(|url| url.starts_with("https://manavault.example.com/"))
        );
        // The two nulls are independent: a deck can have a commander and still
        // have no share link.
        let unshared = &examples["Commander deck without a share link"]["value"]["data"][0];
        assert_eq!(unshared["public_share_url"], Value::Null);
        assert_eq!(unshared["publicly_shared"], false);
        assert_eq!(unshared["commanders"], json!(["Atla Palani, Nest Tender"]));
        assert_eq!(unshared["commanderColorIdentity"], json!(["R", "G"]));

        let codes = at(&document, "/components/schemas/ApiErrorCode/enum")
            .as_array()
            .expect("the codes are an array")
            .clone();
        for status in ["401", "429", "500"] {
            let content = media(&document, status);
            assert_eq!(
                content["schema"],
                json!({"$ref": "#/components/schemas/ApiError"})
            );
            let error = &content["example"]["error"];
            assert!(
                codes.contains(&error["code"]),
                "the {status} example uses a code the API cannot return"
            );
            assert!(error["message"].is_string());
        }
        // A limited client is told when its budget refills.
        let retry_after = at(
            &document,
            "/paths/~1api~1v1~1decks/get/responses/429/headers/Retry-After",
        );
        assert_eq!(retry_after["schema"]["type"], "integer");
    }

    #[test]
    fn deck_schema_matches_the_serialized_json() {
        let document = document();
        let deck = at(&document, "/components/schemas/ApiDeck/properties");
        let mut names: Vec<&str> = deck
            .as_object()
            .expect("ApiDeck has properties")
            .keys()
            .map(String::as_str)
            .collect();
        names.sort_unstable();
        // The serde names, not the Rust field names.
        assert_eq!(
            names,
            [
                "cardCount",
                "commanderColorIdentity",
                "commanders",
                "format",
                "id",
                "name",
                "public_share_url",
                "publicly_shared",
                "updated_at"
            ]
        );
        assert_eq!(
            at(&document, "/components/schemas/ApiDeck/required"),
            &json!([
                "cardCount",
                "commanders",
                "format",
                "id",
                "name",
                "publicly_shared",
                "updated_at"
            ])
        );
        // A deck without a commander or without a share link serializes null,
        // so both fields are nullable and neither is required.
        let identity = &deck["commanderColorIdentity"];
        assert_eq!(identity["type"], json!(["array", "null"]));
        assert_eq!(identity["items"]["type"], "string");
        assert_eq!(deck["public_share_url"]["type"], json!(["string", "null"]));
        // `updated_at` is second-precision UTC text and always present.
        assert_eq!(deck["updated_at"]["type"], "string");
        assert_eq!(deck["updated_at"]["format"], "date-time");
        assert_eq!(
            at(&document, "/components/schemas/Pagination/required"),
            &json!(["page", "per_page", "total", "total_pages"])
        );
        // The error envelope, with a closed set of codes.
        assert_eq!(
            at(&document, "/components/schemas/ApiError/properties/error"),
            &json!({"$ref": "#/components/schemas/ApiErrorBody"})
        );
        assert_eq!(
            at(&document, "/components/schemas/ApiErrorCode/enum"),
            &json!(["unauthorized", "rate_limited", "internal_error"])
        );
    }
}
