//! Deck buylists with printing choice and prices, and their text/CSV export
//! (`Decks.Buylist`, `Decks.Printings`).

use std::collections::HashMap;

use async_graphql::SimpleObject;
use lotus::{Finish, OracleId};
use manavault_allocation::{AllocationError, BuylistOptions, DeckId};

use crate::catalog::price;
use crate::catalog::printing::{Printing, printings_with_owned_counts};
use crate::state::AppState;

/// Which printing a buylist entry names (`printingMode`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrintingMode {
    /// Any printing; the price is the cheapest priced printing's.
    None,
    /// The deck card's preferred printing when it comes in the deck card's
    /// finish, else the cheapest.
    Exact,
    /// The cheapest printing in the deck card's finish.
    Cheapest,
}

impl PrintingMode {
    /// `"none"` and `"exact"`; any other value picks the cheapest printing,
    /// as the Elixir fallback clause did.
    #[must_use]
    pub fn parse(value: &str) -> Self {
        match value {
            "none" => Self::None,
            "exact" => Self::Exact,
            _ => Self::Cheapest,
        }
    }
}

/// `DeckBuylistEntry`.
#[derive(Debug, Clone, SimpleObject)]
#[graphql(complex)]
pub struct DeckBuylistEntry {
    pub card_name: String,
    pub quantity: i64,
    pub missing: i64,
    pub unavailable: i64,
    pub reason: String,
    pub finish: Option<String>,
    pub printing: Option<Printing>,
    pub set_code: Option<String>,
    pub collector_number: Option<String>,
    pub language: Option<String>,
    pub unit_price_cents: Option<i64>,
    pub total_price_cents: Option<i64>,
}

#[async_graphql::ComplexObject]
impl DeckBuylistEntry {
    async fn unit_price_text(&self) -> Option<String> {
        price::format_cents(self.unit_price_cents)
    }

    async fn total_price_text(&self) -> Option<String> {
        price::format_cents(self.total_price_cents)
    }
}

/// `printing_sort_key/2`: cheapest, then oldest, then set and number.
fn sort_key(
    state: &AppState,
    printing: &Printing,
    finish: Finish,
) -> (i64, String, String, String) {
    (
        printing
            .price_cents_for(&state.prices, Some(finish.as_str()))
            .unwrap_or(999_999_999),
        printing
            .released_at
            .clone()
            .unwrap_or_else(|| "9999-12-31".to_owned()),
        printing.set_code.clone(),
        printing.collector_number.clone(),
    )
}

fn supports(printing: &Printing, finish: Finish) -> bool {
    printing
        .finish_list()
        .iter()
        .any(|listed| listed == finish.as_str())
}

/// `Printings.cheapest_printing/1` and, with `priced_only`,
/// `cheapest_priced_printing/1`.
fn cheapest<'a>(
    state: &AppState,
    printings: &'a [Printing],
    finish: Finish,
    priced_only: bool,
) -> Option<&'a Printing> {
    printings
        .iter()
        .filter(|printing| supports(printing, finish))
        .filter(|printing| {
            !priced_only
                || printing
                    .price_cents_for(&state.prices, Some(finish.as_str()))
                    .is_some()
        })
        .min_by_key(|printing| sort_key(state, printing, finish))
}

