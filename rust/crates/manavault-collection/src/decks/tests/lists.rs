//! Decklist import and export, and deck tags.

use std::collections::HashMap;

use lotus::{Finish, Zone};
use serde_json::{Value, json};

use super::support::*;
use crate::decks::DeckError;
use crate::decks::decklist::{self, ImportResult};
use crate::decks::model::DeckId;
use crate::decks::tags::{self, DeckTagChanges, DefaultTagEntry};
use crate::test_support::TestApp;
use crate::test_support::fixtures::{black_lotus, merge, time_walk};

async fn import(app: &TestApp, deck: DeckId, text: &str) -> ImportResult {
    decklist::import_decklist(app.db(), deck, text, false, None)
        .await
        .unwrap()
}

#[tokio::test]
async fn import_and_export_support_zones_and_set_collector_preferences() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let deck = create_deck(&app, "Import Test", None, None).await;
    let text = "Commander\n1 Time Walk (LEA) 84 *F*\n\nMainboard\n1 Black Lotus (LEA) 232\n2x Black Lotus\n\nSideboard\n1 Missing Card\n\nMaybeboard\nSB: 1 Time Walk\n";
    let result = import(&app, deck.id, text).await;
    assert_eq!(result.imported, 4);
    assert_eq!(result.unresolved, vec!["Missing Card"]);

    let loaded = contents(&app, deck.id).await;
    let lotus = loaded
        .cards
        .iter()
        .find(|card| card.card.name == "Black Lotus")
        .unwrap();
    assert_eq!(lotus.row.quantity.get(), 3);
    assert_eq!(
        lotus
            .row
            .preferred_printing_id
            .as_ref()
            .map(lotus::ScryfallId::as_str),
        Some("scryfall-printing-1")
    );
    let zones: Vec<(String, Zone)> = loaded
        .cards
        .iter()
        .map(|card| (card.card.name.clone(), card.row.zone))
        .collect();
    assert!(zones.contains(&("Time Walk".into(), Zone::Commander)));
    assert!(zones.contains(&("Time Walk".into(), Zone::Considering)));

    let export = decklist::export(&loaded.cards);
    assert_eq!(
        export,
        "Mainboard\n3x Black Lotus (LEA) 232\n\nConsidering\n1x Time Walk\n\nCommander\n1x Time Walk (LEA) 84 *F*"
    );
}

#[tokio::test]
async fn import_ignores_comments_and_deduplicates_stable_aliases() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let deck = create_deck(&app, "Commented Import", None, None).await;
    let result = import(
        &app,
        deck.id,
        "Deck:\n1 Black Lotus # exported note\n3x Black Lotus\n\nMaybe:\n2x Black Lotus *F*\n",
    )
    .await;
    assert_eq!(
        result,
        ImportResult {
            imported: 2,
            unresolved: vec![],
            skipped_printings: vec![]
        }
    );
    let cards = deck_cards(&app, deck.id).await;
    let main = cards
        .iter()
        .find(|row| row.zone == Zone::Mainboard)
        .unwrap();
    assert_eq!((main.quantity.get(), main.finish), (3, Finish::Nonfoil));
    let maybe = cards
        .iter()
        .find(|row| row.zone == Zone::Considering)
        .unwrap();
    assert_eq!((maybe.quantity.get(), maybe.finish), (2, Finish::Foil));
}

