//! Auto-sort rules and runs (`collection_test.exs` auto-sort tests).

use std::collections::HashMap;

use pretty_assertions::assert_eq;
use serde_json::json;

use super::*;
use crate::collection::auto_sort::rules::{AutoSortError, RuleInput, list, replace};
use crate::collection::auto_sort::{AutoSortOptions, AutoSortResult, Source, run};
use crate::collection::filters::LocationFilter;
use crate::test_support::fixtures::{black_lotus, plains, time_walk};

fn rule(target: i64, priority: i64) -> RuleInput {
    RuleInput {
        enabled: Some(true),
        priority: Some(priority),
        target_location_id: Some(target),
        ..RuleInput::default()
    }
}

/// `update_auto_sort_rules!/1`: names rules `Rule N` unless named.
async fn save_rules(app: &TestApp, rules: Vec<RuleInput>) {
    let rules: Vec<RuleInput> = rules
        .into_iter()
        .zip(1..)
        .map(|(mut rule, index)| {
            rule.name.get_or_insert_with(|| format!("Rule {index}"));
            rule
        })
        .collect();
    replace(app.db(), &rules).await.unwrap();
}

async fn sort(app: &TestApp, options: AutoSortOptions) -> AutoSortResult {
    run(app.db(), &app.state.prices, &options).await.unwrap()
}

fn dry_run() -> AutoSortOptions {
    AutoSortOptions {
        dry_run: true,
        ..AutoSortOptions::default()
    }
}

async fn location_items(app: &TestApp, location: &LocationRecord) -> Vec<i64> {
    item_ids(app, &ItemFilters::at(LocationFilter::Id(location.id))).await
}

async fn location_of(app: &TestApp, id: i64) -> Option<i64> {
    reload(app, id).await.unwrap().record.location_id
}

#[allow(clippy::unnecessary_wraps)]
fn strings(values: &[&str]) -> Option<Vec<String>> {
    Some(values.iter().map(|v| (*v).to_owned()).collect())
}

/// Marks an item's last move as older than the 30-day debounce.
async fn age_location_change(app: &TestApp, id: i64) {
    let stale =
        crate::timefmt::utc_seconds(time::OffsetDateTime::now_utc() - time::Duration::days(31));
    set_item_column(app, id, "location_changed_at", &stale).await;
}

