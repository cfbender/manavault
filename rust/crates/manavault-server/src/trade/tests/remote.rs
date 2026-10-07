//! `list_source/mana_vault_remote_test.exs` and the absolute-link parts of
//! `list_source_test.exs`, against wiremock through lotus's
//! `DecklistClient`, adjusted to lotus behavior where noted.

use std::future::Future;
use std::net::IpAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use lotus::Zone;
use lotus::decklist::{DecklistClientBuilder, Limits, Origin, Resolver, ShareKind, ShareLink};
use serde_json::{Value, json};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

use crate::test_support::TestApp;
use crate::trade::list_source::{self, ListEntry, ResolveError, ResolvedList, UNSUPPORTED, remote};

/// A DNS stub that answers every host with fixed addresses and counts calls.
struct StubResolver {
    addresses: Vec<IpAddr>,
    calls: AtomicUsize,
}

impl StubResolver {
    fn new(addresses: &[&str]) -> Arc<Self> {
        Arc::new(Self {
            addresses: addresses.iter().map(|a| a.parse().unwrap()).collect(),
            calls: AtomicUsize::new(0),
        })
    }
}

impl Resolver for StubResolver {
    fn resolve<'a>(
        &'a self,
        _host: &'a str,
    ) -> Pin<Box<dyn Future<Output = std::io::Result<Vec<IpAddr>>> + Send + 'a>> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        let addresses = self.addresses.clone();
        Box::pin(async move { Ok(addresses) })
    }
}

/// An app whose allowlist admits loopback, so wiremock is reachable.
async fn app() -> TestApp {
    TestApp::with_config(|config| config.remote_share_allowlist = vec!["127.0.0.0/8".into()]).await
}

fn builder(app: &TestApp) -> DecklistClientBuilder {
    remote::builder(&app.state.config)
}

async fn resolve_with(
    app: &TestApp,
    builder: DecklistClientBuilder,
    url: &str,
) -> Result<ResolvedList, String> {
    list_source::resolve_with(app.db(), || builder.build(), Some(url), None)
        .await
        .map_err(|error| match error {
            ResolveError::User(message) => message.to_owned(),
            ResolveError::Db(error) => format!("database error: {error}"),
        })
}

async fn fetch(app: &TestApp, url: &str) -> Result<ResolvedList, String> {
    resolve_with(app, builder(app), url).await
}

fn deck_url(server: &MockServer, kind: &str) -> String {
    format!("{}/share/{kind}/some-token", server.uri())
}

fn json_response(body: Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(body)
}

fn edge(name: &str, quantity: i64, zone: &str) -> Value {
    json!({"node": {"quantity": quantity, "zone": zone, "card": {"name": name}}})
}

fn deck_page(edges: &[Value], has_next: bool, cursor: Option<&str>) -> Value {
    json!({"data": {"deck": {
        "name": "Remote Deck",
        "deckCards": {"edges": edges, "pageInfo": {"hasNextPage": has_next, "endCursor": cursor}}
    }}})
}

fn body(request: &Request) -> Value {
    serde_json::from_slice(&request.body).unwrap()
}

fn after(request: &Request) -> Option<String> {
    body(request)["variables"]["after"]
        .as_str()
        .map(str::to_owned)
}

async fn graphql_mock(server: &MockServer, response: impl wiremock::Respond + 'static) {
    Mock::given(method("POST"))
        .and(path("/share/graphql"))
        .respond_with(response)
        .mount(server)
        .await;
}

fn entry(name: &str, quantity: i64, zone: Zone) -> ListEntry {
    ListEntry {
        name: name.to_owned(),
        quantity,
        zone,
        set_code: None,
        collector_number: None,
    }
}

