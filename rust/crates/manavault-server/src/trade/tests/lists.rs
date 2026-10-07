//! `entry_resolver_test.exs`, `matcher_test.exs`, `collection_check_test.exs`,
//! and `deck_diff_test.exs`.

use lotus::{OracleId, Zone};
use serde_json::json;

use super::{Item, add_deck_card, allocate, basic_card, card, insert_deck, insert_location};
use crate::test_support::{TestApp, fixtures};
use crate::trade::collection_check::{self, RowStatus};
use crate::trade::deck_diff::{self, DiffError};
use crate::trade::entry_resolver::{self, Resolved, ResolvedEntry};
use crate::trade::list_source::{self, ListEntry};
use crate::trade::matcher;
use crate::trade::want;

fn entry(name: &str, quantity: i64) -> ListEntry {
    ListEntry {
        name: name.to_owned(),
        quantity,
        zone: Zone::Mainboard,
        set_code: None,
        collector_number: None,
    }
}

fn resolved(name: &str, oracle_id: Option<&str>, quantity: i64) -> ResolvedEntry {
    ResolvedEntry {
        entry: entry(name, quantity),
        oracle_id: oracle_id.map(OracleId::new),
    }
}

fn considering(mut entry: ResolvedEntry) -> ResolvedEntry {
    entry.entry.zone = Zone::Considering;
    entry
}

fn list(entries: Vec<ResolvedEntry>, unrecognized: &[&str]) -> Resolved {
    Resolved {
        entries,
        unrecognized: unrecognized.iter().map(|name| (*name).to_owned()).collect(),
    }
}

fn oracle_ids(resolved: &Resolved) -> Vec<Option<&str>> {
    resolved
        .entries
        .iter()
        .map(|entry| entry.oracle_id.as_ref().map(OracleId::as_str))
        .collect()
}

mod entry_resolver_tests {
    use super::*;

    #[tokio::test]
    async fn resolves_exact_normalized_and_diacritic_free_names() {
        let app = TestApp::new().await;
        app.import_cards(&[
            card("oracle-sol-ring", "Sol Ring"),
            card("oracle-oin", "Óin the Brave"),
        ])
        .await;
        let resolved = entry_resolver::resolve(
            app.db(),
            vec![
                entry("sol ring", 1),
                entry("Óin the Brave", 1),
                entry("Oin the brave", 1),
                entry("Sol Ring *F*", 1),
            ],
        )
        .await
        .unwrap();
        assert_eq!(
            oracle_ids(&resolved),
            vec![
                Some("oracle-sol-ring"),
                Some("oracle-oin"),
                Some("oracle-oin"),
                Some("oracle-sol-ring")
            ]
        );
        assert_eq!(resolved.unrecognized.len(), 0);
    }

    #[tokio::test]
    async fn resolves_multi_faced_cards_by_front_face_and_falls_back_to_it() {
        let app = TestApp::new().await;
        app.import_cards(&[
            card("oracle-bala-ged", "Bala Ged Recovery // Bala Ged Sanctuary"),
            card("oracle-fire", "Fire"),
        ])
        .await;
        let resolved = entry_resolver::resolve(
            app.db(),
            vec![entry("Bala Ged Recovery", 1), entry("Fire // Ice", 1)],
        )
        .await
        .unwrap();
        assert_eq!(
            oracle_ids(&resolved),
            vec![Some("oracle-bala-ged"), Some("oracle-fire")]
        );
    }

    #[tokio::test]
    async fn prefers_the_full_split_name_over_the_front_face() {
        let app = TestApp::new().await;
        app.import_cards(&[
            card("oracle-fire", "Fire"),
            card("oracle-fire-ice", "Fire // Ice"),
        ])
        .await;
        let resolved = entry_resolver::resolve(app.db(), vec![entry("Fire // Ice", 1)])
            .await
            .unwrap();
        assert_eq!(oracle_ids(&resolved), vec![Some("oracle-fire-ice")]);
    }