#[tokio::test]
async fn rules_pick_the_first_storage_target_by_priority() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let high = create_location(&app, "High Priority", "box").await;
    let low = create_location(&app, "Low Priority", "box").await;
    let wish = create_location(&app, "Wish List", "list").await;

    let error = replace(
        app.db(),
        &[RuleInput {
            name: Some("Invalid target".into()),
            color_mode: Some("colorless".into()),
            ..rule(wish.id, 1)
        }],
    )
    .await
    .unwrap_err();
    assert!(matches!(error, AutoSortError::InvalidTarget));

    save_rules(
        &app,
        vec![
            RuleInput {
                color_mode: Some("colorless".into()),
                ..rule(high.id, 5)
            },
            RuleInput {
                color_mode: Some("colorless".into()),
                ..rule(low.id, 10)
            },
        ],
    )
    .await;
    let rules = list(app.db()).await.unwrap();
    let saved: Vec<(bool, i64, &str, i64)> = rules
        .iter()
        .map(|r| {
            (
                r.record.enabled,
                r.record.priority,
                r.record.color_mode.as_str(),
                r.record.target_location_id,
            )
        })
        .collect();
    assert_eq!(
        saved,
        [
            (true, 5, "colorless", high.id),
            (true, 10, "colorless", low.id)
        ]
    );

    let item = create_item(&app, "scryfall-printing-1", Attrs::default())
        .await
        .record
        .id;
    let blue = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let list_item = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(wish.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let sorted = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(high.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    // Freshly moved items wait out the debounce.
    age_location_change(&app, sorted).await;

    let preview = sort(&app, dry_run()).await;
    assert_eq!(
        (
            preview.checked_count,
            preview.moved_count,
            preview.skipped_count,
            preview.dry_run
        ),
        (3, 1, 2, true)
    );
    assert_eq!(preview.moves[0].collection_item_id, item);
    assert_eq!(preview.moves[0].finish, "nonfoil");
    assert_eq!(location_of(&app, item).await, None);

    let result = sort(&app, AutoSortOptions::default()).await;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count,
            result.dry_run
        ),
        (3, 1, 2, false)
    );
    let moved = &result.moves[0];
    assert_eq!(moved.collection_item_id, item);
    assert_eq!(moved.card_name, "Black Lotus");
    assert_eq!(moved.card_id.as_deref(), Some("oracle-1"));
    assert_eq!(
        (moved.set_code.as_str(), moved.collector_number.as_str()),
        ("lea", "232")
    );
    assert_eq!(
        moved.image_url.as_deref(),
        Some("https://example.test/black-lotus.jpg")
    );
    assert_eq!((moved.quantity, moved.finish.as_str()), (1, "nonfoil"));
    assert_eq!(
        (moved.from_location_id, moved.from_location_name.as_str()),
        (None, "Unfiled")
    );
    assert_eq!(
        (moved.to_location_id, moved.to_location_name.as_str()),
        (high.id, "High Priority")
    );

    assert_eq!(location_of(&app, item).await, Some(high.id));
    assert_eq!(location_of(&app, blue).await, None);
    assert_eq!(location_of(&app, list_item).await, Some(wish.id));
    assert_eq!(location_of(&app, sorted).await, Some(high.id));
    // Moving stamps the location change, so the next run leaves it alone.
    let moved = reload(&app, item).await.unwrap();
    assert!(moved.record.location_changed_at.is_some());
}

#[tokio::test]
async fn runs_more_than_one_batch() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let target = create_location(&app, "Batched", "box").await;
    save_rules(
        &app,
        vec![RuleInput {
            color_mode: Some("colorless".into()),
            ..rule(target.id, 1)
        }],
    )
    .await;
    let mut ids = Vec::new();
    for _ in 0..101 {
        ids.push(
            create_item(&app, "scryfall-printing-1", Attrs::default())
                .await
                .record
                .id,
        );
    }
    let result = sort(&app, AutoSortOptions::default()).await;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count
        ),
        (101, 101, 0)
    );
    for id in ids {
        assert_eq!(location_of(&app, id).await, Some(target.id));
    }
}

#[tokio::test]
async fn ignores_items_moved_in_the_last_30_days() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let binder = create_location(&app, "Binder", "box").await;
    let price = create_location(&app, "Price", "box").await;
    save_rules(
        &app,
        vec![RuleInput {
            min_price_cents: Some(1_000_000),
            ..rule(price.id, 1)
        }],
    )
    .await;
    let recent = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(binder.id),
            ..Attrs::default()
        },
    )
    .await;
    assert!(recent.record.location_changed_at.is_some());
    let stale = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(binder.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    age_location_change(&app, stale).await;

    let result = sort(&app, AutoSortOptions::default()).await;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count
        ),
        (1, 1, 0)
    );
    assert_eq!(result.moves[0].collection_item_id, stale);
    assert_eq!(location_of(&app, recent.record.id).await, Some(binder.id));
    assert_eq!(location_of(&app, stale).await, Some(price.id));
}

#[tokio::test]
async fn dry_runs_can_preview_unsaved_rules() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let colorless = create_location(&app, "Colorless", "box").await;
    let blue = create_location(&app, "Blue", "box").await;
    save_rules(
        &app,
        vec![RuleInput {
            color_mode: Some("colorless".into()),
            ..rule(colorless.id, 1)
        }],
    )
    .await;
    let item = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let options = AutoSortOptions {
        rules: Some(vec![RuleInput {
            name: Some("Draft blue".into()),
            color_mode: Some("include_any".into()),
            colors: strings(&["U"]),
            ..rule(blue.id, 1)
        }]),
        ..dry_run()
    };
    let result = sort(&app, options).await;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count,
            result.dry_run
        ),
        (1, 1, 0, true)
    );
    assert_eq!(result.moves[0].collection_item_id, item);
    assert_eq!(result.moves[0].finish, "foil");
    assert_eq!(result.moves[0].to_location_id, blue.id);
    assert_eq!(location_of(&app, item).await, None);
    assert_eq!(location_items(&app, &blue).await, Vec::<i64>::new());
}

