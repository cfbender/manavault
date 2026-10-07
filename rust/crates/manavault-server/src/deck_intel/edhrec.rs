//! Deck EDHREC recommendations and commander pages (`EDHRec.Recommendations`,
//! `EDHRec.Payload`, `EDHRec.Client.fetch_recs/1` and
//! `fetch_commander_page/2`, `EDHRec.Response`, and
//! `EDHRec.Response.CommanderPage`).

use std::time::Duration;

use async_graphql::{ID, SimpleObject};
use lotus::{Finish, Zone};
use manavault_allocation::{AllocationError, DeckId};
use serde_json::{Map, Value, json};

use crate::catalog::card::Card;
use crate::catalog::edhrec::{CardLookup, EdhrecError, card_slug, entry_name, entry_number};
use crate::deck_intel::DeckContext;
use crate::deck_intel::status::DeckCardAllocationStatus;
use crate::deck_intel::suggest::{Suggested, collection_statuses, matching_deck_card};
use crate::state::AppState;

const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ManaVault/0.1";

/// Why a deck EDHREC request failed (`Errors.edhrec_error/1` messages).
#[derive(Debug, thiserror::Error)]
pub enum DeckEdhrecError {
    #[error("EDHREC requires a commander.")]
    MissingCommander,
    #[error("EDHREC requires cards in the deck.")]
    EmptyDeck,
    #[error(transparent)]
    Edhrec(#[from] EdhrecError),
    #[error(transparent)]
    Allocation(#[from] AllocationError),
}

/// `deckEdhrec` options.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeckEdhrecOptions {
    pub exclude_lands: bool,
    pub offset: i64,
    /// Show this commander's page for `commander_theme` instead of the
    /// default page; both must be non-empty.
    pub commander_name: Option<String>,
    pub commander_theme: Option<String>,
}

/// `DeckEdhrecCard`.
#[derive(Debug, Clone, SimpleObject)]
pub struct DeckEdhrecCard {
    pub name: String,
    pub oracle_id: Option<ID>,
    pub primary_type: Option<String>,
    pub score: Option<f64>,
    pub salt: Option<f64>,
    pub edhrec_url: Option<String>,
    pub card: Option<Card>,
    pub collection_status: DeckCardAllocationStatus,
}

/// `EdhrecTheme`.
#[derive(Debug, Clone, PartialEq, SimpleObject)]
pub struct EdhrecTheme {
    pub name: String,
    pub slug: Option<String>,
    pub count: Option<i64>,
}

/// `EdhrecStat`.
#[derive(Debug, Clone, PartialEq, Eq, SimpleObject)]
pub struct EdhrecStat {
    pub label: String,
    pub value: String,
}

/// `EdhrecSectionCard`.
#[derive(Debug, Clone, SimpleObject)]
pub struct EdhrecSectionCard {
    pub name: String,
    pub oracle_id: Option<ID>,
    pub synergy: Option<f64>,
    pub inclusion: Option<i64>,
    pub num_decks: Option<i64>,
    pub potential_decks: Option<i64>,
    pub url: Option<String>,
    pub card: Option<Card>,
    pub collection_status: DeckCardAllocationStatus,
}

/// `EdhrecCardSection`.
#[derive(Debug, Clone, SimpleObject)]
pub struct EdhrecCardSection {
    pub header: String,
    pub tag: Option<String>,
    pub cards: Vec<EdhrecSectionCard>,
}

/// `EdhrecCommanderPage`.
#[derive(Debug, Clone, SimpleObject)]
pub struct EdhrecCommanderPage {
    pub name: String,
    pub title: String,
    pub description: Option<String>,
    pub url: String,
    pub rank: Option<i64>,
    pub deck_count: Option<i64>,
    pub salt: Option<f64>,
    pub avg_price: Option<f64>,
    pub color_identity: Vec<String>,
    pub similar: Vec<String>,
    pub themes: Vec<EdhrecTheme>,
    pub stats: Vec<EdhrecStat>,
    pub sections: Vec<EdhrecCardSection>,
}

/// `DeckEdhrec`.
#[derive(Debug, Clone, SimpleObject)]
pub struct DeckEdhrec {
    pub commander_names: Vec<String>,
    pub recommendations: Vec<DeckEdhrecCard>,
    pub cuts: Vec<DeckEdhrecCard>,
    pub commander_pages: Vec<EdhrecCommanderPage>,
    pub more: bool,
}

/// One commander page to show: a single commander, or a partner pair, whose
/// combined page lives at both slugs joined in sorted order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommanderEntry {
    Single(String),
    Pair(String, String),
}

