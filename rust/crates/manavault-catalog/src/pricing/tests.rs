//! Pricing tests: price sources, vendor price syncs, and the pricing
//! GraphQL fields.

use std::sync::Arc;

use async_trait::async_trait;
use lotus::Finish;
use serde_json::json;

use super::sync::{Replaced, replace_vendor_prices, run};
use super::vendors::{Vendor, VendorFeed, VendorRow};
use super::worker::{NAME, VendorSyncWorker, stale_vendors};
use crate::jobs::{Job, Outcome, Worker as _};
use crate::state::AppState;
use crate::test_support::TestApp;

async fn prices(app: &TestApp) -> Vec<(String, String, String, i64)> {
    sqlx::query_as("SELECT vendor, scryfall_id, finish, price_cents FROM vendor_prices ORDER BY vendor, scryfall_id, finish")
        .fetch_all(app.db())
        .await
        .unwrap()
}

fn row(id: &str, finish: Finish, cents: i64) -> VendorRow {
    VendorRow::new(id, finish, cents)
}

#[tokio::test]
async fn replace_keeps_the_cheapest_duplicate_upserts_and_removes_stale_rows() {
    let app = TestApp::new().await;
    replace_vendor_prices(
        app.db(),
        Vendor::ManaPool,
        vec![
            row("aaa", Finish::Nonfoil, 100),
            row("stale", Finish::Nonfoil, 50),
        ],
    )
    .await
    .unwrap();
    let replaced = replace_vendor_prices(
        app.db(),
        Vendor::ManaPool,
        vec![
            row("aaa", Finish::Nonfoil, 300),
            row("aaa", Finish::Nonfoil, 200),
            row("aaa", Finish::Foil, 400),
        ],
    )
    .await
    .unwrap();
    assert_eq!(
        replaced,
        Replaced {
            upserted: 2,
            deleted: 1
        }
    );
    assert_eq!(
        prices(&app).await,
        vec![
            (
                "manapool".to_owned(),
                "aaa".to_owned(),
                "foil".to_owned(),
                400
            ),
            (
                "manapool".to_owned(),
                "aaa".to_owned(),
                "nonfoil".to_owned(),
                200
            ),
        ]
    );
}

#[tokio::test]
async fn replace_leaves_other_vendors_untouched() {
    let app = TestApp::new().await;
    replace_vendor_prices(
        app.db(),
        Vendor::ManaPool,
        vec![row("aaa", Finish::Nonfoil, 100)],
    )
    .await
    .unwrap();
    replace_vendor_prices(
        app.db(),
        Vendor::CardKingdom,
        vec![row("aaa", Finish::Nonfoil, 111)],
    )
    .await
    .unwrap();
    assert_eq!(prices(&app).await.len(), 2);
}

#[tokio::test]
async fn replace_writes_more_than_one_batch() {
    let app = TestApp::new().await;
    let rows = (0..450)
        .map(|i| row(&format!("p{i}"), Finish::Foil, 10 + i))
        .collect();
    let replaced = replace_vendor_prices(app.db(), Vendor::TcgPlayer, rows)
        .await
        .unwrap();
    assert_eq!(replaced.upserted, 450);
    assert_eq!(prices(&app).await.len(), 450);
}

#[tokio::test]
async fn settings_default_to_scryfall_and_validate_sources() {
    let app = TestApp::new().await;
    assert_eq!(super::source(app.db()).await.unwrap(), "scryfall");
    assert_eq!(
        super::set_source(&app.state, "tcgplayer").await.unwrap(),
        super::PriceSource::Vendor(Vendor::TcgPlayer)
    );
    assert_eq!(super::source(app.db()).await.unwrap(), "tcgplayer");
    let error = super::set_source(&app.state, "ebay").await.unwrap_err();
    assert_eq!(error.to_string(), "source is invalid");
    assert_eq!(super::source(app.db()).await.unwrap(), "tcgplayer");
}

#[tokio::test]
async fn the_price_store_follows_the_source() {
    let app = TestApp::new().await;
    replace_vendor_prices(
        app.db(),
        Vendor::ManaPool,
        vec![row("print-1", Finish::Foil, 65_098)],
    )
    .await
    .unwrap();
    super::set_source(&app.state, "manapool").await.unwrap();
    // Exact finish first, then the rest of the chain.
    assert_eq!(
        app.state.prices.price_cents("print-1", &["foil"]),
        Some(65_098)
    );
    assert_eq!(
        app.state
            .prices
            .price_cents("print-1", &["nonfoil", "foil"]),
        Some(65_098)
    );
    // No vendor price: callers fall back to Scryfall.
    assert_eq!(app.state.prices.price_cents("print-2", &["nonfoil"]), None);
    super::set_source(&app.state, "scryfall").await.unwrap();
    assert_eq!(app.state.prices.price_cents("print-1", &["foil"]), None);
}