#[tokio::test]
async fn rules_match_sets_and_release_dates() {
    let app = TestApp::new().await;
    let card = |slug: &str, name: &str, set: &str, released: &str| {
        merge(
            test_card(slug, name, "Creature", &["G"], "common", "1.00"),
            json!({"set": set, "released_at": released}),
        )
    };
    app.import_cards(&[
        card("set-alpha", "Set Alpha", "lea", "1993-08-05"),
        card("set-later", "Set Later", "xyz", "2020-01-01"),
        card("old-test", "Old Test", "tst", "1998-01-01"),
        card("future-test", "Future Test", "tst", "2026-01-01"),
    ])
    .await;
    let set_in = create_location(&app, "Set In", "box").await;
    let set_not_in = create_location(&app, "Set Not In", "box").await;
    let before = create_location(&app, "Released Before", "box").await;
    let after = create_location(&app, "Released After", "box").await;
    save_rules(
        &app,
        vec![
            RuleInput {
                set_operator: Some("in".into()),
                set_codes: strings(&["lea"]),
                ..rule(set_in.id, 1)
            },
            RuleInput {
                set_operator: Some("not_in".into()),
                set_codes: strings(&["lea", "tst"]),
                ..rule(set_not_in.id, 2)
            },
            RuleInput {
                release_date_operator: Some("before".into()),
                release_date: Some("2000-01-01".into()),
                ..rule(before.id, 3)
            },
            RuleInput {
                release_date_operator: Some("after".into()),
                release_date: Some("2025-01-01".into()),
                ..rule(after.id, 4)
            },
        ],
    )
    .await;
    let alpha = create_item(&app, "scryfall-set-alpha", Attrs::default())
        .await
        .record
        .id;
    let later = create_item(&app, "scryfall-set-later", Attrs::default())
        .await
        .record
        .id;
    let old = create_item(&app, "scryfall-old-test", Attrs::default())
        .await
        .record
        .id;
    let future = create_item(&app, "scryfall-future-test", Attrs::default())
        .await
        .record
        .id;

    let result = sort(&app, AutoSortOptions::default()).await;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count
        ),
        (4, 4, 0)
    );
    assert_eq!(location_items(&app, &set_in).await, [alpha]);
    assert_eq!(location_items(&app, &set_not_in).await, [later]);
    assert_eq!(location_items(&app, &before).await, [old]);
    assert_eq!(location_items(&app, &after).await, [future]);

    let error = run(
        app.db(),
        &app.state.prices,
        &AutoSortOptions {
            rules: Some(vec![RuleInput {
                release_date_operator: Some("after".into()),
                release_date: Some("not-a-date".into()),
                ..rule(set_in.id, 1)
            }]),
            ..dry_run()
        },
    )
    .await
    .unwrap_err();
    assert!(matches!(error, AutoSortError::InvalidRule));
    assert_eq!(
        error.to_string(),
        "Auto-sort rule contains invalid criteria."
    );
}

