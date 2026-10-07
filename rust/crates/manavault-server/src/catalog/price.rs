//! Card prices: finish fallback, cents parsing, and display text
//! (`Manavault.Catalog.Price`), plus the SQL price expressions
//! (`Manavault.Catalog.PriceFragments`).
//!
//! In-memory prices and SQL prices share one fallback order
//! ([`finish_fallbacks`] / [`usd_fallback_keys`]), so filters, sorts, and
//! displayed prices agree.

use serde_json::Value;

use crate::catalog::json;
use crate::catalog::printing::PrintingRecord;
use crate::pricing::PriceStore;

/// Ordered printing finishes to try for a current price.
#[must_use]
pub fn finish_fallbacks(finish: Option<&str>) -> &'static [&'static str] {
    match finish {
        Some("foil") => &["foil", "nonfoil"],
        Some("etched") => &["etched", "foil", "nonfoil"],
        _ => &["nonfoil", "foil", "etched"],
    }
}

/// Ordered Scryfall `prices` keys to try for a USD price, given a finish.
#[must_use]
pub fn usd_fallback_keys(finish: Option<&str>) -> Vec<String> {
    finish_fallbacks(finish)
        .iter()
        .map(|finish| match *finish {
            "nonfoil" => "usd".to_owned(),
            other => format!("usd_{other}"),
        })
        .collect()
}

/// The price in cents for a printing: the active vendor source's price, or
/// Scryfall's (`Price.price_cents_for_printing/2`).
#[must_use]
pub fn price_cents_for_printing(
    prices: &PriceStore,
    printing: &PrintingRecord,
    finish: Option<&str>,
) -> Option<i64> {
    prices
        .price_cents(printing.scryfall_id.as_str(), finish_fallbacks(finish))
        .or_else(|| scryfall_price_cents(&printing.prices, finish))
}

/// The Scryfall price in cents from a printing's `prices` JSON text.
#[must_use]
pub fn scryfall_price_cents(prices_json: &str, finish: Option<&str>) -> Option<i64> {
    let prices = json::object(prices_json);
    let text = usd_fallback_keys(finish)
        .into_iter()
        .find_map(|key| match prices.get(&key) {
            Some(Value::String(value)) if !value.is_empty() => Some(value.clone()),
            _ => None,
        })?;
    parse_cents(&text)
}

/// Parses a dollar amount such as `"$1,234.50"` into cents
/// (`Price.parse_cents/1` for strings).
#[must_use]
pub fn parse_cents(price: &str) -> Option<i64> {
    let normalized = price.trim().replace(',', "");
    let normalized = normalized.trim_start_matches('$');
    let (dollars, cents) = match normalized.split_once('.') {
        Some((dollars, cents)) => (dollars, Some(cents)),
        None => (normalized, None),
    };
    if dollars.is_empty() || !dollars.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let dollars: i64 = dollars.parse().ok()?;
    let cents = match cents {
        None => 0,
        Some(cents)
            if (1..=2).contains(&cents.len()) && cents.bytes().all(|b| b.is_ascii_digit()) =>
        {
            format!("{cents:0<2}").parse::<i64>().ok()?
        }
        Some(_) => return None,
    };
    dollars.checked_mul(100)?.checked_add(cents)
}

