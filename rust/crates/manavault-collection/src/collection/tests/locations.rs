//! Locations: CRUD, summaries, and deletes.

use async_graphql::MaybeUndefined;
use pretty_assertions::assert_eq;

use super::*;
use crate::collection::location::{LocationError, LocationKind};
use crate::test_support::fixtures::{black_lotus, time_walk};

fn changes(name: &str, kind: &str) -> LocationChanges {
    LocationChanges {
        name: MaybeUndefined::Value(name.to_owned()),
        kind: MaybeUndefined::Value(kind.to_owned()),
        ..LocationChanges::default()
    }
}

#[tokio::test]
async fn creates_and_updates_locations_with_validation() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let created = location::create(
        app.db(),
        LocationChanges {
            name: MaybeUndefined::Value("Box".into()),
            ..LocationChanges::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(created.kind, LocationKind::Box);

    let error = location::create(app.db(), changes("Box", "binder"))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "name has already been taken");
    let error = location::create(app.db(), changes("", "drawer"))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "name can't be blank, kind is invalid");
    let error = location::create(
        app.db(),
        LocationChanges {
            cover_scryfall_id: MaybeUndefined::Value("missing".into()),
            ..changes("Other", "box")
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "cover scryfall id does not exist");

    let updated = location::update(
        app.db(),
        created.id,
        LocationChanges {
            kind: MaybeUndefined::Value("deck_box".into()),
            description: MaybeUndefined::Value("Sleeved".into()),
            cover_scryfall_id: MaybeUndefined::Value("scryfall-printing-1".into()),
            ..LocationChanges::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.name, "Box");
    assert_eq!(updated.kind, LocationKind::DeckBox);
    assert_eq!(updated.description.as_deref(), Some("Sleeved"));
    assert_eq!(
        updated
            .cover_scryfall_id
            .as_ref()
            .map(ToString::to_string)
            .as_deref(),
        Some("scryfall-printing-1")
    );
    let cleared = location::update(
        app.db(),
        created.id,
        LocationChanges {
            cover_scryfall_id: MaybeUndefined::Null,
            description: MaybeUndefined::Value(String::new()),
            ..LocationChanges::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(
        (cleared.cover_scryfall_id, cleared.description),
        (None, None)
    );
    assert!(matches!(
        location::update(app.db(), 9_999, LocationChanges::default()).await,
        Err(LocationError::NotFound)
    ));
}

#[tokio::test]
async fn deleting_storage_unfiles_items_and_deleting_a_list_deletes_them() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let storage = create_location(&app, "Storage", "box").await;
    let list = create_location(&app, "Wants", "list").await;
    let stored = create_item(
        &app,
        "scryfall-printing-1",
        Attrs {
            location_id: Some(storage.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let wanted = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            location_id: Some(list.id),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;

    let deleted = location::delete(app.db(), storage.id).await.unwrap();
    assert_eq!(deleted.name, "Storage");
    assert_eq!(reload(&app, stored).await.unwrap().record.location_id, None);
    location::delete(app.db(), list.id).await.unwrap();
    assert!(reload(&app, wanted).await.is_none());
    assert_eq!(location::count(app.db()).await.unwrap(), 0);
    assert!(matches!(
        location::delete(app.db(), list.id).await,
        Err(LocationError::NotFound)
    ));
}

#[tokio::test]
async fn summaries_count_unallocated_copies_per_location() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let binder = create_location(&app, "Binder", "binder").await;
    let filed = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            quantity: Some(3),
            location_id: Some(binder.id),
            purchase_price_cents: Some(100),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let loose = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            quantity: Some(2),
            ..Attrs::default()
        },
    )
    .await
    .record
    .id;
    let deck = insert_deck(&app, "Deck", "brewing").await;
    allocate(&app, deck, loose, 1).await;
    let _ = filed;
    let summaries = queries::location_summaries(app.db(), None).await.unwrap();
    let binder_summary = summaries[&Some(binder.id)];
    assert_eq!(
        (
            binder_summary.item_count,
            binder_summary.total_price_cents,
            binder_summary.purchase_price_cents
        ),
        (3, 1_500, 300)
    );
    // The allocated stack is in a deck, not in the unfiled bucket.
    assert_eq!(summaries.get(&None), None);
}
