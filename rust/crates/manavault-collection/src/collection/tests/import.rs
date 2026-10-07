//! Collection imports and import preview batching.

use pretty_assertions::assert_eq;
use serde_json::json;

use super::*;
use crate::collection::auto_sort::rules::{RuleInput, replace};
use crate::collection::filters::LocationFilter;
use crate::collection::import::{
    ImportError, ImportPreview, PreviewOptions, RowStatus, commit, preview, preview_auto_sort,
};
use manavault_catalog::testing::fixtures::{black_lotus, time_walk};

fn options(format: &str) -> PreviewOptions {
    PreviewOptions {
        format: Some(format.to_owned()),
        ..PreviewOptions::default()
    }
}

async fn run(
    app: &TestApp,
    text: &str,
    options: &PreviewOptions,
) -> crate::collection::import::ImportResult {
    let preview = preview(app.db(), text, options).await.unwrap();
    commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap()
}

fn statuses(preview: &ImportPreview) -> (i64, i64, i64, i64) {
    (
        preview.total(),
        preview.exact(),
        preview.ambiguous(),
        preview.unresolved(),
    )
}

#[tokio::test]
async fn csv_preview_resolves_rows_and_applies_one_location() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let binder = create_location(&app, "Import Binder", "binder").await;
    let csv = "Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Purchase Price\n\
               2,Black Lotus,lea,232,nonfoil,NM,en,90000.00\n\
               1,Time Walk,lea,84,foil,LP,ja,\n";
    let options = PreviewOptions {
        location_id: Some(binder.id),
        ..options("csv")
    };
    let preview = preview(app.db(), csv, &options).await.unwrap();
    assert_eq!(statuses(&preview), (2, 2, 0, 0));
    assert_eq!(preview.location_id, Some(binder.id));
    assert!(
        preview
            .rows
            .iter()
            .all(|row| row.attrs.location_id == Some(binder.id))
    );
    let numbers: Vec<i64> = preview.rows.iter().map(|row| row.row_number).collect();
    assert_eq!(numbers, [2, 3]);

    let result = commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap();
    assert_eq!(
        (result.imported, result.skipped, result.auto_sorted),
        (2, 0, 0)
    );
    let items = queries::list_items(app.db(), &ItemFilters::default(), Page::default())
        .await
        .unwrap();
    let summary: Vec<(Option<i64>, i64, Option<i64>, &str)> = items
        .iter()
        .map(|item| {
            (
                item.record.location_id,
                item.record.quantity.as_i64(),
                item.record.purchase_price_cents,
                item.record.condition.as_str(),
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            (Some(binder.id), 2, Some(9_000_000), "near_mint"),
            // `LP` is lightly played (earlier releases read it as near mint).
            (Some(binder.id), 1, Some(500), "lightly_played"),
        ]
    );
    assert_eq!(count(&app, &ItemFilters::default()).await, 3);
    assert_eq!(
        count(&app, &ItemFilters::at(LocationFilter::Id(binder.id))).await,
        3
    );
}

#[tokio::test]
async fn commit_rejects_a_location_removed_after_preview() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let box_location = create_location(&app, "Temporary Box", "box").await;
    let csv =
        "Quantity,Card Name,Set Code,Collector Number,Finish\n1,Black Lotus,lea,232,nonfoil\n";
    let preview = preview(
        app.db(),
        csv,
        &PreviewOptions {
            location_id: Some(box_location.id),
            ..options("csv")
        },
    )
    .await
    .unwrap();
    location::delete(app.db(), box_location.id).await.unwrap();
    let error = commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap_err();
    assert!(matches!(error, ImportError::LocationNotFound));
    let error = preview_auto_sort(app.db(), &app.state.prices, &preview.rows)
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "Import location was not found.");
    assert_eq!(
        item_ids(&app, &ItemFilters::default()).await,
        Vec::<i64>::new()
    );
}