#[tokio::test]
async fn import_matches_diacritics_front_faces_and_flavor_names() {
    let app = TestApp::new().await;
    app.import_cards(&[
        merge(time_walk(), json!({"id": "scryfall-oin-the-brave", "oracle_id": "oracle-oin-the-brave", "name": "Óin the Brave", "collector_number": "12"})),
        merge(time_walk(), json!({"id": "scryfall-bala-ged-recovery", "oracle_id": "oracle-bala-ged-recovery", "name": "Bala Ged Recovery // Bala Ged Sanctuary", "collector_number": "180"})),
        merge(time_walk(), json!({"id": "scryfall-homeward-path", "oracle_id": "oracle-homeward-path", "name": "Homeward Path", "flavor_name": "Pelican Town", "collector_number": "1"})),
    ])
    .await;

    let deck = create_deck(&app, "Diacritic Import", None, None).await;
    let result = import(&app, deck.id, "1 Óin the Brave\n1 Oin the brave").await;
    assert_eq!((result.imported, result.unresolved.len()), (2, 0));
    let cards = deck_cards(&app, deck.id).await;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].quantity.get(), 2);

    let deck = create_deck(&app, "Multi-faced Import", None, None).await;
    let result = import(
        &app,
        deck.id,
        "1 Bala Ged Recovery\n1 Bala Ged Recovery / Bala Ged Sanctuary (LEA) 180\n",
    )
    .await;
    assert_eq!(
        (
            result.imported,
            result.unresolved.len(),
            result.skipped_printings.len()
        ),
        (2, 0, 0)
    );
    let cards = deck_cards(&app, deck.id).await;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].quantity.get(), 2);
    assert_eq!(
        cards[0]
            .preferred_printing_id
            .as_ref()
            .map(lotus::ScryfallId::as_str),
        Some("scryfall-bala-ged-recovery")
    );

    let deck = create_deck(&app, "Flavor Name Import", None, None).await;
    assert_eq!(import(&app, deck.id, "1 Pelican Town").await.imported, 1);
    assert_eq!(card_names(&app, deck.id).await, vec!["Homeward Path"]);
}

#[tokio::test]
async fn import_assumes_one_copy_and_can_target_a_zone() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let deck = create_deck(&app, "Quantityless Import", None, None).await;
    assert_eq!(
        import(&app, deck.id, "Black Lotus\nTime Walk\nSB: Black Lotus\n")
            .await
            .imported,
        3
    );
    let cards = deck_cards(&app, deck.id).await;
    assert!(cards.iter().all(|row| row.quantity.get() == 1));
    assert_eq!(
        cards
            .iter()
            .filter(|row| row.zone == Zone::Considering)
            .count(),
        1
    );

    let deck = create_deck(&app, "Zoned Import", None, None).await;
    let result = decklist::import_decklist(
        app.db(),
        deck.id,
        "Mainboard\n1 Black Lotus\n\nSideboard\n1 Time Walk\n",
        false,
        Some("considering"),
    )
    .await
    .unwrap();
    assert_eq!(result.imported, 2);
    let cards = deck_cards(&app, deck.id).await;
    assert_eq!(cards.len(), 2);
    assert!(cards.iter().all(|row| row.zone == Zone::Considering));

    let error = decklist::import_decklist(app.db(), deck.id, "1 Black Lotus", false, Some("attic"))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "Unknown deck zone: attic");
}

#[tokio::test]
async fn replacement_restores_allocated_cards() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let binder = location(&app, "Import Replace Binder", "binder").await;
    let item = collection_item(
        &app,
        "scryfall-printing-1",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let deck = create_deck(&app, "Replace Import", None, None).await;
    let lotus = add_card(&app, deck.id, "Black Lotus", 1, "mainboard").await;
    allocate(&app, lotus.id, item, 1).await;
    assert_eq!(item_location(&app, item).await, None);

    let result =
        decklist::import_decklist(app.db(), deck.id, "1 Time Walk", true, Some("considering"))
            .await
            .unwrap();
    assert_eq!(result.imported, 1);
    assert_eq!(item_location(&app, item).await, Some(binder.0));
    assert_eq!(card_names(&app, deck.id).await, vec!["Time Walk"]);
    assert!(
        deck_cards(&app, deck.id)
            .await
            .iter()
            .all(|row| row.zone == Zone::Considering)
    );
}

#[tokio::test]
async fn import_keeps_card_identities_when_the_printing_is_unusable() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let deck = create_deck(&app, "Mismatched Printing", None, None).await;
    let result = import(&app, deck.id, "1x Black Lotus (LEA) 84 *F*").await;
    assert_eq!(result.imported, 1);
    assert_eq!(result.skipped_printings, vec!["Black Lotus"]);
    let cards = deck_cards(&app, deck.id).await;
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].oracle_id.as_str(), "oracle-1");
    assert_eq!(cards[0].preferred_printing_id, None);
}

const IROH: &str = include_str!("iroh_grand_lotus.txt");

struct Expected {
    quantity: u32,
    set_code: String,
    collector_number: String,
    finish: Finish,
}

