//! `list_source_test.exs`, `list_source/mana_vault_test.exs`,
//! `list_source/moxfield_test.exs`, `list_source/archidekt_test.exs`, and
//! the status mapping of `list_source/http_test.exs`.

use lotus::Zone;
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::{Item, add_deck_card, app_with_cards, insert_deck, share_deck};
use crate::test_support::{TestApp, fixtures};
use crate::trade::list_source::{
    self, ListEntry, ResolveError, ResolvedList, UNSUPPORTED, local, remote,
};
use crate::trade::share::{self, ShareKind};
use crate::trade::want;

async fn resolve(
    app: &TestApp,
    url: Option<&str>,
    text: Option<&str>,
) -> Result<ResolvedList, String> {
    list_source::resolve(app.db(), &app.state.config, url, text)
        .await
        .map_err(|error| match error {
            ResolveError::User(message) => message.to_owned(),
            ResolveError::Db(error) => format!("database error: {error}"),
        })
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

fn find<'a>(list: &'a ResolvedList, name: &str) -> &'a ListEntry {
    list.entries
        .iter()
        .find(|entry| entry.name == name)
        .expect("entry in the list")
}

mod text {
    use super::*;

    #[tokio::test]
    async fn maps_entries_and_resolves_printing_annotations() {
        let app = TestApp::new().await;
        app.import_cards(&[fixtures::black_lotus()]).await;
        let list = resolve(&app, None, Some("4 Sol Ring\n1 Black Lotus (LEA) 232\n"))
            .await
            .unwrap();
        assert_eq!(list.source_name, None);
        assert_eq!(
            list.entries,
            vec![
                entry("Sol Ring", 4, Zone::Mainboard),
                ListEntry {
                    set_code: Some("lea".into()),
                    collector_number: Some("232".into()),
                    ..entry("Black Lotus", 1, Zone::Mainboard)
                },
            ]
        );
    }

    #[tokio::test]
    async fn parses_headings_sideboard_prefixes_comments_and_duplicates() {
        let app = TestApp::new().await;
        let text = "Commander:\n1 Krenko, Mob Boss\n\nDeck\n2x Sol Ring # ramp\nSol Ring\n4 sol ring\r\nSB: 2 Negate\nMaybeboard\nPonder\n3 Unknown (XYZ) 9";
        let list = resolve(&app, None, Some(text)).await.unwrap();
        assert_eq!(
            list.entries,
            vec![
                entry("Krenko, Mob Boss", 1, Zone::Commander),
                entry("Sol Ring", 4, Zone::Mainboard),
                entry("Negate", 2, Zone::Considering),
                entry("Ponder", 1, Zone::Considering),
                // An unknown printing keeps the bare name and no printing.
                entry("Unknown", 3, Zone::Considering),
            ]
        );
    }

    #[tokio::test]
    async fn text_wins_over_url() {
        let app = TestApp::new().await;
        let list = resolve(
            &app,
            Some("https://moxfield.com/decks/whatever"),
            Some("1 Sol Ring"),
        )
        .await
        .unwrap();
        assert_eq!(list.entries, vec![entry("Sol Ring", 1, Zone::Mainboard)]);
    }

    #[tokio::test]
    async fn nothing_to_resolve_is_a_friendly_error() {
        let app = TestApp::new().await;
        for (url, text) in [(None, None), (Some(""), Some("   ")), (Some("  "), None)] {
            assert_eq!(
                resolve(&app, url, text).await.unwrap_err(),
                "Paste a decklist or a supported link to match."
            );
        }
    }
}

mod links {
    use super::*;

    #[tokio::test]
    async fn unsupported_and_malformed_links_make_no_request() {
        let app = TestApp::new().await;
        for url in [
            "https://example.com/decks/123",
            "not a url",
            "https://www.moxfield.com/decks/ab",
            "https://archidekt.com/decks/abc",
            "ftp://other-vault.example/share/decks/some-token",
            "/decks/abc",
            "/share/decks/",
        ] {
            assert_eq!(
                resolve(&app, Some(url), None).await.unwrap_err(),
                UNSUPPORTED,
                "{url}"
            );
        }
    }

