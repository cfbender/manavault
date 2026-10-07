//! Price fallback consistency for cards, and the price helpers.

use lotus::ScryfallId;
use serde_json::json;

use crate::catalog::price;
use crate::catalog::printing::Printing;
use crate::catalog::search::cards::{SearchOptions, search_cards};
use crate::test_app::TestApp;

const FINISHES: [&str; 3] = ["nonfoil", "foil", "etched"];

fn probe(index: usize, prices: serde_json::Value) -> serde_json::Value {
    let mut card = json!({
        "id": format!("scryfall-printing-price-{index}"),
        "oracle_id": format!("oracle-price-{index}"),
        "name": format!("Price Probe {index}"),
        "type_line": "Artifact", "cmc": 0.0, "colors": [], "color_identity": [],
        "set": "tst", "set_name": "Test Set", "collector_number": format!("{index}"),
        "lang": "en", "rarity": "rare", "finishes": FINISHES,
        "released_at": "2026-01-01"
    });
    card["prices"] = prices;
    card
}

async fn sql_cents(app: &TestApp, scryfall_id: &str, finish: &str) -> i64 {
    let sql = format!(
        "SELECT {} FROM scryfall_printings AS p WHERE p.scryfall_id = ?2",
        price::price_cents_sql("p", "?1")
    );
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(finish)
        .bind(scryfall_id)
        .fetch_one(app.db())
        .await
        .unwrap()
}

/// The same price with the finish read from a column of the outer query,
/// as collection and deck card queries pass it (`i.finish`).
async fn sql_cents_for_column(app: &TestApp, scryfall_id: &str, finish: &str) -> i64 {
    sqlx::query("CREATE TABLE IF NOT EXISTS finish_probe (scryfall_id TEXT, finish TEXT)")
        .execute(app.db())
        .await
        .unwrap();
    sqlx::query("DELETE FROM finish_probe")
        .execute(app.db())
        .await
        .unwrap();
    sqlx::query("INSERT INTO finish_probe (scryfall_id, finish) VALUES (?1, ?2)")
        .bind(scryfall_id)
        .bind(finish)
        .execute(app.db())
        .await
        .unwrap();
    let sql = format!(
        "SELECT {} FROM finish_probe AS i JOIN scryfall_printings AS p ON p.scryfall_id = i.scryfall_id",
        price::price_cents_sql("p", "i.finish")
    );
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .fetch_one(app.db())
        .await
        .unwrap()
}

async fn assert_consistent(app: &TestApp, ids: &[String]) {
    for id in ids {
        let printing = Printing::load(app.db(), &ScryfallId::from(id.as_str()))
            .await
            .unwrap()
            .unwrap();
        for finish in FINISHES {
            let in_memory = printing
                .price_cents_for(&app.state.prices, Some(finish))
                .unwrap_or(0);
            assert_eq!(
                sql_cents(app, id, finish).await,
                in_memory,
                "finish {finish} with prices {}",
                printing.prices
            );
            assert_eq!(
                sql_cents_for_column(app, id, finish).await,
                in_memory,
                "column finish {finish} with prices {}",
                printing.prices
            );
        }
    }
}

#[tokio::test]
async fn sql_price_agrees_with_in_memory_fallback_for_every_finish() {
    let app = TestApp::new().await;
    let variants = [
        json!({"usd": "1.00", "usd_foil": "2.00", "usd_etched": "3.00"}),
        json!({"usd": "1.00", "usd_foil": "2.00"}),
        json!({"usd_foil": "2.00"}),
        json!({"usd_etched": "3.00"}),
        json!({"usd": "1.00"}),
        json!({}),
    ];
    let cards: Vec<_> = variants
        .into_iter()
        .enumerate()
        .map(|(index, prices)| probe(index + 1, prices))
        .collect();
    app.import_cards(&cards).await;
    let ids: Vec<String> = (1..=6)
        .map(|index| format!("scryfall-printing-price-{index}"))
        .collect();
    assert_consistent(&app, &ids).await;

    // The same with a vendor source that prices only some finishes.
    sqlx::query(
        "INSERT INTO pricing_settings (id, source, inserted_at, updated_at) VALUES (1, 'tcgplayer', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
         ON CONFLICT (id) DO UPDATE SET source = excluded.source",
    )
    .execute(app.db())
    .await
    .unwrap();
    for (id, finish, cents) in [
        ("scryfall-printing-price-1", "foil", 2_500),
        ("scryfall-printing-price-2", "nonfoil", 150),
        ("scryfall-printing-price-4", "etched", 900),
    ] {
        sqlx::query("INSERT INTO vendor_prices (vendor, scryfall_id, finish, price_cents, inserted_at, updated_at) VALUES ('tcgplayer', ?1, ?2, ?3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
            .bind(id)
            .bind(finish)
            .bind(cents)
            .execute(app.db())
            .await
            .unwrap();
    }
    app.state.prices.refresh(app.db()).await.unwrap();
    assert_consistent(&app, &ids).await;
}

#[tokio::test]
async fn card_price_filters_use_the_selected_vendor_price() {
    let app = TestApp::new().await;
    app.import_cards(&[
        probe(1, json!({"usd": "30.00"})),
        probe(2, json!({"usd": "1.00"})),
    ])
    .await;
    let names = |term: &'static str| {
        let pool = app.db().clone();
        async move {
            search_cards(&pool, term, SearchOptions::default())
                .await
                .unwrap()
                .iter()
                .map(|card| card.name.clone())
                .collect::<Vec<_>>()
        }
    };
    assert_eq!(names("usd>=15").await, ["Price Probe 1"]);
    sqlx::query("INSERT INTO pricing_settings (id, source, inserted_at, updated_at) VALUES (1, 'tcgplayer', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
        .execute(app.db())
        .await
        .unwrap();
    for (id, cents) in [
        ("scryfall-printing-price-1", 1_000),
        ("scryfall-printing-price-2", 2_000),
    ] {
        sqlx::query("INSERT INTO vendor_prices (vendor, scryfall_id, finish, price_cents, inserted_at, updated_at) VALUES ('tcgplayer', ?1, 'nonfoil', ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
            .bind(id)
            .bind(cents)
            .execute(app.db())
            .await
            .unwrap();
    }
    assert_eq!(names("usd>=15").await, ["Price Probe 2"]);
    assert_eq!(names("usd<15").await, ["Price Probe 1"]);
}

#[test]
fn price_text_shortens_prices() {
    let prices = r#"{"usd": "12.34", "usd_foil": "24.00"}"#;
    assert_eq!(
        price::format_cents(price::scryfall_price_cents(prices, Some("nonfoil"))).as_deref(),
        Some("$12.34")
    );
    assert_eq!(
        price::format_cents(price::scryfall_price_cents(prices, Some("foil"))).as_deref(),
        Some("$24")
    );
}
