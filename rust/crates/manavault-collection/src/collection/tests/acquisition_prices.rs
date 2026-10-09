//! The acquisition price rebuild (domain and GraphQL), against wiremock
//! MTGJSON files.

use std::io::Write as _;

use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use time::OffsetDateTime;
use time::macros::format_description;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::*;
use crate::collection::acquisition_prices::{self, RebuildStatus};
use manavault_catalog::pricing::history::HistoryUrls;
use manavault_catalog::testing::fixtures::{black_lotus, time_walk};

fn day(days_ago: i64) -> String {
    (OffsetDateTime::now_utc() - time::Duration::days(days_ago))
        .date()
        .format(format_description!("[year]-[month]-[day]"))
        .unwrap()
}

fn gzip(text: &str) -> Vec<u8> {
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    encoder.write_all(text.as_bytes()).unwrap();
    encoder.finish().unwrap()
}

async fn mock_mtgjson(server: &MockServer, prices: &Value) -> HistoryUrls {
    Mock::given(method("GET"))
        .and(path("/cardIdentifiers.csv"))
        .respond_with(ResponseTemplate::new(200).set_body_string(
            "name,scryfallId,uuid\nBlack Lotus,scryfall-printing-1,uuid-lotus\nTime Walk,scryfall-printing-2,uuid-walk\n",
        ))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/AllPrices.json.gz"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(gzip(&prices.to_string())))
        .mount(server)
        .await;
    HistoryUrls {
        all_prices: format!("{}/AllPrices.json.gz", server.uri()),
        card_identifiers: format!("{}/cardIdentifiers.csv", server.uri()),
    }
}

/// Ten days of Black Lotus history ending yesterday (in dollars, $101 a day
/// ago through $110); Time Walk has only EUR history.
fn prices() -> Value {
    let mut normal = serde_json::Map::new();
    for days_ago in 1..=10 {
        normal.insert(day(days_ago), json!(100 + days_ago));
    }
    let third_day = day(3);
    json!({
        "meta": {"date": day(1)},
        "data": {
            "uuid-lotus": {"paper": {
                "tcgplayer": {"currency": "USD", "retail": {"normal": normal}},
                "cardkingdom": {"currency": "USD", "retail": {"normal": {&third_day: 50}}}
            }},
            "uuid-walk": {"paper": {"cardmarket": {"currency": "EUR", "retail": {"normal": {&third_day: 1}}}}}
        }
    })
}

async fn set_added(app: &TestApp, id: i64, days_ago: i64) {
    let at = (OffsetDateTime::now_utc() - time::Duration::days(days_ago)).format(
        format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]Z"),
    );
    sqlx::query("UPDATE collection_items SET inserted_at = ?1 WHERE id = ?2")
        .bind(at.unwrap())
        .bind(id)
        .execute(app.db())
        .await
        .unwrap();
}

async fn set_price(app: &TestApp, id: i64, cents: Option<i64>) {
    sqlx::query("UPDATE collection_items SET acquisition_market_price_cents = ?1 WHERE id = ?2")
        .bind(cents)
        .bind(id)
        .execute(app.db())
        .await
        .unwrap();
}

async fn acquisition_prices(app: &TestApp) -> Vec<(i64, Option<i64>)> {
    sqlx::query_as("SELECT id, acquisition_market_price_cents FROM collection_items ORDER BY id")
        .fetch_all(app.db())
        .await
        .unwrap()
}