    async fn shared_app() -> (TestApp, String, String, String) {
        let app = app_with_cards().await;
        let deck = insert_deck(&app, "Shared Deck").await;
        add_deck_card(&app, deck, "oracle-1", 1, "mainboard").await;
        add_deck_card(&app, deck, "oracle-2", 1, "considering").await;
        let deck_token = share_deck(&app, deck).await;
        want::create_by_name(app.db(), "Black Lotus", Some(2))
            .await
            .unwrap();
        let wants_token = share::ensure_token(app.db(), ShareKind::Wants)
            .await
            .unwrap();
        Item::new("scryfall-printing-1", 4)
            .for_trade(4)
            .insert(&app)
            .await;
        let binder_token = share::ensure_token(app.db(), ShareKind::Binder)
            .await
            .unwrap();
        (app, deck_token, wants_token, binder_token)
    }

    #[tokio::test]
    async fn bare_share_paths_resolve_locally() {
        let (app, deck_token, wants_token, binder_token) = shared_app().await;
        let deck = resolve(&app, Some(&format!("/share/decks/{deck_token}")), None)
            .await
            .unwrap();
        assert_eq!(deck.source_name.as_deref(), Some("Shared Deck"));
        assert_eq!(
            deck.entries,
            vec![
                entry("Time Walk", 1, Zone::Considering),
                entry("Black Lotus", 1, Zone::Mainboard),
            ]
        );

        let wants = resolve(&app, Some(&format!(" /share/wants/{wants_token}/ ")), None)
            .await
            .unwrap();
        assert_eq!(wants.source_name.as_deref(), Some("Shared wants"));
        assert_eq!(
            wants.entries,
            vec![entry("Black Lotus", 2, Zone::Mainboard)]
        );

        let binder = resolve(&app, Some(&format!("/share/binder/{binder_token}")), None)
            .await
            .unwrap();
        assert_eq!(binder.source_name.as_deref(), Some("Trade binder"));
        assert_eq!(
            binder.entries,
            vec![ListEntry {
                set_code: Some("lea".into()),
                collector_number: Some("232".into()),
                ..entry("Black Lotus", 4, Zone::Mainboard)
            }]
        );
    }

    #[tokio::test]
    async fn printing_wants_carry_their_printing_locally() {
        let app = app_with_cards().await;
        want::create_by_printing(app.db(), "scryfall-printing-3", Some(3))
            .await
            .unwrap();
        let token = share::ensure_token(app.db(), ShareKind::Wants)
            .await
            .unwrap();
        let wants = resolve(&app, Some(&format!("/share/wants/{token}")), None)
            .await
            .unwrap();
        assert_eq!(
            wants.entries,
            vec![ListEntry {
                set_code: Some("leb".into()),
                collector_number: Some("233".into()),
                ..entry("Black Lotus", 3, Zone::Mainboard)
            }]
        );
    }

    #[tokio::test]
    async fn unknown_local_tokens_are_friendly_errors() {
        let (app, ..) = shared_app().await;
        let token = "not-a-real-token-not-a-real-token";
        for (kind, message) in [
            ("decks", local::DECK_NOT_FOUND),
            ("wants", local::WANTS_NOT_FOUND),
            ("binder", local::BINDER_NOT_FOUND),
        ] {
            assert_eq!(
                resolve(&app, Some(&format!("/share/{kind}/{token}")), None)
                    .await
                    .unwrap_err(),
                message
            );
        }
        assert!(local::DECK_NOT_FOUND.contains("doesn't match a deck on this ManaVault instance"));
        assert!(
            local::WANTS_NOT_FOUND
                .contains("doesn't match a shared want list on this ManaVault instance")
        );
        assert!(
            local::BINDER_NOT_FOUND
                .contains("doesn't match a shared trade binder on this ManaVault instance")
        );
    }