#[tokio::test]
async fn fetches_a_single_deck_page_from_the_links_own_origin() {
    let server = MockServer::start().await;
    graphql_mock(
        &server,
        json_response(deck_page(&[edge("Sol Ring", 1, "mainboard")], false, None)),
    )
    .await;
    let app = app().await;
    let list = fetch(
        &app,
        &format!("{}/share/decks/some-token?view=grid", server.uri()),
    )
    .await
    .unwrap();
    assert_eq!(list.source_name.as_deref(), Some("Remote Deck"));
    assert_eq!(list.entries, vec![entry("Sol Ring", 1, Zone::Mainboard)]);
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(body(&requests[0])["variables"]["id"], "some-token");
}

#[tokio::test]
async fn paginates_on_has_next_page_and_end_cursor() {
    let server = MockServer::start().await;
    graphql_mock(&server, |request: &Request| {
        let query = body(request)["query"].as_str().unwrap().to_owned();
        assert!(query.contains("deckCards(first: 500, after: $after)"));
        match after(request).as_deref() {
            None => json_response(deck_page(
                &[edge("Sol Ring", 4, "mainboard")],
                true,
                Some("cursor-1"),
            )),
            Some(cursor) => {
                assert_eq!(cursor, "cursor-1");
                json_response(deck_page(&[edge("Negate", 2, "sideboard")], false, None))
            }
        }
    })
    .await;
    let app = app().await;
    let list = fetch(&app, &deck_url(&server, "decks")).await.unwrap();
    assert_eq!(
        list.entries,
        vec![
            entry("Sol Ring", 4, Zone::Mainboard),
            entry("Negate", 2, Zone::Considering),
        ]
    );
}

#[tokio::test]
async fn stops_endless_pagination_after_ten_pages() {
    let server = MockServer::start().await;
    let counter = Arc::new(AtomicUsize::new(0));
    let requests = counter.clone();
    graphql_mock(&server, move |_: &Request| {
        let n = requests.fetch_add(1, Ordering::SeqCst) + 1;
        json_response(deck_page(&[], true, Some(&format!("cursor-{n}"))))
    })
    .await;
    let app = app().await;
    assert_eq!(
        fetch(&app, &deck_url(&server, "decks")).await.unwrap_err(),
        remote::LIMIT
    );
    assert_eq!(counter.load(Ordering::SeqCst), 10);
}

#[tokio::test]
async fn rejects_repeated_and_empty_cursors() {
    let server = MockServer::start().await;
    graphql_mock(&server, |_: &Request| {
        json_response(deck_page(&[], true, Some("cursor-1")))
    })
    .await;
    let app = app().await;
    assert_eq!(
        fetch(&app, &deck_url(&server, "decks")).await.unwrap_err(),
        remote::PAGINATION
    );

    let server = MockServer::start().await;
    graphql_mock(&server, json_response(deck_page(&[], true, Some("")))).await;
    assert_eq!(
        fetch(&app, &deck_url(&server, "decks")).await.unwrap_err(),
        remote::PAGINATION
    );
    assert!(remote::PAGINATION.contains("invalid list pagination"));
}

#[tokio::test]
async fn rejects_more_than_ten_thousand_entries_across_pages() {
    let first: Vec<Value> = (1..=5_001)
        .map(|n| edge(&format!("First {n}"), 1, "mainboard"))
        .collect();
    let second: Vec<Value> = (1..=5_000)
        .map(|n| edge(&format!("Second {n}"), 1, "mainboard"))
        .collect();
    let server = MockServer::start().await;
    graphql_mock(&server, move |request: &Request| match after(request) {
        None => json_response(deck_page(&first, true, Some("cursor-1"))),
        Some(_) => json_response(deck_page(&second, false, None)),
    })
    .await;
    let app = app().await;
    assert_eq!(
        fetch(&app, &deck_url(&server, "decks")).await.unwrap_err(),
        remote::LIMIT
    );
}