    #[tokio::test]
    async fn reports_unresolved_names_once_each() {
        let app = TestApp::new().await;
        app.import_cards(&[card("oracle-sol-ring", "Sol Ring")])
            .await;
        let resolved = entry_resolver::resolve(
            app.db(),
            vec![
                entry("Not A Real Card", 1),
                entry("Sol Ring", 1),
                entry("Not A Real Card", 1),
                entry("Also Fake", 1),
            ],
        )
        .await
        .unwrap();
        assert_eq!(
            oracle_ids(&resolved),
            vec![None, Some("oracle-sol-ring"), None, None]
        );
        assert_eq!(resolved.unrecognized, vec!["Not A Real Card", "Also Fake"]);
    }
}

mod matcher_tests {
    use super::*;

    async fn app() -> TestApp {
        let app = TestApp::new().await;
        app.import_cards(&[
            card("oracle-sol-ring", "Sol Ring"),
            card("oracle-lotus", "Black Lotus"),
            card("oracle-walk", "Time Walk"),
        ])
        .await;
        app
    }

    #[tokio::test]
    async fn matches_for_trade_items_grouped_with_their_for_trade_quantities() {
        let app = app().await;
        let item1 = Item::new("scryfall-oracle-sol-ring", 4)
            .for_trade(2)
            .insert(&app)
            .await;
        let item2 = Item::new("scryfall-oracle-sol-ring", 1)
            .for_trade(1)
            .insert(&app)
            .await;
        Item::new("scryfall-oracle-sol-ring", 1).insert(&app).await;
        Item::new("scryfall-oracle-walk", 1)
            .for_trade(1)
            .insert(&app)
            .await;

        let result = matcher::match_list(
            app.db(),
            Some("Their List".into()),
            list(
                vec![
                    resolved("Sol Ring", Some("oracle-sol-ring"), 2),
                    resolved("Sol Ring", Some("oracle-sol-ring"), 1),
                ],
                &[],
            ),
        )
        .await
        .unwrap();
        assert_eq!(result.source_name.as_deref(), Some("Their List"));
        assert_eq!(result.entry_count, 2);
        assert_eq!(result.want_matches.len(), 0);
        assert_eq!(result.binder_matches.len(), 1);
        let binder_match = &result.binder_matches[0];
        assert_eq!(binder_match.card_name, "Sol Ring");
        assert_eq!(binder_match.oracle_id.as_str(), "oracle-sol-ring");
        assert_eq!(binder_match.their_quantity, 3);
        let mut ids: Vec<i64> = binder_match.items.iter().map(|item| item.id).collect();
        ids.sort_unstable();
        assert_eq!(ids, vec![item1, item2]);
        let mut quantities: Vec<i64> = binder_match.items.iter().map(|i| i.quantity).collect();
        quantities.sort_unstable();
        assert_eq!(quantities, vec![1, 2]);
    }

    #[tokio::test]
    async fn matches_wants_and_sorts_by_card_name() {
        let app = app().await;
        want::create_by_name(app.db(), "Black Lotus", Some(2))
            .await
            .unwrap();
        want::create_by_name(app.db(), "Time Walk", Some(1))
            .await
            .unwrap();
        let result = matcher::match_list(
            app.db(),
            None,
            list(
                vec![
                    resolved("Time Walk", Some("oracle-walk"), 1),
                    resolved("Black Lotus", Some("oracle-lotus"), 5),
                ],
                &[],
            ),
        )
        .await
        .unwrap();
        assert_eq!(result.binder_matches.len(), 0);
        let names: Vec<&str> = result
            .want_matches
            .iter()
            .map(|m| m.card_name.as_str())
            .collect();
        assert_eq!(names, vec!["Black Lotus", "Time Walk"]);
        assert_eq!(result.want_matches[0].their_quantity, 5);
        assert_eq!(result.want_matches[0].want.quantity.get(), 2);
        assert_eq!(result.want_matches[0].oracle_id.as_str(), "oracle-lotus");
    }