#[tokio::test]
async fn commit_rejects_a_printing_removed_after_preview() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let csv =
        "Quantity,Card Name,Set Code,Collector Number,Finish\n1,Black Lotus,lea,232,nonfoil\n";
    let preview = preview(app.db(), csv, &options("csv")).await.unwrap();
    assert_eq!(
        preview.rows[0]
            .attrs
            .scryfall_id
            .value()
            .map(String::as_str),
        Some("scryfall-printing-1")
    );
    sqlx::query("DELETE FROM scryfall_printings WHERE scryfall_id = 'scryfall-printing-1'")
        .execute(app.db())
        .await
        .unwrap();
    let error = commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap_err();
    assert_eq!(
        error.to_string(),
        "A card printing in this import no longer exists. Preview the import again."
    );
    assert!(matches!(
        preview_auto_sort(app.db(), &app.state.prices, &preview.rows).await,
        Err(ImportError::PrintingNotFound)
    ));
}

#[tokio::test]
async fn csv_import_can_target_no_location() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let result = run(
        &app,
        "Quantity,Card Name,Set Code,Collector Number\n1,Black Lotus,lea,232\n",
        &options("csv"),
    )
    .await;
    assert_eq!(result.imported, 1);
    let items = queries::list_items(app.db(), &ItemFilters::default(), Page::default())
        .await
        .unwrap();
    assert_eq!(items[0].record.location_id, None);
}

#[tokio::test]
async fn txt_import_parses_scanned_exported_lists() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let txt = "1x Black Lotus (LEA) 232\n2x Time Walk (LEA) 84 *F*\n1x Unknown Card (TST) 1\n";
    let preview = preview(app.db(), txt, &options("txt")).await.unwrap();
    assert_eq!(statuses(&preview), (3, 2, 0, 1));
    let quantities: Vec<Option<i64>> = preview
        .rows
        .iter()
        .map(|r| r.attrs.quantity.value().copied())
        .collect();
    assert_eq!(quantities, [Some(1), Some(2), Some(1)]);
    let finishes: Vec<Option<&str>> = preview
        .rows
        .iter()
        .map(|r| r.attrs.finish.value().map(String::as_str))
        .collect();
    assert_eq!(finishes, [Some("nonfoil"), Some("foil"), Some("nonfoil")]);
    assert_eq!(
        preview.rows[2]
            .attrs
            .scryfall_id
            .value()
            .map(String::as_str),
        Some("")
    );

    let result = commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap();
    assert_eq!((result.imported, result.skipped), (2, 1));
    assert_eq!(count(&app, &ItemFilters::default()).await, 3);
}

#[tokio::test]
async fn import_matches_a_scryfall_flavor_name() {
    let app = TestApp::new().await;
    let homeward = merge(
        time_walk(),
        json!({
            "id": "scryfall-homeward-path",
            "oracle_id": "oracle-homeward-path",
            "name": "Homeward Path",
            "flavor_name": "Pelican Town",
            "set": "sld",
            "collector_number": "1"
        }),
    );
    app.import_cards(&[homeward]).await;
    let preview = preview(app.db(), "1 Pelican Town (SLD) 1", &options("txt"))
        .await
        .unwrap();
    assert_eq!(statuses(&preview), (1, 1, 0, 0));
    let card = preview.rows[0]
        .printing
        .as_ref()
        .unwrap()
        .card
        .clone()
        .unwrap();
    assert_eq!(card.name, "Homeward Path");
}

#[tokio::test]
async fn import_matches_a_reversible_card_by_its_full_or_face_name() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), reversible_lotus()]).await;
    for text in [
        "1 Black Lotus // Black Lotus (LEB) 351",
        "1 Black Lotus (LEB) 351",
    ] {
        let preview = preview(app.db(), text, &options("txt")).await.unwrap();
        assert_eq!(statuses(&preview), (1, 1, 0, 0), "{text}");
        assert_eq!(
            preview.rows[0]
                .printing
                .as_ref()
                .unwrap()
                .record
                .scryfall_id
                .as_str(),
            "scryfall-reversible-1"
        );
    }
}