    #[tokio::test]
    async fn revoked_local_shares_stop_resolving() {
        let (app, _deck, wants_token, binder_token) = shared_app().await;
        share::disable(app.db(), ShareKind::Wants).await.unwrap();
        share::disable(app.db(), ShareKind::Binder).await.unwrap();
        assert_eq!(
            resolve(&app, Some(&format!("/share/wants/{wants_token}")), None)
                .await
                .unwrap_err(),
            local::WANTS_NOT_FOUND
        );
        assert_eq!(
            resolve(&app, Some(&format!("/share/binder/{binder_token}")), None)
                .await
                .unwrap_err(),
            local::BINDER_NOT_FOUND
        );
    }
}

/// An app whose Moxfield and Archidekt API bases point at `server`.
async fn app_with_apis(server: &MockServer) -> TestApp {
    let base = server.uri();
    TestApp::with_config(|config| {
        config.platform_urls.moxfield_api = format!("{base}/v3/decks/all/");
        config.platform_urls.archidekt_api = format!("{base}/api/decks/");
    })
    .await
}

mod moxfield {
    use super::*;

    #[tokio::test]
    async fn normalizes_every_board_into_zoned_entries() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v3/decks/all/abcde"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "name": "Boros Aggro",
                "boards": {
                    "mainboard": {"cards": {"1": {"quantity": 4, "card": {"name": "Sol Ring", "set": "cmr", "cn": "1"}}}},
                    "sideboard": {"cards": {"2": {"quantity": 2, "card": {"name": "Negate"}}}},
                    "maybeboard": {"cards": {"3": {"quantity": 1, "card": {"name": "Ponder"}}}},
                    "commanders": {"cards": {"4": {"quantity": 1, "card": {"name": "Krenko, Mob Boss"}}}},
                    "tokens": {"cards": {"5": {"quantity": 1, "card": {"name": "Goblin"}}}}
                }
            })))
            .expect(1)
            .mount(&server)
            .await;
        let app = app_with_apis(&server).await;
        let list = resolve(
            &app,
            Some("https://www.moxfield.com/decks/abcde/primer"),
            None,
        )
        .await
        .unwrap();
        assert_eq!(list.source_name.as_deref(), Some("Boros Aggro"));
        assert_eq!(
            find(&list, "Sol Ring"),
            &ListEntry {
                set_code: Some("cmr".into()),
                collector_number: Some("1".into()),
                ..entry("Sol Ring", 4, Zone::Mainboard)
            }
        );
        assert_eq!(
            find(&list, "Negate"),
            &entry("Negate", 2, Zone::Considering)
        );
        assert_eq!(
            find(&list, "Ponder"),
            &entry("Ponder", 1, Zone::Considering)
        );
        assert_eq!(
            find(&list, "Krenko, Mob Boss"),
            &entry("Krenko, Mob Boss", 1, Zone::Commander)
        );
        assert_eq!(list.entries.len(), 4, "other boards are ignored");
    }

    async fn status_message(status: u16) -> String {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(status).set_body_string("nope"))
            .mount(&server)
            .await;
        let app = app_with_apis(&server).await;
        resolve(&app, Some("https://moxfield.com/decks/abcde"), None)
            .await
            .unwrap_err()
    }

    #[tokio::test]
    async fn forbidden_suggests_pasting_and_other_failures_are_friendly() {
        assert_eq!(status_message(403).await, remote::MOXFIELD_FORBIDDEN);
        assert!(remote::MOXFIELD_FORBIDDEN.contains("paste the list instead"));
        // lotus treats 401 like 403 (Elixir: a generic HTTP error).
        assert_eq!(status_message(401).await, remote::MOXFIELD_FORBIDDEN);
        assert_eq!(status_message(500).await, remote::MOXFIELD_ERROR);
        assert_eq!(status_message(404).await, remote::MOXFIELD_ERROR);
        assert!(remote::MOXFIELD_ERROR.contains("Paste the deck export text"));
    }

    #[tokio::test]
    async fn invalid_json_and_unreachable_hosts_are_friendly() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
            .mount(&server)
            .await;
        let app = app_with_apis(&server).await;
        assert_eq!(
            resolve(&app, Some("https://moxfield.com/decks/abcde"), None)
                .await
                .unwrap_err(),
            remote::MOXFIELD_ERROR
        );
        // The default test configuration points at a closed port.
        let app = TestApp::new().await;
        assert_eq!(
            resolve(&app, Some("https://moxfield.com/decks/abcde"), None)
                .await
                .unwrap_err(),
            remote::MOXFIELD_ERROR
        );
    }
}