    #[tokio::test]
    async fn unresolved_entries_count_but_never_match() {
        let app = app().await;
        let result = matcher::match_list(
            app.db(),
            None,
            list(vec![resolved("Fake Card", None, 1)], &["Fake Card"]),
        )
        .await
        .unwrap();
        assert_eq!(result.entry_count, 1);
        assert_eq!(result.unrecognized, vec!["Fake Card"]);
        assert_eq!(result.binder_matches.len(), 0);
        assert_eq!(result.want_matches.len(), 0);
    }

    #[tokio::test]
    async fn excludes_items_in_list_locations() {
        let app = app().await;
        let wishlist = insert_location(&app, "Wishlist", "list").await;
        Item::new("scryfall-oracle-sol-ring", 1)
            .for_trade(1)
            .location(wishlist)
            .insert(&app)
            .await;
        let result = matcher::match_list(
            app.db(),
            None,
            list(vec![resolved("Sol Ring", Some("oracle-sol-ring"), 1)], &[]),
        )
        .await
        .unwrap();
        assert_eq!(result.binder_matches.len(), 0);
    }

    #[tokio::test]
    async fn graphql_trade_matches() {
        let app = app().await;
        let item = Item::new("scryfall-oracle-sol-ring", 4)
            .for_trade(2)
            .insert(&app)
            .await;
        want::create_by_name(app.db(), "Black Lotus", Some(2))
            .await
            .unwrap();
        let data = app
            .gql_data(
                "mutation($text: String) { tradeMatches(text: $text) {
                   sourceName entryCount unrecognized
                   binderMatches { cardName oracleId theirQuantity
                     items { id quantity condition finish forTrade printing { setCode card { name } } } }
                   wantMatches { cardName oracleId theirQuantity want { quantity card { name } } }
                 } }",
                json!({"text": "3 Sol Ring\n1 Black Lotus\n1 Nope"}),
            )
            .await;
        assert_eq!(
            data["tradeMatches"],
            json!({
                "sourceName": null,
                "entryCount": 3,
                "unrecognized": ["Nope"],
                "binderMatches": [{
                    "cardName": "Sol Ring", "oracleId": "oracle-sol-ring", "theirQuantity": 3,
                    "items": [{
                        "id": crate::graphql::global_id(crate::graphql::NodeKind::CollectionItem, item).0,
                        "quantity": 2, "condition": "near_mint", "finish": "nonfoil",
                        "forTrade": true,
                        "printing": {"setCode": "tst", "card": {"name": "Sol Ring"}}
                    }]
                }],
                "wantMatches": [{
                    "cardName": "Black Lotus", "oracleId": "oracle-lotus", "theirQuantity": 1,
                    "want": {"quantity": 2, "card": {"name": "Black Lotus"}}
                }]
            })
        );
    }
}

mod collection_check_tests {
    use super::*;