#[tokio::test]
async fn rules_cover_price_land_color_rarity_and_colorless_examples() {
    let app = TestApp::new().await;
    app.import_cards(&[
        black_lotus(),
        plains(),
        test_card(
            "command-tower",
            "Command Tower",
            "Land",
            &[],
            "rare",
            "0.25",
        ),
        test_card(
            "izzet-charm",
            "Izzet Charm",
            "Instant",
            &["U", "R"],
            "uncommon",
            "1.00",
        ),
        test_card(
            "gruul-charm",
            "Gruul Charm",
            "Instant",
            &["R", "G"],
            "uncommon",
            "1.00",
        ),
        test_card(
            "esper-charm",
            "Esper Charm",
            "Instant",
            &["W", "U", "B"],
            "uncommon",
            "1.00",
        ),
        test_card("sol-ring", "Sol Ring", "Artifact", &[], "uncommon", "2.00"),
    ])
    .await;
    let price = create_location(&app, "Price", "box").await;
    let nonbasic = create_location(&app, "Non-Basic Lands", "box").await;
    let basic = create_location(&app, "Basic Lands", "box").await;
    let red_green = create_location(&app, "Red Green", "box").await;
    let wub = create_location(&app, "WUB", "box").await;
    let multicolor = create_location(&app, "Multicolor", "box").await;
    let colorless = create_location(&app, "Colorless", "box").await;
    save_rules(
        &app,
        vec![
            RuleInput {
                min_price_cents: Some(1_000_000),
                ..rule(price.id, 1)
            },
            RuleInput {
                type_line_includes: strings(&["land"]),
                type_line_excludes: strings(&["basic"]),
                ..rule(nonbasic.id, 2)
            },
            RuleInput {
                type_line_includes: strings(&["basic land"]),
                ..rule(basic.id, 3)
            },
            RuleInput {
                color_mode: Some("exact".into()),
                colors: strings(&["R", "G"]),
                ..rule(red_green.id, 4)
            },
            RuleInput {
                color_mode: Some("exact".into()),
                colors: strings(&["W", "U", "B"]),
                ..rule(wub.id, 5)
            },
            RuleInput {
                color_mode: Some("multicolor".into()),
                ..rule(multicolor.id, 6)
            },
            RuleInput {
                color_mode: Some("colorless".into()),
                rarities: strings(&["uncommon"]),
                ..rule(colorless.id, 7)
            },
        ],
    )
    .await;
    let mut ids = HashMap::new();
    for id in [
        "scryfall-printing-1",
        "scryfall-printing-basic-plains",
        "scryfall-command-tower",
        "scryfall-izzet-charm",
        "scryfall-gruul-charm",
        "scryfall-esper-charm",
        "scryfall-sol-ring",
    ] {
        ids.insert(id, create_item(&app, id, Attrs::default()).await.record.id);
    }
    let result = sort(&app, AutoSortOptions::default()).await;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count
        ),
        (7, 7, 0)
    );
    assert_eq!(
        location_items(&app, &price).await,
        [ids["scryfall-printing-1"]]
    );
    assert_eq!(
        location_items(&app, &nonbasic).await,
        [ids["scryfall-command-tower"]]
    );
    assert_eq!(
        location_items(&app, &basic).await,
        [ids["scryfall-printing-basic-plains"]]
    );
    assert_eq!(
        location_items(&app, &red_green).await,
        [ids["scryfall-gruul-charm"]]
    );
    assert_eq!(
        location_items(&app, &wub).await,
        [ids["scryfall-esper-charm"]]
    );
    assert_eq!(
        location_items(&app, &multicolor).await,
        [ids["scryfall-izzet-charm"]]
    );
    assert_eq!(
        location_items(&app, &colorless).await,
        [ids["scryfall-sol-ring"]]
    );
}

