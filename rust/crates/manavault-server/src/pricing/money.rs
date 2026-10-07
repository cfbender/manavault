//! Vendor price values in cents (`Manavault.Pricing.Money`).

use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

static DECIMAL: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"^\s*(\d+)(?:\.(\d{1,2}))?\s*$").ok());

/// The largest dollar amount accepted, far above any card price; keeps the
/// float conversion exact.
const MAX_DOLLARS: f64 = 1.0e12;

fn positive(cents: i64) -> Option<i64> {
    (cents > 0).then_some(cents)
}

/// Converts a vendor price value (decimal dollar string, float, or integer
/// dollars) into positive integer cents. Missing, malformed, zero, and
/// negative values are `None`.
#[must_use]
pub fn to_cents(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => {
            if let Some(dollars) = number.as_i64() {
                return positive(dollars.checked_mul(100)?);
            }
            let dollars = number.as_f64()?;
            if !dollars.is_finite() || dollars.abs() > MAX_DOLLARS {
                return None;
            }
            // `{:.0}` of an already rounded float prints it exactly.
            positive(format!("{:.0}", (dollars * 100.0).round()).parse().ok()?)
        }
        Value::String(text) => from_decimal(text),
        _ => None,
    }
}

/// Parses `"12"`, `"12.5"`, or `"12.50"` dollars into cents.
#[must_use]
pub fn from_decimal(text: &str) -> Option<i64> {
    let captures = DECIMAL.as_ref()?.captures(text)?;
    let dollars: i64 = captures.get(1)?.as_str().parse().ok()?;
    let cents = match captures.get(2) {
        Some(cents) => format!("{:0<2}", cents.as_str()).parse::<i64>().ok()?,
        None => 0,
    };
    positive(dollars.checked_mul(100)?.checked_add(cents)?)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn parses_decimal_dollar_strings() {
        assert_eq!(to_cents(&json!("0.35")), Some(35));
        assert_eq!(to_cents(&json!("12.5")), Some(1250));
        assert_eq!(to_cents(&json!("479.95")), Some(47_995));
        assert_eq!(to_cents(&json!(" 3.00 ")), Some(300));
    }

    #[test]
    fn converts_numbers() {
        assert_eq!(to_cents(&json!(5)), Some(500));
        assert_eq!(to_cents(&json!(9.57)), Some(957));
        assert_eq!(to_cents(&json!(9000.0)), Some(900_000));
        assert_eq!(to_cents(&json!(0.255)), Some(26));
    }

    #[test]
    fn rejects_missing_malformed_zero_and_negative_values() {
        assert_eq!(to_cents(&Value::Null), None);
        assert_eq!(to_cents(&json!("")), None);
        assert_eq!(to_cents(&json!("free")), None);
        assert_eq!(to_cents(&json!("0.00")), None);
        assert_eq!(to_cents(&json!("1.234")), None);
        assert_eq!(to_cents(&json!(-3)), None);
        assert_eq!(to_cents(&json!({})), None);
    }
}