    #[tokio::test]
    async fn summarizes_ready_allocated_missing_and_cost() {
        let app = TestApp::new().await;
        let cheap_lotus = fixtures::merge(
            fixtures::black_lotus_beta(),
            json!({"prices": {"usd": "10.00"}}),
        );
        app.import_cards(&[
            fixtures::black_lotus(),
            cheap_lotus,
            fixtures::time_walk(),
            fixtures::plains(),
        ])
        .await;
        Item::new("scryfall-printing-1", 2).insert(&app).await;
        let allocated = Item::new("scryfall-printing-3", 1).insert(&app).await;
        let other_deck = insert_deck(&app, "Other deck").await;
        let other_lotus = add_deck_card(&app, other_deck, "oracle-1", 1, "mainboard").await;
        allocate(&app, other_lotus, allocated, 1).await;

        let list = list_source::resolve(
            app.db(),
            &app.state.config,
            None,
            Some("4 Black Lotus\n1 Time Walk\n10 Plains\n1 Unknown Card"),
        )
        .await
        .unwrap();
        let result = collection_check::check(app.db(), &app.state.prices, list, false)
            .await
            .unwrap();
        assert_eq!(result.requested_quantity, 16);
        assert_eq!(result.entry_count, 4);
        assert_eq!(result.available_quantity, 12);
        assert_eq!(result.unavailable_quantity, 1);
        assert_eq!(result.missing_quantity, 2);
        assert_eq!(result.estimated_cost_cents, 2_500);
        assert_eq!(result.cost_text(), "$25");
        assert_eq!(result.unpriced_quantity, 0);
        assert_eq!(result.unrecognized, vec!["Unknown Card"]);

        let lotus = result
            .cards
            .iter()
            .find(|card| card.card_name == "Black Lotus")
            .unwrap();
        assert_eq!(
            (
                lotus.required,
                lotus.owned,
                lotus.available,
                lotus.unavailable,
                lotus.missing,
                lotus.to_source
            ),
            (4, 3, 2, 1, 1, 2)
        );
        assert_eq!(lotus.status, RowStatus::Partial);
        assert_eq!(lotus.unit_price_cents, Some(1_000));
        assert_eq!(lotus.total_price_cents, Some(2_000));
        assert_eq!(lotus.printing.as_ref().unwrap().set_code, "leb");

        let plains = result
            .cards
            .iter()
            .find(|card| card.card_name == "Plains")
            .unwrap();
        assert_eq!(
            (
                plains.required,
                plains.available,
                plains.unavailable,
                plains.missing
            ),
            (10, 10, 0, 0)
        );
        assert_eq!(plains.status, RowStatus::BasicLand);

        // Worst status first: missing Time Walk, partial Lotus, basic Plains.
        let statuses: Vec<RowStatus> = result.cards.iter().map(|card| card.status).collect();
        assert_eq!(
            statuses,
            vec![RowStatus::Missing, RowStatus::Partial, RowStatus::BasicLand]
        );
    }

    #[tokio::test]
    async fn excludes_considering_cards_by_default_and_can_include_them() {
        let app = TestApp::new().await;
        app.import_cards(&[fixtures::black_lotus(), fixtures::time_walk()])
            .await;
        let text = "Mainboard\n1 Black Lotus\nConsidering\n2 Time Walk";
        let resolve = || async {
            list_source::resolve(app.db(), &app.state.config, None, Some(text))
                .await
                .unwrap()
        };
        let default = collection_check::check(app.db(), &app.state.prices, resolve().await, false)
            .await
            .unwrap();
        assert_eq!(default.requested_quantity, 1);
        assert_eq!(default.excluded_quantity, 2);
        let names: Vec<&str> = default.cards.iter().map(|c| c.card_name.as_str()).collect();
        assert_eq!(names, vec!["Black Lotus"]);

        let complete = collection_check::check(app.db(), &app.state.prices, resolve().await, true)
            .await
            .unwrap();
        assert_eq!(complete.requested_quantity, 3);
        assert_eq!(complete.excluded_quantity, 0);
        let mut names: Vec<&str> = complete
            .cards
            .iter()
            .map(|c| c.card_name.as_str())
            .collect();
        names.sort_unstable();
        assert_eq!(names, vec!["Black Lotus", "Time Walk"]);
    }

    #[tokio::test]
    async fn allocated_elsewhere_and_list_locations() {
        let app = TestApp::new().await;
        app.import_cards(&[fixtures::black_lotus()]).await;
        let wishlist = insert_location(&app, "Wishlist", "list").await;
        // Copies in list locations are not owned.
        Item::new("scryfall-printing-1", 5)
            .location(wishlist)
            .insert(&app)
            .await;
        let item = Item::new("scryfall-printing-1", 1).insert(&app).await;
        let deck = insert_deck(&app, "Deck").await;
        let deck_card = add_deck_card(&app, deck, "oracle-1", 1, "mainboard").await;
        allocate(&app, deck_card, item, 1).await;

        let list = list_source::resolve(app.db(), &app.state.config, None, Some("1 Black Lotus"))
            .await
            .unwrap();
        let result = collection_check::check(app.db(), &app.state.prices, list, false)
            .await
            .unwrap();
        let lotus = &result.cards[0];
        assert_eq!(
            (
                lotus.owned,
                lotus.available,
                lotus.unavailable,
                lotus.missing
            ),
            (1, 0, 1, 0)
        );
        assert_eq!(lotus.status, RowStatus::AllocatedElsewhere);
        // Unpriced? No: the alpha printing has a price.
        assert_eq!(result.unpriced_quantity, 0);
        assert_eq!(result.estimated_cost_cents, 10_000_000);
    }

