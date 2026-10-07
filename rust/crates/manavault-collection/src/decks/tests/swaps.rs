//! Deck swaps, the deck picker, and deck share caching.

use lotus::{Finish, Zone};
use serde_json::json;

use super::support::*;
use crate::decks::DeckError;
use crate::decks::cards::{self, DeckCardChanges};
use crate::decks::model::{DeckCardRow, DeckCardTag, DeckId, DeckStatus};
use crate::decks::picker;
use crate::decks::records::{self, DeckChanges, PlayOutcome};
use crate::decks::swap::{self, CutDestination, Swap, SwapAdd, SwapCut};
use crate::test_support::TestApp;
use crate::test_support::fixtures::legal_commander_card;
use crate::timefmt;

struct SwapDeck {
    app: TestApp,
    deck: DeckId,
    plains: DeckCardRow,
    silver_bolt: DeckCardRow,
    white_ward: DeckCardRow,
    red_bolt: DeckCardRow,
}

async fn swap_deck() -> SwapDeck {
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
            "White Ward",
            &["W"],
            json!({"commander": "legal"}),
            json!({}),
        ),
        legality_card(
            "Dawn Charm",
            &["W"],
            json!({"commander": "legal"}),
            json!({}),
        ),
        legality_card("Red Bolt", &["R"], json!({"commander": "legal"}), json!({})),
    ])
    .await;
    let deck = create_deck(&app, "Swap Target", Some("commander"), None)
        .await
        .id;
    add_card(&app, deck, "Test Commander", 1, "commander").await;
    let plains = add_card(&app, deck, "Plains", 98, "mainboard").await;
    let silver_bolt = add_card(&app, deck, "Silver Bolt", 1, "mainboard").await;
    let white_ward = add_card(&app, deck, "White Ward", 1, "considering").await;
    let red_bolt = add_card(&app, deck, "Red Bolt", 1, "considering").await;
    SwapDeck {
        app,
        deck,
        plains,
        silver_bolt,
        white_ward,
        red_bolt,
    }
}

fn cut(card: &DeckCardRow, quantity: i64, destination: CutDestination) -> SwapCut {
    SwapCut {
        deck_card_id: card.id,
        quantity,
        destination,
    }
}

fn add_existing(card: &DeckCardRow, quantity: i64) -> SwapAdd {
    SwapAdd {
        deck_card_id: Some(card.id),
        name: None,
        quantity,
    }
}

fn add_named(name: &str, quantity: i64) -> SwapAdd {
    SwapAdd {
        deck_card_id: None,
        name: Some(name.to_owned()),
        quantity,
    }
}

#[tokio::test]
async fn preview_evaluates_the_swapped_list_without_writing() {
    let ctx = swap_deck().await;
    assert_eq!(legality(&ctx.app, ctx.deck).await.status, "legal");
    let preview = swap::preview(
        ctx.app.db(),
        ctx.deck,
        &Swap {
            cuts: vec![cut(&ctx.silver_bolt, 1, CutDestination::Remove)],
            adds: vec![add_existing(&ctx.red_bolt, 1)],
        },
    )
    .await
    .unwrap();
    assert_eq!(preview.card_count, 100);
    assert_eq!(preview.unresolved_names.len(), 0);
    assert_eq!(preview.legality.status, "illegal");
    assert_eq!(
        issue(&preview.legality, "commander_color_identity")
            .card_name
            .as_deref(),
        Some("Red Bolt")
    );
    assert_eq!(
        deck_card(&ctx.app, ctx.silver_bolt.id).await.unwrap().zone,
        Zone::Mainboard
    );
    assert_eq!(
        deck_card(&ctx.app, ctx.red_bolt.id).await.unwrap().zone,
        Zone::Considering
    );

    let preview = swap::preview(
        ctx.app.db(),
        ctx.deck,
        &Swap {
            cuts: vec![cut(&ctx.plains, 2, CutDestination::Remove)],
            adds: vec![add_named("Dawn Charm", 1), add_named("No Such Card", 1)],
        },
    )
    .await
    .unwrap();
    assert_eq!(preview.card_count, 99);
    assert_eq!(preview.unresolved_names, vec!["No Such Card"]);
    issue(&preview.legality, "commander_deck_size");
}

