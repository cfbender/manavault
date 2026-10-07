//! Value summaries and the value dashboard (`CollectionValueSummary`,
//! `CollectionValueDashboard`, `CollectionValuePosition`), with the price
//! texts of `CollectionFields.value_summary/2`.

use async_graphql::{Object, SimpleObject};

use crate::catalog::price::{format_cents, format_signed_cents};
use crate::catalog::printing::Printing;
use crate::collection::item::CollectionItem;
use crate::collection::queries::{RankedPosition, ValueDashboard, ValueTotals};

/// An exact-enough float of a cent amount.
pub(crate) fn to_f64(value: i64) -> f64 {
    let high =
        i32::try_from(value / 1_000_000).unwrap_or(if value < 0 { i32::MIN } else { i32::MAX });
    let low = i32::try_from(value % 1_000_000).unwrap_or(0);
    f64::from(high) * 1_000_000.0 + f64::from(low)
}

/// `gain * 100 / purchase`, when there is a purchase basis.
#[must_use]
pub fn value_gain_percent(gain: Option<i64>, purchase: Option<i64>) -> Option<f64> {
    match (gain, purchase) {
        (Some(gain), Some(purchase)) if purchase > 0 => {
            Some(to_f64(gain) * 100.0 / to_f64(purchase))
        }
        _ => None,
    }
}

/// `+12.5%` / `-3%` / `0%` (`Price.format_percent/1`).
#[must_use]
pub fn format_percent(percent: Option<f64>) -> Option<String> {
    let rounded = (percent? * 10.0).round() / 10.0;
    let sign = if rounded > 0.0 { "+" } else { "" };
    let value = if rounded.fract() == 0.0 {
        let whole = format!("{rounded:.0}");
        if whole == "-0" { "0".to_owned() } else { whole }
    } else {
        format!("{rounded}")
    };
    Some(format!("{sign}{value}%"))
}

/// `CollectionValueSummary`.
#[derive(Debug, Clone, PartialEq, SimpleObject)]
#[graphql(name = "CollectionValueSummary")]
pub struct CollectionValueSummary {
    pub total_price_cents: i64,
    pub total_price_text: Option<String>,
    pub purchase_price_cents: i64,
    pub purchase_price_text: Option<String>,
    pub value_gain_cents: i64,
    pub value_gain_text: Option<String>,
    pub value_gain_percent: Option<f64>,
    pub value_gain_percent_text: Option<String>,
}

impl CollectionValueSummary {
    /// `CollectionFields.value_summary/2`.
    #[must_use]
    pub fn new(total: i64, purchase: i64) -> Self {
        let gain = total - purchase;
        let percent = value_gain_percent(Some(gain), Some(purchase));
        Self {
            total_price_cents: total,
            total_price_text: format_cents(Some(total)),
            purchase_price_cents: purchase,
            purchase_price_text: format_cents(Some(purchase)),
            value_gain_cents: gain,
            value_gain_text: format_signed_cents(Some(gain)),
            value_gain_percent: percent,
            value_gain_percent_text: format_percent(percent),
        }
    }
}

impl From<ValueTotals> for CollectionValueSummary {
    fn from(totals: ValueTotals) -> Self {
        Self::new(totals.total_price_cents, totals.purchase_price_cents)
    }
}

/// `CollectionValuePosition`.
pub struct CollectionValuePosition(pub RankedPosition);

#[Object]
impl CollectionValuePosition {
    async fn printing(&self) -> &Printing {
        &self.0.printing
    }

    async fn items(&self) -> &[CollectionItem] {
        &self.0.items
    }

    async fn quantity(&self) -> i64 {
        self.0.position.quantity
    }

    async fn total_price_cents(&self) -> i64 {
        self.0.position.total_price_cents
    }

    async fn total_price_text(&self) -> String {
        format_cents(Some(self.0.position.total_price_cents)).unwrap_or_default()
    }

    async fn purchase_price_cents(&self) -> i64 {
        self.0.position.purchase_price_cents
    }

    async fn purchase_price_text(&self) -> String {
        format_cents(Some(self.0.position.purchase_price_cents)).unwrap_or_default()
    }

    async fn value_gain_cents(&self) -> i64 {
        self.0.position.value_gain_cents
    }

    async fn value_gain_text(&self) -> String {
        format_signed_cents(Some(self.0.position.value_gain_cents)).unwrap_or_default()
    }

    async fn value_gain_percent(&self) -> Option<f64> {
        value_gain_percent(
            Some(self.0.position.value_gain_cents),
            Some(self.0.position.purchase_price_cents),
        )
    }

    async fn value_gain_percent_text(&self) -> Option<String> {
        format_percent(value_gain_percent(
            Some(self.0.position.value_gain_cents),
            Some(self.0.position.purchase_price_cents),
        ))
    }
}

/// `CollectionValueDashboard`.
pub struct CollectionValueDashboard(pub ValueDashboard);

fn positions(positions: &[RankedPosition]) -> Vec<CollectionValuePosition> {
    positions
        .iter()
        .cloned()
        .map(CollectionValuePosition)
        .collect()
}

#[Object]
impl CollectionValueDashboard {
    async fn summary(&self) -> CollectionValueSummary {
        self.0.summary.into()
    }

    async fn item_count(&self) -> i64 {
        self.0.summary.item_count
    }

    async fn position_count(&self) -> i64 {
        self.0.position_count
    }

    async fn gain_position_count(&self) -> i64 {
        self.0.gain_position_count
    }

    async fn loss_position_count(&self) -> i64 {
        self.0.loss_position_count
    }

    async fn unchanged_position_count(&self) -> i64 {
        self.0.position_count - self.0.gain_position_count - self.0.loss_position_count
    }

    async fn biggest_gains(&self) -> Vec<CollectionValuePosition> {
        positions(&self.0.biggest_gains)
    }

    async fn biggest_losses(&self) -> Vec<CollectionValuePosition> {
        positions(&self.0.biggest_losses)
    }

    async fn biggest_percent_gains(&self) -> Vec<CollectionValuePosition> {
        positions(&self.0.biggest_percent_gains)
    }

    async fn biggest_percent_losses(&self) -> Vec<CollectionValuePosition> {
        positions(&self.0.biggest_percent_losses)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_percentages_like_elixir() {
        assert_eq!(format_percent(Some(0.0)).as_deref(), Some("0%"));
        assert_eq!(format_percent(Some(-51.377)).as_deref(), Some("-51.4%"));
        assert_eq!(format_percent(Some(12.0)).as_deref(), Some("+12%"));
        assert_eq!(format_percent(Some(-0.04)).as_deref(), Some("0%"));
        assert_eq!(format_percent(Some(150.26)).as_deref(), Some("+150.3%"));
        assert_eq!(format_percent(None), None);
        assert_eq!(value_gain_percent(Some(5), Some(0)), None);
        assert_eq!(to_f64(-1_234_567_890), -1_234_567_890.0);
    }
}