fn expected_entries(text: &str) -> HashMap<String, Expected> {
    let re = regex::Regex::new(r"^(\d+)x\s+(.+?)\s+\(([A-Z0-9]+)\)\s+(.+?)(?:\s+\*([A-Z])\*)?$")
        .unwrap();
    let mut entries: HashMap<String, Expected> = HashMap::new();
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let caps = re.captures(line).unwrap();
        let quantity: u32 = caps[1].parse().unwrap();
        let finish = if caps.get(5).map(|m| m.as_str()) == Some("F") {
            Finish::Foil
        } else {
            Finish::Nonfoil
        };
        entries
            .entry(caps[2].to_owned())
            .and_modify(|entry| entry.quantity = entry.quantity.max(quantity))
            .or_insert(Expected {
                quantity,
                set_code: caps[3].to_owned(),
                collector_number: caps[4].to_owned(),
                finish,
            });
    }
    entries
}

fn expected_cards(expected: &HashMap<String, Expected>) -> Vec<Value> {
    expected
        .iter()
        .map(|(name, entry)| {
            let scryfall_id = format!(
                "{}-{}-{}-{}",
                entry.set_code.to_lowercase(),
                entry.collector_number,
                entry.finish.as_str(),
                slug(name)
            );
            let type_line = if ["Forest", "Island", "Mountain"].contains(&name.as_str()) {
                "Basic Land"
            } else {
                "Instant"
            };
            json!({
                "id": scryfall_id,
                "oracle_id": format!("oracle-{}", slug(name)),
                "name": name,
                "type_line": type_line,
                "oracle_text": "",
                "color_identity": [],
                "legalities": {},
                "set": entry.set_code.to_lowercase(),
                "set_name": format!("{} Test Set", entry.set_code),
                "collector_number": entry.collector_number,
                "lang": "en",
                "finishes": [entry.finish.as_str()],
                "image_uris": {"normal": format!("https://example.test/{scryfall_id}.jpg")},
                "prices": {},
                "released_at": "2026-01-01"
            })
        })
        .collect()
}

#[tokio::test]
async fn import_dedupes_the_iroh_list_to_100_cards_with_printings_and_finishes() {
    let expected = expected_entries(IROH);
    assert_eq!(expected.len(), 89);
    assert_eq!(expected.values().map(|e| e.quantity).sum::<u32>(), 100);
    let app = TestApp::new().await;
    app.import_cards(&expected_cards(&expected)).await;
    let deck = create_deck(&app, "Iroh, Grand Lotus", None, None).await;
    let result = import(&app, deck.id, IROH).await;
    assert_eq!(
        result,
        ImportResult {
            imported: 89,
            unresolved: vec![],
            skipped_printings: vec![]
        }
    );
    let loaded = contents(&app, deck.id).await;
    assert_eq!(loaded.stats().total, 100);
    assert_eq!(loaded.cards.len(), 89);
    for card in &loaded.cards {
        let entry = &expected[&card.card.name];
        assert_eq!(
            card.row.quantity.get(),
            entry.quantity,
            "{}",
            card.card.name
        );
        assert_eq!(card.row.finish, entry.finish, "{}", card.card.name);
        let printing = card.preferred_printing.as_ref().unwrap();
        assert_eq!(printing.set_code, entry.set_code.to_lowercase());
        assert_eq!(printing.collector_number, entry.collector_number);
    }
}

// --- deck tags ---

async fn tag_app() -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    clear_default_tags(&app).await;
    app
}

fn tag(name: &str, color: Option<&str>) -> DeckTagChanges {
    DeckTagChanges {
        name: Some(Some(name.to_owned())),
        color: color.map(|color| Some(color.to_owned())),
        ..DeckTagChanges::default()
    }
}

#[tokio::test]
async fn tags_get_distinct_positions_default_colors_and_validation() {
    let app = tag_app().await;
    let deck = create_deck(&app, "Powered", Some("vintage"), None).await;
    let aggro = tags::create_deck_tag(app.db(), deck.id, &tag("Aggro", Some("#ff0000")))
        .await
        .unwrap();
    let combo = tags::create_deck_tag(app.db(), deck.id, &tag("Combo", Some("#00ff00")))
        .await
        .unwrap();
    assert_eq!(
        (aggro.name.as_str(), aggro.color.as_str()),
        ("Aggro", "#ff0000")
    );
    assert!(combo.position > aggro.position);

    let absent = tags::create_deck_tag(app.db(), deck.id, &tag("NoColorKey", None))
        .await
        .unwrap();
    let blank = tags::create_deck_tag(app.db(), deck.id, &tag("BlankColor", Some("")))
        .await
        .unwrap();
    assert_eq!(absent.color, "#7C5CFF");
    assert_eq!(absent.color, blank.color);

    let error = tags::create_deck_tag(app.db(), deck.id, &tag("Bad", Some("red")))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "color has invalid format");
    let error = tags::create_deck_tag(app.db(), deck.id, &tag("Aggro", Some("#00ff00")))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "deck_id has already been taken");
}