#[tokio::test]
async fn invalid_swaps_are_rejected() {
    let ctx = swap_deck().await;
    let reject = |swap: Swap| {
        let pool = ctx.app.db().clone();
        let deck = ctx.deck;
        async move { swap::preview(&pool, deck, &swap).await.unwrap_err() }
    };
    let code = |error: DeckError| error.code().unwrap_or_default();
    assert_eq!(code(reject(Swap::default()).await), "empty_swap");
    assert_eq!(
        code(
            reject(Swap {
                cuts: vec![cut(&ctx.white_ward, 1, CutDestination::Remove)],
                adds: vec![]
            })
            .await
        ),
        "swap_cut_not_in_deck"
    );
    assert_eq!(
        code(
            reject(Swap {
                cuts: vec![],
                adds: vec![add_existing(&ctx.silver_bolt, 1)]
            })
            .await
        ),
        "swap_add_not_considering"
    );
    assert_eq!(
        code(
            reject(Swap {
                cuts: vec![cut(&ctx.silver_bolt, 2, CutDestination::Remove)],
                adds: vec![]
            })
            .await
        ),
        "swap_quantity_exceeds_deck_card"
    );
    assert_eq!(
        code(
            reject(Swap {
                cuts: vec![
                    cut(&ctx.silver_bolt, 1, CutDestination::Remove),
                    cut(&ctx.silver_bolt, 1, CutDestination::Remove)
                ],
                adds: vec![]
            })
            .await
        ),
        "duplicate_swap_entry"
    );
    assert_eq!(
        code(
            reject(Swap {
                cuts: vec![cut(&ctx.silver_bolt, 0, CutDestination::Remove)],
                adds: vec![]
            })
            .await
        ),
        "invalid_swap"
    );
    assert_eq!(
        code(
            reject(Swap {
                cuts: vec![],
                adds: vec![add_named("Dawn Charm", 1), add_named("dawn charm", 1)]
            })
            .await
        ),
        "duplicate_swap_entry"
    );
}

#[tokio::test]
async fn apply_commits_cuts_removals_and_adds_together() {
    let ctx = swap_deck().await;
    cards::update_deck_card(
        ctx.app.db(),
        ctx.silver_bolt.id,
        &DeckCardChanges {
            tag: Some(Some("consider_cutting".into())),
            ..DeckCardChanges::default()
        },
    )
    .await
    .unwrap();
    swap::apply(
        ctx.app.db(),
        ctx.deck,
        &Swap {
            cuts: vec![
                cut(&ctx.silver_bolt, 1, CutDestination::Considering),
                cut(&ctx.plains, 1, CutDestination::Remove),
            ],
            adds: vec![add_existing(&ctx.white_ward, 1), add_named("Dawn Charm", 1)],
        },
    )
    .await
    .unwrap();
    let bolt = deck_card(&ctx.app, ctx.silver_bolt.id).await.unwrap();
    assert_eq!((bolt.zone, bolt.tag), (Zone::Considering, None));
    assert_eq!(
        deck_card(&ctx.app, ctx.plains.id)
            .await
            .unwrap()
            .quantity
            .get(),
        97
    );
    assert_eq!(
        deck_card(&ctx.app, ctx.white_ward.id).await.unwrap().zone,
        Zone::Mainboard
    );
    assert_eq!(legality(&ctx.app, ctx.deck).await.status, "legal");
    assert_eq!(
        contents(&ctx.app, ctx.deck).await.summary(None).card_count,
        100
    );
}