    #[tokio::test]
    async fn the_cheapest_printing_ties_break_chronologically() {
        // Elixir compared Date structs in term order (day first), which
        // would pick the 1993-08-05 printing over 1993-10-01.
        let app = TestApp::new().await;
        app.import_cards(&[
            fixtures::merge(
                fixtures::black_lotus(),
                json!({"prices": {"usd": "5.00"}, "released_at": "1993-10-01", "set": "zzz"}),
            ),
            fixtures::merge(
                fixtures::black_lotus_beta(),
                json!({"prices": {"usd": "5.00"}, "released_at": "1993-08-05", "set": "aaa"}),
            ),
            fixtures::merge(
                fixtures::black_lotus(),
                json!({"id": "unpriced", "prices": {}, "released_at": "1990-01-01"}),
            ),
        ])
        .await;
        let list = list_source::resolve(app.db(), &app.state.config, None, Some("1 Black Lotus"))
            .await
            .unwrap();
        let result = collection_check::check(app.db(), &app.state.prices, list, false)
            .await
            .unwrap();
        assert_eq!(result.cards[0].printing.as_ref().unwrap().set_code, "aaa");
        assert_eq!(result.cards[0].unit_price_cents, Some(500));
    }

    #[tokio::test]
    async fn graphql_collection_check() {
        let app = TestApp::new().await;
        app.import_cards(&[fixtures::black_lotus(), fixtures::time_walk()])
            .await;
        Item::new("scryfall-printing-1", 1).insert(&app).await;
        let data = app
            .gql_data(
                "mutation($text: String) { collectionCheck(text: $text) {
                   sourceName entryCount requestedQuantity excludedQuantity availableQuantity
                   unavailableQuantity missingQuantity estimatedCostCents estimatedCostText
                   unpricedQuantity unrecognized
                   cards { cardName oracleId required owned available unavailable missing toSource
                     status printing { setCode } setCode collectorNumber unitPriceCents
                     unitPriceText totalPriceCents totalPriceText }
                 } }",
                json!({"text": "1 Black Lotus\n2 Time Walk\nSideboard\n1 Black Lotus"}),
            )
            .await;
        assert_eq!(
            data["collectionCheck"],
            json!({
                "sourceName": null, "entryCount": 2, "requestedQuantity": 3,
                "excludedQuantity": 1, "availableQuantity": 1, "unavailableQuantity": 0,
                "missingQuantity": 2, "estimatedCostCents": 1000, "estimatedCostText": "$10",
                "unpricedQuantity": 0, "unrecognized": [],
                "cards": [
                    {
                        "cardName": "Time Walk", "oracleId": "oracle-2", "required": 2, "owned": 0,
                        "available": 0, "unavailable": 0, "missing": 2, "toSource": 2,
                        "status": "missing", "printing": {"setCode": "lea"}, "setCode": "lea",
                        "collectorNumber": "84", "unitPriceCents": 500, "unitPriceText": "$5",
                        "totalPriceCents": 1000, "totalPriceText": "$10"
                    },
                    {
                        "cardName": "Black Lotus", "oracleId": "oracle-1", "required": 1, "owned": 1,
                        "available": 1, "unavailable": 0, "missing": 0, "toSource": 0,
                        "status": "ready", "printing": {"setCode": "lea"}, "setCode": "lea",
                        "collectorNumber": "232", "unitPriceCents": 10_000_000,
                        "unitPriceText": "$100k", "totalPriceCents": 0, "totalPriceText": "$0"
                    }
                ]
            })
        );

        let included = app
            .gql_data(
                "mutation($text: String) { collectionCheck(text: $text, includeConsidering: true) { requestedQuantity excludedQuantity } }",
                json!({"text": "1 Black Lotus\nSideboard\n1 Time Walk"}),
            )
            .await;
        assert_eq!(
            included["collectionCheck"],
            json!({"requestedQuantity": 2, "excludedQuantity": 0})
        );
    }
}