#[tokio::test]
async fn rejects_more_than_ten_megabytes_across_pages() {
    let padding = "x".repeat(3_400_000);
    let server = MockServer::start().await;
    graphql_mock(&server, move |request: &Request| {
        let (has_next, cursor) = match after(request).as_deref() {
            None => (true, Some("cursor-1")),
            Some("cursor-1") => (true, Some("cursor-2")),
            _ => (false, None),
        };
        let mut page = deck_page(&[], has_next, cursor);
        page["padding"] = json!(padding);
        json_response(page)
    })
    .await;
    let app = app().await;
    assert_eq!(
        fetch(&app, &deck_url(&server, "decks")).await.unwrap_err(),
        remote::LIMIT
    );
    assert!(remote::LIMIT.contains("too large or took too long"));
}

#[tokio::test]
async fn rejects_an_import_past_its_whole_import_deadline() {
    let server = MockServer::start().await;
    graphql_mock(
        &server,
        json_response(deck_page(&[], false, None)).set_delay(Duration::from_secs(2)),
    )
    .await;
    let app = app().await;
    let builder = builder(&app).limits(Limits {
        timeout: Duration::from_millis(200),
        ..Limits::default()
    });
    assert_eq!(
        resolve_with(&app, builder, &deck_url(&server, "decks"))
            .await
            .unwrap_err(),
        remote::LIMIT
    );
}

#[tokio::test]
async fn deck_errors_map_to_the_elixir_messages() {
    let app = app().await;
    let cases = [
        (
            json_response(json!({"data": {"deck": null}})),
            remote::DECK_NOT_FOUND,
        ),
        (
            json_response(json!({"errors": [{"message": "boom"}]})),
            remote::UNREACHABLE,
        ),
        (
            ResponseTemplate::new(200).set_body_string("not json"),
            remote::UNREACHABLE,
        ),
        (ResponseTemplate::new(500), remote::UNREACHABLE),
        // lotus reads `data` without a `deck` field as a null deck (Elixir:
        // "couldn't reach").
        (
            json_response(json!({"data": {"unexpected": true}})),
            remote::DECK_NOT_FOUND,
        ),
    ];
    for (response, message) in cases {
        let server = MockServer::start().await;
        graphql_mock(&server, response).await;
        assert_eq!(
            fetch(&app, &deck_url(&server, "decks")).await.unwrap_err(),
            message
        );
    }
    assert!(remote::DECK_NOT_FOUND.contains("doesn't match a deck on that ManaVault instance"));
    assert!(remote::UNREACHABLE.contains("Couldn't reach that ManaVault instance"));
}

#[tokio::test]
async fn a_transport_failure_is_unreachable() {
    let app = app().await;
    assert_eq!(
        fetch(&app, "http://127.0.0.1:9/share/decks/some-token")
            .await
            .unwrap_err(),
        remote::UNREACHABLE
    );
}

fn list_response(field: &str, entries: &Value) -> ResponseTemplate {
    json_response(json!({"data": {field: {"entries": entries}}}))
}

#[tokio::test]
async fn fetches_want_lists_and_binders() {
    let entries = json!([
        {"cardName": "Sol Ring", "quantity": 2, "setCode": "cmr", "collectorNumber": "1"},
        {"cardName": "Negate", "quantity": 1, "setCode": null, "collectorNumber": null},
        {"quantity": 1}
    ]);
    let app = app().await;
    for (kind, field, name) in [
        ("wants", "wantsList", "Shared wants"),
        ("binder", "binderList", "Trade binder"),
    ] {
        let server = MockServer::start().await;
        graphql_mock(&server, list_response(field, &entries)).await;
        let list = fetch(&app, &deck_url(&server, kind)).await.unwrap();
        assert_eq!(list.source_name.as_deref(), Some(name));
        assert_eq!(
            list.entries,
            vec![
                ListEntry {
                    set_code: Some("cmr".into()),
                    collector_number: Some("1".into()),
                    ..entry("Sol Ring", 2, Zone::Mainboard)
                },
                entry("Negate", 1, Zone::Mainboard),
            ]
        );
        let request = &server.received_requests().await.unwrap()[0];
        assert!(body(request)["query"].as_str().unwrap().contains(field));
    }
}