impl CommanderEntry {
    /// `Client.commander_slug/1`.
    #[must_use]
    pub fn slug(&self) -> String {
        match self {
            Self::Single(name) => card_slug(name),
            Self::Pair(a, b) => {
                let mut slugs = [card_slug(a), card_slug(b)];
                slugs.sort();
                slugs.join("-")
            }
        }
    }

    /// The display name; a pair joins both names in slug order.
    #[must_use]
    pub fn display_name(&self) -> String {
        match self {
            Self::Single(name) => name.clone(),
            Self::Pair(a, b) => {
                let mut names = [a.as_str(), b.as_str()];
                names.sort_by_key(|name| card_slug(name));
                names.join(" // ")
            }
        }
    }
}

// --- Payload ---------------------------------------------------------------

fn zone_order(zone: Zone) -> u8 {
    match zone {
        Zone::Commander => 0,
        Zone::Mainboard => 1,
        Zone::Considering => 2,
    }
}

/// `Decklists.export_line/1`: `"2x Name (SET) 123 *F*"`.
fn export_line(deck: &DeckContext, named: &manavault_allocation::NamedDeckCard) -> String {
    let mut parts = vec![format!("{}x", named.card.quantity), named.name.clone()];
    if let Some(printing) = deck.preferred_printing(named) {
        parts.push(format!(
            "({}) {}",
            printing.set_code.to_uppercase(),
            printing.collector_number
        ));
    }
    match named.card.finish {
        Finish::Foil => parts.push("*F*".to_owned()),
        Finish::Etched => parts.push("*E*".to_owned()),
        Finish::Nonfoil => {}
    }
    parts.retain(|part| !part.is_empty());
    parts.join(" ")
}

/// The body posted to EDHREC's recs endpoint (`Payload.recs_payload/2`).
pub(crate) fn recs_payload(deck: &DeckContext, options: &DeckEdhrecOptions) -> Value {
    let mut cards: Vec<&manavault_allocation::NamedDeckCard> = deck
        .cards
        .iter()
        .filter(|named| named.card.zone != Zone::Considering)
        .collect();
    cards.sort_by(|a, b| {
        (zone_order(a.card.zone), &a.name, a.card.id).cmp(&(
            zone_order(b.card.zone),
            &b.name,
            b.card.id,
        ))
    });
    let mut commanders: Vec<&str> = deck
        .cards
        .iter()
        .filter(|named| named.card.zone == Zone::Commander)
        .map(|named| named.name.as_str())
        .collect();
    commanders.sort_unstable();
    json!({
        "cards": cards.into_iter().map(|named| export_line(deck, named)).collect::<Vec<_>>(),
        "commanders": commanders,
        "name": "",
        "options": {"excludeLands": options.exclude_lands, "offset": options.offset},
    })
}

fn validate_payload(payload: &Value) -> Result<(), DeckEdhrecError> {
    let empty = |key: &str| {
        payload
            .get(key)
            .and_then(Value::as_array)
            .is_none_or(Vec::is_empty)
    };
    if empty("commanders") {
        Err(DeckEdhrecError::MissingCommander)
    } else if empty("cards") {
        Err(DeckEdhrecError::EmptyDeck)
    } else {
        Ok(())
    }
}

// --- Client ------------------------------------------------------------------

async fn decode_object(response: reqwest::Response) -> Result<Map<String, Value>, EdhrecError> {
    let body = response
        .bytes()
        .await
        .map_err(|error| EdhrecError::RequestFailed(error.to_string()))?;
    match serde_json::from_slice(&body) {
        Ok(Value::Object(map)) => Ok(map),
        _ => Err(EdhrecError::UnexpectedResponse),
    }
}