mod deck_diff_tests {
    use super::*;

    async fn setup() -> (TestApp, i64) {
        let app = TestApp::new().await;
        app.import_cards(&[
            card("oracle-sol-ring", "Sol Ring"),
            card("oracle-lotus", "Black Lotus"),
            card("oracle-walk", "Time Walk"),
            card("oracle-bolt", "Lightning Bolt"),
        ])
        .await;
        let deck = insert_deck(&app, "Test Deck").await;
        add_deck_card(&app, deck, "oracle-sol-ring", 1, "mainboard").await;
        add_deck_card(&app, deck, "oracle-lotus", 1, "mainboard").await;
        add_deck_card(&app, deck, "oracle-walk", 1, "considering").await;
        (app, deck)
    }

    async fn diff(app: &TestApp, deck: i64, entries: Vec<ResolvedEntry>) -> deck_diff::DiffResult {
        deck_diff::diff(app.db(), deck, None, list(entries, &[]))
            .await
            .unwrap()
    }

    fn names(entries: &[deck_diff::DiffEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.card_name.as_str()).collect()
    }

    #[tokio::test]
    async fn adds_cards_only_in_the_list() {
        let (app, deck) = setup().await;
        let result = deck_diff::diff(
            app.db(),
            deck,
            Some("Their List".into()),
            list(
                vec![resolved("Lightning Bolt", Some("oracle-bolt"), 2)],
                &[],
            ),
        )
        .await
        .unwrap();
        assert_eq!(result.source_name.as_deref(), Some("Their List"));
        assert_eq!(result.changes.len(), 0);
        assert_eq!(names(&result.cuts), vec!["Black Lotus", "Sol Ring"]);
        assert_eq!(result.adds.len(), 1);
        let add = &result.adds[0];
        assert_eq!(add.card_name, "Lightning Bolt");
        assert_eq!(add.oracle_id.as_ref().unwrap().as_str(), "oracle-bolt");
        assert_eq!(add.quantity, 2);
        assert_eq!(
            add.image_url.as_deref(),
            Some("https://example.test/oracle-bolt.jpg")
        );
        assert_eq!(add.deck_card_ids.len(), 0);
    }

    #[tokio::test]
    async fn adds_name_only_entries_without_image_or_oracle_id() {
        let (app, deck) = setup().await;
        let result = deck_diff::diff(
            app.db(),
            deck,
            None,
            list(
                vec![resolved("Some Unknown Card", None, 3)],
                &["Some Unknown Card"],
            ),
        )
        .await
        .unwrap();
        assert_eq!(result.unrecognized, vec!["Some Unknown Card"]);
        assert_eq!(result.adds.len(), 1);
        assert_eq!(result.adds[0].quantity, 3);
        assert_eq!(result.adds[0].oracle_id, None);
        assert_eq!(result.adds[0].image_url, None);
    }

    #[tokio::test]
    async fn cuts_cards_only_in_the_deck_with_images() {
        let (app, deck) = setup().await;
        let result = diff(&app, deck, vec![]).await;
        assert_eq!(result.adds.len(), 0);
        assert_eq!(names(&result.cuts), vec!["Black Lotus", "Sol Ring"]);
        assert!(result.cuts.iter().all(|cut| cut.image_url.is_some()));
    }

