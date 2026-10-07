//! Plain-text decklists (`Catalog.Decklists`, `Decks.DecklistIO`).

use std::collections::HashMap;
use std::sync::LazyLock;

use lotus::{Finish, OracleId, ScryfallId, Zone};
use regex::Regex;
use sqlx::SqlitePool;

use crate::decks::cards::{self, DeckCardChanges};
use crate::decks::contents::LoadedDeckCard;
use crate::decks::model::{DeckCardRow, DeckId, load_deck_on, parse_zone};
use crate::decks::{DeckError, ensure_decklist_editable};
use manavault_catalog::catalog::search::cards_by_name;
use manavault_core::db;

// The line, printing, and finish patterns match ASCII `\d` and `\s` only, as
// in earlier releases; `(?-u:...)` keeps them ASCII. The comment pattern and
// `\R` line breaks are Unicode-aware.
static LINE_BREAK: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new("\r\n|[\n\u{0B}\u{0C}\r\u{85}\u{2028}\u{2029}]").ok());
static CARD_LINE: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?-u:\s)*(?:((?-u:\d)+)(?-u:\s)*x?(?-u:\s)+)?(.+?)(?-u:\s)*$").ok()
});
static PRINTING: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(r"^(.+?)(?-u:\s)+\(([A-Za-z0-9]+)\)(?-u:\s)+([^\t\n\x0B\x0C\r ]+)(?-u:\s)*$").ok()
});
static FOIL: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"(?i)\*F\*(?-u:\s)*$").ok());
static ETCHED: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"(?i)\*E\*(?-u:\s)*$").ok());
static COMMENT: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\s+#.*$").ok());

fn matches(re: &LazyLock<Option<Regex>>, text: &str) -> bool {
    re.as_ref().is_some_and(|re| re.is_match(text))
}

/// One parsed decklist line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecklistEntry {
    pub quantity: i64,
    pub name: String,
    pub zone: String,
    pub finish: Finish,
    /// The printing named by `(SET) number`, when it exists in the catalog.
    pub preferred_printing_id: Option<ScryfallId>,
}

fn zone_heading(line: &str) -> Option<&'static str> {
    let lower = line.to_lowercase();
    match lower.trim_end_matches(':') {
        "main" | "mainboard" | "deck" => Some("mainboard"),
        "side" | "sideboard" | "maybe" | "maybeboard" | "considering" => Some("considering"),
        "commander" | "commanders" => Some("commander"),
        _ => None,
    }
}

fn strip_comment(line: &str) -> String {
    match COMMENT.as_ref() {
        Some(re) => re.replace(line, "").trim().to_owned(),
        None => line.trim().to_owned(),
    }
}

/// `Util.parse_quantity/1` on the line's digits. Earlier releases had no
/// integer upper bound, so a count beyond `i64` saturates (and then fails the deck
/// card's quantity limit) instead of becoming 1.
fn parse_quantity(digits: Option<&str>) -> i64 {
    match digits {
        None | Some("") => 1,
        Some(digits) => digits.parse().unwrap_or(i64::MAX),
    }
}

struct RawEntry {
    quantity: i64,
    name: String,
    zone: String,
    finish: Finish,
    set_and_number: Option<(String, String)>,
}

fn parse_card_line(line: &str, zone: &str) -> Option<RawEntry> {
    if let Some(rest) = line.strip_prefix("SB:") {
        return parse_card_line(rest.trim(), "considering");
    }
    let captures = CARD_LINE.as_ref()?.captures(line)?;
    let name = captures.get(2)?.as_str();
    let cleaned = cards_by_name::normalize_card_name(name);
    let (name, set_and_number) = match PRINTING.as_ref().and_then(|re| re.captures(&cleaned)) {
        Some(printing) => (
            cards_by_name::normalize_card_name(printing.get(1).map_or("", |m| m.as_str())),
            Some((
                printing.get(2).map_or("", |m| m.as_str()).to_owned(),
                printing.get(3).map_or("", |m| m.as_str()).to_owned(),
            )),
        ),
        None => (cleaned, None),
    };
    let finish = if matches(&FOIL, line) {
        Finish::Foil
    } else if matches(&ETCHED, line) {
        Finish::Etched
    } else {
        Finish::Nonfoil
    };
    Some(RawEntry {
        quantity: parse_quantity(captures.get(1).map(|m| m.as_str())),
        name,
        zone: zone.to_owned(),
        finish,
        set_and_number,
    })
}

