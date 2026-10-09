//! Deck CRUD and deck legality.

use lotus::{Finish, Zone};
use serde_json::json;

use crate::decks::DeckError;
use crate::decks::cards::{self, DeckCardChanges};
use crate::decks::model::{DeckCardTag, DeckId};
use crate::decks::records::{self, DeckChanges};
use crate::test_app::TestApp;
use crate::testing::*;
use manavault_catalog::testing::fixtures::{
    black_lotus, black_lotus_beta, legal_commander_card, merge, time_walk,
};

#[tokio::test]
async fn deck_crud_stores_card_identities_with_optional_preferred_printings() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let deck = create_deck(app.db(), "Powered", Some("vintage"), Some("brewing")).await;

    let lotus = add_printing(app.db(), deck.id, "Black Lotus", 1, "scryfall-printing-1").await;
    assert_eq!(lotus.oracle_id.as_str(), "oracle-1");
    assert_eq!(
        lotus
            .preferred_printing_id
            .as_ref()
            .map(lotus::ScryfallId::as_str),
        Some("scryfall-printing-1")
    );

    let updated =
        cards::add_card_to_deck(app.db(), deck.id, &by_oracle("oracle-1", 2, "mainboard"))
            .await
            .unwrap();
    assert_eq!(updated.id, lotus.id);
    assert_eq!(updated.quantity.get(), 3);
    assert_eq!(
        updated
            .preferred_printing_id
            .as_ref()
            .map(lotus::ScryfallId::as_str),
        Some("scryfall-printing-1"),
        "adding copies without a printing keeps the preferred printing"
    );

    let commander =
        cards::add_card_to_deck(app.db(), deck.id, &by_oracle("oracle-2", 1, "commander"))
            .await
            .unwrap();
    assert_eq!(
        card_names(app.db(), deck.id).await,
        vec!["Time Walk", "Black Lotus"]
    );

    let stats = contents(app.db(), deck.id).await.stats();
    assert_eq!(stats.total, 4);
    assert_eq!(stats.zones.get("commander"), Some(&1));
    assert_eq!(stats.zones.get("mainboard"), Some(&3));
    assert_eq!(stats.types.get("Artifact"), Some(&3));
    assert_eq!(stats.types.get("Sorcery"), Some(&1));

    let moved = cards::update_deck_card(
        app.db(),
        commander.id,
        &DeckCardChanges {
            zone: Some(Some("considering".into())),
            quantity: Some(Some(2)),
            ..DeckCardChanges::default()
        },
    )
    .await
    .unwrap();
    assert_eq!((moved.zone, moved.quantity.get()), (Zone::Considering, 2));

    let tagged = cards::update_tags(app.db(), &[commander.id], Some("getting".into()))
        .await
        .unwrap();
    assert_eq!(tagged[0].tag, Some(DeckCardTag::Getting));
    assert_eq!(
        deck_card(app.db(), commander.id).await.unwrap().tag,
        Some(DeckCardTag::Getting)
    );
    let cleared = cards::update_tags(app.db(), &[commander.id], None)
        .await
        .unwrap();
    assert_eq!(cleared[0].tag, None);
    let error = cards::update_tags(app.db(), &[commander.id], Some("maybe".into()))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "tag is invalid");

    cards::delete_deck_card(app.db(), updated.id).await.unwrap();
    let renamed = update_deck(
        app.db(),
        deck.id,
        DeckChanges {
            name: Some(Some("Powered Updated".into())),
            ..DeckChanges::default()
        },
    )
    .await;
    assert_eq!(renamed.name, "Powered Updated");
    records::delete_deck(app.db(), deck.id).await.unwrap();
    assert_eq!(records::count_decks(app.db()).await.unwrap(), 0);
}