#[tokio::test]
async fn apply_rolls_back_every_change_when_one_step_fails() {
    let ctx = swap_deck().await;
    let error = swap::apply(
        ctx.app.db(),
        ctx.deck,
        &Swap {
            cuts: vec![cut(&ctx.silver_bolt, 1, CutDestination::Remove)],
            adds: vec![add_named("No Such Card", 1)],
        },
    )
    .await
    .unwrap_err();
    assert!(matches!(error, DeckError::CardNotFound));
    assert_eq!(
        deck_card(&ctx.app, ctx.silver_bolt.id).await.unwrap().zone,
        Zone::Mainboard
    );
}

#[tokio::test]
async fn apply_merges_into_existing_rows_of_the_target_zone() {
    let ctx = swap_deck().await;
    add_card(&ctx.app, ctx.deck, "Plains", 2, "considering").await;
    swap::apply(
        ctx.app.db(),
        ctx.deck,
        &Swap {
            cuts: vec![cut(&ctx.plains, 3, CutDestination::Considering)],
            adds: vec![],
        },
    )
    .await
    .unwrap();
    let mut rows: Vec<(Zone, u32)> = deck_cards(&ctx.app, ctx.deck)
        .await
        .into_iter()
        .filter(|row| row.oracle_id.as_str() == "oracle-plains")
        .map(|row| (row.zone, row.quantity.get()))
        .collect();
    rows.sort_by_key(|(zone, _)| zone.as_str());
    assert_eq!(rows, vec![(Zone::Considering, 5), (Zone::Mainboard, 95)]);
}

#[tokio::test]
async fn partial_cuts_release_copies_beyond_the_remaining_quantity() {
    let ctx = swap_deck().await;
    let dawn = add_card(&ctx.app, ctx.deck, "Dawn Charm", 4, "mainboard").await;
    let item = collection_item(
        &ctx.app,
        "scryfall-printing-dawn-charm",
        4,
        Finish::Nonfoil,
        None,
    )
    .await;
    allocate(&ctx.app, dawn.id, item, 4).await;
    swap::apply(
        ctx.app.db(),
        ctx.deck,
        &Swap {
            cuts: vec![cut(&dawn, 3, CutDestination::Remove)],
            adds: vec![],
        },
    )
    .await
    .unwrap();
    assert_eq!(
        deck_card(&ctx.app, dawn.id).await.unwrap().quantity.get(),
        1
    );
    assert_eq!(allocated_quantity(&ctx.app, dawn.id).await, 1);
    let status = manavault_allocation::allocation_status(ctx.app.db(), dawn.id)
        .await
        .unwrap();
    assert_eq!(status.available, 3);
}

#[tokio::test]
async fn apply_refuses_archived_decks() {
    let ctx = swap_deck().await;
    set_status(&ctx.app, ctx.deck, "archived").await;
    let error = swap::apply(
        ctx.app.db(),
        ctx.deck,
        &Swap {
            cuts: vec![cut(&ctx.silver_bolt, 1, CutDestination::Remove)],
            adds: vec![],
        },
    )
    .await
    .unwrap_err();
    assert!(matches!(error, DeckError::DeckArchived));
}

// --- deck picker ---

async fn random(app: &TestApp, exclude: Option<DeckId>, roll: f64) -> Option<DeckId> {
    picker::random_deck(app.db(), exclude, time::OffsetDateTime::now_utc(), roll)
        .await
        .unwrap()
        .map(|deck| deck.id)
}

#[tokio::test]
async fn random_deck_picks_active_decks_and_excludes_the_previous_suggestion() {
    let app = TestApp::new().await;
    let alpha = create_deck(&app, "Alpha", None, Some("active")).await;
    let beta = create_deck(&app, "Beta", None, Some("active")).await;
    create_deck(&app, "A Brew", None, Some("brewing")).await;
    create_deck(&app, "Archived", None, Some("archived")).await;
    assert_eq!(random(&app, None, 0.0).await, Some(alpha.id));
    assert_eq!(random(&app, Some(alpha.id), 0.0).await, Some(beta.id));
    set_status(&app, beta.id, "archived").await;
    assert_eq!(random(&app, Some(alpha.id), 0.0).await, Some(alpha.id));
}