/// Posts a deck to EDHREC's recs endpoint (`Client.fetch_recs/1`).
pub async fn fetch_recs(
    http: &reqwest::Client,
    url: &str,
    payload: &Value,
) -> Result<Map<String, Value>, EdhrecError> {
    let response = http
        .post(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header("origin", "https://edhrec.com")
        .header(reqwest::header::REFERER, "https://edhrec.com/recs")
        .header(reqwest::header::USER_AGENT, BROWSER_USER_AGENT)
        .json(payload)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|error| EdhrecError::RequestFailed(error.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(EdhrecError::Http(status.as_u16()));
    }
    decode_object(response).await
}

/// A commander page's JSON (`Client.fetch_commander_page/2`), following
/// EDHREC's one-hop `{"redirect": "/commanders/<slug>"}` answer for
/// non-canonical slugs.
pub async fn fetch_commander_page(
    http: &reqwest::Client,
    json_base_url: &str,
    entry: &CommanderEntry,
    theme_slug: Option<&str>,
) -> Result<Map<String, Value>, EdhrecError> {
    let base = format!("{}/pages/commanders", json_base_url.trim_end_matches('/'));
    let mut path = vec![entry.slug()];
    if let Some(theme) = theme_slug.map(card_slug).filter(|slug| !slug.is_empty()) {
        path.push(theme);
    }
    path.retain(|part| !part.is_empty());
    let page = get_commander_page(http, &format!("{base}/{}.json", path.join("/"))).await?;
    match page.get("redirect") {
        None => Ok(page),
        Some(Value::String(redirect)) => match redirect.strip_prefix("/commanders/") {
            Some(slug) if !slug.is_empty() => {
                let page = get_commander_page(http, &format!("{base}/{slug}.json")).await?;
                if page.contains_key("redirect") {
                    Err(EdhrecError::UnexpectedResponse)
                } else {
                    Ok(page)
                }
            }
            _ => Err(EdhrecError::UnexpectedResponse),
        },
        Some(_) => Err(EdhrecError::UnexpectedResponse),
    }
}

async fn get_commander_page(
    http: &reqwest::Client,
    url: &str,
) -> Result<Map<String, Value>, EdhrecError> {
    let response = http
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|error| EdhrecError::RequestFailed(error.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(EdhrecError::Http(status.as_u16()));
    }
    decode_object(response).await
}

// --- Response ------------------------------------------------------------------

/// A non-empty string field (`CommanderPage.page_value/2`).
fn page_value(map: &Map<String, Value>, key: &str) -> Option<String> {
    match map.get(key) {
        Some(Value::String(value)) if !value.is_empty() => Some(value.clone()),
        _ => None,
    }
}

fn page_number(map: &Map<String, Value>, key: &str) -> Option<f64> {
    entry_number(map, key).and_then(|number| number.as_f64())
}

/// Rounds half away from zero, as Elixir's `round/1` does. Values outside
/// ±2^53 are not page counts and read as absent.
fn round_to_i64(value: f64) -> Option<i64> {
    let rounded = value.round();
    if rounded.is_finite() && rounded.abs() < 9_007_199_254_740_992.0 {
        format!("{rounded:.0}").parse().ok()
    } else {
        None
    }
}

/// An integer field, rounding floats (`CommanderPage.page_integer/2`).
fn page_integer(map: &Map<String, Value>, key: &str) -> Option<i64> {
    let number = entry_number(map, key)?;
    number
        .as_i64()
        .or_else(|| number.as_f64().and_then(round_to_i64))
}

fn page_list(map: &Map<String, Value>, key: &str) -> Vec<String> {
    match map.get(key) {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(|value| value.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

fn object<'a>(map: &'a Map<String, Value>, key: &str) -> Option<&'a Map<String, Value>> {
    map.get(key).and_then(Value::as_object)
}

fn objects<'a>(map: &'a Map<String, Value>, key: &str) -> Vec<&'a Map<String, Value>> {
    match map.get(key) {
        Some(Value::Array(values)) => values.iter().filter_map(Value::as_object).collect(),
        _ => Vec::new(),
    }
}

