//! EDHREC card pages for `cardEdhrec` (`Manavault.Catalog.EDHRec.card_page/2`,
//! `EDHRec.Client.fetch_card_page/1`, `EDHRec.Response.CardPage`, and the
//! batched card resolution of `EDHRec.Response.CardLookup`).

use std::collections::HashMap;
use std::time::Duration;

use async_graphql::{ID, SimpleObject};
use lotus::{OracleId, ScryfallId};
use serde_json::{Map, Value};
use sqlx::SqlitePool;

use crate::catalog::card::{Card, CardRecord};
use crate::catalog::printing::Printing;
use crate::catalog::search::cards_by_name;

/// The public EDHREC JSON host; card pages live under `/pages/cards`.
pub const DEFAULT_JSON_BASE_URL: &str = "https://json.edhrec.com";

const SECTION_TAGS: [&str; 4] = [
    "topcommanders",
    "newcommanders",
    "newcards",
    "highliftcards",
];
const SECTION_LIMIT: usize = 5;

/// Why an EDHREC request failed.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum EdhrecError {
    #[error("EDHREC returned HTTP {0}.")]
    Http(u16),
    #[error("Could not reach EDHREC: {0}")]
    RequestFailed(String),
    #[error("EDHREC returned an unexpected response.")]
    UnexpectedResponse,
}

/// EDHREC's URL slug for a card name (`CardLookup.card_slug/1`).
#[must_use]
pub fn card_slug(name: &str) -> String {
    let lower: String = name
        .to_lowercase()
        .chars()
        .filter(|c| !matches!(c, '\'' | '\u{2019}' | ','))
        .collect();
    let mut slug = String::with_capacity(lower.len());
    let mut pending_dash = false;
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if pending_dash {
                slug.push('-');
            }
            pending_dash = false;
            slug.push(c);
        } else {
            pending_dash = true;
        }
    }
    slug.trim_start_matches('-').to_owned()
}

/// Fetches a card's EDHREC page JSON (`Client.fetch_card_page/1`).
pub async fn fetch_card_page(
    http: &reqwest::Client,
    base_url: &str,
    name: &str,
) -> Result<Map<String, Value>, EdhrecError> {
    let url = format!(
        "{}/pages/cards/{}.json",
        base_url.trim_end_matches('/'),
        card_slug(name)
    );
    let response = http
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|error| {
            EdhrecError::RequestFailed(crate::http_errors::transport_message(&error))
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(EdhrecError::Http(status.as_u16()));
    }
    let body = response.bytes().await.map_err(|error| {
        EdhrecError::RequestFailed(crate::http_errors::transport_message(&error))
    })?;
    match serde_json::from_slice(&body) {
        Ok(Value::Object(page)) => Ok(page),
        _ => Err(EdhrecError::UnexpectedResponse),
    }
}

/// A string field of an EDHREC entry (`CardLookup.entry_string/2`).
#[must_use]
pub fn entry_string(entry: &Map<String, Value>, key: &str) -> Option<String> {
    match entry.get(key) {
        Some(Value::String(value)) => Some(value.clone()),
        _ => None,
    }
}

/// A numeric field of an EDHREC entry (`CardLookup.entry_number/2`).
#[must_use]
pub fn entry_number(entry: &Map<String, Value>, key: &str) -> Option<serde_json::Number> {
    match entry.get(key) {
        Some(Value::Number(number)) => Some(number.clone()),
        _ => None,
    }
}

/// An entry's card name, or `""`.
#[must_use]
pub fn entry_name(entry: &Map<String, Value>) -> String {
    entry_string(entry, "name").unwrap_or_default()
}

/// Local cards for EDHREC entries, resolved in three grouped queries
/// (`CardLookup.local_card_lookup/2`).
#[derive(Debug, Default)]
pub struct CardLookup {
    oracle: HashMap<String, CardRecord>,
    printing: HashMap<String, CardRecord>,
    name_index: HashMap<String, CardRecord>,
}

impl CardLookup {
    /// Builds the lookup for entry identifiers (oracle or Scryfall ids) and names.
    pub async fn build(
        pool: &SqlitePool,
        identifiers: &[String],
        names: &[String],
    ) -> Result<Self, sqlx::Error> {
        let mut identifiers: Vec<String> = identifiers
            .iter()
            .filter(|id| !id.is_empty())
            .cloned()
            .collect();
        identifiers.sort();
        identifiers.dedup();
        let oracle_ids: Vec<OracleId> = identifiers
            .iter()
            .map(|id| OracleId::from(id.as_str()))
            .collect();
        let scryfall_ids: Vec<ScryfallId> = identifiers
            .iter()
            .map(|id| ScryfallId::from(id.as_str()))
            .collect();
        let oracle = crate::catalog::card::load_records(pool, &oracle_ids)
            .await?
            .into_iter()
            .map(|card| (card.oracle_id.to_string(), card))
            .collect();
        let printing = Printing::load_many(pool, &scryfall_ids)
            .await?
            .into_iter()
            .filter_map(|(id, printing)| Some((id.to_string(), printing.card?.as_ref().clone())))
            .collect();
        let name_index = cards_by_name::by_names(pool, names).await?;
        Ok(Self {
            oracle,
            printing,
            name_index,
        })
    }

    /// The local card for an entry: by oracle id, then printing id, then name.
    #[must_use]
    pub fn local_card(&self, identifier: Option<&str>, name: &str) -> Option<&CardRecord> {
        let by_id = identifier
            .filter(|id| !id.is_empty())
            .and_then(|id| self.oracle.get(id).or_else(|| self.printing.get(id)));
        by_id.or_else(|| self.name_index.get(&cards_by_name::key(name)))
    }
}

