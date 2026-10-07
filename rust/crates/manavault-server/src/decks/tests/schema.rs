//! GraphQL tests from `test/manavault_web/schema/`: `deck_cards_test.exs`,
//! `deck_mutations_test.exs`, `deck_queries_test.exs`,
//! `decks_pagination_test.exs`, `deck_detail_and_share_test.exs` (owner
//! schema), `deck_swap_test.exs`, `deck_picker_test.exs`,
//! `deck_allocation_batching_test.exs` (status values), and the deck parts
//! of `schema_domain_contract_test.exs`.

use lotus::Finish;
use serde_json::{Value, json};

use super::support::*;
use crate::decks::model::DeckCardId;
use crate::decks::records::{self, DeckChanges};
use crate::test_support::TestApp;
use crate::test_support::fixtures::{black_lotus, legal_commander_card};

async fn app_with(cards: &[Value]) -> TestApp {
    let app = TestApp::new().await;
    app.import_cards(cards).await;
    app
}

#[tokio::test]
async fn update_deck_card_moves_a_card_between_zones() {
    let app = app_with(&[simple_card(
        "scryfall-printing-1",
        "oracle-1",
        "Black Lotus",
        "Artifact",
        json!({"collector_number": "232", "set": "lea"}),
    )])
    .await;
    let deck = create_deck(&app, "Considering Test", None, None).await;
    let card = add_card(&app, deck.id, "Black Lotus", 1, "mainboard").await;
    let data = app
        .gql_data(
            "mutation MoveDeckCard($id: ID!, $input: DeckCardUpdateInput!) {
               updateDeckCard(id: $id, input: $input) { deckCard { id zone quantity card { name } } }
             }",
            json!({"id": card_gid(card.id), "input": {"zone": "considering"}}),
        )
        .await;
    assert_eq!(
        data["updateDeckCard"]["deckCard"],
        json!({"id": card_gid(card.id), "zone": "considering", "quantity": 1, "card": {"name": "Black Lotus"}})
    );
}

#[tokio::test]
async fn deck_card_tags_update_individually_and_in_bulk() {
    let app = app_with(&[
        simple_card(
            "scryfall-tag-card-1",
            "oracle-tag-card-1",
            "Tag One",
            "Artifact",
            json!({}),
        ),
        simple_card(
            "scryfall-tag-card-2",
            "oracle-tag-card-2",
            "Tag Two",
            "Creature",
            json!({"collector_number": "2"}),
        ),
    ])
    .await;
    let deck = create_deck(&app, "Tag Test", None, None).await;
    let first = add_card(&app, deck.id, "Tag One", 1, "mainboard").await;
    let second = add_card(&app, deck.id, "Tag Two", 1, "mainboard").await;
    let data = app
        .gql_data(
            "mutation UpdateTag($id: ID!, $input: DeckCardUpdateInput!) {
               updateDeckCard(id: $id, input: $input) { deckCard { id tag } }
             }",
            json!({"id": card_gid(first.id), "input": {"tag": "getting"}}),
        )
        .await;
    assert_eq!(data["updateDeckCard"]["deckCard"]["tag"], json!("getting"));
    let data = app
        .gql_data(
            "mutation BulkTag($deckCardIds: [ID!]!, $tag: String) {
               updateDeckCardsTag(deckCardIds: $deckCardIds, tag: $tag) { deckCards { id tag } }
             }",
            json!({"deckCardIds": [card_gid(first.id), card_gid(second.id)], "tag": "consider_cutting"}),
        )
        .await;
    assert_eq!(
        data["updateDeckCardsTag"]["deckCards"],
        json!([
            {"id": card_gid(first.id), "tag": "consider_cutting"},
            {"id": card_gid(second.id), "tag": "consider_cutting"}
        ])
    );
    let response = app
        .gql(
            "mutation BulkTag($deckCardIds: [ID!]!, $tag: String) {
               updateDeckCardsTag(deckCardIds: $deckCardIds, tag: $tag) { deckCards { id } }
             }",
            json!({"deckCardIds": [card_gid(first.id)], "tag": "maybe"}),
        )
        .await;
    assert_eq!(error_message(&response), "tag is invalid");
}

#[tokio::test]
async fn optimize_switches_selected_cards_to_the_cheapest_printing() {
    let app = app_with(&[
        simple_card(
            "scryfall-optimize-expensive",
            "oracle-optimize-lotus",
            "Optimize Lotus",
            "Artifact",
            json!({"set": "exp", "prices": {"usd": "9.00"}}),
        ),
        simple_card(
            "scryfall-optimize-cheap",
            "oracle-optimize-lotus",
            "Optimize Lotus",
            "Artifact",
            json!({"set": "chp", "collector_number": "2", "prices": {"usd": "1.25"}}),
        ),
        simple_card(
            "scryfall-optimize-other",
            "oracle-optimize-other",
            "Optimize Other",
            "Creature",
            json!({"set": "oth", "collector_number": "3", "prices": {"usd": "0.50"}}),
        ),
    ])
    .await;
    let deck = create_deck(&app, "Optimize Test", None, None).await;
    let selected = add_printing(
        &app,
        deck.id,
        "Optimize Lotus",
        1,
        "scryfall-optimize-expensive",
    )
    .await;
    let binder = location(&app, "Optimize Binder", "binder").await;
    let item = collection_item(
        &app,
        "scryfall-optimize-expensive",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    allocate(&app, selected.id, item, 1).await;
    let unselected = add_printing(
        &app,
        deck.id,
        "Optimize Other",
        1,
        "scryfall-optimize-other",
    )
    .await;

    let data = app
        .gql_data(
            "mutation OptimizeDeckCardPrintings($deckCardIds: [ID!]!) {
               optimizeDeckCardPrintings(deckCardIds: $deckCardIds) {
                 deckCards { id preferredPrinting { scryfallId setCode } }
               }
             }",
            json!({"deckCardIds": [card_gid(selected.id)]}),
        )
        .await;
    assert_eq!(
        data["optimizeDeckCardPrintings"]["deckCards"],
        json!([{"id": card_gid(selected.id), "preferredPrinting": {"scryfallId": "scryfall-optimize-cheap", "setCode": "chp"}}])
    );
    assert_eq!(
        deck_card(&app, unselected.id)
            .await
            .unwrap()
            .preferred_printing_id
            .unwrap()
            .as_str(),
        "scryfall-optimize-other"
    );
    assert_eq!(allocated_quantity(&app, selected.id).await, 0);
    assert_eq!(item_location(&app, item).await, Some(binder.0));
}