#[tokio::test]
async fn tags_list_by_position_with_quantity_card_counts() {
    let app = tag_app().await;
    let deck = create_deck(&app, "Powered", Some("vintage"), None).await;
    let zebra = tags::create_deck_tag(app.db(), deck.id, &tag("Zebra", Some("#111111")))
        .await
        .unwrap();
    let apple = tags::create_deck_tag(app.db(), deck.id, &tag("Apple", Some("#222222")))
        .await
        .unwrap();
    let mango = tags::create_deck_tag(app.db(), deck.id, &tag("Mango", Some("#333333")))
        .await
        .unwrap();
    for (tag_row, position) in [(&zebra, 10), (&apple, 5), (&mango, 0)] {
        tags::update_deck_tag(
            app.db(),
            tag_row.id,
            &DeckTagChanges {
                position: Some(Some(position)),
                ..DeckTagChanges::default()
            },
        )
        .await
        .unwrap();
    }
    let names: Vec<String> = tags::list_deck_tags(app.db(), deck.id)
        .await
        .unwrap()
        .into_iter()
        .map(|tag| tag.name)
        .collect();
    assert_eq!(names, vec!["Mango", "Apple", "Zebra"]);

    let deck = create_deck(&app, "Counts", Some("vintage"), None).await;
    let lotus = add_card(&app, deck.id, "Black Lotus", 3, "mainboard").await;
    let walk = add_card(&app, deck.id, "Time Walk", 1, "mainboard").await;
    let busy = tags::create_deck_tag(app.db(), deck.id, &tag("Busy", Some("#ff0000")))
        .await
        .unwrap();
    let empty = tags::create_deck_tag(app.db(), deck.id, &tag("Empty", Some("#00ff00")))
        .await
        .unwrap();
    tags::assign_deck_card_tag(app.db(), lotus.id, busy.id)
        .await
        .unwrap();
    tags::assign_deck_card_tag(app.db(), walk.id, busy.id)
        .await
        .unwrap();
    let listed = tags::list_deck_tags(app.db(), deck.id).await.unwrap();
    assert_eq!(
        listed.iter().find(|t| t.id == busy.id).unwrap().card_count,
        4
    );
    assert_eq!(
        listed.iter().find(|t| t.id == empty.id).unwrap().card_count,
        0
    );
}

async fn tag_ids(app: &TestApp, card: crate::decks::model::DeckCardId) -> Vec<i64> {
    let mut ids = tags::tag_ids_by_deck_card(app.db(), &[card])
        .await
        .unwrap()
        .remove(&card)
        .unwrap_or_default();
    ids.sort_unstable();
    ids
}