#[tokio::test]
async fn type_statistics_count_the_permanent_rather_than_its_secondary_spell() {
    let app = TestApp::new().await;
    app.import_cards(&[
        merge(
            black_lotus(),
            json!({"name": "My Precious // Allure of Power",
                   "type_line": "Legendary Artifact — Equipment // Instant — Adventure"}),
        ),
        merge(
            time_walk(),
            json!({"name": "Emeritus of Woe // Demonic Tutor",
                   "type_line": "Creature — Vampire Warlock // Sorcery"}),
        ),
    ])
    .await;
    let deck = create_deck(app.db(), "Multi-face types", None, None).await;
    cards::add_card_to_deck(app.db(), deck.id, &by_oracle("oracle-1", 2, "mainboard"))
        .await
        .unwrap();
    cards::add_card_to_deck(app.db(), deck.id, &by_oracle("oracle-2", 1, "mainboard"))
        .await
        .unwrap();
    let types = contents(app.db(), deck.id).await.stats().types;
    assert_eq!(
        types.into_iter().collect::<Vec<_>>(),
        vec![("Artifact", 2), ("Creature", 1)]
    );
}

#[tokio::test]
async fn add_card_resolves_names_with_or_without_diacritics() {
    let app = TestApp::new().await;
    app.import_cards(&[merge(
        time_walk(),
        json!({"id": "scryfall-oin-the-brave", "oracle_id": "oracle-oin-the-brave",
               "name": "Óin the Brave", "collector_number": "12"}),
    )])
    .await;
    let deck = create_deck(app.db(), "Diacritic Add", None, None).await;
    let first = add_card(app.db(), deck.id, "Óin the Brave", 1, "mainboard").await;
    let second = add_card(app.db(), deck.id, "Oin the brave", 1, "mainboard").await;
    assert_eq!(first.id, second.id);
    assert_eq!(second.quantity.get(), 2);
    assert_eq!(second.oracle_id.as_str(), "oracle-oin-the-brave");
}

#[tokio::test]
async fn summaries_return_counts_cover_and_commander_colors() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let deck = create_deck(app.db(), "Summary Test", None, None).await;
    add_card(app.db(), deck.id, "Black Lotus", 2, "mainboard").await;
    add_card(app.db(), deck.id, "Time Walk", 1, "commander").await;
    let summary = crate::decks::deck_summaries(app.db(), &[deck.id])
        .await
        .unwrap()
        .remove(&deck.id)
        .unwrap();
    assert_eq!(summary.card_count, 3);
    assert_eq!(summary.unique_card_count, 2);
    assert_eq!(summary.commander_color_identity, Some(vec!["U".to_owned()]));
    assert_eq!(
        summary.cover_image_url.as_deref(),
        Some("https://example.test/black-lotus.jpg")
    );
}