#[tokio::test]
async fn add_deck_card_adds_a_card_by_name() {
    let app = app_with(&[simple_card(
        "scryfall-add-deck-card",
        "oracle-add-deck-card",
        "Add Me",
        "Creature",
        json!({}),
    )])
    .await;
    let deck = create_deck(&app, "Add Test", None, None).await;
    let mutation = "mutation AddDeckCard($deckId: ID!, $input: DeckCardInput!) {
      addDeckCard(deckId: $deckId, input: $input) { deckCard { id quantity zone finish card { name } } }
    }";
    let data = app
        .gql_data(
            mutation,
            json!({"deckId": deck_gid(deck.id), "input": {"name": "Add Me", "quantity": 2, "zone": "considering", "finish": "nonfoil"}}),
        )
        .await;
    let card = &data["addDeckCard"]["deckCard"];
    assert_eq!(card["quantity"], json!(2));
    assert_eq!(card["zone"], json!("considering"));
    assert_eq!(card["finish"], json!("nonfoil"));
    assert_eq!(card["card"]["name"], json!("Add Me"));

    let response = app
        .gql(
            mutation,
            json!({"deckId": deck_gid(deck.id), "input": {"name": "No Such Card"}}),
        )
        .await;
    assert_eq!(error_message(&response), "Card was not found.");
    let response = app
        .gql(
            mutation,
            json!({"deckId": deck_gid(deck.id), "input": {"name": "Add Me", "quantity": 0}}),
        )
        .await;
    assert_eq!(error_message(&response), "quantity must be greater than 0");
}