#[tokio::test]
async fn want_and_binder_errors_map_to_the_elixir_messages() {
    let app = app().await;
    for (kind, field, not_found, unsupported) in [
        (
            "wants",
            "wantsList",
            remote::WANTS_NOT_FOUND,
            remote::WANTS_UNSUPPORTED,
        ),
        (
            "binder",
            "binderList",
            remote::BINDER_NOT_FOUND,
            remote::BINDER_UNSUPPORTED,
        ),
    ] {
        let cases = [
            (json_response(json!({"data": {field: null}})), not_found),
            (
                json_response(json!({"errors": [{
                    "message": format!("Cannot query field \"{field}\" on type \"RootQueryType\".")
                }]})),
                unsupported,
            ),
            (
                json_response(json!({"errors": [{"message": "internal server error"}]})),
                remote::UNREACHABLE,
            ),
        ];
        for (response, message) in cases {
            let server = MockServer::start().await;
            graphql_mock(&server, response).await;
            assert_eq!(
                fetch(&app, &deck_url(&server, kind)).await.unwrap_err(),
                message,
                "{kind}"
            );
        }
    }
    assert!(remote::WANTS_UNSUPPORTED.contains("doesn't support shared want lists"));
    assert!(remote::BINDER_UNSUPPORTED.contains("doesn't support shared trade binders"));
}

#[tokio::test]
async fn rejects_non_public_literals_without_an_allowlist() {
    let app = TestApp::new().await;
    for address in [
        "127.0.0.1",
        "10.20.30.40",
        "169.254.169.254",
        "0.0.0.0",
        "[::1]",
        "[fd12:3456::20]",
        "[fe80::1]",
        "[::]",
        "[::ffff:127.0.0.1]",
        "[2001:2::1]",
        "[2001:20::1]",
        "[2002:7f00:1::1]",
        "[3fff::1]",
    ] {
        assert_eq!(
            fetch(&app, &format!("http://{address}/share/decks/token"))
                .await
                .unwrap_err(),
            UNSUPPORTED,
            "{address}"
        );
    }
}

#[tokio::test]
async fn allows_a_configured_lan_hostname_and_keeps_its_authority() {
    let server = MockServer::start().await;
    let port = server.address().port();
    Mock::given(method("POST"))
        .and(path("/share/graphql"))
        .and(header("host", format!("friend.home:{port}").as_str()))
        .respond_with(json_response(json!({"data": {"deck": null}})))
        .expect(1)
        .mount(&server)
        .await;
    let app = TestApp::with_config(|config| {
        config.remote_share_allowlist = vec!["friend.home".into()];
    })
    .await;
    let client = remote::builder(&app.state.config)
        .resolver(StubResolver::new(&["127.0.0.1"]))
        .build()
        .unwrap();
    let origin = Origin::parse(&format!(
        "http://friend.home:{port}/private/path?ignored=yes"
    ))
    .unwrap();
    let share = ShareLink {
        kind: ShareKind::Deck,
        token: "token".into(),
    };
    assert_eq!(
        remote::manavault(&client, &origin, &share)
            .await
            .unwrap_err(),
        remote::DECK_NOT_FOUND
    );
}

#[tokio::test]
async fn allows_only_addresses_inside_a_configured_ipv6_cidr() {
    let app = TestApp::with_config(|config| {
        config.remote_share_allowlist = vec!["fd12:3456::/64".into()];
    })
    .await;
    let quick = || {
        remote::builder(&app.state.config)
            .connect_timeout(Duration::from_millis(200))
            .timeout(Duration::from_millis(500))
    };
    // Allowed: the request is attempted (and fails to connect).
    assert_eq!(
        resolve_with(&app, quick(), "http://[fd12:3456::20]/share/decks/token")
            .await
            .unwrap_err(),
        remote::UNREACHABLE
    );
    assert_eq!(
        resolve_with(&app, quick(), "http://[fd13:3456::20]/share/decks/token")
            .await
            .unwrap_err(),
        UNSUPPORTED
    );
}