#[tokio::test]
async fn cover_defaults_to_the_commander_and_can_be_any_card_in_the_deck() {
    let app = TestApp::new().await;
    app.import_cards(&[
        black_lotus(),
        merge(
            time_walk(),
            json!({"image_uris": {"normal": "https://example.test/commander.jpg"}}),
        ),
    ])
    .await;
    let deck = create_deck(app.db(), "Cover Test", None, None).await;
    add_card(app.db(), deck.id, "Time Walk", 1, "commander").await;
    let lotus = add_card(app.db(), deck.id, "Black Lotus", 1, "mainboard").await;
    let cover = |app: &TestApp, deck: DeckId| {
        let pool = app.db().clone();
        async move {
            let row = records::get_deck(&pool, deck).await.unwrap();
            crate::decks::deck_summaries(&pool, &[deck])
                .await
                .unwrap()
                .remove(&row.id)
                .unwrap()
                .cover_image_url
        }
    };
    assert_eq!(
        cover(&app, deck.id).await.as_deref(),
        Some("https://example.test/commander.jpg")
    );

    let updated = update_deck(
        app.db(),
        deck.id,
        DeckChanges {
            cover_deck_card_id: Some(Some(lotus.id)),
            ..DeckChanges::default()
        },
    )
    .await;
    assert_eq!(updated.cover_deck_card_id, Some(lotus.id));
    assert_eq!(
        cover(&app, deck.id).await.as_deref(),
        Some("https://example.test/black-lotus.jpg")
    );

    let other = create_deck(app.db(), "Other Deck", None, None).await;
    let other_card = add_card(app.db(), other.id, "Black Lotus", 1, "mainboard").await;
    let error = records::update_deck(
        app.db(),
        deck.id,
        &DeckChanges {
            cover_deck_card_id: Some(Some(other_card.id)),
            ..DeckChanges::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "cover deck card id must belong to deck");

    cards::delete_deck_card(app.db(), lotus.id).await.unwrap();
    assert_eq!(
        records::get_deck(app.db(), deck.id)
            .await
            .unwrap()
            .cover_deck_card_id,
        None
    );
    assert_eq!(
        cover(&app, deck.id).await.as_deref(),
        Some("https://example.test/commander.jpg")
    );
}

#[tokio::test]
async fn commander_color_identity_includes_the_inferred_chosen_color() {
    let app = TestApp::new().await;
    app.import_cards(&[
        legality_commander_card("Test Doctor", &["U", "R"], json!({"type_line": "Legendary Creature — Time Lord Doctor"})),
        legality_commander_card("Test Companion", &[], json!({"oracle_text": "If Test Companion is your commander, choose a color before the game begins. Test Companion is the chosen color.\nDoctor's companion (You can have two commanders if the other is the Doctor.)"})),
        legality_card("Green Spell", &["G"], json!({"commander": "legal"}), json!({})),
    ])
    .await;
    let deck = create_deck(app.db(), "Chosen Color", Some("commander"), None).await;
    add_card(app.db(), deck.id, "Test Doctor", 1, "commander").await;
    add_card(app.db(), deck.id, "Test Companion", 1, "commander").await;
    add_card(app.db(), deck.id, "Green Spell", 1, "mainboard").await;
    let summary = crate::decks::deck_summaries(app.db(), &[deck.id])
        .await
        .unwrap();
    assert_eq!(
        summary[&deck.id].commander_color_identity,
        Some(vec!["U".to_owned(), "R".to_owned(), "G".to_owned()])
    );
}

async fn partner_deck(app: &TestApp, name: &str) -> DeckId {
    create_deck(app.db(), name, Some("commander"), None)
        .await
        .id
}

#[tokio::test]
async fn add_deck_partner_promotes_companions_and_backgrounds() {
    let app = TestApp::new().await;
    app.import_cards(&[
        legality_commander_card("Test Doctor", &["U", "R"], json!({"type_line": "Legendary Creature — Time Lord Doctor"})),
        legality_commander_card("Test Companion", &[], json!({"oracle_text": "Doctor's companion (You can have two commanders if the other is the Doctor.)"})),
        legality_commander_card("Background Chooser", &["W"], json!({"oracle_text": "Choose a Background (You can have a Background as a second commander.)"})),
        legality_card("Test Background", &["G"], json!({"commander": "legal"}), json!({"type_line": "Legendary Enchantment — Background"})),
    ])
    .await;
    let deck = partner_deck(&app, "Partner Test").await;
    add_card(app.db(), deck, "Test Doctor", 1, "commander").await;
    let companion = add_card(app.db(), deck, "Test Companion", 1, "mainboard").await;
    let moved = cards::add_partner(app.db(), companion.id).await.unwrap();
    assert_eq!(moved.zone, Zone::Commander);
    let mut commanders: Vec<String> = contents(app.db(), deck)
        .await
        .cards
        .iter()
        .filter(|card| card.row.zone == Zone::Commander)
        .map(|card| card.card.name.clone())
        .collect();
    commanders.sort();
    assert_eq!(commanders, vec!["Test Companion", "Test Doctor"]);

    let deck = partner_deck(&app, "Background Test").await;
    add_card(app.db(), deck, "Background Chooser", 1, "commander").await;
    let background = add_card(app.db(), deck, "Test Background", 1, "mainboard").await;
    assert_eq!(
        cards::add_partner(app.db(), background.id)
            .await
            .unwrap()
            .zone,
        Zone::Commander
    );
}

#[tokio::test]
async fn add_deck_partner_rejects_unpaired_cards_and_needs_exactly_one_commander() {
    let app = TestApp::new().await;
    app.import_cards(&[
        legality_commander_card("Solo Commander", &["W"], json!({})),
        legality_commander_card("Unpaired Legend", &["G"], json!({})),
        legality_commander_card("Partner One", &["W"], json!({"oracle_text": "Partner"})),
        legality_commander_card("Partner Two", &["U"], json!({"oracle_text": "Partner"})),
        legality_commander_card("Partner Three", &["G"], json!({"oracle_text": "Partner"})),
    ])
    .await;
    let deck = partner_deck(&app, "No Pair").await;
    add_card(app.db(), deck, "Solo Commander", 1, "commander").await;
    let legend = add_card(app.db(), deck, "Unpaired Legend", 1, "mainboard").await;
    let error = cards::add_partner(app.db(), legend.id).await.unwrap_err();
    assert!(matches!(error, DeckError::Code("invalid_commander_pair")));
    assert_eq!(
        deck_card(app.db(), legend.id).await.unwrap().zone,
        Zone::Mainboard
    );

    let deck = partner_deck(&app, "Full Zone").await;
    let candidate = add_card(app.db(), deck, "Partner Three", 1, "mainboard").await;
    assert!(matches!(
        cards::add_partner(app.db(), candidate.id)
            .await
            .unwrap_err(),
        DeckError::Code("no_commander")
    ));
    add_card(app.db(), deck, "Partner One", 1, "commander").await;
    assert_eq!(
        cards::add_partner(app.db(), candidate.id)
            .await
            .unwrap()
            .zone,
        Zone::Commander
    );
    let third = add_card(app.db(), deck, "Partner Two", 1, "mainboard").await;
    assert!(matches!(
        cards::add_partner(app.db(), third.id).await.unwrap_err(),
        DeckError::Code("command_zone_full")
    ));
    assert!(matches!(
        cards::add_partner(app.db(), candidate.id)
            .await
            .unwrap_err(),
        DeckError::Code("already_commander")
    ));
}

#[tokio::test]
async fn archived_decks_reject_decklist_edits_until_unarchived() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let deck = create_deck(app.db(), "Archived Edit Guard", None, None).await;
    let lotus = add_card(app.db(), deck.id, "Black Lotus", 1, "mainboard").await;
    set_status(app.db(), deck.id, "archived").await;

    let quantity_two = DeckCardChanges {
        quantity: Some(Some(2)),
        ..DeckCardChanges::default()
    };
    assert!(matches!(
        cards::add_card_to_deck(app.db(), deck.id, &by_name("Time Walk", 1, "mainboard")).await,
        Err(DeckError::DeckArchived)
    ));
    assert!(matches!(
        crate::decks::decklist::import_decklist(app.db(), deck.id, "1 Time Walk", false, None)
            .await,
        Err(DeckError::DeckArchived)
    ));
    assert!(matches!(
        cards::update_deck_card(app.db(), lotus.id, &quantity_two).await,
        Err(DeckError::DeckArchived)
    ));
    assert!(matches!(
        cards::delete_deck_card(app.db(), lotus.id).await,
        Err(DeckError::DeckArchived)
    ));

    set_status(app.db(), deck.id, "active").await;
    assert_eq!(
        cards::update_deck_card(app.db(), lotus.id, &quantity_two)
            .await
            .unwrap()
            .quantity
            .get(),
        2
    );
    add_card(app.db(), deck.id, "Time Walk", 1, "mainboard").await;
}