#[tokio::test]
async fn ambiguous_rows_list_their_candidates() {
    let app = TestApp::new().await;
    app.import_cards(&[
        black_lotus(),
        manavault_catalog::testing::fixtures::black_lotus_beta(),
    ])
    .await;
    let preview = preview(app.db(), "Black Lotus", &options("txt"))
        .await
        .unwrap();
    assert_eq!(statuses(&preview), (1, 0, 1, 0));
    assert_eq!(preview.rows[0].status, RowStatus::Ambiguous);
    assert_eq!(preview.rows[0].candidates.len(), 2);
    let result = commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap();
    assert_eq!((result.imported, result.skipped), (0, 1));
}

#[tokio::test]
async fn import_defaults_to_an_available_finish() {
    let app = TestApp::new().await;
    app.import_cards(&[time_walk()]).await;
    let preview = preview(app.db(), "1x Time Walk (LEA) 84", &options("txt"))
        .await
        .unwrap();
    assert_eq!(preview.rows[0].status, RowStatus::Exact);
    assert_eq!(
        preview.rows[0].attrs.finish.value().map(String::as_str),
        Some("foil")
    );
    let result = commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap();
    assert_eq!((result.imported, result.skipped), (1, 0));
    let items = queries::list_items(app.db(), &ItemFilters::default(), Page::default())
        .await
        .unwrap();
    assert_eq!(items[0].record.finish.as_str(), "foil");
}

#[tokio::test]
async fn import_applies_a_default_purchase_price_to_rows_without_one() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let csv = "Quantity,Card Name,Set Code,Collector Number,Finish,Purchase Price\n\
               1,Black Lotus,lea,232,nonfoil,42.00\n1,Time Walk,lea,84,foil,\n";
    let with_price = PreviewOptions {
        purchase_price_cents: Some(100),
        ..options("csv")
    };
    let previewed = preview(app.db(), csv, &with_price).await.unwrap();
    let prices: Vec<Option<i64>> = previewed
        .rows
        .iter()
        .map(|r| r.attrs.purchase_price_cents.value().copied())
        .collect();
    assert_eq!(prices, [Some(4_200), Some(100)]);
    commit(app.db(), &app.state.prices, &previewed.rows, false)
        .await
        .unwrap();
    let items = queries::list_items(app.db(), &ItemFilters::default(), Page::default())
        .await
        .unwrap();
    let prices: Vec<Option<i64>> = items
        .iter()
        .map(|i| i.record.purchase_price_cents)
        .collect();
    assert_eq!(prices, [Some(4_200), Some(100)]);

    let error = preview(
        app.db(),
        "x",
        &PreviewOptions {
            purchase_price_cents: Some(-1),
            ..PreviewOptions::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(
        error.to_string(),
        "Import purchase price must be a dollar amount."
    );
    let error = preview(app.db(), "x", &options_with_location(9_999))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "Import location was not found.");
    let error = preview(
        app.db(),
        "x",
        &PreviewOptions {
            format: Some("xlsx".into()),
            ..PreviewOptions::default()
        },
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "Import file must be a CSV or TXT file.");
    let error = preview(app.db(), "Quantity,Name\n1,\"Opt\n", &options("csv"))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "Could not parse that import file.");
}

fn options_with_location(id: i64) -> PreviewOptions {
    PreviewOptions {
        location_id: Some(id),
        ..PreviewOptions::default()
    }
}

#[tokio::test]
async fn scryfall_id_rows_resolve_in_bulk_with_their_cards() {
    let app = TestApp::new().await;
    let cards: Vec<_> = (1..=6)
        .map(|index| {
            simple_card(
                &format!("scryfall-import-batch-{index}"),
                &format!("oracle-import-batch-{index}"),
                &format!("Import Batch {index}"),
                json!({"collector_number": index.to_string(), "set": "ibt"}),
            )
        })
        .collect();
    app.import_cards(&cards).await;
    let csv: String = std::iter::once("Quantity,Scryfall ID".to_owned())
        .chain((1..=6).map(|index| format!("1,scryfall-import-batch-{index}")))
        .collect::<Vec<_>>()
        .join("\n");
    let preview = preview(app.db(), &csv, &options("csv")).await.unwrap();
    assert_eq!(statuses(&preview), (6, 6, 0, 0));
    for row in &preview.rows {
        assert!(row.printing.as_ref().unwrap().card.is_some());
    }
}