/// The store loads a vendor's prices in pages; a vendor with more rows than
/// one page (and rows sharing a scryfall id across the page boundary) loads
/// completely, and other vendors' rows stay out.
#[tokio::test]
async fn the_price_store_loads_every_page_of_a_large_vendor() {
    let app = TestApp::new().await;
    let finishes = [Finish::Nonfoil, Finish::Foil, Finish::Etched];
    let rows: Vec<VendorRow> = (0..15_001)
        .flat_map(|index| {
            finishes
                .into_iter()
                .map(move |finish| row(&format!("print-{index:06}"), finish, 100 + index))
        })
        .collect();
    assert!(rows.len() > 2 * 20_000);
    replace_vendor_prices(app.db(), Vendor::CardKingdom, rows)
        .await
        .unwrap();
    replace_vendor_prices(
        app.db(),
        Vendor::ManaPool,
        vec![row("print-x", Finish::Foil, 1)],
    )
    .await
    .unwrap();
    super::set_source(&app.state, "cardkingdom").await.unwrap();
    assert_eq!(app.state.prices.len(), 45_003);
    assert_eq!(
        app.state.prices.price_cents("print-006666", &["foil"]),
        Some(6_766)
    );
    assert_eq!(
        app.state.prices.price_cents("print-015000", &["etched"]),
        Some(15_100)
    );
    assert_eq!(app.state.prices.price_cents("print-x", &["foil"]), None);
}

struct Healthy;

#[async_trait]
impl VendorFeed for Healthy {
    fn vendor(&self) -> Vendor {
        Vendor::ManaPool
    }
    async fn fetch(&self, _state: &AppState) -> Result<Vec<VendorRow>, String> {
        Ok(vec![row("healthy", Finish::Nonfoil, 250)])
    }
}

struct Crashing;

#[async_trait]
impl VendorFeed for Crashing {
    fn vendor(&self) -> Vendor {
        Vendor::CardKingdom
    }
    #[allow(clippy::panic)]
    async fn fetch(&self, _state: &AppState) -> Result<Vec<VendorRow>, String> {
        panic!("Database busy")
    }
}

struct Empty;

#[async_trait]
impl VendorFeed for Empty {
    fn vendor(&self) -> Vendor {
        Vendor::TcgPlayer
    }
    async fn fetch(&self, _state: &AppState) -> Result<Vec<VendorRow>, String> {
        Ok(Vec::new())
    }
}

#[tokio::test]
async fn a_crashing_vendor_is_reported_and_later_vendors_still_sync() {
    let app = TestApp::new().await;
    replace_vendor_prices(
        app.db(),
        Vendor::TcgPlayer,
        vec![row("kept", Finish::Nonfoil, 1)],
    )
    .await
    .unwrap();
    super::set_source(&app.state, "manapool").await.unwrap();
    let results = run(
        &app.state,
        vec![Arc::new(Crashing), Arc::new(Empty), Arc::new(Healthy)],
    )
    .await;
    assert_eq!(
        results,
        vec![
            (Vendor::CardKingdom, Err("Database busy".to_owned())),
            (Vendor::TcgPlayer, Err("empty_feed".to_owned())),
            (Vendor::ManaPool, Ok(1)),
        ]
    );
    // An empty feed keeps the vendor's existing prices.
    assert_eq!(
        prices(&app).await,
        vec![
            (
                "manapool".to_owned(),
                "healthy".to_owned(),
                "nonfoil".to_owned(),
                250
            ),
            (
                "tcgplayer".to_owned(),
                "kept".to_owned(),
                "nonfoil".to_owned(),
                1
            ),
        ]
    );
    // The store was refreshed after the run.
    assert_eq!(
        app.state.prices.price_cents("healthy", &["nonfoil"]),
        Some(250)
    );
}