/// Rounds to one decimal place, half away from zero (`Float.round(value, 1)`).
fn round_tenths(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

/// Formats cents for display: `$0.99`, `$123`, `$12.3k` (`Price.format_cents/1`).
#[must_use]
pub fn format_cents(cents: Option<i64>) -> Option<String> {
    let cents = cents?;
    if cents > 999_999 {
        let thousands = round_tenths(cents_to_f64(cents) / 100.0 / 1_000.0);
        let text = if thousands.fract() == 0.0 {
            format!("{thousands:.0}")
        } else {
            format!("{thousands:.1}")
        };
        return Some(format!("${text}k"));
    }
    if cents >= 10_000 {
        return Some(format!("${}", cents / 100));
    }
    let dollars = cents / 100;
    let remainder = cents % 100;
    if remainder == 0 {
        Some(format!("${dollars}"))
    } else {
        Some(format!("${dollars}.{remainder:0>2}"))
    }
}

fn cents_to_f64(cents: i64) -> f64 {
    // Prices are far below 2^53 cents, so the conversion is exact.
    let clamped = i32::try_from(cents / 1_000).unwrap_or(i32::MAX);
    let rest = i32::try_from(cents % 1_000).unwrap_or(0);
    f64::from(clamped) * 1_000.0 + f64::from(rest)
}

/// `+$4.68` / `-$4.68` / `$0` (`Price.format_signed_cents/1`).
#[must_use]
pub fn format_signed_cents(cents: Option<i64>) -> Option<String> {
    let cents = cents?;
    Some(match cents {
        0 => "$0".to_owned(),
        positive if positive > 0 => format!("+{}", format_cents(Some(positive))?),
        negative => format!("-{}", format_cents(Some(negative.checked_abs()?))?),
    })
}

/// SQL for the vendor-price subquery of the printing aliased `printing`,
/// ordered by the finish fallback of `finish_sql` (a SQL expression).
fn vendor_order_sql(finishes: &[&str]) -> String {
    let cases: Vec<String> = finishes
        .iter()
        .zip(1..)
        .map(|(finish, priority)| format!("WHEN '{finish}' THEN {priority}"))
        .collect();
    format!(
        "CASE vendor_price.finish {} ELSE {} END",
        cases.join(" "),
        finishes.len() + 1
    )
}

fn coalesce_sql(printing: &str, keys: &[String]) -> String {
    let parts: Vec<String> = keys
        .iter()
        .map(|key| format!("json_extract({printing}.prices, '$.{key}')"))
        .collect();
    format!("COALESCE({})", parts.join(", "))
}

fn finish_list_sql(finishes: &[&str]) -> String {
    let quoted: Vec<String> = finishes
        .iter()
        .map(|finish| format!("'{finish}'"))
        .collect();
    format!("vendor_price.finish IN ({})", quoted.join(", "))
}

fn vendor_price_sql(printing: &str, finish_filter: &str, order: &str) -> String {
    format!(
        "SELECT vendor_price.price_cents / 100.0 FROM vendor_prices AS vendor_price \
         WHERE vendor_price.vendor = (SELECT pricing_setting.source FROM pricing_settings AS pricing_setting WHERE pricing_setting.id = 1) \
           AND vendor_price.scryfall_id = {printing}.scryfall_id \
           AND {finish_filter} \
         ORDER BY {order} LIMIT 1"
    )
}

/// Finish-agnostic current USD price (REAL) of the printing aliased
/// `printing`, in the default fallback order (`price_fragment/1`).
#[must_use]
pub fn price_sql(printing: &str) -> String {
    let chain = finish_fallbacks(None);
    format!(
        "COALESCE(({}), CAST(COALESCE(NULLIF({}, ''), '0') AS REAL))",
        vendor_price_sql(printing, &finish_list_sql(chain), &vendor_order_sql(chain)),
        coalesce_sql(printing, &usd_fallback_keys(None))
    )
}

/// Finish-aware current USD price (REAL) of the printing aliased `printing`
/// for the finish SQL expression `finish` (`price_value_fragment/2`).
///
/// Elixir bug: the vendor subquery accepted any vendor finish and only
/// ordered by the fallback chain, so a foil item with only an etched vendor
/// price used the etched price in SQL (filters, sorts, totals) while the
/// in-memory price (`Pricing.Store`) found none and fell back to Scryfall.
/// Here the subquery is limited to the finish's fallback chain, matching the
/// in-memory price.
#[must_use]
pub fn price_value_sql(printing: &str, finish: &str) -> String {
    let order = format!(
        "CASE {finish} WHEN 'foil' THEN {} WHEN 'etched' THEN {} ELSE {} END",
        vendor_order_sql(finish_fallbacks(Some("foil"))),
        vendor_order_sql(finish_fallbacks(Some("etched"))),
        vendor_order_sql(finish_fallbacks(None))
    );
    let filter = format!(
        "CASE {finish} WHEN 'foil' THEN {} WHEN 'etched' THEN {} ELSE {} END",
        finish_list_sql(finish_fallbacks(Some("foil"))),
        finish_list_sql(finish_fallbacks(Some("etched"))),
        finish_list_sql(finish_fallbacks(None))
    );
    format!(
        "COALESCE(({}), CAST(COALESCE(NULLIF(CASE {finish} WHEN 'foil' THEN {} WHEN 'etched' THEN {} ELSE {} END, ''), '0') AS REAL))",
        vendor_price_sql(printing, &filter, &order),
        coalesce_sql(printing, &usd_fallback_keys(Some("foil"))),
        coalesce_sql(printing, &usd_fallback_keys(Some("etched"))),
        coalesce_sql(printing, &usd_fallback_keys(None)),
    )
}

/// Finish-aware price in integer cents (`price_cents_fragment/2`).
#[must_use]
pub fn price_cents_sql(printing: &str, finish: &str) -> String {
    format!(
        "CAST(round({} * 100) AS INTEGER)",
        price_value_sql(printing, finish)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_and_parses_like_elixir() {
        assert_eq!(format_cents(Some(99)).as_deref(), Some("$0.99"));
        assert_eq!(format_cents(Some(105)).as_deref(), Some("$1.05"));
        assert_eq!(format_cents(Some(1_200)).as_deref(), Some("$12"));
        assert_eq!(format_cents(Some(12_345)).as_deref(), Some("$123"));
        assert_eq!(format_cents(Some(240_000)).as_deref(), Some("$2400"));
        assert_eq!(format_cents(Some(1_000_000)).as_deref(), Some("$10k"));
        assert_eq!(format_cents(Some(1_234_567)).as_deref(), Some("$12.3k"));
        assert_eq!(format_cents(Some(10_000_000)).as_deref(), Some("$100k"));
        assert_eq!(format_cents(None), None);
        assert_eq!(parse_cents("$1,234.50"), Some(123_450));
        assert_eq!(parse_cents(" 12.3 "), Some(1_230));
        assert_eq!(parse_cents("12"), Some(1_200));
        assert_eq!(parse_cents("12.345"), None);
        assert_eq!(parse_cents("abc"), None);
        assert_eq!(parse_cents("-1.00"), None);
        assert_eq!(format_signed_cents(Some(468)).as_deref(), Some("+$4.68"));
        assert_eq!(format_signed_cents(Some(-468)).as_deref(), Some("-$4.68"));
        assert_eq!(format_signed_cents(Some(0)).as_deref(), Some("$0"));
    }

    #[test]
    fn finish_fallback_prefers_the_finish_then_cheaper_ones() {
        let prices = r#"{"usd": "12.34", "usd_foil": "24.00"}"#;
        assert_eq!(scryfall_price_cents(prices, Some("nonfoil")), Some(1_234));
        assert_eq!(scryfall_price_cents(prices, Some("foil")), Some(2_400));
        assert_eq!(scryfall_price_cents(prices, Some("etched")), Some(2_400));
        assert_eq!(
            scryfall_price_cents(r#"{"usd_foil": "2.00"}"#, None),
            Some(200)
        );
        assert_eq!(
            scryfall_price_cents(r#"{"usd_etched": "3.00"}"#, Some("foil")),
            None
        );
        assert_eq!(scryfall_price_cents(r#"{"usd": ""}"#, None), None);
        assert_eq!(
            usd_fallback_keys(Some("etched")),
            ["usd_etched", "usd_foil", "usd"]
        );
    }
}