/// `CardEdhrecEntry`.
#[derive(Debug, Clone, SimpleObject)]
pub struct CardEdhrecEntry {
    pub name: String,
    pub scryfall_id: Option<ID>,
    pub lift: Option<f64>,
    pub num_decks: Option<i64>,
    pub potential_decks: Option<i64>,
    pub url: String,
    pub card: Option<Card>,
}

/// `CardEdhrecSection`.
#[derive(Debug, Clone, SimpleObject)]
pub struct CardEdhrecSection {
    pub header: String,
    pub tag: Option<String>,
    pub cards: Vec<CardEdhrecEntry>,
}

/// `CardEdhrec`.
#[derive(Debug, Clone, SimpleObject)]
pub struct CardEdhrec {
    pub url: String,
    pub sections: Vec<CardEdhrecSection>,
}

fn object_at<'a>(value: &'a Map<String, Value>, path: &[&str]) -> Option<&'a Value> {
    let (first, rest) = path.split_first()?;
    let value = value.get(*first)?;
    if rest.is_empty() {
        return Some(value);
    }
    match value {
        Value::Object(map) => object_at(map, rest),
        _ => None,
    }
}

fn cardviews(section: &Map<String, Value>) -> Vec<&Map<String, Value>> {
    match section.get("cardviews") {
        Some(Value::Array(items)) => items.iter().filter_map(Value::as_object).collect(),
        _ => Vec::new(),
    }
}

fn card_page_url(page: &Map<String, Value>) -> String {
    match object_at(page, &["container", "json_dict", "card", "name"]) {
        Some(Value::String(name)) if !name.is_empty() => {
            format!("https://edhrec.com/cards/{}", card_slug(name))
        }
        _ => "https://edhrec.com".to_owned(),
    }
}

fn entry_url(entry: &Map<String, Value>, name: &str) -> String {
    match entry_string(entry, "url") {
        Some(url) if url.starts_with('/') => format!("https://edhrec.com{url}"),
        Some(url) if url.starts_with("https://edhrec.com/") => url,
        _ => format!("https://edhrec.com/cards/{}", card_slug(name)),
    }
}

fn integer(number: Option<serde_json::Number>) -> Option<i64> {
    number?.as_i64()
}

/// Normalizes a card page into its four synergy sections, resolving entries
/// to local cards (`CardPage.normalize/1`).
pub async fn normalize_card_page(
    pool: &SqlitePool,
    page: &Map<String, Value>,
) -> Result<CardEdhrec, sqlx::Error> {
    let sections: Vec<&Map<String, Value>> =
        match object_at(page, &["container", "json_dict", "cardlists"]) {
            Some(Value::Array(lists)) => lists
                .iter()
                .filter_map(Value::as_object)
                .filter(|section| {
                    matches!(section.get("tag"), Some(Value::String(tag)) if SECTION_TAGS.contains(&tag.as_str()))
                })
                .collect(),
            _ => Vec::new(),
        };
    let entries: Vec<&Map<String, Value>> = sections.iter().flat_map(|s| cardviews(s)).collect();
    let identifiers: Vec<String> = entries
        .iter()
        .filter_map(|e| entry_string(e, "id"))
        .collect();
    let names: Vec<String> = entries.iter().map(|e| entry_name(e)).collect();
    let lookup = CardLookup::build(pool, &identifiers, &names).await?;

    let sections = sections
        .into_iter()
        .map(|section| CardEdhrecSection {
            header: entry_string(section, "header").unwrap_or_else(|| "Cards".to_owned()),
            tag: entry_string(section, "tag"),
            cards: cardviews(section)
                .into_iter()
                .take(SECTION_LIMIT)
                .filter_map(|entry| {
                    let name = entry_name(entry);
                    if name.is_empty() {
                        return None;
                    }
                    let scryfall_id = entry_string(entry, "id");
                    Some(CardEdhrecEntry {
                        card: lookup
                            .local_card(scryfall_id.as_deref(), &name)
                            .cloned()
                            .map(Card::from),
                        scryfall_id: scryfall_id.map(ID),
                        lift: entry_number(entry, "lift").and_then(|n| n.as_f64()),
                        num_decks: integer(entry_number(entry, "num_decks")),
                        potential_decks: integer(entry_number(entry, "potential_decks")),
                        url: entry_url(entry, &name),
                        name,
                    })
                })
                .collect(),
        })
        .collect();
    Ok(CardEdhrec {
        url: card_page_url(page),
        sections,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_match_edhrec() {
        assert_eq!(card_slug("Black Lotus"), "black-lotus");
        assert_eq!(card_slug("Urza's Saga"), "urzas-saga");
        assert_eq!(
            card_slug("Atraxa, Praetors\u{2019} Voice"),
            "atraxa-praetors-voice"
        );
        assert_eq!(card_slug("Fire // Ice"), "fire-ice");
        assert_eq!(card_slug("  -Lim-Dûl!  "), "lim-d-l");
    }

    #[test]
    fn reads_entry_fields() {
        let entry = serde_json::json!({"name": "Sol Ring", "score": 7, "salt": 1.5})
            .as_object()
            .cloned()
            .unwrap();
        assert_eq!(entry_string(&entry, "name").as_deref(), Some("Sol Ring"));
        assert_eq!(entry_string(&entry, "missing"), None);
        assert_eq!(integer(entry_number(&entry, "score")), Some(7));
        assert_eq!(
            entry_number(&entry, "salt").and_then(|n| n.as_f64()),
            Some(1.5)
        );
        assert_eq!(entry_number(&entry, "name"), None);
    }
}