#[tokio::test]
async fn random_deck_is_none_without_playable_decks() {
    let app = TestApp::new().await;
    let brewing = create_deck(&app, "Brewing", None, Some("brewing")).await;
    create_deck(&app, "Retired", None, Some("archived")).await;
    assert_eq!(random(&app, None, 0.5).await, None);
    assert_eq!(random(&app, Some(brewing.id), 0.5).await, None);
}

#[tokio::test]
async fn inclusion_persists_independently_of_status() {
    let app = TestApp::new().await;
    let alpha = create_deck(&app, "Alpha", None, Some("active")).await;
    assert!(alpha.included_for_play);
    let beta = records::create_deck(
        app.db(),
        &DeckChanges {
            name: Some(Some("Beta".into())),
            status: Some(Some("active".into())),
            included_for_play: Some(Some(false)),
            ..DeckChanges::default()
        },
    )
    .await
    .unwrap();
    let include = |value: Option<bool>| DeckChanges {
        included_for_play: Some(value),
        ..DeckChanges::default()
    };
    let alpha = update_deck(&app, alpha.id, include(Some(false))).await;
    assert_eq!(alpha.status, DeckStatus::Active);
    assert!(!alpha.included_for_play);
    assert_eq!(records::count_decks(app.db()).await.unwrap(), 2);
    assert_eq!(random(&app, Some(alpha.id), 0.5).await, None);

    update_deck(&app, beta.id, include(Some(true))).await;
    for roll in [0.0, 1.0] {
        assert_eq!(random(&app, Some(beta.id), roll).await, Some(beta.id));
    }
    set_status(&app, beta.id, "archived").await;
    assert_eq!(random(&app, None, 0.5).await, None);
    update_deck(&app, alpha.id, include(Some(true))).await;
    assert_eq!(random(&app, None, 0.5).await, Some(alpha.id));
    let error = records::update_deck(app.db(), alpha.id, &include(None))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "included for play can't be blank");
}

#[tokio::test]
async fn playing_resets_skips_and_archived_decks_cannot_record() {
    let app = TestApp::new().await;
    let deck = records::create_deck(
        app.db(),
        &DeckChanges {
            name: Some(Some("History".into())),
            status: Some(Some("active".into())),
            ..DeckChanges::default()
        },
    )
    .await
    .unwrap();
    sqlx::query!("UPDATE decks SET skip_count = 3 WHERE id = ?1", deck.id)
        .execute(app.db())
        .await
        .unwrap();
    let played = records::record_play(app.db(), deck.id, PlayOutcome::Played)
        .await
        .unwrap();
    assert_eq!((played.play_count, played.skip_count), (1, 0));
    assert!(played.last_played_at.is_some());
    let skipped = records::record_play(app.db(), deck.id, PlayOutcome::Skipped)
        .await
        .unwrap();
    assert_eq!((skipped.play_count, skipped.skip_count), (1, 1));
    assert_eq!(skipped.last_played_at, played.last_played_at);

    let retired = create_deck(&app, "Retired", None, Some("archived")).await;
    for outcome in [PlayOutcome::Played, PlayOutcome::Skipped] {
        assert!(matches!(
            records::record_play(app.db(), retired.id, outcome).await,
            Err(DeckError::Code("archived_deck"))
        ));
    }
}