#[tokio::test]
async fn type_rules_match_permanent_front_faces() {
    let app = TestApp::new().await;
    app.import_cards(&[
        test_card(
            "emeritus",
            "Emeritus of Woe // Demonic Tutor",
            "Creature — Vampire Warlock // Sorcery",
            &["B"],
            "mythic",
            "1.00",
        ),
        test_card(
            "precious",
            "My Precious // Allure of Power",
            "Legendary Artifact — Equipment // Instant — Adventure",
            &[],
            "rare",
            "1.00",
        ),
        test_card(
            "split",
            "Discovery // Dispersal",
            "Sorcery // Instant",
            &["U", "B"],
            "uncommon",
            "1.00",
        ),
        test_card(
            "sorcery",
            "Demonic Tutor",
            "Sorcery",
            &["B"],
            "rare",
            "1.00",
        ),
    ])
    .await;
    let instants = create_location(&app, "Instants", "box").await;
    let sorceries = create_location(&app, "Sorceries", "box").await;
    let creatures = create_location(&app, "Creatures", "box").await;
    let artifacts = create_location(&app, "Artifacts", "box").await;
    save_rules(
        &app,
        vec![
            RuleInput {
                type_line_includes: strings(&["instant"]),
                ..rule(instants.id, 1)
            },
            RuleInput {
                type_line_includes: strings(&["sorcery"]),
                ..rule(sorceries.id, 2)
            },
            RuleInput {
                type_line_includes: strings(&["creature", "vampire"]),
                type_line_excludes: strings(&["sorcery"]),
                ..rule(creatures.id, 3)
            },
            RuleInput {
                type_line_includes: strings(&["artifact", "equipment"]),
                type_line_excludes: strings(&["instant"]),
                ..rule(artifacts.id, 4)
            },
        ],
    )
    .await;
    let emeritus = create_item(&app, "scryfall-emeritus", Attrs::default())
        .await
        .record
        .id;
    let precious = create_item(&app, "scryfall-precious", Attrs::default())
        .await
        .record
        .id;
    let split = create_item(&app, "scryfall-split", Attrs::default())
        .await
        .record
        .id;
    let sorcery = create_item(&app, "scryfall-sorcery", Attrs::default())
        .await
        .record
        .id;

    let preview = sort(&app, dry_run()).await;
    assert_eq!(preview.moved_count, 4);
    let moves: HashMap<i64, i64> = preview
        .moves
        .iter()
        .map(|m| (m.collection_item_id, m.to_location_id))
        .collect();
    assert_eq!(
        moves,
        HashMap::from([
            (emeritus, creatures.id),
            (precious, artifacts.id),
            (split, instants.id),
            (sorcery, sorceries.id)
        ])
    );
    assert_eq!(location_items(&app, &creatures).await, Vec::<i64>::new());
    assert_eq!(sort(&app, AutoSortOptions::default()).await.moved_count, 4);
    assert_eq!(location_items(&app, &creatures).await, [emeritus]);
    assert_eq!(location_items(&app, &artifacts).await, [precious]);
    assert_eq!(location_items(&app, &instants).await, [split]);
    assert_eq!(location_items(&app, &sorceries).await, [sorcery]);
}

#[tokio::test]
async fn transformed_cards_use_front_face_colors() {
    let app = TestApp::new().await;
    let mut card = test_card(
        "grizzled-angler",
        "Grizzled Angler // Grisly Anglerfish",
        "Creature — Human // Creature — Eldrazi Fish",
        &[],
        "uncommon",
        "0.10",
    );
    if let Some(map) = card.as_object_mut() {
        map.remove("colors");
        map.insert("color_identity".into(), json!(["U"]));
        map.insert(
            "card_faces".into(),
            json!([
                {"name": "Grizzled Angler", "colors": ["U"], "oracle_text": "{T}: Mill two cards."},
                {"name": "Grisly Anglerfish", "colors": [], "oracle_text": "{6}: Creatures your opponents control attack this turn if able."}
            ]),
        );
    }
    app.import_cards(&[card]).await;
    sqlx::query(
        "UPDATE scryfall_cards SET colors = '[]' WHERE oracle_id = 'oracle-grizzled-angler'",
    )
    .execute(app.db())
    .await
    .unwrap();
    let colorless = create_location(&app, "Colorless", "box").await;
    let blue = create_location(&app, "Blue", "box").await;
    save_rules(
        &app,
        vec![
            RuleInput {
                color_mode: Some("colorless".into()),
                ..rule(colorless.id, 1)
            },
            RuleInput {
                color_mode: Some("include_any".into()),
                colors: strings(&["U"]),
                ..rule(blue.id, 2)
            },
        ],
    )
    .await;
    let item = create_item(&app, "scryfall-grizzled-angler", Attrs::default())
        .await
        .record
        .id;
    let result = sort(&app, AutoSortOptions::default()).await;
    assert_eq!(
        (
            result.checked_count,
            result.moved_count,
            result.skipped_count
        ),
        (1, 1, 0)
    );
    assert_eq!(location_items(&app, &blue).await, [item]);
    assert_eq!(location_items(&app, &colorless).await, Vec::<i64>::new());
}