    #[tokio::test]
    async fn cut_and_change_rows_carry_every_deck_card_id() {
        let (app, deck) = setup().await;
        let sol_main = add_deck_card(&app, deck, "oracle-sol-ring", 1, "mainboard").await;
        let sol_commander = add_deck_card(&app, deck, "oracle-sol-ring", 1, "commander").await;
        let result = diff(
            &app,
            deck,
            vec![resolved("Black Lotus", Some("oracle-lotus"), 3)],
        )
        .await;
        let sol_cut = result
            .cuts
            .iter()
            .find(|cut| cut.card_name == "Sol Ring")
            .unwrap();
        let mut expected = vec![sol_main, sol_commander];
        expected.sort_unstable();
        assert_eq!(sol_cut.deck_card_ids, expected);
        assert_eq!(sol_cut.quantity, 3);
        assert_eq!(result.changes.len(), 1);
        assert_eq!(result.changes[0].card_name, "Black Lotus");
        assert_eq!(result.changes[0].deck_card_ids.len(), 1);

        app.import_cards(&[basic_card("oracle-plains-a", "Plains")])
            .await;
        let plains = add_deck_card(&app, deck, "oracle-plains-a", 3, "mainboard").await;
        let result = diff(&app, deck, vec![]).await;
        let plains_cut = result
            .cuts
            .iter()
            .find(|cut| cut.card_name == "Plains")
            .unwrap();
        assert_eq!(plains_cut.deck_card_ids, vec![plains]);
    }

    #[tokio::test]
    async fn reports_changes_and_nothing_for_matching_quantities() {
        let (app, deck) = setup().await;
        let result = diff(
            &app,
            deck,
            vec![resolved("Sol Ring", Some("oracle-sol-ring"), 4)],
        )
        .await;
        assert_eq!(result.changes.len(), 1);
        let change = &result.changes[0];
        assert_eq!(
            (change.from_quantity, change.to_quantity),
            (1, 4),
            "{change:?}"
        );
        assert_eq!(
            change.oracle_id.as_ref().unwrap().as_str(),
            "oracle-sol-ring"
        );
        assert_eq!(names(&result.cuts), vec!["Black Lotus"]);

        let result = diff(
            &app,
            deck,
            vec![resolved("Sol Ring", Some("oracle-sol-ring"), 1)],
        )
        .await;
        assert_eq!(result.changes.len(), 0);
    }

    #[tokio::test]
    async fn excludes_the_considering_zone_on_both_sides() {
        let (app, deck) = setup().await;
        let result = diff(
            &app,
            deck,
            vec![considering(resolved("Time Walk", Some("oracle-walk"), 1))],
        )
        .await;
        assert!(!names(&result.cuts).contains(&"Time Walk"));
        assert!(!names(&result.adds).contains(&"Time Walk"));
        assert_eq!(result.changes.len(), 0);
    }

    #[tokio::test]
    async fn basic_lands_compare_by_name_across_oracle_ids() {
        let (app, deck) = setup().await;
        app.import_cards(&[basic_card("oracle-plains-a", "Plains")])
            .await;
        add_deck_card(&app, deck, "oracle-plains-a", 4, "mainboard").await;
        app.import_cards(&[basic_card("oracle-plains-b", "Plains")])
            .await;

        let same = diff(
            &app,
            deck,
            vec![resolved("Plains", Some("oracle-plains-b"), 4)],
        )
        .await;
        assert!(!names(&same.adds).contains(&"Plains"));
        assert!(!names(&same.cuts).contains(&"Plains"));
        assert!(same.changes.iter().all(|c| c.card_name != "Plains"));

        let more = diff(
            &app,
            deck,
            vec![resolved("Plains", Some("oracle-plains-b"), 7)],
        )
        .await;
        let change = more
            .changes
            .iter()
            .find(|c| c.card_name == "Plains")
            .unwrap();
        assert_eq!((change.from_quantity, change.to_quantity), (4, 7));
        assert!(!names(&more.adds).contains(&"Plains"));
        assert!(!names(&more.cuts).contains(&"Plains"));
    }

