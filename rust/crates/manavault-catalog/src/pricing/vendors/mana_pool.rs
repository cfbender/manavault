//! `ManaPool`'s public singles price feed
//! (`Manavault.Pricing.Vendors.ManaPool`). Each printing and finish uses the
//! lowest near-mint listing, falling back to the lowest
//! lightly-played-or-better listing and then the lowest listing of any
//! condition. Listing prices are keyed per finish, so nonfoil, foil, and
//! etched never share a price.

use std::time::Duration;

use async_trait::async_trait;
use lotus::Finish;
use serde_json::Value;

use super::{Vendor, VendorFeed, VendorRow, get};
use crate::state::AppState;

pub const PRICES_URL: &str = "https://manapool.com/api/v1/prices/singles";

const LISTING_PRICES: [(Finish, [&str; 3]); 3] = [
    (
        Finish::Nonfoil,
        ["price_cents_nm", "price_cents_lp_plus", "price_cents"],
    ),
    (
        Finish::Foil,
        [
            "price_cents_nm_foil",
            "price_cents_lp_plus_foil",
            "price_cents_foil",
        ],
    ),
    (
        Finish::Etched,
        [
            "price_cents_nm_etched",
            "price_cents_lp_plus_etched",
            "price_cents_etched",
        ],
    ),
];

pub struct ManaPool {
    pub url: String,
}

#[async_trait]
impl VendorFeed for ManaPool {
    fn vendor(&self) -> Vendor {
        Vendor::ManaPool
    }

    async fn fetch(&self, state: &AppState) -> Result<Vec<VendorRow>, String> {
        let (status, body) = get(state, &self.url, Duration::from_secs(300)).await?;
        if status != reqwest::StatusCode::OK {
            return Err(format!("ManaPool returned HTTP {}", status.as_u16()));
        }
        Ok(serde_json::from_slice::<Value>(&body)
            .map(|body| rows(&body))
            .unwrap_or_default())
    }
}

fn first_price(variant: &Value, fields: &[&str]) -> Option<i64> {
    fields.iter().find_map(|field| {
        variant
            .get(*field)
            .and_then(Value::as_i64)
            .filter(|cents| *cents > 0)
    })
}

/// Maps the feed into listing rows; market prices are never used.
#[must_use]
pub fn rows(body: &Value) -> Vec<VendorRow> {
    let Some(variants) = body.get("data").and_then(Value::as_array) else {
        return Vec::new();
    };
    variants
        .iter()
        .filter_map(|variant| {
            let id = variant
                .get("scryfall_id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())?;
            Some(LISTING_PRICES.iter().filter_map(move |(finish, fields)| {
                first_price(variant, fields).map(|cents| VendorRow::new(id, *finish, cents))
            }))
        })
        .flatten()
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;
    use crate::test_support::TestApp;

    #[test]
    fn uses_the_lowest_near_mint_listing_for_each_finish() {
        let body = json!({"data": [{
            "scryfall_id": "aaa", "price_market": 500, "price_market_foil": 750,
            "price_cents": 410, "price_cents_lp_plus": 450, "price_cents_nm": 525,
            "price_cents_foil": 600, "price_cents_lp_plus_foil": 700, "price_cents_nm_foil": 790,
            "price_cents_etched": 850, "price_cents_lp_plus_etched": 875, "price_cents_nm_etched": 900
        }]});
        assert_eq!(
            rows(&body),
            vec![
                VendorRow::new("aaa", Finish::Nonfoil, 525),
                VendorRow::new("aaa", Finish::Foil, 790),
                VendorRow::new("aaa", Finish::Etched, 900),
            ]
        );
    }

    #[test]
    fn falls_back_per_finish_and_never_borrows_another_finish() {
        let body = json!({"data": [
            {"scryfall_id": "aaa", "price_market": 999, "price_cents": 147, "price_cents_lp_plus": 290,
             "price_cents_nm": null, "price_cents_foil": 310, "price_cents_lp_plus_foil": null, "price_cents_nm_foil": null},
            {"scryfall_id": "foil-only", "price_market": 8595, "price_market_foil": 20955, "price_cents_nm_foil": 43000},
            {"scryfall_id": "nonfoil-only", "price_market_foil": 300, "price_cents_nm": 200}
        ]});
        assert_eq!(
            rows(&body),
            vec![
                VendorRow::new("aaa", Finish::Nonfoil, 290),
                VendorRow::new("aaa", Finish::Foil, 310),
                VendorRow::new("foil-only", Finish::Foil, 43_000),
                VendorRow::new("nonfoil-only", Finish::Nonfoil, 200),
            ]
        );
    }

    #[test]
    fn skips_missing_and_invalid_listing_prices() {
        let body = json!({"data": [
            {"scryfall_id": "aaa", "price_market": 500, "price_market_foil": 750},
            {"scryfall_id": "bbb", "price_cents_nm": 0, "price_cents_foil": -100},
            {"scryfall_id": "ccc", "price_cents_nm": "12.00"},
            {"scryfall_id": "ddd", "price_cents_nm": 12.5},
            {"scryfall_id": "", "price_cents_nm": 200},
            {"scryfall_id": "ddd", "low_price": 400},
            {"scryfall_id": "aaa"}
        ]});
        assert_eq!(rows(&body).len(), 0);
        assert_eq!(rows(&json!({})).len(), 0);
        assert_eq!(rows(&json!([1, 2])).len(), 0);
    }

    #[tokio::test]
    async fn fetch_maps_the_feed_into_listing_rows() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": [{
                "scryfall_id": "aaa", "price_market": 8595, "price_cents_lp_plus": 7000, "price_cents_nm_foil": 43000
            }]})))
            .mount(&server)
            .await;
        let app = TestApp::new().await;
        let feed = ManaPool { url: server.uri() };
        assert_eq!(
            feed.fetch(&app.state).await,
            Ok(vec![
                VendorRow::new("aaa", Finish::Nonfoil, 7000),
                VendorRow::new("aaa", Finish::Foil, 43_000),
            ])
        );
        let failing = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&failing)
            .await;
        let feed = ManaPool { url: failing.uri() };
        assert_eq!(
            feed.fetch(&app.state).await,
            Err("ManaPool returned HTTP 503".to_owned())
        );
    }
}