#[tokio::test]
async fn rejects_a_dns_answer_set_containing_a_private_address() {
    let server = MockServer::start().await;
    graphql_mock(&server, json_response(json!({"data": {"deck": null}}))).await;
    let app = TestApp::new().await;
    let builder = builder(&app).resolver(StubResolver::new(&["93.184.216.34", "169.254.169.254"]));
    assert_eq!(
        resolve_with(&app, builder, "https://rebinding.example/share/decks/token")
            .await
            .unwrap_err(),
        UNSUPPORTED
    );
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test]
async fn resolves_once_and_pins_the_address_across_pagination() {
    let server = MockServer::start().await;
    let port = server.address().port();
    let expected_host = format!("stable.example:{port}");
    graphql_mock(&server, move |request: &Request| {
        assert_eq!(
            request.headers.get("host").unwrap().to_str().unwrap(),
            expected_host
        );
        let (has_next, cursor) = match after(request) {
            None => (true, Some("next")),
            Some(_) => (false, None),
        };
        let mut page = deck_page(&[], has_next, cursor);
        page["data"]["deck"]["name"] = json!("Pinned");
        json_response(page)
    })
    .await;
    let app = TestApp::with_config(|config| {
        config.remote_share_allowlist = vec!["stable.example".into()];
    })
    .await;
    let resolver = StubResolver::new(&["127.0.0.1"]);
    let builder = builder(&app).resolver(resolver.clone());
    let list = resolve_with(
        &app,
        builder,
        &format!("http://stable.example:{port}/share/decks/token"),
    )
    .await
    .unwrap();
    assert_eq!(list.source_name.as_deref(), Some("Pinned"));
    assert_eq!(resolver.calls.load(Ordering::SeqCst), 1);
    assert_eq!(server.received_requests().await.unwrap().len(), 2);
}

#[tokio::test]
async fn remote_deck_cards_clamp_quantities_and_default_unknown_zones() {
    // lotus behavior (deliberate difference): Elixir kept a 0 quantity and
    // an unknown zone string as sent.
    let server = MockServer::start().await;
    graphql_mock(
        &server,
        json_response(deck_page(
            &[
                edge("Sol Ring", 0, "attractions"),
                edge("Island", 3, "commander"),
            ],
            false,
            None,
        )),
    )
    .await;
    let app = app().await;
    let list = fetch(&app, &deck_url(&server, "decks")).await.unwrap();
    assert_eq!(
        list.entries,
        vec![
            entry("Sol Ring", 1, Zone::Mainboard),
            entry("Island", 3, Zone::Commander),
        ]
    );
}

#[tokio::test]
async fn graphql_trade_matches_reads_a_remote_list_and_surfaces_errors() {
    let server = MockServer::start().await;
    graphql_mock(
        &server,
        list_response(
            "wantsList",
            &json!([{"cardName": "Sol Ring", "quantity": 3}]),
        ),
    )
    .await;
    let app = app().await;
    let data = app
        .gql_data(
            "mutation($url: String) { tradeMatches(url: $url) { sourceName entryCount unrecognized } }",
            json!({"url": deck_url(&server, "wants")}),
        )
        .await;
    assert_eq!(
        data["tradeMatches"],
        json!({"sourceName": "Shared wants", "entryCount": 1, "unrecognized": ["Sol Ring"]})
    );
    let response = app
        .gql(
            "mutation { tradeMatches(url: \"https://example.com/x\") { entryCount } }",
            json!({}),
        )
        .await;
    assert_eq!(super::error_message(&response), UNSUPPORTED);
}
