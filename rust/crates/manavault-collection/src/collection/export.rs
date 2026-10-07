//! Collection exports (`Collection.Export`, `ExportCollection`, `Catalog.CSV`).

use sqlx::SqlitePool;

use crate::collection::filters::ItemFilters;
use crate::collection::item::CollectionItem;
use crate::collection::queries::all_items;
use manavault_catalog::catalog::price::format_cents;
use manavault_catalog::pricing::PriceStore;

const CSV_HEADER: [&str; 9] = [
    "Quantity",
    "Card Name",
    "Set Code",
    "Collector Number",
    "Finish",
    "Condition",
    "Language",
    "Location",
    "Purchase Price",
];

/// One CSV cell, quoted when it holds a comma, quote, or newline.
fn cell(value: &str) -> String {
    if value.contains([',', '"', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_owned()
    }
}

/// A CSV row (`CSV.row/1`).
#[must_use]
pub fn csv_row<S: AsRef<str>>(values: &[S]) -> String {
    values
        .iter()
        .map(|value| cell(value.as_ref()))
        .collect::<Vec<_>>()
        .join(",")
}

fn card_name(item: &CollectionItem) -> String {
    item.card()
        .map(|card| card.name.clone())
        .unwrap_or_default()
}

/// The CSV export of items (`Export.csv/1`).
#[must_use]
pub fn csv(items: &[CollectionItem], prices: &PriceStore) -> String {
    let mut lines = vec![csv_row(&CSV_HEADER)];
    for item in items {
        let printing = &item.printing.record;
        lines.push(csv_row(&[
            item.record.quantity.to_string(),
            card_name(item),
            printing.set_code.clone(),
            printing.collector_number.clone(),
            item.record.finish.as_str().to_owned(),
            item.record.condition.as_str().to_owned(),
            item.record.language.clone(),
            item.location
                .as_ref()
                .map(|location| location.name.clone())
                .unwrap_or_default(),
            format_cents(item.purchase_basis_cents(prices)).unwrap_or_default(),
        ]));
    }
    lines.join("\n")
}

/// One decklist-style line: `2x Name (SET) 12 [foil] {lightly_played} <ja>`.
fn text_line(item: &CollectionItem) -> String {
    let printing = &item.printing.record;
    let mut parts = vec![
        format!("{}x", item.record.quantity),
        card_name(item),
        format!(
            "({}) {}",
            printing.set_code.to_uppercase(),
            printing.collector_number
        ),
    ];
    if item.record.finish != lotus::Finish::Nonfoil {
        parts.push(format!("[{}]", item.record.finish));
    }
    if item.record.condition != lotus::Condition::NearMint {
        parts.push(format!("{{{}}}", item.record.condition));
    }
    if item.record.language != "en" && !item.record.language.is_empty() {
        parts.push(format!("<{}>", item.record.language));
    }
    parts.retain(|part| !part.is_empty());
    parts.join(" ")
}

/// The text export of items (`Export.text/1`).
#[must_use]
pub fn text(items: &[CollectionItem]) -> String {
    items.iter().map(text_line).collect::<Vec<_>>().join("\n")
}

/// The CSV export of the items matching the filters.
pub async fn export_csv(
    pool: &SqlitePool,
    prices: &PriceStore,
    filters: &ItemFilters,
) -> Result<String, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    Ok(csv(&all_items(&mut conn, filters).await?, prices))
}

/// The text export of the items matching the filters.
pub async fn export_text(pool: &SqlitePool, filters: &ItemFilters) -> Result<String, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    Ok(text(&all_items(&mut conn, filters).await?))
}