mod archidekt {
    use super::*;

    #[tokio::test]
    async fn maps_cards_into_zones_by_primary_category() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/decks/1234567/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "name": "Mono Red Aggro",
                "cards": [
                    {"quantity": 4, "card": {"oracleCard": {"name": "Lightning Bolt"}}, "categories": []},
                    {"quantity": 2, "card": {"oracleCard": {"name": "Abrade"}}, "categories": ["Sideboard"]},
                    {"quantity": 1, "card": {"oracleCard": {"name": "Chandra, Torch of Defiance"}}, "categories": ["Maybeboard"]},
                    {"quantity": 1, "card": {"oracleCard": {"name": "Krenko, Mob Boss"}}, "categories": ["Commander"]},
                    {"quantity": 1, "categories": []}
                ]
            })))
            .mount(&server)
            .await;
        let app = app_with_apis(&server).await;
        let list = resolve(
            &app,
            Some("https://archidekt.com/decks/1234567/my-deck"),
            None,
        )
        .await
        .unwrap();
        assert_eq!(list.source_name.as_deref(), Some("Mono Red Aggro"));
        assert_eq!(
            list.entries,
            vec![
                entry("Lightning Bolt", 4, Zone::Mainboard),
                entry("Abrade", 2, Zone::Considering),
                entry("Chandra, Torch of Defiance", 1, Zone::Considering),
                entry("Krenko, Mob Boss", 1, Zone::Commander),
            ],
            "entries without an oracle card name are skipped"
        );
    }

    #[tokio::test]
    async fn zones_follow_included_in_deck_not_any_category() {
        // lotus behavior (deliberate difference): a secondary Maybeboard
        // category does not move a card out of the deck, and a custom
        // excluded category does.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "name": "Categories",
                "categories": [
                    {"name": "Ramp", "includedInDeck": true},
                    {"name": "Maybeboard", "includedInDeck": false},
                    {"name": "Cut", "includedInDeck": false}
                ],
                "cards": [
                    {"quantity": 1, "card": {"oracleCard": {"name": "Sol Ring"}}, "categories": ["Ramp", "Maybeboard"]},
                    {"quantity": 1, "card": {"oracleCard": {"name": "Ponder"}}, "categories": ["Cut"]}
                ]
            })))
            .mount(&server)
            .await;
        let app = app_with_apis(&server).await;
        let list = resolve(&app, Some("https://archidekt.com/decks/42"), None)
            .await
            .unwrap();
        assert_eq!(
            list.entries,
            vec![
                entry("Sol Ring", 1, Zone::Mainboard),
                entry("Ponder", 1, Zone::Considering),
            ]
        );
    }

    #[tokio::test]
    async fn failures_suggest_pasting() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(403))
            .mount(&server)
            .await;
        let app = app_with_apis(&server).await;
        let message = resolve(&app, Some("https://archidekt.com/decks/1234567"), None)
            .await
            .unwrap_err();
        assert_eq!(message, remote::ARCHIDEKT_ERROR);
        assert!(message.contains("Paste the deck export text"));
    }
}