#[tokio::test]
async fn periodic_jobs_skip_vendors_with_fresh_prices() {
    let app = TestApp::new().await;
    assert_eq!(
        stale_vendors(&app.state).await.unwrap(),
        Vendor::ALL.to_vec()
    );
    for (index, vendor) in Vendor::ALL.into_iter().enumerate() {
        replace_vendor_prices(
            app.db(),
            vendor,
            vec![row(&format!("fresh-{index}"), Finish::Nonfoil, 100)],
        )
        .await
        .unwrap();
    }
    assert_eq!(stale_vendors(&app.state).await.unwrap().len(), 0);
    let job = Job {
        id: 1,
        worker: NAME.to_owned(),
        args: json!({}),
        attempt: 1,
        max_attempts: 3,
    };
    assert!(matches!(
        VendorSyncWorker.perform(&app.state, &job).await,
        Outcome::Done
    ));

    // Card Kingdom refreshes every six hours, TCGplayer daily.
    let seven_hours_ago = crate::timefmt::utc_micros(
        time::OffsetDateTime::now_utc() - std::time::Duration::from_secs(7 * 3600),
    );
    sqlx::query(
        "UPDATE vendor_prices SET updated_at = ?1 WHERE vendor IN ('cardkingdom', 'tcgplayer')",
    )
    .bind(seven_hours_ago)
    .execute(app.db())
    .await
    .unwrap();
    assert_eq!(
        stale_vendors(&app.state).await.unwrap(),
        vec![Vendor::CardKingdom]
    );
}

// ---- GraphQL ----

#[tokio::test]
async fn pricing_settings_lists_sources_and_vendor_statuses() {
    let app = TestApp::new().await;
    replace_vendor_prices(
        app.db(),
        Vendor::CardKingdom,
        vec![row("a", Finish::Nonfoil, 1), row("b", Finish::Foil, 2)],
    )
    .await
    .unwrap();
    let data = app
        .gql_data(
            "{ pricingSettings { source sources vendors { vendor priceCount lastSyncedAt } } }",
            json!({}),
        )
        .await;
    let settings = &data["pricingSettings"];
    assert_eq!(settings["source"], "scryfall");
    assert_eq!(
        settings["sources"],
        json!(["scryfall", "tcgplayer", "cardkingdom", "manapool"])
    );
    let vendors = settings["vendors"].as_array().unwrap();
    assert_eq!(vendors.len(), 3);
    assert_eq!(
        vendors[0],
        json!({"vendor": "tcgplayer", "priceCount": 0, "lastSyncedAt": null})
    );
    assert_eq!(vendors[1]["vendor"], "cardkingdom");
    assert_eq!(vendors[1]["priceCount"], 2);
    let synced = vendors[1]["lastSyncedAt"].as_str().unwrap();
    assert!(crate::timefmt::parse(synced).is_some());
    assert_eq!(synced.len(), "2026-10-07T07:30:43.123456Z".len());
    assert_eq!(vendors[2]["vendor"], "manapool");
}

#[tokio::test]
async fn update_pricing_settings_changes_the_source_or_reports_the_changeset_error() {
    let app = TestApp::new().await;
    let data = app
        .gql_data(
            r#"mutation { updatePricingSettings(source: "manapool") { pricingSettings { source } } }"#,
            json!({}),
        )
        .await;
    assert_eq!(
        data["updatePricingSettings"]["pricingSettings"]["source"],
        "manapool"
    );
    assert_eq!(
        app.state.prices.active_source().as_deref(),
        Some("manapool")
    );

    let response = app
        .gql(
            r#"mutation { updatePricingSettings(source: "ebay") { pricingSettings { source } } }"#,
            json!({}),
        )
        .await;
    assert_eq!(response["errors"][0]["message"], "source is invalid");
    assert_eq!(response["data"]["updatePricingSettings"], json!(null));
}

#[tokio::test]
async fn sync_vendor_prices_queues_one_forced_job() {
    let app = TestApp::new().await;
    for _ in 0..2 {
        let data = app
            .gql_data(
                "mutation { syncVendorPrices { pricingSettings { source } } }",
                json!({}),
            )
            .await;
        assert_eq!(
            data["syncVendorPrices"]["pricingSettings"]["source"],
            "scryfall"
        );
    }
    let jobs: Vec<(String, String, String)> =
        sqlx::query_as("SELECT worker, queue, args FROM oban_jobs")
            .fetch_all(app.db())
            .await
            .unwrap();
    assert_eq!(
        jobs,
        vec![(
            NAME.to_owned(),
            "pricing".to_owned(),
            r#"{"force":true}"#.to_owned()
        )]
    );
}