#[tokio::test]
async fn can_target_only_unfiled_items_and_skips_allocated_copies() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let target = create_location(&app, "Colorless", "box").await;
    let binder = create_location(&app, "Binder", "box").await;
    save_rules(
        &app,
        vec![RuleInput {
            color_mode: Some("colorless".into()),
            ..rule(target.id, 1)
        }],
    )
    .await;
    let allocated = create_item(&app, "scryfall-printing-1", Attrs::default())
        .await
        .record
        .id;
    let unfiled = create_item(&app, "scryfall-printing-1", Attrs::default())
        .await
        .record
        .id;
    let in_binder = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(binder.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    age_location_change(&app, in_binder).await;
    let deck = insert_deck(&app, "Sleeved", "brewing").await;
    allocate(&app, deck, allocated, 1).await;

    let preview = sort(
        &app,
        AutoSortOptions {
            source: Source::Unfiled,
            ..dry_run()
        },
    )
    .await;
    assert_eq!(
        (
            preview.checked_count,
            preview.moved_count,
            preview.skipped_count
        ),
        (1, 1, 0)
    );
    assert_eq!(preview.moves[0].collection_item_id, unfiled);

    let result = sort(
        &app,
        AutoSortOptions {
            source: Source::Unfiled,
            ..AutoSortOptions::default()
        },
    )
    .await;
    assert_eq!((result.checked_count, result.moved_count), (1, 1));
    assert_eq!(location_of(&app, unfiled).await, Some(target.id));
    assert_eq!(location_of(&app, allocated).await, None);
    assert_eq!(location_of(&app, in_binder).await, Some(binder.id));

    let result = sort(
        &app,
        AutoSortOptions {
            source: Source::Location(binder.id),
            ..AutoSortOptions::default()
        },
    )
    .await;
    assert_eq!((result.checked_count, result.moved_count), (1, 1));
    assert_eq!(result.moves[0].from_location_name, "Binder");
    assert_eq!(location_of(&app, in_binder).await, Some(target.id));
}

#[tokio::test]
async fn saved_rules_are_validated() {
    let app = TestApp::new().await;
    let binder = create_location(&app, "Binder", "binder").await;
    let invalid = |input: RuleInput| {
        let app = &app;
        async move { replace(app.db(), &[input]).await.unwrap_err().to_string() }
    };
    assert_eq!(
        invalid(RuleInput {
            name: Some(String::new()),
            ..rule(binder.id, 1)
        })
        .await,
        "name can't be blank"
    );
    assert_eq!(
        invalid(RuleInput {
            name: Some("Bad".into()),
            color_mode: Some("rainbow".into()),
            min_price_cents: Some(500),
            max_price_cents: Some(100),
            release_date: Some("soon".into()),
            ..rule(binder.id, -1)
        })
        .await,
        "color_mode is invalid, max_price_cents must be greater than or equal to min price, priority must be greater than or equal to 0, release_date is invalid"
    );
    assert_eq!(
        invalid(RuleInput {
            name: Some("Gone".into()),
            ..rule(9_999, 1)
        })
        .await,
        "Auto-sort target location was not found."
    );
    // A failed save keeps the existing rules.
    save_rules(&app, vec![rule(binder.id, 1)]).await;
    invalid(RuleInput {
        name: Some("Gone".into()),
        ..rule(9_999, 1)
    })
    .await;
    assert_eq!(list(app.db()).await.unwrap().len(), 1);
}
