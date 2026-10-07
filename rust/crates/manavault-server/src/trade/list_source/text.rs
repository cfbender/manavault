//! Pasted decklist text (`Manavault.Catalog.Decklists.parse/2` without a
//! zone override, plus `ListSource.from_text/1`).
//!
//! INTEGRATION: the deck port owns `Catalog.Decklists`; this is a private
//! copy of its parser so trade lists work before that lands. Replace it with
//! the deck module's parser when merging if they agree.

use std::collections::HashMap;
use std::sync::LazyLock;

use lotus::Zone;
use regex::Regex;
use sqlx::SqlitePool;

use crate::catalog::search::cards_by_name::normalize_card_name;
use crate::catalog::search::printings::get_printing;
use crate::trade::list_source::ListEntry;

static LINE_BREAK: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"\r\n|\n|\r|\x0B|\x0C|\u{85}|\u{2028}|\u{2029}").ok());
static COMMENT: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\s+#.*$").ok());
static CARD_LINE: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"(?is)^\s*(?:(?P<quantity>\d+)\s*x?\s+)?(?P<name>.+?)\s*$").ok());
static PRINTING: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"(?s)^(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\S+)\s*$").ok());
static FOIL: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"(?i)\*F\*\s*$").ok());
static ETCHED: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"(?i)\*E\*\s*$").ok());

/// A parsed line before deduplication.
struct Line {
    name: String,
    quantity: i64,
    zone: Zone,
    finish: &'static str,
    printing: Option<Printing>,
}

/// The printing a `Name (SET) 123` annotation names.
#[derive(Clone, PartialEq, Eq)]
struct Printing {
    scryfall_id: String,
    set_code: String,
    collector_number: String,
}

/// `Util.parse_quantity/1` for the digits the line regex captured.
fn parse_quantity(quantity: Option<&str>) -> i64 {
    match quantity {
        None => 1,
        Some(digits) => digits.parse().unwrap_or(1),
    }
}

fn zone_heading(line: &str) -> Option<Zone> {
    let lowered = line.to_lowercase();
    match lowered.trim_end_matches(':') {
        "main" | "mainboard" | "deck" => Some(Zone::Mainboard),
        "side" | "sideboard" | "maybe" | "maybeboard" | "considering" => Some(Zone::Considering),
        "commander" | "commanders" => Some(Zone::Commander),
        _ => None,
    }
}

fn strip_comment(line: &str) -> String {
    match COMMENT.as_ref() {
        Some(comment) => comment.replace(line, "").trim().to_owned(),
        None => line.trim().to_owned(),
    }
}

fn finish(line: &str) -> &'static str {
    if FOIL.as_ref().is_some_and(|regex| regex.is_match(line)) {
        "foil"
    } else if ETCHED.as_ref().is_some_and(|regex| regex.is_match(line)) {
        "etched"
    } else {
        "nonfoil"
    }
}

async fn card_name_and_printing(
    pool: &SqlitePool,
    name: &str,
) -> Result<(String, Option<Printing>), sqlx::Error> {
    let cleaned = normalize_card_name(name);
    let captures = PRINTING.as_ref().and_then(|regex| regex.captures(&cleaned));
    let Some(captures) = captures else {
        return Ok((cleaned, None));
    };
    let (Some(card_name), Some(set_code), Some(collector_number)) =
        (captures.get(1), captures.get(2), captures.get(3))
    else {
        return Ok((cleaned, None));
    };
    let printing = get_printing(pool, set_code.as_str(), collector_number.as_str())
        .await?
        .map(|printing| Printing {
            scryfall_id: printing.scryfall_id.into_string(),
            set_code: printing.set_code,
            collector_number: printing.collector_number,
        });
    Ok((normalize_card_name(card_name.as_str()), printing))
}

async fn card_line(pool: &SqlitePool, line: &str, zone: Zone) -> Result<Option<Line>, sqlx::Error> {
    if let Some(rest) = line.strip_prefix("SB:") {
        return Box::pin(card_line(pool, rest.trim(), Zone::Considering)).await;
    }
    let Some(captures) = CARD_LINE.as_ref().and_then(|regex| regex.captures(line)) else {
        return Ok(None);
    };
    let Some(name) = captures.name("name") else {
        return Ok(None);
    };
    let (name, printing) = card_name_and_printing(pool, name.as_str()).await?;
    Ok(Some(Line {
        name,
        quantity: parse_quantity(captures.name("quantity").map(|m| m.as_str())),
        zone,
        finish: finish(line),
        printing,
    }))
}

/// Parses decklist text into entries: zone headings (`Commander`,
/// `Sideboard:`, ...), `SB:` prefixes, `4x Name (SET) 123 *F*` lines, and
/// `# comments`. Duplicate lines (same name, zone, printing, and finish)
/// merge, keeping the larger quantity. A `(SET) 123` annotation that names
/// a known printing fills in its set code and collector number.
pub async fn parse(pool: &SqlitePool, text: &str) -> Result<Vec<ListEntry>, sqlx::Error> {
    let lines: Vec<&str> = match LINE_BREAK.as_ref() {
        Some(regex) => regex.split(text).collect(),
        None => text.lines().collect(),
    };
    let mut zone = Zone::Mainboard;
    let mut parsed = Vec::new();
    for raw in lines {
        let line = strip_comment(raw.trim());
        if line.is_empty() {
            continue;
        }
        if let Some(heading) = zone_heading(&line) {
            zone = heading;
            continue;
        }
        if let Some(entry) = card_line(pool, &line, zone).await? {
            parsed.push(entry);
        }
    }
    Ok(dedupe(parsed)
        .into_iter()
        .map(|line| ListEntry {
            name: line.name,
            quantity: line.quantity,
            zone: line.zone,
            set_code: line.printing.as_ref().map(|p| p.set_code.clone()),
            collector_number: line.printing.map(|p| p.collector_number),
        })
        .collect())
}

type Key = (String, Zone, Option<String>, &'static str);

fn dedupe(lines: Vec<Line>) -> Vec<Line> {
    let mut order: Vec<Key> = Vec::new();
    let mut merged: HashMap<Key, Line> = HashMap::new();
    for line in lines {
        let key = (
            line.name.to_lowercase(),
            line.zone,
            line.printing.as_ref().map(|p| p.scryfall_id.clone()),
            line.finish,
        );
        if let Some(existing) = merged.get_mut(&key) {
            existing.quantity = existing.quantity.max(line.quantity);
            if line.printing.is_some() {
                existing.printing = line.printing;
            }
        } else {
            order.push(key.clone());
            merged.insert(key, line);
        }
    }
    order
        .into_iter()
        .filter_map(|key| merged.remove(&key))
        .collect()
}