#[tokio::test]
async fn delete_deck_card_returns_allocated_copies() {
    let app = app_with(&[simple_card(
        "scryfall-delete-deck-card",
        "oracle-delete-deck-card",
        "Delete Me",
        "Artifact",
        json!({}),
    )])
    .await;
    let deck = create_deck(&app, "Delete Test", None, None).await;
    let card = add_card(&app, deck.id, "Delete Me", 1, "mainboard").await;
    let binder = location(&app, "Delete Binder", "binder").await;
    let item = collection_item(
        &app,
        "scryfall-delete-deck-card",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    allocate(&app, card.id, item, 1).await;
    let data = app
        .gql_data(
            "mutation DeleteDeckCard($id: ID!) { deleteDeckCard(id: $id) { deckCard { id card { name } } } }",
            json!({"id": card_gid(card.id)}),
        )
        .await;
    assert_eq!(
        data["deleteDeckCard"]["deckCard"],
        json!({"id": card_gid(card.id), "card": {"name": "Delete Me"}})
    );
    assert_eq!(deck_cards(&app, deck.id).await.len(), 0);
    assert_eq!(item_location(&app, item).await, Some(binder.0));
    assert_eq!(all_allocations(&app).await.len(), 0);
}

#[tokio::test]
async fn delete_deck_removes_an_archived_deck_and_restores_allocated_cards() {
    let app = app_with(&[simple_card(
        "scryfall-delete-deck",
        "oracle-delete-deck",
        "Delete Deck Card",
        "Artifact",
        json!({}),
    )])
    .await;
    let deck = create_deck(&app, "Deck To Delete", None, None).await;
    let card = add_card(&app, deck.id, "Delete Deck Card", 1, "mainboard").await;
    let binder = location(&app, "Delete Deck Binder", "binder").await;
    let item = collection_item(
        &app,
        "scryfall-delete-deck",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    allocate(&app, card.id, item, 1).await;
    set_status(&app, deck.id, "archived").await;
    let data = app
        .gql_data(
            "mutation DeleteDeck($id: ID!) { deleteDeck(id: $id) { deck { id name } } }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    assert_eq!(data["deleteDeck"]["deck"]["name"], json!("Deck To Delete"));
    assert!(records::get_deck(app.db(), deck.id).await.is_err());
    assert_eq!(item_location(&app, item).await, Some(binder.0));
    let response = app
        .gql(
            "query Deck($id: ID!) { deck(id: $id) { id } }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    assert_eq!(error_message(&response), "Deck was not found.");
}

const SET_COMMANDER: &str = "mutation SetDeckCommander($id: ID!) {
  setDeckCommander(id: $id) { deckCard { id zone card { name } } }
}";

#[tokio::test]
async fn set_deck_commander_replaces_the_current_commander() {
    let app = app_with(&[
        simple_card(
            "scryfall-printing-1",
            "oracle-1",
            "Old Legend",
            "Legendary Creature — Wizard",
            json!({}),
        ),
        simple_card(
            "scryfall-printing-2",
            "oracle-2",
            "New Legend",
            "Legendary Creature — Soldier",
            json!({"collector_number": "2"}),
        ),
    ])
    .await;
    let deck = create_deck(&app, "Commander Test", None, None).await;
    let old = add_card(&app, deck.id, "Old Legend", 1, "commander").await;
    let new = add_card(&app, deck.id, "New Legend", 1, "mainboard").await;
    let data = app
        .gql_data(SET_COMMANDER, json!({"id": card_gid(new.id)}))
        .await;
    assert_eq!(
        data["setDeckCommander"]["deckCard"]["zone"],
        json!("commander")
    );
    assert_eq!(
        deck_card(&app, old.id).await.unwrap().zone,
        lotus::Zone::Mainboard
    );
    assert_eq!(
        deck_card(&app, new.id).await.unwrap().zone,
        lotus::Zone::Commander
    );
}

#[tokio::test]
async fn set_deck_commander_accepts_can_be_your_commander_text_and_rejects_others() {
    let app = app_with(&[
        simple_card("scryfall-printing-jace", "oracle-jace", "Jace, Multiverse Architect", "Legendary Planeswalker — Jace", json!({"oracle_text": "Jace, Multiverse Architect can be your commander.\n+1: Draw a card."})),
        simple_card("scryfall-printing-rock", "oracle-rock", "Plain Rock", "Legendary Artifact", json!({"oracle_text": "{T}: Add {C}.", "collector_number": "2"})),
    ])
    .await;
    let deck = create_deck(&app, "Planeswalker Commander", None, None).await;
    let jace = add_card(&app, deck.id, "Jace, Multiverse Architect", 1, "mainboard").await;
    let rock = add_card(&app, deck.id, "Plain Rock", 1, "mainboard").await;
    let response = app
        .gql(SET_COMMANDER, json!({"id": card_gid(rock.id)}))
        .await;
    assert_eq!(error_message(&response), "card can't be your commander");
    let data = app
        .gql_data(SET_COMMANDER, json!({"id": card_gid(jace.id)}))
        .await;
    assert_eq!(
        data["setDeckCommander"]["deckCard"]["card"]["name"],
        json!("Jace, Multiverse Architect")
    );
}

#[tokio::test]
async fn add_deck_partner_keeps_the_commander_and_pairs_the_candidate() {
    let app = app_with(&[
        simple_card("scryfall-printing-doctor", "oracle-doctor", "Test Doctor", "Legendary Creature — Time Lord Doctor", json!({})),
        simple_card("scryfall-printing-companion", "oracle-companion", "Test Companion", "Legendary Creature — Human", json!({"oracle_text": "Doctor's companion (You can have two commanders if the other is the Doctor.)", "collector_number": "2"})),
        simple_card("scryfall-printing-bystander", "oracle-bystander", "Unpaired Legend", "Legendary Creature — Soldier", json!({"collector_number": "3"})),
    ])
    .await;
    let deck = create_deck(&app, "Partner Test", Some("commander"), None).await;
    let commander = add_card(&app, deck.id, "Test Doctor", 1, "commander").await;
    let companion = add_card(&app, deck.id, "Test Companion", 1, "mainboard").await;
    let bystander = add_card(&app, deck.id, "Unpaired Legend", 1, "mainboard").await;
    let mutation = "mutation AddDeckPartner($id: ID!) { addDeckPartner(id: $id) { deckCard { id zone card { name } } } }";
    let response = app
        .gql(mutation, json!({"id": card_gid(bystander.id)}))
        .await;
    assert!(error_message(&response).contains("can't be paired"));
    let data = app
        .gql_data(mutation, json!({"id": card_gid(companion.id)}))
        .await;
    assert_eq!(
        data["addDeckPartner"]["deckCard"]["zone"],
        json!("commander")
    );
    assert_eq!(
        deck_card(&app, commander.id).await.unwrap().zone,
        lotus::Zone::Commander
    );
    assert_eq!(
        deck_card(&app, bystander.id).await.unwrap().zone,
        lotus::Zone::Mainboard
    );
    let response = app
        .gql(mutation, json!({"id": card_gid(companion.id)}))
        .await;
    assert_eq!(
        error_message(&response),
        "card is already in the command zone"
    );
}

#[tokio::test]
async fn bulk_update_and_bulk_delete_act_on_a_selection() {
    let app = app_with(&[
        simple_card(
            "scryfall-bulk-card-1",
            "oracle-bulk-card-1",
            "Bulk One",
            "Artifact",
            json!({}),
        ),
        simple_card(
            "scryfall-bulk-card-2",
            "oracle-bulk-card-2",
            "Bulk Two",
            "Creature",
            json!({"collector_number": "2"}),
        ),
    ])
    .await;
    let deck = create_deck(&app, "Bulk Test", None, None).await;
    let first = add_card(&app, deck.id, "Bulk One", 1, "mainboard").await;
    let second = add_card(&app, deck.id, "Bulk Two", 1, "mainboard").await;
    let ids = json!([card_gid(first.id), card_gid(second.id)]);
    let data = app
        .gql_data(
            "mutation BulkUpdate($deckCardIds: [ID!]!, $input: DeckCardUpdateInput!) {
               bulkUpdateDeckCards(deckCardIds: $deckCardIds, input: $input) { deckCards { id zone } }
             }",
            json!({"deckCardIds": ids, "input": {"zone": "considering"}}),
        )
        .await;
    let updated = data["bulkUpdateDeckCards"]["deckCards"].as_array().unwrap();
    assert_eq!(updated.len(), 2);
    assert!(
        updated
            .iter()
            .all(|card| card["zone"] == json!("considering"))
    );
    let data = app
        .gql_data(
            "mutation BulkDelete($deckCardIds: [ID!]!) {
               bulkDeleteDeckCards(deckCardIds: $deckCardIds) { deckCards { id allocationStatus { state } } }
             }",
            json!({"deckCardIds": ids}),
        )
        .await;
    assert_eq!(
        data["bulkDeleteDeckCards"]["deckCards"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert!(deck_card(&app, first.id).await.is_none());
    assert!(deck_card(&app, second.id).await.is_none());

    let response = app
        .gql(
            "mutation BulkDelete($deckCardIds: [ID!]!) { bulkDeleteDeckCards(deckCardIds: $deckCardIds) { deckCards { id } } }",
            json!({"deckCardIds": [card_gid(first.id)]}),
        )
        .await;
    assert_eq!(error_message(&response), "Deck card was not found.");
}

// --- deck_mutations_test.exs ---

#[tokio::test]
async fn update_deck_updates_deck_fields() {
    let app = app_with(&[black_lotus()]).await;
    let deck = create_deck(&app, "Old Deck", Some("commander"), Some("brewing")).await;
    let cover = add_card(&app, deck.id, "Black Lotus", 1, "mainboard").await;
    let mutation = "mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {
      updateDeck(id: $id, input: $input) {
        deck { id name format status playCount skipCount lastPlayedAt primer coverDeckCardId coverImageUrl }
      }
    }";
    let data = app
        .gql_data(
            mutation,
            json!({"id": deck_gid(deck.id), "input": {
                "name": "New Deck", "format": "modern", "status": "active", "playCount": 14,
                "skipCount": 3, "lastPlayedAt": "2026-08-10T07:00:00Z",
                "primer": "## Game plan\n\nCast the commander, then protect it.",
                "coverDeckCardId": card_gid(cover.id)
            }}),
        )
        .await;
    assert_eq!(
        data["updateDeck"]["deck"],
        json!({
            "id": deck_gid(deck.id), "name": "New Deck", "format": "modern", "status": "active",
            "playCount": 14, "skipCount": 3, "lastPlayedAt": "2026-08-10T07:00:00Z",
            "primer": "## Game plan\n\nCast the commander, then protect it.",
            "coverDeckCardId": card_gid(cover.id),
            "coverImageUrl": "https://example.test/black-lotus.jpg"
        })
    );
    let response = app
        .gql(
            mutation,
            json!({"id": deck_gid(deck.id), "input": {"format": "tiny", "name": ""}}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "format is invalid, name can't be blank"
    );
    let response = app
        .gql(
            mutation,
            json!({"id": deck_gid(deck.id), "input": {"coverDeckCardId": deck_gid(deck.id)}}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "Expected deck card ID, got deck ID"
    );
}

#[tokio::test]
async fn import_mutation_and_export_query_expose_plain_text_decklists() {
    let app = app_with(&[
        simple_card(
            "scryfall-deck-import-1",
            "oracle-deck-import-1",
            "Import Lotus",
            "Artifact",
            json!({"set": "imp"}),
        ),
        simple_card(
            "scryfall-deck-import-2",
            "oracle-deck-import-2",
            "Import Walk",
            "Sorcery",
            json!({"set": "imp", "collector_number": "2"}),
        ),
    ])
    .await;
    let deck = create_deck(&app, "Import Deck", None, None).await;
    let id = deck_gid(deck.id);
    let import = "mutation ImportDecklist($id: ID!, $text: String!, $replaceExisting: Boolean) {
      importDecklist(id: $id, text: $text, replaceExisting: $replaceExisting) {
        importResult { imported unresolved skippedPrintings }
      }
    }";
    let data = app
        .gql_data(
            import,
            json!({"id": id, "text": "Commander\n1 Import Walk\n\nMainboard\n2 Import Lotus\n1 Missing Card\n"}),
        )
        .await;
    assert_eq!(
        data["importDecklist"]["importResult"],
        json!({"imported": 2, "unresolved": ["Missing Card"], "skippedPrintings": []})
    );
    let export = "query DeckExportText($id: ID!) { deckExportText(id: $id) }";
    let text = app.gql_data(export, json!({"id": id})).await["deckExportText"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(text.contains("Commander\n1x Import Walk"));
    assert!(text.contains("Mainboard\n2x Import Lotus"));

    let data = app
        .gql_data(
            import,
            json!({"id": id, "text": "Mainboard\n1 Import Walk\n", "replaceExisting": true}),
        )
        .await;
    assert_eq!(data["importDecklist"]["importResult"]["imported"], json!(1));
    assert_eq!(
        app.gql_data(export, json!({"id": id})).await["deckExportText"],
        json!("Mainboard\n1x Import Walk")
    );

    let response = app
        .gql(
            "mutation ImportDecklist($id: ID!, $text: String!, $zone: String) {
               importDecklist(id: $id, text: $text, zone: $zone) { importResult { imported } }
             }",
            json!({"id": id, "text": "1 Import Walk", "zone": "attic"}),
        )
        .await;
    assert_eq!(error_message(&response), "Unknown deck zone: attic");
    set_status(&app, deck.id, "archived").await;
    let response = app
        .gql(import, json!({"id": id, "text": "1 Import Walk"}))
        .await;
    assert_eq!(
        error_message(&response),
        "Unarchive this deck before importing a decklist."
    );
}

// --- deck_queries_test.exs, decks_pagination_test.exs ---

#[tokio::test]
async fn create_deck_mutation_creates_a_deck() {
    let app = TestApp::new().await;
    let mutation = "mutation CreateDeck($input: DeckInput!) {
      createDeck(input: $input) { deck { id name format status cardCount uniqueCardCount tags { name } } }
    }";
    let data = app
        .gql_data(
            mutation,
            json!({"input": {"name": "Knife Drawer", "format": "commander", "status": "brewing"}}),
        )
        .await;
    let deck = &data["createDeck"]["deck"];
    assert_eq!(deck["name"], json!("Knife Drawer"));
    assert_eq!(deck["format"], json!("commander"));
    assert_eq!(deck["status"], json!("brewing"));
    assert_eq!(deck["cardCount"], json!(0));
    assert_eq!(deck["uniqueCardCount"], json!(0));
    assert_eq!(
        deck["tags"],
        json!([{"name": "Ramp"}, {"name": "Draw"}, {"name": "Interact"}, {"name": "Plan"}])
    );
    let response = app
        .gql(mutation, json!({"input": {"name": "Bad", "format": null}}))
        .await;
    assert_eq!(error_message(&response), "format can't be blank");
}

#[tokio::test]
async fn deck_counts_exclude_considering_cards() {
    let app = app_with(&[
        simple_card(
            "scryfall-count-main",
            "oracle-count-main",
            "Count Main",
            "Creature",
            json!({}),
        ),
        simple_card(
            "scryfall-count-commander",
            "oracle-count-commander",
            "Count Commander",
            "Legendary Creature",
            json!({"collector_number": "2"}),
        ),
    ])
    .await;
    let deck = create_deck(&app, "Count Test", Some("commander"), None).await;
    add_card(&app, deck.id, "Count Main", 2, "mainboard").await;
    add_card(&app, deck.id, "Count Commander", 1, "commander").await;
    add_card(&app, deck.id, "Count Main", 4, "considering").await;
    add_card(&app, deck.id, "Count Commander", 8, "considering").await;
    let data = app
        .gql_data(
            "query Deck($id: ID!) { deck(id: $id) { cardCount uniqueCardCount } }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    assert_eq!(data["deck"], json!({"cardCount": 3, "uniqueCardCount": 2}));
}

#[tokio::test]
async fn decks_query_exposes_summary_fields_and_legality() {
    let app = app_with(&[
        simple_card("scryfall-summary-main", "oracle-summary-main", "Summary Main", "Creature", json!({"image_uris": {"art_crop": "https://example.test/summary-main-art.jpg"}})),
        simple_card("scryfall-summary-commander", "oracle-summary-commander", "Summary Commander", "Legendary Creature", json!({"color_identity": ["G", "U"], "collector_number": "2", "legalities": {"commander": "legal"}})),
    ])
    .await;
    let deck = create_deck(&app, "Summary Deck", Some("commander"), None).await;
    add_card(&app, deck.id, "Summary Main", 2, "mainboard").await;
    add_card(&app, deck.id, "Summary Commander", 1, "commander").await;
    let data = app
        .gql_data(
            "query { decks(first: 10) {
               pageInfo { endCursor hasNextPage }
               edges { node { name coverImageUrl commanderColorIdentity cardCount uniqueCardCount
                              legality { status issues { code cardName } } } }
             } }",
            json!({}),
        )
        .await;
    assert_eq!(data["decks"]["pageInfo"]["hasNextPage"], json!(false));
    let node = &data["decks"]["edges"][0]["node"];
    assert_eq!(node["name"], json!("Summary Deck"));
    assert_eq!(
        node["coverImageUrl"],
        json!("https://example.test/summary-main-art.jpg")
    );
    assert_eq!(node["commanderColorIdentity"], json!(["U", "G"]));
    assert_eq!(node["cardCount"], json!(3));
    assert_eq!(node["uniqueCardCount"], json!(2));
    assert_eq!(node["legality"]["status"], json!("illegal"));
    assert!(
        node["legality"]["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|issue| issue["code"] == json!("card_legality")
                && issue["cardName"] == json!("Summary Main"))
    );
}

#[tokio::test]
async fn decks_connection_paginates_at_the_page_boundary() {
    let app = TestApp::new().await;
    for index in 1..=3 {
        create_deck(&app, &format!("Pager Deck {index}"), None, None).await;
    }
    let data = app
        .gql_data("query { decks(first: 2) { pageInfo { hasNextPage endCursor } edges { node { name } } } }", json!({}))
        .await;
    assert_eq!(data["decks"]["pageInfo"]["hasNextPage"], json!(true));
    let names: Vec<&str> = data["decks"]["edges"]
        .as_array()
        .unwrap()
        .iter()
        .map(|edge| edge["node"]["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["Pager Deck 1", "Pager Deck 2"]);
    let cursor = data["decks"]["pageInfo"]["endCursor"]
        .as_str()
        .unwrap()
        .to_owned();
    let data = app
        .gql_data(
            "query Page($after: String) { decks(first: 2, after: $after) { pageInfo { hasNextPage } edges { node { name } } } }",
            json!({"after": cursor}),
        )
        .await;
    assert_eq!(data["decks"]["pageInfo"]["hasNextPage"], json!(false));
    assert_eq!(
        data["decks"]["edges"],
        json!([{"node": {"name": "Pager Deck 3"}}])
    );
    let data = app
        .gql_data("query { decks { edges { node { name } } } }", json!({}))
        .await;
    assert_eq!(data["decks"]["edges"].as_array().unwrap().len(), 3);
}

// --- deck_detail_and_share_test.exs (owner schema) ---

#[tokio::test]
async fn deck_detail_exposes_legality_cards_tags_and_share_tokens() {
    let app = app_with(&[simple_card(
        "scryfall-share-card",
        "oracle-share-card",
        "Shared Card",
        "Artifact",
        json!({
            "oracle_text": "Shared oracle text.", "set": "shr", "collector_number": "9",
            "prices": {"usd": "2.50"}, "legalities": {"commander": "legal", "modern": "not_legal"},
            "game_changer": true
        }),
    )])
    .await;
    let deck = records::create_deck(
        app.db(),
        &DeckChanges {
            name: Some(Some("Shared Deck".into())),
            ..DeckChanges::default()
        },
    )
    .await
    .unwrap();
    let card = add_printing(&app, deck.id, "Shared Card", 2, "scryfall-share-card").await;
    let tag = crate::decks::tags::create_deck_tag(
        app.db(),
        deck.id,
        &crate::decks::tags::DeckTagChanges {
            name: Some(Some("Mana Rocks".into())),
            color: Some(Some("#00ff00".into())),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    crate::decks::tags::assign_deck_card_tag(app.db(), card.id, tag.id)
        .await
        .unwrap();
    collection_item(&app, "scryfall-share-card", 2, Finish::Nonfoil, None).await;

    let data = app
        .gql_data(
            "mutation ShareDeck($id: ID!) { ensureDeckShareToken(id: $id) { deck { id shareToken } } }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    let token = data["ensureDeckShareToken"]["deck"]["shareToken"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(token.len(), 24);

    let data = app
        .gql_data(
            "query SharedDeck($token: String!) {
               sharedDeck(token: $token) {
                 name cardCount uniqueCardCount
                 legality { status issues { code message severity cardName } }
                 tags { id name color targetCount position cardCount }
                 deckCards(first: 500) {
                   pageInfo { hasNextPage }
                   edges { node {
                     quantity zone finish tag tagIds priceCents
                     card { name gameChanger }
                     preferredPrinting { scryfallId setCode }
                     fallbackPrinting { scryfallId }
                     allocationStatus { state required owned allocated proxyAllocated available allocatedElsewhere missing deckZone }
                   } }
                 }
               }
             }",
            json!({"token": token}),
        )
        .await;
    let shared = &data["sharedDeck"];
    assert_eq!(shared["name"], json!("Shared Deck"));
    assert_eq!(
        (
            shared["cardCount"].clone(),
            shared["uniqueCardCount"].clone()
        ),
        (json!(2), json!(1))
    );
    assert_eq!(shared["legality"]["status"], json!("illegal"));
    assert!(
        shared["legality"]["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|issue| issue["cardName"] == json!("Shared Card")
                && issue["severity"] == json!("error"))
    );
    assert!(
        shared["tags"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["id"] == json!(tag.id.to_string())
                && t["name"] == json!("Mana Rocks")
                && t["cardCount"] == json!(2))
    );
    let node = &shared["deckCards"]["edges"][0]["node"];
    assert_eq!(node["tagIds"], json!([tag.id.to_string()]));
    assert_eq!(node["priceCents"], json!(250));
    assert_eq!(
        node["card"],
        json!({"name": "Shared Card", "gameChanger": true})
    );
    assert_eq!(
        node["preferredPrinting"],
        json!({"scryfallId": "scryfall-share-card", "setCode": "shr"})
    );
    assert_eq!(
        node["fallbackPrinting"],
        json!({"scryfallId": "scryfall-share-card"})
    );
    assert_eq!(
        node["allocationStatus"],
        json!({"state": "available", "required": 2, "owned": 2, "allocated": 0, "proxyAllocated": 0,
               "available": 2, "allocatedElsewhere": 0, "missing": 0, "deckZone": null})
    );

    let data = app
        .gql_data(
            "mutation Rotate($id: ID!) { rotateDeckShareToken(id: $id) { deck { shareToken } } }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    let rotated = data["rotateDeckShareToken"]["deck"]["shareToken"]
        .as_str()
        .unwrap();
    assert_ne!(rotated, token);
    let data = app
        .gql_data(
            "query Shared($token: String!) { sharedDeck(token: $token) { name } }",
            json!({"token": token}),
        )
        .await;
    assert_eq!(data["sharedDeck"], Value::Null);
    let data = app
        .gql_data(
            "mutation Disable($id: ID!) { disableDeckSharing(id: $id) { deck { shareToken } } }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    assert_eq!(
        data["disableDeckSharing"]["deck"]["shareToken"],
        Value::Null
    );
}

#[tokio::test]
async fn tag_mutations_round_trip() {
    let app = app_with(&[black_lotus()]).await;
    let deck = create_deck(&app, "Tags", None, None).await;
    let card = add_card(&app, deck.id, "Black Lotus", 2, "mainboard").await;
    let data = app
        .gql_data(
            "mutation Create($deckId: ID!, $input: DeckTagInput!) { createDeckTag(deckId: $deckId, input: $input) { deckTag { id name color targetCount position cardCount } } }",
            json!({"deckId": deck_gid(deck.id), "input": {"name": "Combo", "targetCount": 5}}),
        )
        .await;
    let tag = &data["createDeckTag"]["deckTag"];
    assert_eq!(tag["color"], json!("#7C5CFF"));
    assert_eq!(tag["position"], json!(4), "after the four default tags");
    let tag_id = tag["id"].as_str().unwrap().to_owned();

    let data = app
        .gql_data(
            "mutation Assign($card: ID!, $tag: ID!) { assignDeckCardTag(deckCardId: $card, tagId: $tag) { deckCard { tagIds } deckTags { name cardCount } } }",
            json!({"card": card_gid(card.id), "tag": tag_id}),
        )
        .await;
    assert_eq!(
        data["assignDeckCardTag"]["deckCard"]["tagIds"],
        json!([tag_id])
    );
    assert!(
        data["assignDeckCardTag"]["deckTags"]
            .as_array()
            .unwrap()
            .contains(&json!({"name": "Combo", "cardCount": 2}))
    );

    let data = app
        .gql_data(
            "mutation Update($id: ID!, $input: DeckTagInput!) { updateDeckTag(id: $id, input: $input) { deckTag { name color targetCount } } }",
            json!({"id": tag_id, "input": {"name": "Combo Pieces", "targetCount": null}}),
        )
        .await;
    assert_eq!(
        data["updateDeckTag"]["deckTag"],
        json!({"name": "Combo Pieces", "color": "#7C5CFF", "targetCount": null})
    );
    let response = app
        .gql(
            "mutation Update($id: ID!, $input: DeckTagInput!) { updateDeckTag(id: $id, input: $input) { deckTag { name } } }",
            json!({"id": "nope", "input": {"name": "X"}}),
        )
        .await;
    assert_eq!(error_message(&response), "Invalid ID: nope");
    let response = app
        .gql(
            "mutation Update($id: ID!, $input: DeckTagInput!) { updateDeckTag(id: $id, input: $input) { deckTag { name } } }",
            json!({"id": "999999", "input": {"name": "X"}}),
        )
        .await;
    assert_eq!(error_message(&response), "Deck tag was not found.");

    let data = app
        .gql_data(
            "mutation Unassign($card: ID!, $tag: ID!) { unassignDeckCardTag(deckCardId: $card, tagId: $tag) { deckCard { tagIds } } }",
            json!({"card": card_gid(card.id), "tag": tag_id}),
        )
        .await;
    assert_eq!(data["unassignDeckCardTag"]["deckCard"]["tagIds"], json!([]));

    let other = create_deck(&app, "Other", None, None).await;
    let foreign = crate::decks::tags::list_deck_tags(app.db(), other.id)
        .await
        .unwrap()[0]
        .id;
    let response = app
        .gql(
            "mutation Assign($card: ID!, $tag: ID!) { assignDeckCardTag(deckCardId: $card, tagId: $tag) { deckCard { id } } }",
            json!({"card": card_gid(card.id), "tag": foreign.to_string()}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "That tag belongs to a different deck."
    );

    let tags = crate::decks::tags::list_deck_tags(app.db(), deck.id)
        .await
        .unwrap();
    let reversed: Vec<String> = tags.iter().rev().map(|t| t.id.to_string()).collect();
    let data = app
        .gql_data(
            "mutation Reorder($deckId: ID!, $tagIds: [ID!]!) { reorderDeckTags(deckId: $deckId, tagIds: $tagIds) { tags { name position } } }",
            json!({"deckId": deck_gid(deck.id), "tagIds": reversed}),
        )
        .await;
    assert_eq!(
        data["reorderDeckTags"]["tags"][0],
        json!({"name": "Combo Pieces", "position": 0})
    );

    let data = app
        .gql_data(
            "mutation Delete($id: ID!) { deleteDeckTag(id: $id) { deckTagId } }",
            json!({"id": tag_id}),
        )
        .await;
    assert_eq!(data["deleteDeckTag"]["deckTagId"], json!(tag_id));

    let data = app
        .gql_data(
            "mutation Replace($tags: [DefaultDeckTagInput!]!) { replaceDefaultDeckTags(tags: $tags) { tags { id name color targetCount position } } }",
            json!({"tags": [{"name": "Ramp", "color": "#22c55e", "targetCount": 10}, {"name": "Removal", "color": "#ef4444"}]}),
        )
        .await;
    let defaults = data["replaceDefaultDeckTags"]["tags"].as_array().unwrap();
    assert_eq!(defaults.len(), 2);
    assert_eq!(defaults[1]["position"], json!(1));
    let data = app
        .gql_data("query { defaultDeckTags { name } }", json!({}))
        .await;
    assert_eq!(
        data["defaultDeckTags"],
        json!([{"name": "Ramp"}, {"name": "Removal"}])
    );
    let response = app
        .gql(
            "mutation Replace($tags: [DefaultDeckTagInput!]!) { replaceDefaultDeckTags(tags: $tags) { tags { id } } }",
            json!({"tags": [{"name": "A", "color": "#000000"}, {"name": "A", "color": "#111111"}]}),
        )
        .await;
    assert_eq!(error_message(&response), "name has already been taken");
}

// --- deck_swap_test.exs (GraphQL) ---

#[tokio::test]
async fn swap_preview_and_apply_over_graphql() {
    let app = app_with(&[
        legal_commander_card(),
        legal_plains(),
        legality_card(
            "Silver Bolt",
            &["W"],
            json!({"commander": "legal"}),
            json!({}),
        ),
        legality_card("Red Bolt", &["R"], json!({"commander": "legal"}), json!({})),
    ])
    .await;
    let deck = create_deck(&app, "Swap API", Some("commander"), None).await;
    add_card(&app, deck.id, "Test Commander", 1, "commander").await;
    add_card(&app, deck.id, "Plains", 98, "mainboard").await;
    let bolt = add_card(&app, deck.id, "Silver Bolt", 1, "mainboard").await;
    let variables = json!({
        "deckId": deck_gid(deck.id),
        "input": {
            "cuts": [{"deckCardId": card_gid(bolt.id), "quantity": 1, "destination": "CONSIDERING"}],
            "adds": [{"name": "Red Bolt", "quantity": 1}]
        }
    });
    let data = app
        .gql_data(
            "query DeckSwapPreview($deckId: ID!, $input: DeckSwapInput!) {
               deckSwapPreview(deckId: $deckId, input: $input) { cardCount unresolvedNames legality { status issues { code cardName } } }
             }",
            variables.clone(),
        )
        .await;
    assert_eq!(
        data["deckSwapPreview"],
        json!({"cardCount": 100, "unresolvedNames": [], "legality": {"status": "illegal",
               "issues": [{"code": "commander_color_identity", "cardName": "Red Bolt"}]}})
    );
    let apply = "mutation ApplyDeckSwap($deckId: ID!, $input: DeckSwapInput!) {
      applyDeckSwap(deckId: $deckId, input: $input) { deck { id cardCount legality { status } } }
    }";
    let data = app.gql_data(apply, variables).await;
    assert_eq!(data["applyDeckSwap"]["deck"]["cardCount"], json!(100));
    assert_eq!(
        data["applyDeckSwap"]["deck"]["legality"]["status"],
        json!("illegal")
    );
    assert_eq!(
        deck_card(&app, bolt.id).await.unwrap().zone,
        lotus::Zone::Considering
    );

    let response = app
        .gql(
            apply,
            json!({"deckId": deck_gid(deck.id), "input": {"cuts": [], "adds": []}}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "Stage at least one cut or add before swapping."
    );
}

// --- deck_picker_test.exs (GraphQL) ---

#[tokio::test]
async fn random_deck_and_record_play_over_graphql() {
    let app = TestApp::new().await;
    let first = create_deck(&app, "First", None, Some("active")).await;
    let second = create_deck(&app, "Second", None, Some("active")).await;
    create_deck(&app, "Retired", None, Some("archived")).await;
    let data = app
        .gql_data(
            "query RandomDeck($excludeId: ID) { randomDeck(excludeId: $excludeId) { id name playCount skipCount lastPlayedAt } }",
            json!({"excludeId": deck_gid(first.id)}),
        )
        .await;
    assert_eq!(
        data["randomDeck"],
        json!({"id": deck_gid(second.id), "name": "Second", "playCount": 0, "skipCount": 0, "lastPlayedAt": null})
    );

    let record = "mutation RecordDeckPlay($id: ID!, $outcome: DeckPlayOutcome!) {
      recordDeckPlay(id: $id, outcome: $outcome) { deck { name playCount skipCount lastPlayedAt } }
    }";
    let played = app
        .gql_data(
            record,
            json!({"id": deck_gid(second.id), "outcome": "PLAYED"}),
        )
        .await;
    let last = played["recordDeckPlay"]["deck"]["lastPlayedAt"].clone();
    assert!(last.is_string());
    let skipped = app
        .gql_data(
            record,
            json!({"id": deck_gid(second.id), "outcome": "SKIPPED"}),
        )
        .await;
    assert_eq!(
        skipped["recordDeckPlay"]["deck"],
        json!({"name": "Second", "playCount": 1, "skipCount": 1, "lastPlayedAt": last})
    );
    let archived = create_deck(&app, "Gone", None, Some("archived")).await;
    let response = app
        .gql(
            record,
            json!({"id": deck_gid(archived.id), "outcome": "PLAYED"}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "Archived decks cannot be recorded as played."
    );
}

#[tokio::test]
async fn inclusion_toggles_through_graphql_and_controls_random_picks() {
    let app = TestApp::new().await;
    let deck = create_deck(&app, "Tonight", None, Some("active")).await;
    let id = deck_gid(deck.id);
    for included in [false, true] {
        let data = app
            .gql_data(
                "mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) { updateDeck(id: $id, input: $input) { deck { includedForPlay status playCount skipCount } } }",
                json!({"id": id, "input": {"includedForPlay": included}}),
            )
            .await;
        assert_eq!(
            data["updateDeck"]["deck"],
            json!({"includedForPlay": included, "status": "active", "playCount": 0, "skipCount": 0})
        );
        let data = app
            .gql_data(
                "query DeckInclusion($id: ID!) { deck(id: $id) { includedForPlay } decks(first: 10) { edges { node { includedForPlay } } } randomDeck(excludeId: $id) { id } }",
                json!({"id": id}),
            )
            .await;
        assert_eq!(data["deck"]["includedForPlay"], json!(included));
        assert_eq!(
            data["decks"]["edges"][0]["node"]["includedForPlay"],
            json!(included)
        );
        assert_eq!(
            data["randomDeck"],
            if included {
                json!({"id": id})
            } else {
                Value::Null
            }
        );
    }
    let data = app.gql_data("query { randomDeck { id } }", json!({})).await;
    assert_eq!(data["randomDeck"], json!({"id": id}));
}

// --- deck_allocation_batching_test.exs (status values) ---

#[tokio::test]
async fn deck_page_allocation_status_counts_copies_reserved_elsewhere() {
    let mut cards: Vec<Value> = (1..=3)
        .map(|index| {
            simple_card(
                &format!("scryfall-batched-allocation-{index}"),
                &format!("oracle-batched-allocation-{index}"),
                &format!("Batched Allocation {index}"),
                "Artifact",
                json!({"collector_number": index.to_string(), "set": "bat"}),
            )
        })
        .collect();
    cards.push(simple_card(
        "scryfall-batched-allocation-1-alternate",
        "oracle-batched-allocation-1",
        "Batched Allocation 1",
        "Artifact",
        json!({"collector_number": "1a", "set": "bat"}),
    ));
    let app = app_with(&cards).await;
    let binder = location(&app, "Batch Binder", "binder").await;
    let mut items = Vec::new();
    for index in 1..=3 {
        items.push(
            collection_item(
                &app,
                &format!("scryfall-batched-allocation-{index}"),
                1,
                Finish::Nonfoil,
                Some(binder),
            )
            .await,
        );
    }
    let primary = items[0];
    let alternate = collection_item(
        &app,
        "scryfall-batched-allocation-1-alternate",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let deck = create_deck(&app, "Batched Allocation Deck", None, None).await;
    for index in 1..=3 {
        add_card(
            &app,
            deck.id,
            &format!("Batched Allocation {index}"),
            1,
            "mainboard",
        )
        .await;
    }
    let other = create_deck(&app, "Other Batched Allocation Deck", None, None).await;
    let other_card = add_card(&app, other.id, "Batched Allocation 1", 1, "mainboard").await;
    allocate(&app, other_card.id, alternate, 1).await;

    let data = app
        .gql_data(
            "query Deck($id: ID!) { deck(id: $id) {
               id cardCount uniqueCardCount legality { status }
               deckCards(first: 10, after: null) {
                 pageInfo { endCursor hasNextPage }
                 edges { node { id card { name printings(first: 10) { edges { node { scryfallId } } } }
                                preferredPrinting { scryfallId }
                                allocationStatus { state available allocatedElsewhere owned missing
                                  candidates { available allocated allocatedElsewhere
                                    item { id priceText location { name } printing { card { name } } } } } } }
               }
             } }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    let deck_data = &data["deck"];
    assert_eq!(deck_data["cardCount"], json!(3));
    assert_eq!(deck_data["uniqueCardCount"], json!(3));
    assert_eq!(deck_data["legality"]["status"], json!("illegal"));
    let edges = deck_data["deckCards"]["edges"].as_array().unwrap();
    assert_eq!(edges.len(), 3);
    let first = edges
        .iter()
        .find(|edge| edge["node"]["card"]["name"] == json!("Batched Allocation 1"))
        .unwrap();
    let status = &first["node"]["allocationStatus"];
    assert_eq!(
        [
            &status["state"],
            &status["available"],
            &status["allocatedElsewhere"],
            &status["owned"],
            &status["missing"]
        ],
        [
            &json!("available"),
            &json!(1),
            &json!(1),
            &json!(2),
            &json!(0)
        ]
    );
    // Both copies are candidates: the binder's is free, the alternate
    // printing's is reserved by the other deck (and has left its binder).
    let mut candidates = status["candidates"].as_array().unwrap().clone();
    candidates.sort_by_key(|candidate| candidate["available"].as_i64());
    let item_gid = |id: crate::decks::model::CollectionItemId| {
        crate::graphql::global_id(crate::graphql::NodeKind::CollectionItem, id.0).to_string()
    };
    assert_eq!(
        Value::Array(candidates),
        json!([
            {"available": 0, "allocated": 0, "allocatedElsewhere": 1,
             "item": {"id": item_gid(alternate), "priceText": null, "location": null,
                      "printing": {"card": {"name": "Batched Allocation 1"}}}},
            {"available": 1, "allocated": 0, "allocatedElsewhere": 0,
             "item": {"id": item_gid(primary), "priceText": null, "location": {"name": "Batch Binder"},
                      "printing": {"card": {"name": "Batched Allocation 1"}}}}
        ])
    );
    assert_eq!(
        first["node"]["card"]["printings"]["edges"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let data = app
        .gql_data(
            "query Deck($id: ID!) { deck(id: $id) { deckCards { edges { node { allocationStatus { state allocated } } } } } }",
            json!({"id": deck_gid(other.id)}),
        )
        .await;
    assert_eq!(
        data["deck"]["deckCards"]["edges"][0]["node"]["allocationStatus"],
        json!({"state": "allocated", "allocated": 1})
    );
}

#[tokio::test]
async fn basic_lands_and_proxies_in_allocation_status() {
    let app = app_with(&[
        crate::test_support::fixtures::plains(),
        simple_card(
            "scryfall-snow",
            "oracle-snow",
            "Snow-Covered Forest",
            "Basic Snow Land — Forest",
            json!({"collector_number": "9"}),
        ),
        black_lotus(),
    ])
    .await;
    let deck = create_deck(&app, "Lands", None, None).await;
    add_card(&app, deck.id, "Plains", 10, "mainboard").await;
    add_card(&app, deck.id, "Snow-Covered Forest", 5, "mainboard").await;
    let lotus = add_card(&app, deck.id, "Black Lotus", 2, "mainboard").await;
    sqlx::query!(
        "UPDATE deck_cards SET proxy_quantity = 1 WHERE id = ?1",
        lotus.id
    )
    .execute(app.db())
    .await
    .unwrap();
    let data = app
        .gql_data(
            "query Deck($id: ID!) { deck(id: $id) { deckCards { edges { node { card { name } allocationStatus { state required allocated proxyAllocated missing } } } } } }",
            json!({"id": deck_gid(deck.id)}),
        )
        .await;
    let statuses: Vec<(String, Value)> = data["deck"]["deckCards"]["edges"]
        .as_array()
        .unwrap()
        .iter()
        .map(|edge| {
            (
                edge["node"]["card"]["name"].as_str().unwrap().to_owned(),
                edge["node"]["allocationStatus"].clone(),
            )
        })
        .collect();
    let by_name = |name: &str| statuses.iter().find(|(n, _)| n == name).unwrap().1.clone();
    assert_eq!(
        by_name("Plains"),
        json!({"state": "basic_land", "required": 10, "allocated": 10, "proxyAllocated": 0, "missing": 0})
    );
    assert_eq!(by_name("Snow-Covered Forest")["state"], json!("basic_land"));
    assert_eq!(
        by_name("Black Lotus"),
        json!({"state": "partial", "required": 2, "allocated": 1, "proxyAllocated": 1, "missing": 1})
    );
}

// --- schema_domain_contract_test.exs (deck parts) ---

#[tokio::test]
async fn deck_root_fields_and_payloads_match_the_contract() {
    let app = TestApp::new().await;
    let data = app
        .gql_data(
            "{ __schema { queryType { fields { name } } mutationType { fields { name } } }
               recordDeckPlayPayload: __type(name: \"RecordDeckPlayPayload\") { fields { name type { name } } }
               randomDeckField: __type(name: \"RootQueryType\") { fields { name args { name type { kind name } } } } }",
            json!({}),
        )
        .await;
    let names = |kind: &str| -> Vec<String> {
        data["__schema"][kind]["fields"]
            .as_array()
            .unwrap()
            .iter()
            .map(|field| field["name"].as_str().unwrap().to_owned())
            .collect()
    };
    let queries = names("queryType");
    for field in [
        "deck",
        "deckExportText",
        "deckSwapPreview",
        "decks",
        "defaultDeckTags",
        "randomDeck",
        "sharedDeck",
    ] {
        assert!(queries.contains(&field.to_owned()), "{field}");
    }
    let mutations = names("mutationType");
    for field in [
        "addDeckCard",
        "addDeckPartner",
        "applyDeckSwap",
        "assignDeckCardTag",
        "bulkDeleteDeckCards",
        "bulkUpdateDeckCards",
        "createDeck",
        "createDeckTag",
        "deleteDeck",
        "deleteDeckCard",
        "deleteDeckTag",
        "disableDeckSharing",
        "ensureDeckShareToken",
        "importDecklist",
        "linkDeckExternalSource",
        "optimizeDeckCardPrintings",
        "recordDeckPlay",
        "reorderDeckTags",
        "replaceDefaultDeckTags",
        "rotateDeckShareToken",
        "setDeckCommander",
        "syncDeckExternalSource",
        "unassignDeckCardTag",
        "unlinkDeckExternalSource",
        "updateDeck",
        "updateDeckCard",
        "updateDeckCardsTag",
    ] {
        assert!(mutations.contains(&field.to_owned()), "{field}");
    }
    assert_eq!(
        data["recordDeckPlayPayload"]["fields"],
        json!([{"name": "deck", "type": {"name": "Deck"}}])
    );
    let random = data["randomDeckField"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["name"] == json!("randomDeck"))
        .unwrap();
    assert_eq!(
        random["args"],
        json!([{"name": "excludeId", "type": {"kind": "SCALAR", "name": "ID"}}])
    );
}

#[tokio::test]
async fn deck_card_ids_round_trip_as_global_ids() {
    let app = app_with(&[simple_card(
        "printing-contract",
        "oracle-contract",
        "Contract Card",
        "Artifact",
        json!({}),
    )])
    .await;
    let deck = create_deck(&app, "Node Contract Deck", None, None).await;
    let card = add_card(&app, deck.id, "Contract Card", 1, "mainboard").await;
    assert_eq!(card_gid(DeckCardId(4)), "RGVja0NhcmQ6NA==");
    assert_eq!(deck_gid(crate::decks::model::DeckId(3)), "RGVjazoz");
    let data = app
        .gql_data(
            "mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) { updateDeckCard(id: $id, input: $input) { deckCard { id quantity } } }",
            json!({"id": card_gid(card.id), "input": {}}),
        )
        .await;
    assert_eq!(
        data["updateDeckCard"]["deckCard"],
        json!({"id": card_gid(card.id), "quantity": 1})
    );
    let response = app
        .gql(
            "mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) { updateDeckCard(id: $id, input: $input) { deckCard { id } } }",
            json!({"id": deck_gid(deck.id), "input": {}}),
        )
        .await;
    assert_eq!(
        error_message(&response),
        "Expected deck card ID, got deck ID"
    );
    let response = app
        .gql(
            "mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) { updateDeckCard(id: $id, input: $input) { deckCard { id } } }",
            json!({"id": card_gid(DeckCardId(999_999)), "input": {}}),
        )
        .await;
    assert_eq!(error_message(&response), "Deck card was not found.");
}