/// `Decklists.parse/2`: headings switch zones, `SB:` lines are considering,
/// `#` starts a comment, and repeated lines for the same card, zone,
/// printing, and finish collapse to the largest quantity. `zone` overrides
/// every line's zone. This is the one pasted-decklist parser: deck imports,
/// trade lists (`trade::list_source::text`), and list analysis use it.
pub async fn parse(
    pool: &SqlitePool,
    text: &str,
    zone: Option<&str>,
) -> Result<Vec<DecklistEntry>, sqlx::Error> {
    let mut current = "mainboard";
    let mut raw = Vec::new();
    let lines: Vec<&str> = match LINE_BREAK.as_ref() {
        Some(pattern) => pattern.split(text).collect(),
        None => text.lines().collect(),
    };
    for line in lines {
        let line = strip_comment(line.trim());
        if line.is_empty() {
            continue;
        }
        if let Some(heading) = zone_heading(&line) {
            current = heading;
            continue;
        }
        if let Some(entry) = parse_card_line(&line, current) {
            raw.push(entry);
        }
    }

    let mut entries = Vec::with_capacity(raw.len());
    for entry in raw {
        let preferred_printing_id = match &entry.set_and_number {
            Some((set, number)) => {
                manavault_catalog::catalog::search::printings::get_printing(pool, set, number)
                    .await?
                    .map(|printing| printing.scryfall_id)
            }
            None => None,
        };
        entries.push(DecklistEntry {
            quantity: entry.quantity,
            name: entry.name,
            zone: zone.map_or(entry.zone, str::to_owned),
            finish: entry.finish,
            preferred_printing_id,
        });
    }
    Ok(dedupe(entries))
}

fn dedupe(entries: Vec<DecklistEntry>) -> Vec<DecklistEntry> {
    type Key = (String, String, Option<ScryfallId>, Finish);
    let mut order: Vec<Key> = Vec::new();
    let mut deduped: HashMap<Key, DecklistEntry> = HashMap::new();
    for entry in entries {
        let key = (
            entry.name.to_lowercase(),
            entry.zone.clone(),
            entry.preferred_printing_id.clone(),
            entry.finish,
        );
        if let Some(existing) = deduped.get_mut(&key) {
            existing.quantity = existing.quantity.max(entry.quantity);
            if entry.preferred_printing_id.is_some() {
                existing.preferred_printing_id = entry.preferred_printing_id;
            }
        } else {
            order.push(key.clone());
            deduped.insert(key, entry);
        }
    }
    order
        .into_iter()
        .filter_map(|key| deduped.remove(&key))
        .collect()
}

/// One decklist line for a deck card, `"2x Name (SET) 123 *F*"`, the format
/// [`parse`] reads back (`Decklists.export_line/1`).
#[must_use]
pub fn export_line(card: &LoadedDeckCard) -> String {
    let mut parts = vec![
        format!("{}x", card.row.quantity.get()),
        card.card.name.clone(),
    ];
    if let Some(printing) = &card.preferred_printing {
        parts.push(format!(
            "({}) {}",
            printing.set_code.to_uppercase(),
            printing.collector_number
        ));
    }
    match card.row.finish {
        Finish::Foil => parts.push("*F*".to_owned()),
        Finish::Etched => parts.push("*E*".to_owned()),
        Finish::Nonfoil => {}
    }
    parts.retain(|part| !part.is_empty());
    parts.join(" ")
}

/// `Decklists.export/1`: mainboard, considering, and commander sections,
/// each sorted by card name, separated by blank lines.
#[must_use]
pub fn export(cards: &[LoadedDeckCard]) -> String {
    [
        (Zone::Mainboard, "Mainboard"),
        (Zone::Considering, "Considering"),
        (Zone::Commander, "Commander"),
    ]
    .into_iter()
    .filter_map(|(zone, label)| {
        let mut zone_cards: Vec<&LoadedDeckCard> =
            cards.iter().filter(|card| card.row.zone == zone).collect();
        if zone_cards.is_empty() {
            return None;
        }
        zone_cards.sort_by(|a, b| a.card.name.cmp(&b.card.name));
        let lines: Vec<String> = zone_cards.into_iter().map(export_line).collect();
        Some(format!("{label}\n{}", lines.join("\n")))
    })
    .collect::<Vec<String>>()
    .join("\n\n")
}

/// `DeckImportResult`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImportResult {
    pub imported: i64,
    pub unresolved: Vec<String>,
    pub skipped_printings: Vec<String>,
}