/// An entry's `oracle_id` string (`CardLookup.entry_oracle_id/1`).
fn entry_oracle_id(entry: &Map<String, Value>) -> Option<String> {
    entry
        .get("oracle_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn edhrec_path(path: Option<String>, fallback: String) -> String {
    match path {
        Some(url) if url.starts_with("http") => url,
        Some(path) if path.starts_with('/') => format!("https://edhrec.com{path}"),
        _ => fallback,
    }
}

fn page_themes(page: &Map<String, Value>) -> Vec<EdhrecTheme> {
    let Some(panels) = object(page, "panels") else {
        return Vec::new();
    };
    objects(panels, "taglinks")
        .into_iter()
        .filter_map(|tag| {
            Some(EdhrecTheme {
                name: page_value(tag, "value")?,
                slug: page_value(tag, "slug"),
                count: page_integer(tag, "count"),
            })
        })
        .take(12)
        .collect()
}

fn page_stats(page: &Map<String, Value>) -> Vec<EdhrecStat> {
    let money = page_number(page, "avg_price").and_then(|price| {
        entry_number(page, "avg_price")
            .and_then(|n| n.as_i64())
            .or_else(|| round_to_i64(price))
            .map(|dollars| format!("${dollars}"))
    });
    let integer = |key: &str| page_integer(page, key).map(|value| value.to_string());
    [
        ("Average price", money),
        ("Average deck size", integer("deck_size")),
        ("Average decks", integer("num_decks_avg")),
        ("Creatures", integer("creature")),
        ("Instants", integer("instant")),
        ("Sorceries", integer("sorcery")),
        ("Artifacts", integer("artifact")),
        ("Enchantments", integer("enchantment")),
        ("Planeswalkers", integer("planeswalker")),
        ("Lands", integer("land")),
        ("Basics", integer("basic")),
        ("Nonbasics", integer("nonbasic")),
    ]
    .into_iter()
    .filter_map(|(label, value)| {
        Some(EdhrecStat {
            label: label.to_owned(),
            value: value?,
        })
    })
    .collect()
}

/// A fetched commander page with what is needed to normalize it.
pub(crate) struct FetchedPage {
    pub entry: CommanderEntry,
    pub name: String,
    pub theme_slug: Option<String>,
    pub page: Map<String, Value>,
}

/// The pages to fetch: a partner pair's combined page first, then each
/// commander's own (`Response.commander_page_entries/1`), without repeats.
fn commander_page_entries(names: &[String]) -> Vec<CommanderEntry> {
    let mut entries = Vec::new();
    if let [a, b] = names {
        entries.push(CommanderEntry::Pair(a.clone(), b.clone()));
    }
    entries.extend(names.iter().cloned().map(CommanderEntry::Single));
    let mut unique: Vec<CommanderEntry> = Vec::with_capacity(entries.len());
    for entry in entries {
        if !unique.contains(&entry) {
            unique.push(entry);
        }
    }
    unique
}

fn commander_url(entry: &CommanderEntry, theme_slug: Option<&str>) -> String {
    let base = format!("https://edhrec.com/commanders/{}", entry.slug());
    match theme_slug.map(card_slug) {
        Some(slug) if !slug.is_empty() => format!("{base}/{slug}"),
        _ => base,
    }
}

/// Fetches recommendations for the deck and its commander pages
/// (`Recommendations.recs/2`).
pub async fn deck_edhrec(
    state: &AppState,
    deck_id: DeckId,
    options: &DeckEdhrecOptions,
) -> Result<DeckEdhrec, DeckEdhrecError> {
    let deck = DeckContext::load(&state.db, deck_id).await?;
    let payload = recs_payload(&deck, options);
    validate_payload(&payload)?;
    let response = fetch_recs(&state.http, &state.config.deck_intel.edhrec_recs, &payload).await?;

    let commander_names: Vec<String> = match response.get("commanders") {
        Some(Value::Array(entries)) => entries
            .iter()
            .map(|entry| entry.as_object().map(entry_name).unwrap_or_default())
            .collect(),
        _ => Vec::new(),
    };
    let theme = match (&options.commander_name, &options.commander_theme) {
        (Some(name), Some(theme)) if !name.is_empty() && !theme.is_empty() => {
            Some((name.as_str(), theme.as_str()))
        }
        _ => None,
    };
    let mut pages = Vec::new();
    for entry in commander_page_entries(&commander_names) {
        let name = entry.display_name();
        let theme_slug = theme
            .filter(|(commander, _)| *commander == name)
            .map(|(_, slug)| slug.to_owned());
        // A missing page only hides that page.
        if let Ok(page) = fetch_commander_page(
            &state.http,
            &state.config.edhrec_json_base_url,
            &entry,
            theme_slug.as_deref(),
        )
        .await
        {
            pages.push(FetchedPage {
                entry,
                name,
                theme_slug,
                page,
            });
        }
    }
    Ok(normalize(state, &deck, commander_names, &response, &pages).await?)
}

/// One entry of a recs list before statuses are known.
struct RecEntry<'a> {
    entry: &'a Map<String, Value>,
    name: String,
    oracle_id: Option<String>,
}

/// A commander page's non-empty sections with their named cards.
type PageSections<'a> = Vec<(&'a Map<String, Value>, Vec<SectionCard<'a>>)>;

struct SectionCard<'a> {
    entry: &'a Map<String, Value>,
    name: String,
    identifier: Option<String>,
}

