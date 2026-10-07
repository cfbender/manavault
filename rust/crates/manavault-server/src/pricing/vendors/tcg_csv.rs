//! `TCGplayer` prices via tcgcsv.com (`Manavault.Pricing.Vendors.TcgCsv`):
//! free, no auth, refreshed daily around 20:00 UTC.
//!
//! `TCGplayer`'s own API is closed to new developers; tcgcsv republishes its
//! per-group (set) pricing. Each price row is keyed by `TCGplayer` product id
//! and finish subtype, so rows join to printings through the `tcgplayer_id`
//! and `tcgplayer_etched_id` Scryfall supplies at catalog import. Prices use
//! `TCGplayer`'s low price (TCG Low), falling back to the market price.
//! Individual group failures are skipped so one bad set cannot lose a whole
//! sync.

use std::collections::HashMap;
use std::time::Duration;

use async_trait::async_trait;
use lotus::Finish;
use serde_json::Value;
use sqlx::SqlitePool;

use super::{Vendor, VendorFeed, VendorRow, get};
use crate::pricing::money;
use crate::state::AppState;

pub const BASE_URL: &str = "https://tcgcsv.com/tcgplayer/1";
/// tcgcsv asks scrapers to pace requests; ~450 Magic groups take about two
/// minutes at this rate.
pub const REQUEST_DELAY: Duration = Duration::from_millis(250);

/// Printings by `TCGplayer` product id: `(scryfall_id, etched?)`. Several
/// printings can share a product, and etched printings have their own.
pub type ProductPrintings = HashMap<i64, Vec<(String, bool)>>;

pub struct TcgCsv {
    pub base_url: String,
    pub request_delay: Duration,
}