#[tokio::test]
async fn historical_play_data_can_be_imported_cleared_and_validated() {
    let app = TestApp::new().await;
    let deck = create_deck(&app, "Imported History", None, None).await;
    let updated = update_deck(
        &app,
        deck.id,
        DeckChanges {
            play_count: Some(Some(14)),
            skip_count: Some(Some(3)),
            last_played_at: Some(Some("2026-08-10T07:00:00Z".into())),
            ..DeckChanges::default()
        },
    )
    .await;
    assert_eq!((updated.play_count, updated.skip_count), (14, 3));
    assert_eq!(
        updated.last_played_at.as_deref(),
        Some("2026-08-10T07:00:00Z")
    );
    let cleared = update_deck(
        &app,
        deck.id,
        DeckChanges {
            last_played_at: Some(None),
            ..DeckChanges::default()
        },
    )
    .await;
    assert_eq!(cleared.last_played_at, None);
    let error = records::update_deck(
        app.db(),
        deck.id,
        &DeckChanges {
            play_count: Some(Some(-1)),
            skip_count: Some(Some(-1)),
            ..DeckChanges::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "play count must be greater than or equal to 0, skip count must be greater than or equal to 0"
    );
    let _ = timefmt::now();
}

// --- deck share caching ---

#[tokio::test]
async fn share_tokens_resolve_rotate_and_disappear() {
    let app = TestApp::new().await;
    for token in ["", "not-a-share-token", &"=".repeat(24), &"A".repeat(24)] {
        assert!(
            records::get_by_share_token(app.db(), token)
                .await
                .unwrap()
                .is_none()
        );
    }
    let deck = create_deck(&app, "Cacheable Share", None, None).await;
    let shared = records::ensure_share_token(app.db(), deck.id)
        .await
        .unwrap();
    let token = shared.share_token.clone().unwrap();
    assert_eq!(
        records::ensure_share_token(app.db(), deck.id)
            .await
            .unwrap()
            .share_token
            .as_deref(),
        Some(token.as_str()),
        "ensure keeps an existing token"
    );
    assert_eq!(
        records::get_by_share_token(app.db(), &token)
            .await
            .unwrap()
            .unwrap()
            .id,
        deck.id
    );
    update_deck(
        &app,
        deck.id,
        DeckChanges {
            name: Some(Some("Updated Shared Deck".into())),
            ..DeckChanges::default()
        },
    )
    .await;
    assert_eq!(
        records::get_by_share_token(app.db(), &token)
            .await
            .unwrap()
            .unwrap()
            .name,
        "Updated Shared Deck"
    );
    let rotated = records::rotate_share_token(app.db(), deck.id)
        .await
        .unwrap();
    let new_token = rotated.share_token.unwrap();
    assert_ne!(new_token, token);
    assert!(
        records::get_by_share_token(app.db(), &token)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        records::get_by_share_token(app.db(), &new_token)
            .await
            .unwrap()
            .is_some()
    );
    records::delete_deck(app.db(), deck.id).await.unwrap();
    assert!(
        records::get_by_share_token(app.db(), &new_token)
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn moving_a_commander_into_an_existing_row_keeps_its_reservations() {
    // Earlier releases deleted the moved row, and the cascade dropped
    // its reservations while the copies stayed out of their location.
    let app = TestApp::new().await;
    app.import_cards(&[
        legal_commander_card(),
        legality_commander_card("Other Legend", &["W"], json!({})),
    ])
    .await;
    let binder = location(&app, "Binder", "binder").await;
    let item = collection_item(
        &app,
        "scryfall-printing-test-commander",
        1,
        Finish::Nonfoil,
        Some(binder),
    )
    .await;
    let deck = create_deck(&app, "Merge", Some("commander"), None).await;
    let commander = add_card(&app, deck.id, "Test Commander", 1, "commander").await;
    let mainboard_copy = add_card(&app, deck.id, "Test Commander", 1, "mainboard").await;
    allocate(&app, commander.id, item, 1).await;
    let other = add_card(&app, deck.id, "Other Legend", 1, "mainboard").await;
    let moved = cards::set_commander(app.db(), other.id).await.unwrap();
    assert_eq!(moved.zone, Zone::Commander);
    assert!(deck_card(&app, commander.id).await.is_none());
    assert_eq!(
        deck_card(&app, mainboard_copy.id)
            .await
            .unwrap()
            .quantity
            .get(),
        2
    );
    assert_eq!(allocated_quantity(&app, mainboard_copy.id).await, 1);
    let _ = DeckCardTag::Getting;
}