/// `Decks.import_decklist/3`. With `replace`, the deck's cards are removed
/// first and their copies returned to their source locations.
pub async fn import_decklist(
    pool: &SqlitePool,
    deck_id: DeckId,
    text: &str,
    replace: bool,
    zone: Option<&str>,
) -> Result<ImportResult, DeckError> {
    let deck = crate::decks::records::get_deck(pool, deck_id).await?;
    ensure_decklist_editable(&deck)?;
    if let Some(zone) = zone
        && parse_zone(zone).is_none()
    {
        return Err(DeckError::Message(format!("Unknown deck zone: {zone}")));
    }
    let entries = parse(pool, text, zone).await?;
    let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();
    let cards = cards_by_name::by_names(pool, &names).await?;
    let printing_ids: Vec<ScryfallId> = entries
        .iter()
        .filter_map(|entry| entry.preferred_printing_id.clone())
        .collect();
    let printings =
        manavault_catalog::catalog::printing::Printing::load_many(pool, &printing_ids).await?;

    let mut tx = db::begin_write(pool).await?;
    let deck = load_deck_on(&mut tx, deck_id)
        .await?
        .ok_or(DeckError::DeckNotFound)?;
    if replace {
        for row in crate::decks::model::deck_card_rows(&mut tx, deck_id).await? {
            cards::delete_unchecked_in(&mut tx, &row).await?;
        }
    }
    let mut result = ImportResult::default();
    let mut rows: HashMap<(OracleId, String), DeckCardRow> = HashMap::new();
    for entry in entries {
        let Some(card) = cards.get(&cards_by_name::key(&entry.name)) else {
            result.unresolved.push(entry.name);
            continue;
        };
        let (preferred, skipped) = match &entry.preferred_printing_id {
            Some(id) => match printings.get(id) {
                Some(printing) if printing.oracle_id == card.oracle_id => (Some(id.clone()), false),
                _ => (None, true),
            },
            None => (None, false),
        };
        let key = (card.oracle_id.clone(), entry.zone.clone());
        let existing = match rows.get(&key) {
            Some(row) => Some(row.clone()),
            None => match parse_zone(&entry.zone) {
                Some(zone) => {
                    crate::deck_card_row_query!(
                        "WHERE dc.deck_id = ?1 AND dc.oracle_id = ?2 AND dc.zone = ?3",
                        deck.id,
                        card.oracle_id,
                        zone
                    )
                    .fetch_optional(&mut *tx)
                    .await?
                }
                None => None,
            },
        };
        let quantity = match &existing {
            Some(row) => row.quantity.as_i64().saturating_add(entry.quantity),
            None => entry.quantity,
        };
        let changes = DeckCardChanges {
            quantity: Some(Some(quantity)),
            zone: Some(Some(entry.zone.clone())),
            finish: Some(Some(entry.finish.as_str().to_owned())),
            preferred_printing_id: preferred.map(Some),
            ..DeckCardChanges::default()
        };
        let row = cards::write_import_row(
            &mut tx,
            deck.id,
            &card.oracle_id,
            existing.as_ref(),
            &changes,
        )
        .await?;
        result.imported += 1;
        if skipped {
            result.skipped_printings.push(entry.name);
        }
        rows.insert(key, row);
    }
    tx.commit().await?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn parses_headings_comments_and_aliases() {
        let app = crate::test_app::TestApp::new().await;
        let entries = parse(
            app.db(),
            "Deck:\n1 Black Lotus # note\n3x Black Lotus\n\nMaybe:\n2x Black Lotus *F*\nSB: Time Walk\n",
            None,
        )
        .await
        .unwrap();
        let summary: Vec<(i64, &str, &str, Finish)> = entries
            .iter()
            .map(|e| (e.quantity, e.name.as_str(), e.zone.as_str(), e.finish))
            .collect();
        assert_eq!(
            summary,
            vec![
                (3, "Black Lotus", "mainboard", Finish::Nonfoil),
                (2, "Black Lotus", "considering", Finish::Foil),
                (1, "Time Walk", "considering", Finish::Nonfoil),
            ]
        );
        let overridden = parse(
            app.db(),
            "Commander\n1 A\nSideboard\n1 B",
            Some("mainboard"),
        )
        .await
        .unwrap();
        assert!(overridden.iter().all(|e| e.zone == "mainboard"));
    }
    /// The cases the trade and AI copies of the parser covered: `\R` line
    /// breaks (a lone `\r`, U+2028), `[SET]` suffixes, `(SET) 123` printing
    /// lookups, and ASCII-only quantities.
    #[tokio::test]
    async fn parses_line_breaks_printings_and_quantities_like_earlier_releases() {
        let app = crate::test_app::TestApp::new().await;
        app.import_cards(&[manavault_catalog::testing::fixtures::black_lotus()])
            .await;
        let text = "Commander\r1 Test Commander\r\n\nMainboard:\u{2028}2x Plains # basics\n3 plains\n4 Black Lotus (LEA) 232\nSol Ring *F*\nSB: Island\nMaybe\n1 Opt [M21]\n\u{0663} Unicode Digit\n99999999999999999999 Huge";
        let entries = parse(app.db(), text, None).await.unwrap();
        let summary: Vec<(i64, &str, &str, Finish, bool)> = entries
            .iter()
            .map(|e| {
                (
                    e.quantity,
                    e.name.as_str(),
                    e.zone.as_str(),
                    e.finish,
                    e.preferred_printing_id.is_some(),
                )
            })
            .collect();
        assert_eq!(
            summary,
            vec![
                (1, "Test Commander", "commander", Finish::Nonfoil, false),
                (3, "Plains", "mainboard", Finish::Nonfoil, false),
                (4, "Black Lotus", "mainboard", Finish::Nonfoil, true),
                (1, "Sol Ring", "mainboard", Finish::Foil, false),
                (1, "Island", "considering", Finish::Nonfoil, false),
                (1, "Opt", "considering", Finish::Nonfoil, false),
                (
                    1,
                    "\u{0663} Unicode Digit",
                    "considering",
                    Finish::Nonfoil,
                    false
                ),
                (i64::MAX, "Huge", "considering", Finish::Nonfoil, false),
            ]
        );
    }
}