async fn get_json(state: &AppState, url: &str) -> Result<Value, String> {
    let (status, body) = get(state, url, Duration::from_secs(120)).await?;
    if status != reqwest::StatusCode::OK {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    serde_json::from_slice::<Value>(&body)
        .ok()
        .filter(Value::is_object)
        .ok_or_else(|| format!("HTTP {}", status.as_u16()))
}

#[async_trait]
impl VendorFeed for TcgCsv {
    fn vendor(&self) -> Vendor {
        Vendor::TcgPlayer
    }

    async fn fetch(&self, state: &AppState) -> Result<Vec<VendorRow>, String> {
        let groups = get_json(state, &format!("{}/groups", self.base_url)).await?;
        let Some(groups) = groups.get("results").and_then(Value::as_array) else {
            return Err("tcgcsv returned an unexpected groups payload".to_owned());
        };
        let printings = product_printings(&state.db)
            .await
            .map_err(|error| error.to_string())?;
        let mut rows_out = Vec::new();
        for group_id in groups
            .iter()
            .filter_map(|group| group.get("groupId"))
            .filter(|id| !id.is_null())
        {
            let group_id = group_id
                .as_str()
                .map_or_else(|| group_id.to_string(), str::to_owned);
            tokio::time::sleep(self.request_delay).await;
            match get_json(state, &format!("{}/{group_id}/prices", self.base_url)).await {
                Ok(body) => match body.get("results") {
                    Some(prices) => rows_out.extend(rows(prices, &printings)),
                    None => {
                        tracing::warn!(
                            "tcgcsv group {group_id} skipped: unexpected prices payload"
                        );
                    }
                },
                Err(error) => tracing::warn!("tcgcsv group {group_id} skipped: {error:?}"),
            }
        }
        Ok(rows_out)
    }
}

/// Every printing with a `TCGplayer` product id.
pub async fn product_printings(pool: &SqlitePool) -> Result<ProductPrintings, sqlx::Error> {
    let mut printings: ProductPrintings = HashMap::new();
    for row in sqlx::query!(
        r#"SELECT scryfall_id AS "scryfall_id!", tcgplayer_id, tcgplayer_etched_id FROM scryfall_printings
           WHERE tcgplayer_id IS NOT NULL OR tcgplayer_etched_id IS NOT NULL"#
    )
    .fetch_all(pool)
    .await?
    {
        if let Some(id) = row.tcgplayer_id {
            printings
                .entry(id)
                .or_default()
                .push((row.scryfall_id.clone(), false));
        }
        if let Some(id) = row.tcgplayer_etched_id {
            printings.entry(id).or_default().push((row.scryfall_id, true));
        }
    }
    Ok(printings)
}

/// Maps a group's price rows to printing finishes. Products matched through
/// an etched id price the etched finish; otherwise `Foil` subtypes price
/// foil and `Normal` prices nonfoil. Rows without a low or market price, or
/// whose product has no printing, are skipped.
#[must_use]
pub fn rows(prices: &Value, printings: &ProductPrintings) -> Vec<VendorRow> {
    let Some(prices) = prices.as_array() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for price in prices {
        let Some(product_id) = price.get("productId").and_then(Value::as_i64) else {
            continue;
        };
        let null = Value::Null;
        let Some(cents) = money::to_cents(price.get("lowPrice").unwrap_or(&null))
            .or_else(|| money::to_cents(price.get("marketPrice").unwrap_or(&null)))
        else {
            continue;
        };
        for (scryfall_id, etched) in printings.get(&product_id).into_iter().flatten() {
            out.push(VendorRow::new(
                scryfall_id,
                finish(price.get("subTypeName"), *etched),
                cents,
            ));
        }
    }
    out
}

fn finish(subtype: Option<&Value>, etched: bool) -> Finish {
    if etched {
        return Finish::Etched;
    }
    let subtype = match subtype {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(text)) => text.to_lowercase(),
        Some(other) => other.to_string().to_lowercase(),
    };
    if subtype.contains("etched") {
        Finish::Etched
    } else if subtype.contains("foil") {
        Finish::Foil
    } else {
        Finish::Nonfoil
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;
    use crate::test_support::{TestApp, fixtures};

    #[allow(clippy::needless_pass_by_value)]
    fn price(product: i64, subtype: &str, low: Value, market: Value) -> Value {
        json!({"productId": product, "subTypeName": subtype, "lowPrice": low, "marketPrice": market})
    }

    #[test]
    fn prices_finishes_with_the_tcg_low_falling_back_to_market() {
        let printings: ProductPrintings = HashMap::from([
            (1, vec![("aaa".to_owned(), false)]),
            (
                2,
                vec![("bbb".to_owned(), false), ("bbb-promo".to_owned(), false)],
            ),
            (3, vec![("ccc".to_owned(), true)]),
            (4, vec![("ddd".to_owned(), false)]),
        ]);
        let prices = json!([
            price(1, "Normal", json!(0.25), json!(0.35)),
            price(1, "Foil", Value::Null, json!(1.5)),
            price(2, "Normal", json!(3.0), json!(4.0)),
            price(3, "Foil", json!(9.57), json!(12.0)),
            price(4, "Foil Etched", json!(5.0), Value::Null),
        ]);
        let mut rows = rows(&prices, &printings);
        rows.sort();
        assert_eq!(
            rows,
            vec![
                VendorRow::new("aaa", Finish::Nonfoil, 25),
                VendorRow::new("aaa", Finish::Foil, 150),
                VendorRow::new("bbb", Finish::Nonfoil, 300),
                VendorRow::new("bbb-promo", Finish::Nonfoil, 300),
                VendorRow::new("ccc", Finish::Etched, 957),
                VendorRow::new("ddd", Finish::Etched, 500),
            ]
        );
    }

    #[test]
    fn skips_unmatched_products_rows_without_prices_and_odd_payloads() {
        let printings = HashMap::from([(1, vec![("aaa".to_owned(), false)])]);
        let prices = json!([
            price(1, "Normal", Value::Null, Value::Null),
            price(99, "Normal", json!(1.0), json!(1.0))
        ]);
        assert_eq!(rows(&prices, &printings).len(), 0);
        assert_eq!(rows(&Value::Null, &HashMap::new()).len(), 0);
    }

    #[tokio::test]
    async fn fetch_joins_every_groups_prices_to_printings() {
        let app = TestApp::new().await;
        app.import_cards(&[fixtures::card(json!({"tcgplayer_id": 101})), {
            let mut walk = fixtures::time_walk();
            walk["tcgplayer_id"] = json!(201);
            walk["tcgplayer_etched_id"] = json!(202);
            walk
        }])
        .await;
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/tcgplayer/1/groups"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({"results": [{"groupId": 1}, {"groupId": 2}]})),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/tcgplayer/1/1/prices"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                json!({"results": [price(101, "Normal", json!(9000.0), json!(9500.0))]}),
            ))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/tcgplayer/1/2/prices"))
            .respond_with(ResponseTemplate::new(500).set_body_json(json!({"success": false})))
            .mount(&server)
            .await;
        let feed = TcgCsv {
            base_url: format!("{}/tcgplayer/1", server.uri()),
            request_delay: Duration::ZERO,
        };
        assert_eq!(
            feed.fetch(&app.state).await,
            Ok(vec![VendorRow::new(
                "scryfall-printing-1",
                Finish::Nonfoil,
                900_000
            )])
        );
        assert_eq!(
            product_printings(app.db()).await.unwrap(),
            HashMap::from([
                (101, vec![("scryfall-printing-1".to_owned(), false)]),
                (201, vec![("scryfall-printing-2".to_owned(), false)]),
                (202, vec![("scryfall-printing-2".to_owned(), true)]),
            ])
        );
    }
}