/// The buylist of a deck (`Buylist.deck_buylist/2`), sorted by card name,
/// set code, and collector number.
pub async fn deck_buylist(
    state: &AppState,
    deck_id: DeckId,
    mode: PrintingMode,
    options: BuylistOptions,
) -> Result<Vec<DeckBuylistEntry>, AllocationError> {
    let needs = manavault_allocation::deck_buylist_needs(&state.db, deck_id, options).await?;
    let mut oracle_ids: Vec<OracleId> = needs
        .iter()
        .map(|need| need.deck_card.oracle_id.clone())
        .collect();
    oracle_ids.sort();
    oracle_ids.dedup();
    let printings: HashMap<OracleId, Vec<Printing>> =
        printings_with_owned_counts(&state.db, &oracle_ids).await?;
    let none: Vec<Printing> = Vec::new();

    let mut entries: Vec<DeckBuylistEntry> = needs
        .into_iter()
        .map(|need| {
            let card = &need.deck_card;
            let card_printings = printings.get(&card.oracle_id).unwrap_or(&none);
            let preferred = card.preferred_printing_id.as_ref().and_then(|id| {
                card_printings
                    .iter()
                    .find(|printing| &printing.scryfall_id == id)
            });
            let printing = match mode {
                PrintingMode::None => None,
                PrintingMode::Exact => preferred
                    .filter(|printing| supports(printing, card.finish))
                    .or_else(|| cheapest(state, card_printings, card.finish, false)),
                PrintingMode::Cheapest => cheapest(state, card_printings, card.finish, false),
            };
            let price_printing =
                printing.or_else(|| cheapest(state, card_printings, card.finish, true));
            let unit_price_cents = price_printing
                .and_then(|p| p.price_cents_for(&state.prices, Some(card.finish.as_str())));
            let quantity = need.quantity.as_i64();
            DeckBuylistEntry {
                card_name: need.card_name,
                quantity,
                missing: i64::from(need.missing),
                unavailable: i64::from(need.unavailable),
                reason: need.reason.as_str().to_owned(),
                finish: Some(card.finish.as_str().to_owned()),
                set_code: printing.map(|p| p.set_code.clone()),
                collector_number: printing.map(|p| p.collector_number.clone()),
                language: printing.map(|p| p.lang.clone()),
                printing: printing.cloned(),
                unit_price_cents,
                total_price_cents: unit_price_cents.and_then(|cents| cents.checked_mul(quantity)),
            }
        })
        .collect();
    entries.sort_by(|a, b| {
        (
            &a.card_name,
            a.set_code.as_deref().unwrap_or(""),
            a.collector_number.as_deref().unwrap_or(""),
        )
            .cmp(&(
                &b.card_name,
                b.set_code.as_deref().unwrap_or(""),
                b.collector_number.as_deref().unwrap_or(""),
            ))
    });
    Ok(entries)
}

/// `Buylist.export_deck_buylist/3`: `"text"` lines, a `"csv"` sheet, or `""`
/// for any other format.
pub async fn export_deck_buylist(
    state: &AppState,
    deck_id: DeckId,
    format: &str,
    mode: PrintingMode,
    options: BuylistOptions,
) -> Result<String, AllocationError> {
    match format {
        "text" => Ok(deck_buylist(state, deck_id, mode, options)
            .await?
            .iter()
            .map(text_line)
            .collect::<Vec<_>>()
            .join("\n")),
        "csv" => {
            let mut rows = vec![
                [
                    "Quantity",
                    "Card",
                    "Set",
                    "Collector Number",
                    "Finish",
                    "Language",
                    "Reason",
                    "Unit Price",
                    "Total Price",
                ]
                .map(str::to_owned)
                .to_vec(),
            ];
            for entry in deck_buylist(state, deck_id, mode, options).await? {
                rows.push(vec![
                    entry.quantity.to_string(),
                    entry.card_name,
                    entry.set_code.unwrap_or_default(),
                    entry.collector_number.unwrap_or_default(),
                    entry.finish.unwrap_or_default(),
                    entry.language.unwrap_or_default(),
                    entry.reason,
                    price::format_cents(entry.unit_price_cents).unwrap_or_default(),
                    price::format_cents(entry.total_price_cents).unwrap_or_default(),
                ]);
            }
            Ok(rows
                .iter()
                .map(|row| csv_row(row))
                .collect::<Vec<_>>()
                .join("\n"))
        }
        _ => Ok(String::new()),
    }
}

fn text_line(entry: &DeckBuylistEntry) -> String {
    match (&entry.set_code, &entry.collector_number) {
        (Some(set), Some(number)) => format!(
            "{} {} ({} {number})",
            entry.quantity,
            entry.card_name,
            set.to_uppercase()
        ),
        _ => format!("{} {}", entry.quantity, entry.card_name),
    }
}

/// `Catalog.CSV.row/1`.
fn csv_row(values: &[String]) -> String {
    values
        .iter()
        .map(|value| {
            if value.contains([',', '"', '\n']) {
                format!("\"{}\"", value.replace('"', "\"\""))
            } else {
                value.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(",")
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn csv_cells_are_quoted_like_the_elixir_writer() {
        let row = [
            "2".to_owned(),
            "Fire, Ice".to_owned(),
            "say \"hi\"".to_owned(),
        ];
        assert_eq!(csv_row(&row), r#"2,"Fire, Ice","say ""hi""""#);
    }

    #[test]
    fn printing_modes_fall_back_to_cheapest() {
        assert_eq!(PrintingMode::parse("none"), PrintingMode::None);
        assert_eq!(PrintingMode::parse("exact"), PrintingMode::Exact);
        assert_eq!(PrintingMode::parse("cheapest"), PrintingMode::Cheapest);
        assert_eq!(PrintingMode::parse("whatever"), PrintingMode::Cheapest);
    }
}