/// `Response.normalize_recs_response/4` over already fetched pages. Every
/// card in the response is resolved with one batched lookup and one pair of
/// status computations.
pub(crate) async fn normalize(
    state: &AppState,
    deck: &DeckContext,
    commander_names: Vec<String>,
    response: &Map<String, Value>,
    pages: &[FetchedPage],
) -> Result<DeckEdhrec, AllocationError> {
    let rec_list = |key: &str| -> Vec<RecEntry<'_>> {
        objects(response, key)
            .into_iter()
            .map(|entry| RecEntry {
                entry,
                name: entry_name(entry),
                oracle_id: entry_oracle_id(entry),
            })
            .filter(|rec| !rec.name.is_empty())
            .collect()
    };
    let in_recs = rec_list("inRecs");
    let out_recs = rec_list("outRecs");

    let sections: Vec<PageSections<'_>> = pages
        .iter()
        .map(|fetched| {
            let cardlists = object(&fetched.page, "container")
                .and_then(|container| object(container, "json_dict"))
                .map(|dict| objects(dict, "cardlists"))
                .unwrap_or_default();
            cardlists
                .into_iter()
                .map(|section| {
                    let cards: Vec<SectionCard<'_>> = objects(section, "cardviews")
                        .into_iter()
                        .map(|entry| SectionCard {
                            entry,
                            name: entry_name(entry),
                            identifier: page_value(entry, "oracle_id")
                                .or_else(|| page_value(entry, "id")),
                        })
                        .filter(|card| !card.name.is_empty())
                        .collect();
                    (section, cards)
                })
                .filter(|(_, cards)| !cards.is_empty())
                .collect()
        })
        .collect();

    let mut identifiers: Vec<String> = Vec::new();
    let mut names: Vec<String> = Vec::new();
    for rec in in_recs.iter().chain(&out_recs) {
        identifiers.extend(rec.oracle_id.clone());
        names.push(rec.name.clone());
    }
    for (_, cards) in sections.iter().flatten() {
        for card in cards {
            identifiers.extend(card.identifier.clone());
            names.push(card.name.clone());
        }
    }
    let lookup = CardLookup::build(&state.db, &identifiers, &names).await?;

    // Resolve recs (deck match by the entry's oracle id) and section cards
    // (deck match by the resolved card's oracle id).
    let resolve_rec = |rec: &RecEntry<'_>| {
        let local_card = lookup.local_card(rec.oracle_id.as_deref(), &rec.name);
        Suggested {
            local_card,
            deck_card: matching_deck_card(deck, rec.oracle_id.as_deref(), &rec.name),
        }
    };
    let resolve_section_card = |card: &SectionCard<'_>| {
        let local_card = lookup.local_card(card.identifier.as_deref(), &card.name);
        Suggested {
            local_card,
            deck_card: matching_deck_card(
                deck,
                local_card.map(|card| card.oracle_id.as_str()),
                &card.name,
            ),
        }
    };
    let mut suggestions: Vec<Suggested<'_>> = Vec::new();
    suggestions.extend(in_recs.iter().map(resolve_rec));
    suggestions.extend(out_recs.iter().map(resolve_rec));
    for (_, cards) in sections.iter().flatten() {
        suggestions.extend(cards.iter().map(resolve_section_card));
    }
    let mut statuses = collection_statuses(&state.db, &suggestions)
        .await?
        .into_iter()
        .zip(suggestions);

    let mut rec_cards = |recs: &[RecEntry<'_>]| -> Vec<DeckEdhrecCard> {
        recs.iter()
            .zip(statuses.by_ref())
            .map(|(rec, (status, suggested))| DeckEdhrecCard {
                name: rec.name.clone(),
                oracle_id: rec
                    .oracle_id
                    .clone()
                    .or_else(|| suggested.local_card.map(|c| c.oracle_id.to_string()))
                    .map(ID),
                primary_type: rec
                    .entry
                    .get("primary_type")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                score: entry_number(rec.entry, "score").and_then(|n| n.as_f64()),
                salt: entry_number(rec.entry, "salt").and_then(|n| n.as_f64()),
                edhrec_url: Some(format!("https://edhrec.com/cards/{}", card_slug(&rec.name))),
                card: suggested.local_card.cloned().map(Card::from),
                collection_status: status,
            })
            .collect()
    };
    let recommendations = rec_cards(&in_recs);
    let cuts = rec_cards(&out_recs);

    let mut commander_pages = Vec::with_capacity(pages.len());
    for (fetched, page_sections) in pages.iter().zip(&sections) {
        let page = &fetched.page;
        let empty = Map::new();
        let container = object(page, "container").unwrap_or(&empty);
        let card = object(container, "json_dict")
            .and_then(|dict| object(dict, "card"))
            .unwrap_or(&empty);
        let sections = page_sections
            .iter()
            .map(|(section, cards)| EdhrecCardSection {
                header: page_value(section, "header").unwrap_or_else(|| "Cards".to_owned()),
                tag: page_value(section, "tag"),
                cards: cards
                    .iter()
                    .zip(statuses.by_ref())
                    .map(|(card, (status, suggested))| EdhrecSectionCard {
                        name: card.name.clone(),
                        oracle_id: suggested
                            .local_card
                            .map(|local| ID(local.oracle_id.to_string())),
                        synergy: page_number(card.entry, "synergy"),
                        inclusion: page_integer(card.entry, "inclusion"),
                        num_decks: page_integer(card.entry, "num_decks"),
                        potential_decks: page_integer(card.entry, "potential_decks"),
                        url: Some(edhrec_path(
                            page_value(card.entry, "url"),
                            format!("https://edhrec.com/cards/{}", card_slug(&card.name)),
                        )),
                        card: suggested.local_card.cloned().map(Card::from),
                        collection_status: status,
                    })
                    .collect(),
            })
            .collect();
        commander_pages.push(EdhrecCommanderPage {
            name: page_value(card, "name").unwrap_or_else(|| fetched.name.clone()),
            title: page_value(page, "title")
                .or_else(|| page_value(page, "header"))
                .unwrap_or_else(|| fetched.name.clone()),
            description: Some(
                page_value(container, "description")
                    .or_else(|| page_value(page, "description"))
                    .unwrap_or_else(|| "EDHREC commander data".to_owned()),
            ),
            url: commander_url(&fetched.entry, fetched.theme_slug.as_deref()),
            rank: page_integer(card, "rank"),
            deck_count: page_integer(card, "num_decks")
                .or_else(|| page_integer(page, "num_decks_avg")),
            salt: page_number(card, "salt"),
            avg_price: page_number(page, "avg_price"),
            color_identity: page_list(card, "color_identity"),
            similar: page_list(page, "similar"),
            themes: page_themes(page),
            stats: page_stats(page),
            sections,
        });
    }

    Ok(DeckEdhrec {
        commander_names,
        recommendations,
        cuts,
        commander_pages,
        more: response.get("more") == Some(&Value::Bool(true)),
    })
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn commander_entries_put_the_partner_page_first() {
        let names = ["Zeta Partner".to_owned(), "Alpha Partner".to_owned()];
        let entries = commander_page_entries(&names);
        assert_eq!(
            entries,
            [
                CommanderEntry::Pair("Zeta Partner".into(), "Alpha Partner".into()),
                CommanderEntry::Single("Zeta Partner".into()),
                CommanderEntry::Single("Alpha Partner".into()),
            ]
        );
        assert_eq!(entries[0].slug(), "alpha-partner-zeta-partner");
        assert_eq!(entries[0].display_name(), "Alpha Partner // Zeta Partner");
        assert_eq!(
            commander_page_entries(&["Solo".to_owned(), "Solo".to_owned()]),
            [
                CommanderEntry::Pair("Solo".into(), "Solo".into()),
                CommanderEntry::Single("Solo".into())
            ]
        );
    }

    #[test]
    fn page_numbers_round_like_elixir() {
        let page = json!({"a": 2.5, "b": -2.5, "c": 7, "d": "x", "avg_price": 100_000.4})
            .as_object()
            .cloned()
            .unwrap();
        assert_eq!(page_integer(&page, "a"), Some(3));
        assert_eq!(page_integer(&page, "b"), Some(-3));
        assert_eq!(page_integer(&page, "c"), Some(7));
        assert_eq!(page_integer(&page, "d"), None);
        assert_eq!(
            page_stats(&page),
            [EdhrecStat {
                label: "Average price".into(),
                value: "$100000".into()
            }]
        );
    }

    #[test]
    fn edhrec_paths_become_absolute_urls() {
        let fallback = || "fallback".to_owned();
        assert_eq!(
            edhrec_path(Some("/cards/sol-ring".into()), fallback()),
            "https://edhrec.com/cards/sol-ring"
        );
        assert_eq!(
            edhrec_path(Some("https://x.test/a".into()), fallback()),
            "https://x.test/a"
        );
        assert_eq!(edhrec_path(Some("cards".into()), fallback()), "fallback");
        assert_eq!(edhrec_path(None, fallback()), "fallback");
    }
}