#[tokio::test]
async fn stats_total_excludes_considering_cards() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let deck = create_deck(app.db(), "Count Test", None, None).await;
    add_card(app.db(), deck.id, "Black Lotus", 2, "mainboard").await;
    add_card(app.db(), deck.id, "Time Walk", 1, "commander").await;
    add_card(app.db(), deck.id, "Black Lotus", 4, "considering").await;
    add_card(app.db(), deck.id, "Time Walk", 8, "considering").await;
    let stats = contents(app.db(), deck.id).await.stats();
    assert_eq!(stats.total, 3);
    assert_eq!(
        stats.zones.into_iter().collect::<Vec<_>>(),
        vec![("commander", 1), ("considering", 12), ("mainboard", 2)]
    );
}

#[tokio::test]
async fn reducing_a_quantity_releases_copies_that_no_longer_fit() {
    // Earlier releases left these reserved (fixed here).
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let binder = location(app.db(), "Binder", "binder").await;
    let item = collection_item(
        app.db(),
        "scryfall-printing-1",
        3,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let deck = create_deck(app.db(), "Trim", None, None).await;
    let lotus = add_card(app.db(), deck.id, "Black Lotus", 3, "mainboard").await;
    allocate(app.db(), lotus.id, item, 3).await;
    assert_eq!(location_quantity(app.db(), binder).await, 0);
    cards::update_deck_card(
        app.db(),
        lotus.id,
        &DeckCardChanges {
            quantity: Some(Some(1)),
            ..DeckCardChanges::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(allocated_quantity(app.db(), lotus.id).await, 1);
    assert_eq!(location_quantity(app.db(), binder).await, 2);
}

#[tokio::test]
async fn changing_the_printing_reallocates_owned_copies_of_the_new_printing() {
    let app = TestApp::new().await;
    app.import_cards(&[
        black_lotus(),
        manavault_catalog::testing::fixtures::black_lotus_beta(),
    ])
    .await;
    let binder = location(app.db(), "Binder", "binder").await;
    let alpha = collection_item(
        app.db(),
        "scryfall-printing-1",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let beta = collection_item(
        app.db(),
        "scryfall-printing-3",
        2,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let deck = create_deck(app.db(), "Switch", None, None).await;
    let lotus = add_card(app.db(), deck.id, "Black Lotus", 1, "mainboard").await;
    allocate(app.db(), lotus.id, alpha, 1).await;
    cards::update_deck_card(
        app.db(),
        lotus.id,
        &DeckCardChanges {
            preferred_printing_id: Some(Some(lotus::ScryfallId::new("scryfall-printing-3"))),
            ..DeckCardChanges::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(item_location(app.db(), alpha).await, Some(binder.0));
    let allocations = all_allocations(app.db()).await;
    assert_eq!(allocations.len(), 1);
    let (card, held_by, quantity) = allocations[0];
    assert_eq!((card, quantity), (lotus.id.0, 1));
    let held: String = sqlx::query_scalar!(
        "SELECT scryfall_id FROM collection_items WHERE id = ?1",
        held_by
    )
    .fetch_one(app.db())
    .await
    .unwrap();
    assert_eq!(held, "scryfall-printing-3");
    assert_eq!(
        location_quantity(app.db(), binder).await,
        2,
        "one beta stays, the alpha returns"
    );
    let _ = beta;
}

#[tokio::test]
async fn moving_to_considering_releases_copies_and_proxies() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let binder = location(app.db(), "Binder", "binder").await;
    let item = collection_item(
        app.db(),
        "scryfall-printing-1",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let deck = create_deck(app.db(), "Considering", None, None).await;
    let lotus = add_card(app.db(), deck.id, "Black Lotus", 2, "mainboard").await;
    allocate(app.db(), lotus.id, item, 1).await;
    sqlx::query!(
        "UPDATE deck_cards SET proxy_quantity = 1 WHERE id = ?1",
        lotus.id
    )
    .execute(app.db())
    .await
    .unwrap();
    let moved = cards::update_deck_card(
        app.db(),
        lotus.id,
        &DeckCardChanges {
            zone: Some(Some("considering".into())),
            ..DeckCardChanges::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(moved.proxy_quantity, 0);
    assert_eq!(allocated_quantity(app.db(), lotus.id).await, 0);
    assert_eq!(item_location(app.db(), item).await, Some(binder.0));
}

#[tokio::test]
async fn lowering_the_quantity_while_switching_the_printing_trims_proxies() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), black_lotus_beta()]).await;
    let binder = location(app.db(), "Binder", "binder").await;
    let alpha = collection_item(
        app.db(),
        "scryfall-printing-1",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let deck = create_deck(app.db(), "Switch And Trim", None, None).await;
    let lotus = add_printing(app.db(), deck.id, "Black Lotus", 3, "scryfall-printing-1").await;
    allocate(app.db(), lotus.id, alpha, 1).await;
    sqlx::query("UPDATE deck_cards SET proxy_quantity = 2 WHERE id = ?1")
        .bind(lotus.id)
        .execute(app.db())
        .await
        .unwrap();

    // One edit lowers the quantity below the proxy count and switches the
    // printing; the proxies must shrink to fit like a plain quantity drop.
    let updated = cards::update_deck_card(
        app.db(),
        lotus.id,
        &DeckCardChanges {
            quantity: Some(Some(1)),
            preferred_printing_id: Some(Some("scryfall-printing-3".into())),
            ..DeckCardChanges::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(updated.quantity.get(), 1);
    assert_eq!(allocated_quantity(app.db(), lotus.id).await, 0);
    assert_eq!(item_location(app.db(), alpha).await, Some(binder.0));
    assert_eq!(
        updated.proxy_quantity, 0,
        "proxies ({}) exceed the deck card's quantity (1)",
        updated.proxy_quantity
    );
}

// --- deck legality ---

async fn commander_deck(app: &TestApp, name: &str) -> DeckId {
    create_deck(app.db(), name, Some("commander"), None)
        .await
        .id
}

#[tokio::test]
async fn legal_commander_deck_with_repeated_basic_lands() {
    let app = TestApp::new().await;
    app.import_cards(&[legal_commander_card(), legal_plains()])
        .await;
    let deck = commander_deck(&app, "Legal Commander").await;
    add_card(app.db(), deck, "Test Commander", 1, "commander").await;
    add_card(app.db(), deck, "Plains", 99, "mainboard").await;
    let legality = legality(app.db(), deck).await;
    assert_eq!(legality.status, "legal");
    assert_eq!(legality.issues.len(), 0);
}

#[tokio::test]
async fn legality_uses_the_given_card_data() {
    let app = TestApp::new().await;
    app.import_cards(&[legal_commander_card(), legal_plains()])
        .await;
    let deck = commander_deck(&app, "Preloaded Commander").await;
    add_card(app.db(), deck, "Test Commander", 1, "commander").await;
    add_card(app.db(), deck, "Plains", 99, "mainboard").await;
    let mut loaded = (*contents(app.db(), deck).await).clone();
    for card in &mut loaded.cards {
        if card.card.name == "Plains" {
            let mut record = (*card.card).clone();
            record.legalities = r#"{"commander": "banned"}"#.into();
            card.card = std::sync::Arc::new(record);
        }
    }
    let legality = loaded.legality(crate::decks::model::DeckFormat::Commander);
    assert_eq!(legality.status, "illegal");
    assert_eq!(
        issue(&legality, "card_legality").card_name.as_deref(),
        Some("Plains")
    );
}

#[tokio::test]
async fn duplicate_banned_and_off_color_cards_are_illegal() {
    let app = TestApp::new().await;
    app.import_cards(&[
        legal_commander_card(),
        legal_plains(),
        legality_card(
            "Silver Bolt",
            &["W"],
            json!({"commander": "legal"}),
            json!({}),
        ),
        legality_card(
            "Banned Spell",
            &[],
            json!({"commander": "banned"}),
            json!({}),
        ),
        legality_card(
            "Blue Spell",
            &["U"],
            json!({"commander": "legal"}),
            json!({}),
        ),
    ])
    .await;

    let deck = commander_deck(&app, "Duplicate Commander").await;
    add_card(app.db(), deck, "Test Commander", 1, "commander").await;
    add_card(app.db(), deck, "Plains", 97, "mainboard").await;
    add_card(app.db(), deck, "Silver Bolt", 2, "mainboard").await;
    let result = legality(app.db(), deck).await;
    assert_eq!(codes(&result), vec!["commander_singleton"]);
    let singleton = issue(&result, "commander_singleton");
    assert_eq!(singleton.card_name.as_deref(), Some("Silver Bolt"));
    assert!(singleton.message.contains("Silver Bolt appears 2 times"));

    let deck = commander_deck(&app, "Banned Commander").await;
    add_card(app.db(), deck, "Test Commander", 1, "commander").await;
    add_card(app.db(), deck, "Plains", 98, "mainboard").await;
    add_card(app.db(), deck, "Banned Spell", 1, "mainboard").await;
    let result = legality(app.db(), deck).await;
    assert_eq!(codes(&result), vec!["card_legality"]);
    assert_eq!(
        issue(&result, "card_legality").message,
        "Banned Spell is not legal in commander (status: banned)."
    );

    let deck = commander_deck(&app, "Off Color Commander").await;
    add_card(app.db(), deck, "Test Commander", 1, "commander").await;
    add_card(app.db(), deck, "Plains", 98, "mainboard").await;
    add_card(app.db(), deck, "Blue Spell", 1, "mainboard").await;
    let result = legality(app.db(), deck).await;
    assert_eq!(codes(&result), vec!["commander_color_identity"]);
    let off_color = issue(&result, "commander_color_identity");
    assert_eq!(off_color.card_name.as_deref(), Some("Blue Spell"));
    assert_eq!(
        off_color.message,
        "Blue Spell color identity U is outside commander color identity W."
    );
}

#[tokio::test]
async fn legality_reports_size_count_and_missing_legalities_outside_commander() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let deck = create_deck(app.db(), "Vintage", Some("vintage"), None).await;
    add_card(app.db(), deck.id, "Black Lotus", 1, "mainboard").await;
    add_card(app.db(), deck.id, "Time Walk", 1, "considering").await;
    let result = legality(app.db(), deck.id).await;
    assert_eq!(
        result
            .issues
            .iter()
            .map(|issue| issue.message.as_str())
            .collect::<Vec<_>>(),
        vec!["Black Lotus is not legal in vintage (status: restricted)."],
        "considering cards and commander-only rules are ignored"
    );

    let deck = create_deck(app.db(), "Empty Commander", Some("commander"), None).await;
    let result = legality(app.db(), deck.id).await;
    assert_eq!(
        result
            .issues
            .iter()
            .map(|issue| issue.message.as_str())
            .collect::<Vec<_>>(),
        vec![
            "Commander decks must contain exactly 100 counted cards; this deck has 0.",
            "Commander decks must have exactly one commander, or two with a pairing ability such as Partner; this deck has 0."
        ]
    );
}

fn partner(name: &str, colors: &[&str]) -> serde_json::Value {
    legality_commander_card(
        name,
        colors,
        json!({"oracle_text": "Partner (You can have two commanders if both have partner.)"}),
    )
}

fn restricted(name: &str, label: &str) -> serde_json::Value {
    legality_commander_card(
        name,
        &["W"],
        json!({"oracle_text": format!("Partner—{label} (You can have two commanders if both have a {label} partner ability.)")}),
    )
}

async fn pair_legality(
    app: &TestApp,
    name: &str,
    a: &str,
    b: &str,
) -> crate::decks::legality::DeckLegality {
    let deck = commander_deck(app, name).await;
    add_card(app.db(), deck, a, 1, "commander").await;
    add_card(app.db(), deck, b, 1, "commander").await;
    add_card(app.db(), deck, "Plains", 98, "mainboard").await;
    legality(app.db(), deck).await
}

#[tokio::test]
async fn two_commanders_need_matching_pairing_abilities() {
    let app = TestApp::new().await;
    let friends = json!({"oracle_text": "Friends forever (You can have two commanders if both have friends forever.)"});
    app.import_cards(&[
        partner("Partner One", &["W"]),
        partner("Partner Two", &["U"]),
        legality_commander_card("Lone General", &["W"], json!({})),
        legality_commander_card("Other General", &["W"], json!({})),
        restricted("Survivor Leader", "Survivors"),
        restricted("Vault Dweller", "Vault 13"),
        restricted("Survivor Scout", "Survivors"),
        legality_commander_card("Named Ally", &["W"], json!({"oracle_text": "Partner with Named Friend (When this creature enters, target player may put Named Friend into their hand from their library, then shuffle.)"})),
        legality_commander_card("Named Friend", &["U"], json!({"oracle_text": "Partner with Named Ally (When this creature enters, target player may put Named Ally into their hand from their library, then shuffle.)"})),
        legality_commander_card("Named Stranger", &["U"], json!({})),
        legality_commander_card("Best Friend", &["W"], friends.clone()),
        legality_commander_card("Forever Friend", &["U"], friends),
        legality_commander_card("Background Chooser", &["W"], json!({"oracle_text": "Choose a Background (You can have a Background as a second commander.)"})),
        legality_card("Storied Past", &["U"], json!({"commander": "legal"}), json!({"type_line": "Legendary Enchantment — Background"})),
        legal_plains(),
    ])
    .await;
    for (a, b) in [
        ("Partner One", "Partner Two"),
        ("Survivor Leader", "Survivor Scout"),
        ("Named Ally", "Named Friend"),
        ("Best Friend", "Forever Friend"),
        ("Background Chooser", "Storied Past"),
    ] {
        let result = pair_legality(&app, &format!("{a} deck"), a, b).await;
        assert_eq!(result.status, "legal", "{a} + {b}: {:?}", result.issues);
    }
    for (a, b) in [
        ("Lone General", "Other General"),
        ("Survivor Leader", "Vault Dweller"),
        ("Named Ally", "Named Stranger"),
    ] {
        let result = pair_legality(&app, &format!("{a} bad deck"), a, b).await;
        assert_eq!(codes(&result), vec!["commander_count"], "{a} + {b}");
        assert!(
            issue(&result, "commander_count")
                .message
                .contains("can't be paired")
        );
    }
}

fn doctor_cards() -> Vec<serde_json::Value> {
    vec![
        legality_commander_card(
            "Test Doctor",
            &["U", "R"],
            json!({"type_line": "Legendary Creature — Time Lord Doctor"}),
        ),
        legality_commander_card(
            "Test Companion",
            &[],
            json!({"oracle_text": "If Test Companion is your commander, choose a color before the game begins. Test Companion is the chosen color.\nDoctor's companion (You can have two commanders if the other is the Doctor.)"}),
        ),
        legality_card(
            "Test Island",
            &["U"],
            json!({"commander": "legal"}),
            json!({"type_line": "Basic Land — Island"}),
        ),
        legality_card(
            "Green Spell",
            &["G"],
            json!({"commander": "legal"}),
            json!({}),
        ),
        legality_card(
            "White Spell",
            &["W"],
            json!({"commander": "legal"}),
            json!({}),
        ),
        legality_card(
            "Two Color Spell",
            &["G", "W"],
            json!({"commander": "legal"}),
            json!({}),
        ),
    ]
}

#[tokio::test]
async fn chosen_colors_extend_the_commander_identity_by_one_per_chooser() {
    let app = TestApp::new().await;
    app.import_cards(&doctor_cards()).await;

    let deck = commander_deck(&app, "Doctor Deck").await;
    add_card(app.db(), deck, "Test Doctor", 1, "commander").await;
    add_card(app.db(), deck, "Test Companion", 1, "commander").await;
    add_card(app.db(), deck, "Test Island", 97, "mainboard").await;
    add_card(app.db(), deck, "Green Spell", 1, "mainboard").await;
    assert_eq!(legality(app.db(), deck).await.status, "legal");

    let deck = commander_deck(&app, "Doctor Two Color Deck").await;
    add_card(app.db(), deck, "Test Doctor", 1, "commander").await;
    add_card(app.db(), deck, "Test Companion", 1, "commander").await;
    add_card(app.db(), deck, "Test Island", 97, "mainboard").await;
    add_card(app.db(), deck, "Two Color Spell", 1, "mainboard").await;
    let result = legality(app.db(), deck).await;
    assert_eq!(codes(&result), vec!["commander_color_identity"]);
    let two_color = issue(&result, "commander_color_identity");
    assert_eq!(two_color.card_name.as_deref(), Some("Two Color Spell"));
    assert!(two_color.message.contains("1 chosen color"));

    let deck = commander_deck(&app, "Doctor Combined Colors Deck").await;
    add_card(app.db(), deck, "Test Doctor", 1, "commander").await;
    add_card(app.db(), deck, "Test Companion", 1, "commander").await;
    add_card(app.db(), deck, "Test Island", 96, "mainboard").await;
    add_card(app.db(), deck, "Green Spell", 1, "mainboard").await;
    add_card(app.db(), deck, "White Spell", 1, "mainboard").await;
    let result = legality(app.db(), deck).await;
    assert_eq!(codes(&result), vec!["commander_color_identity"]);
    let combined = issue(&result, "commander_color_identity");
    assert_eq!(combined.card_name, None);
    assert!(combined.message.contains("use GW"));
    assert!(combined.message.contains("1 chosen color"));
}

#[tokio::test]
async fn snow_basics_are_exempt_from_singleton_and_allocation() {
    let app = TestApp::new().await;
    app.import_cards(&[
        legal_commander_card(),
        legality_card(
            "Snow-Covered Plains",
            &["W"],
            json!({"commander": "legal"}),
            json!({"type_line": "Basic Snow Land — Plains"}),
        ),
    ])
    .await;
    let deck = commander_deck(&app, "Snow").await;
    add_card(app.db(), deck, "Test Commander", 1, "commander").await;
    add_card(app.db(), deck, "Snow-Covered Plains", 99, "mainboard").await;
    assert_eq!(legality(app.db(), deck).await.status, "legal");
}