    #[tokio::test]
    async fn one_sided_basics_are_adds_or_cuts() {
        let (app, deck) = setup().await;
        app.import_cards(&[
            basic_card("oracle-forest", "Forest"),
            basic_card("oracle-island", "Island"),
        ])
        .await;
        add_deck_card(&app, deck, "oracle-island", 2, "mainboard").await;
        let result = diff(
            &app,
            deck,
            vec![resolved("Forest", Some("oracle-forest"), 3)],
        )
        .await;
        let add = result
            .adds
            .iter()
            .find(|a| a.card_name == "Forest")
            .unwrap();
        assert_eq!(add.quantity, 3);
        assert_eq!(
            add.image_url.as_deref(),
            Some("https://example.test/oracle-forest.jpg")
        );
        let cut = result
            .cuts
            .iter()
            .find(|c| c.card_name == "Island")
            .unwrap();
        assert_eq!(cut.quantity, 2);
    }

    #[tokio::test]
    async fn snow_covered_basics_stay_distinct() {
        let (app, deck) = setup().await;
        app.import_cards(&[basic_card("oracle-plains-a", "Plains")])
            .await;
        add_deck_card(&app, deck, "oracle-plains-a", 2, "mainboard").await;
        let result = deck_diff::diff(
            app.db(),
            deck,
            None,
            list(
                vec![
                    resolved("Plains", Some("oracle-plains-a"), 2),
                    resolved("Snow-Covered Plains", None, 1),
                ],
                &["Snow-Covered Plains"],
            ),
        )
        .await
        .unwrap();
        let all: Vec<&str> = names(&result.adds)
            .into_iter()
            .chain(names(&result.cuts))
            .chain(result.changes.iter().map(|c| c.card_name.as_str()))
            .collect();
        assert!(!all.contains(&"Plains"));
        let add = result
            .adds
            .iter()
            .find(|a| a.card_name == "Snow-Covered Plains")
            .unwrap();
        assert_eq!(
            (add.quantity, add.oracle_id.clone(), add.image_url.clone()),
            (1, None, None)
        );
    }

    #[tokio::test]
    async fn snow_basics_in_the_catalog_compare_by_name() {
        // Elixir counted only `Basic Land ...` type lines as basics, so a
        // `Basic Snow Land` with another oracle id was a cut plus an add.
        let (app, deck) = setup().await;
        let snow = |oracle_id: &str| {
            fixtures::merge(
                card(oracle_id, "Snow-Covered Forest"),
                json!({"type_line": "Basic Snow Land — Forest"}),
            )
        };
        app.import_cards(&[snow("oracle-snow-a")]).await;
        add_deck_card(&app, deck, "oracle-snow-a", 2, "mainboard").await;
        app.import_cards(&[snow("oracle-snow-b")]).await;
        let result = diff(
            &app,
            deck,
            vec![resolved("Snow-Covered Forest", Some("oracle-snow-b"), 2)],
        )
        .await;
        assert!(!names(&result.adds).contains(&"Snow-Covered Forest"));
        assert!(!names(&result.cuts).contains(&"Snow-Covered Forest"));
    }

    #[tokio::test]
    async fn basics_do_not_affect_other_classification() {
        let (app, deck) = setup().await;
        app.import_cards(&[basic_card("oracle-plains-a", "Plains")])
            .await;
        add_deck_card(&app, deck, "oracle-plains-a", 3, "mainboard").await;
        let result = diff(
            &app,
            deck,
            vec![
                resolved("Plains", Some("oracle-plains-a"), 3),
                resolved("Sol Ring", Some("oracle-sol-ring"), 2),
                resolved("Lightning Bolt", Some("oracle-bolt"), 1),
            ],
        )
        .await;
        assert_eq!(result.changes.len(), 1);
        assert_eq!(result.changes[0].card_name, "Sol Ring");
        assert_eq!(names(&result.adds), vec!["Lightning Bolt"]);
        assert_eq!(names(&result.cuts), vec!["Black Lotus"]);
    }

    #[tokio::test]
    async fn missing_decks_are_a_friendly_error() {
        let app = TestApp::new().await;
        let error = deck_diff::diff(app.db(), -1, None, list(vec![], &[]))
            .await
            .unwrap_err();
        assert!(matches!(error, DiffError::NotFound));
        assert!(error.to_string().contains("couldn't be found"));
    }
}