#[tokio::test]
async fn rebuild_replaces_prices_of_items_added_inside_the_history_window() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus(), time_walk()]).await;
    let server = MockServer::start().await;
    let urls = mock_mtgjson(&server, &prices()).await;
    // Added yesterday: takes that day's price.
    let today = create_item(&app, "scryfall-printing-1", Attrs::default()).await;
    set_added(&app, today.record.id, 1).await;
    // Added five days ago: takes the five-day-old price; its snapshot was the
    // migration's current price.
    let earlier = create_item(&app, "scryfall-printing-1", Attrs::default()).await;
    set_added(&app, earlier.record.id, 5).await;
    set_price(&app, earlier.record.id, Some(9_999)).await;
    // Already right: counted in the window, not as updated.
    let right = create_item(&app, "scryfall-printing-1", Attrs::default()).await;
    set_added(&app, right.record.id, 7).await;
    set_price(&app, right.record.id, Some(10_700)).await;
    // Added before the window: keeps its snapshot.
    let old = create_item(&app, "scryfall-printing-1", Attrs::default()).await;
    set_added(&app, old.record.id, 40).await;
    set_price(&app, old.record.id, Some(1)).await;
    // In the window, but its card has no USD history: keeps its snapshot.
    let walk = create_item(
        &app,
        "scryfall-printing-2",
        Attrs {
            finish: Some("foil"),
            ..Attrs::default()
        },
    )
    .await;
    set_added(&app, walk.record.id, 3).await;
    set_price(&app, walk.record.id, None).await;

    let record = acquisition_prices::run(&app.state, &urls, None)
        .await
        .unwrap();
    assert_eq!(record.status, RebuildStatus::Succeeded);
    assert_eq!(record.source.as_deref(), Some("scryfall"));
    assert_eq!(record.history_from.as_deref(), Some(day(10).as_str()));
    assert_eq!(record.history_to.as_deref(), Some(day(1).as_str()));
    assert_eq!(
        (
            record.items_in_window,
            record.items_updated,
            record.items_without_history
        ),
        (4, 2, 1)
    );
    assert_eq!(record.error, None);
    assert!(record.started_at.is_some() && record.completed_at.is_some());
    assert_eq!(
        acquisition_prices(&app).await,
        vec![
            (today.record.id, Some(10_100)),
            (earlier.record.id, Some(10_500)),
            (right.record.id, Some(10_700)),
            (old.record.id, Some(1)),
            (walk.record.id, None),
        ]
    );

    // A vendor source reads that vendor's history and the latest earlier day.
    manavault_catalog::pricing::set_source(&app.state, "cardkingdom")
        .await
        .unwrap();
    let record = acquisition_prices::run(&app.state, &urls, None)
        .await
        .unwrap();
    assert_eq!(record.source.as_deref(), Some("cardkingdom"));
    assert_eq!(record.history_from.as_deref(), Some(day(10).as_str()));
    assert_eq!(
        (
            record.items_in_window,
            record.items_updated,
            record.items_without_history
        ),
        (4, 3, 1)
    );
    assert_eq!(
        acquisition_prices(&app).await[..3],
        [
            (today.record.id, Some(5_000)),
            (earlier.record.id, Some(5_000)),
            (right.record.id, Some(5_000)),
        ]
    );
    assert_eq!(
        acquisition_prices::latest(app.db()).await.unwrap().unwrap(),
        record
    );
}

#[tokio::test]
async fn rebuild_records_a_failed_download_and_keeps_prices() {
    let app = TestApp::new().await;
    app.import_cards(&[black_lotus()]).await;
    let item = create_item(&app, "scryfall-printing-1", Attrs::default()).await;
    set_price(&app, item.record.id, Some(42)).await;
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;
    let urls = HistoryUrls {
        all_prices: format!("{}/AllPrices.json.gz", server.uri()),
        card_identifiers: format!("{}/cardIdentifiers.csv", server.uri()),
    };
    let record = acquisition_prices::run(&app.state, &urls, None)
        .await
        .unwrap();
    assert_eq!(record.status, RebuildStatus::Failed);
    assert_eq!(
        record.error.as_deref(),
        Some("MTGJSON request failed with HTTP 503")
    );
    assert_eq!(
        acquisition_prices(&app).await,
        vec![(item.record.id, Some(42))]
    );
}

#[tokio::test]
async fn rebuild_mutation_queues_one_job_and_the_query_reports_it() {
    let app = TestApp::new().await;
    let query = "{ acquisitionPriceRebuild { id status source itemsInWindow itemsUpdated itemsWithoutHistory error } }";
    assert_eq!(
        app.gql_data(query, json!({})).await,
        json!({"acquisitionPriceRebuild": null})
    );
    let mutation = "mutation { rebuildAcquisitionPrices { rebuild { id status source error } } }";
    let first = app.gql_data(mutation, json!({})).await;
    assert_eq!(
        first,
        json!({"rebuildAcquisitionPrices": {"rebuild": {"id": "1", "status": "queued", "source": null, "error": null}}})
    );
    // A second request while one is pending returns the same rebuild.
    assert_eq!(app.gql_data(mutation, json!({})).await, first);
    let jobs: Vec<(String, String)> =
        sqlx::query_as("SELECT worker, args FROM jobs WHERE state = 'queued'")
            .fetch_all(app.db())
            .await
            .unwrap();
    assert_eq!(
        jobs,
        vec![(
            acquisition_prices::NAME.to_owned(),
            r#"{"rebuild_id":1}"#.to_owned()
        )]
    );
    assert_eq!(
        app.gql_data(query, json!({})).await,
        json!({"acquisitionPriceRebuild": {
            "id": "1", "status": "queued", "source": null,
            "itemsInWindow": 0, "itemsUpdated": 0, "itemsWithoutHistory": 0, "error": null
        }})
    );
    // With no items, the job finishes without fetching anything.
    let drained = app
        .state
        .jobs
        .drain_queue(&app.state, "pricing", false)
        .await;
    assert_eq!((drained.success, drained.cancelled), (1, 0));
    let data = app.gql_data(query, json!({})).await;
    assert_eq!(data["acquisitionPriceRebuild"]["status"], "succeeded");
    assert_eq!(data["acquisitionPriceRebuild"]["source"], "scryfall");
}