#[tokio::test]
async fn token_rows_become_owned_token_items() {
    let app = TestApp::new().await;
    let token = simple_card(
        "scryfall-token-soldier",
        "oracle-token-soldier",
        "Soldier",
        json!({"layout": "token", "type_line": "Token Creature — Soldier", "set": "tm10"}),
    );
    app.import_cards(&[black_lotus(), token]).await;
    let csv = "Quantity,Scryfall ID\n2,scryfall-token-soldier\n1,scryfall-printing-1\n1,scryfall-token-soldier\n";
    let preview = preview(app.db(), csv, &options("csv")).await.unwrap();
    assert_eq!(statuses(&preview), (3, 3, 0, 0));
    let result = commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap();
    assert_eq!((result.imported, result.skipped), (3, 0));
    assert_eq!(count(&app, &ItemFilters::default()).await, 1);
    let tokens: Vec<(String, i64)> =
        sqlx::query_as("SELECT scryfall_id, quantity FROM token_items")
            .fetch_all(app.db())
            .await
            .unwrap();
    assert_eq!(tokens, [("scryfall-token-soldier".to_owned(), 3)]);
}

#[tokio::test]
async fn invalid_rows_roll_the_whole_commit_back() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let csv = "Quantity,Scryfall ID\n1,scryfall-printing-1\n-2,scryfall-printing-1\n";
    let preview = preview(app.db(), csv, &options("csv")).await.unwrap();
    let error = commit(app.db(), &app.state.prices, &preview.rows, false)
        .await
        .unwrap_err();
    // Lowering the quantity caps the offered copies too, so both fail.
    assert_eq!(
        error.to_string(),
        "quantity must be greater than 0, for trade quantity must be greater than or equal to 0"
    );
    assert_eq!(count(&app, &ItemFilters::default()).await, 0);
}

#[tokio::test]
async fn auto_sort_after_import_moves_only_imported_items() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let colorless = create_location(&app, "Colorless", "box").await;
    let blue = create_location(&app, "Blue", "box").await;
    let rule = |name: &str, target: i64, priority: i64, mode: &str, colors: &[&str]| RuleInput {
        name: Some(name.to_owned()),
        enabled: Some(true),
        priority: Some(priority),
        target_location_id: Some(target),
        color_mode: Some(mode.to_owned()),
        colors: Some(colors.iter().map(|c| (*c).to_owned()).collect()),
        ..RuleInput::default()
    };
    replace(
        app.db(),
        &[
            rule("Rule 1", colorless.id, 1, "colorless", &[]),
            rule("Rule 2", blue.id, 2, "include_any", &["U"]),
        ],
    )
    .await
    .unwrap();
    let existing = create_item(&app, "scryfall-printing-1", Attrs::default())
        .await
        .record
        .id;
    let csv = "Quantity,Card Name,Set Code,Collector Number,Finish\n1,Black Lotus,lea,232,nonfoil\n1,Time Walk,lea,84,foil\n";
    let preview = preview(app.db(), csv, &options("csv")).await.unwrap();

    let dry = preview_auto_sort(app.db(), &app.state.prices, &preview.rows)
        .await
        .unwrap();
    assert!(dry.dry_run);
    assert_eq!((dry.checked_count, dry.moved_count), (2, 2));
    // The dry run imports nothing.
    assert_eq!(item_ids(&app, &ItemFilters::default()).await, [existing]);

    let result = commit(app.db(), &app.state.prices, &preview.rows, true)
        .await
        .unwrap();
    assert_eq!(
        (result.imported, result.skipped, result.auto_sorted),
        (2, 0, 2)
    );
    assert_eq!(
        reload(&app, existing).await.unwrap().record.location_id,
        None
    );
    assert_eq!(
        item_ids(&app, &ItemFilters::at(LocationFilter::Id(colorless.id)))
            .await
            .len(),
        1
    );
    assert_eq!(
        item_ids(&app, &ItemFilters::at(LocationFilter::Id(blue.id)))
            .await
            .len(),
        1
    );
    assert_eq!(
        item_ids(&app, &ItemFilters::at(LocationFilter::Unfiled)).await,
        [existing]
    );
}