#[tokio::test]
async fn assignments_are_idempotent_guarded_and_cascade_on_delete() {
    let app = tag_app().await;
    let deck = create_deck(&app, "Powered", Some("vintage"), None).await;
    let card = add_card(&app, deck.id, "Black Lotus", 1, "mainboard").await;
    let t1 = tags::create_deck_tag(app.db(), deck.id, &tag("T1", Some("#ff0000")))
        .await
        .unwrap();
    let t2 = tags::create_deck_tag(app.db(), deck.id, &tag("T2", Some("#00ff00")))
        .await
        .unwrap();
    tags::assign_deck_card_tag(app.db(), card.id, t1.id)
        .await
        .unwrap();
    tags::assign_deck_card_tag(app.db(), card.id, t1.id)
        .await
        .unwrap();
    assert_eq!(tag_ids(&app, card.id).await, vec![t1.id]);
    tags::assign_deck_card_tag(app.db(), card.id, t2.id)
        .await
        .unwrap();
    assert_eq!(tag_ids(&app, card.id).await, vec![t1.id, t2.id]);
    tags::unassign_deck_card_tag(app.db(), card.id, t1.id)
        .await
        .unwrap();
    tags::unassign_deck_card_tag(app.db(), card.id, t1.id)
        .await
        .unwrap();
    assert_eq!(tag_ids(&app, card.id).await, vec![t2.id]);

    let other = create_deck(&app, "Deck B", Some("vintage"), None).await;
    let foreign = tags::create_deck_tag(app.db(), other.id, &tag("TagB", Some("#ff0000")))
        .await
        .unwrap();
    assert!(matches!(
        tags::assign_deck_card_tag(app.db(), card.id, foreign.id).await,
        Err(DeckError::Code("deck_mismatch"))
    ));
    assert!(matches!(
        tags::assign_deck_card_tag(app.db(), crate::decks::model::DeckCardId(-1), t1.id).await,
        Err(DeckError::NotFound)
    ));
    assert!(matches!(
        tags::assign_deck_card_tag(app.db(), card.id, -1).await,
        Err(DeckError::NotFound)
    ));

    tags::delete_deck_tag(app.db(), t2.id).await.unwrap();
    assert!(
        tags::list_deck_tags(app.db(), deck.id)
            .await
            .unwrap()
            .iter()
            .all(|t| t.id != t2.id)
    );
    assert_eq!(tag_ids(&app, card.id).await.len(), 0);
}

#[tokio::test]
async fn reorder_follows_the_given_order_and_ignores_other_decks() {
    let app = tag_app().await;
    let deck_a = create_deck(&app, "Deck A", Some("vintage"), None).await;
    let deck_b = create_deck(&app, "Deck B", Some("vintage"), None).await;
    let t1 = tags::create_deck_tag(app.db(), deck_a.id, &tag("T1", Some("#111111")))
        .await
        .unwrap();
    let t2 = tags::create_deck_tag(app.db(), deck_a.id, &tag("T2", Some("#222222")))
        .await
        .unwrap();
    let t3 = tags::create_deck_tag(app.db(), deck_a.id, &tag("T3", Some("#333333")))
        .await
        .unwrap();
    let tb = tags::create_deck_tag(app.db(), deck_b.id, &tag("TB", Some("#444444")))
        .await
        .unwrap();
    let ordered = tags::reorder_deck_tags(app.db(), deck_a.id, &[t3.id, tb.id, t1.id, t2.id])
        .await
        .unwrap();
    assert_eq!(
        ordered.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
        vec!["T3", "T1", "T2"]
    );
    let b = tags::list_deck_tags(app.db(), deck_b.id).await.unwrap();
    assert_eq!(b[0].position, tb.position);
}

#[tokio::test]
async fn new_decks_copy_the_default_tags() {
    let app = tag_app().await;
    tags::replace_default_deck_tags(
        app.db(),
        &[
            DefaultTagEntry {
                name: "Ramp".into(),
                color: "#22c55e".into(),
                target_count: None,
            },
            DefaultTagEntry {
                name: "Draw".into(),
                color: "#3b82f6".into(),
                target_count: Some(10),
            },
        ],
    )
    .await
    .unwrap();
    let deck = create_deck(&app, "Powered", Some("vintage"), None).await;
    let listed: Vec<(String, String, i64, Option<i64>)> = tags::list_deck_tags(app.db(), deck.id)
        .await
        .unwrap()
        .into_iter()
        .map(|t| (t.name, t.color, t.position, t.target_count))
        .collect();
    assert_eq!(
        listed,
        vec![
            ("Ramp".into(), "#22c55e".into(), 0, None),
            ("Draw".into(), "#3b82f6".into(), 1, Some(10))
        ]
    );

    clear_default_tags(&app).await;
    let deck = create_deck(&app, "Bare", Some("vintage"), None).await;
    assert_eq!(
        tags::list_deck_tags(app.db(), deck.id).await.unwrap().len(),
        0
    );
    assert_eq!(
        tags::list_default_deck_tags(app.db()).await.unwrap().len(),
        0
    );
}

#[tokio::test]
async fn fresh_databases_have_the_migration_default_tags() {
    let app = TestApp::new().await;
    let defaults: Vec<String> = tags::list_default_deck_tags(app.db())
        .await
        .unwrap()
        .into_iter()
        .map(|t| t.name)
        .collect();
    assert_eq!(defaults, vec!["Ramp", "Draw", "Interact", "Plan"]);
}
