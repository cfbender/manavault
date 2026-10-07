//! Format legality of a decklist (`Manavault.Catalog.DeckLegality`).

use std::collections::{BTreeSet, HashMap, HashSet};

use lotus::{OracleId, Zone};
use serde_json::Value;

use crate::catalog::card::CardRecord;
use crate::catalog::json;
use crate::decks::commander;
use crate::decks::model::{DeckFormat, counts_toward_deck};

/// One deck card as the legality rules see it.
#[derive(Debug, Clone, Copy)]
pub struct LegalityCard<'a> {
    pub oracle_id: &'a OracleId,
    pub zone: Zone,
    pub quantity: u32,
    pub card: Option<&'a CardRecord>,
}

/// One rule violation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegalityIssue {
    pub code: &'static str,
    pub message: String,
    pub severity: &'static str,
    pub card_name: Option<String>,
}

/// The outcome: `"legal"` with no issues, else `"illegal"`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckLegality {
    pub status: &'static str,
    pub issues: Vec<LegalityIssue>,
}

fn issue(code: &'static str, message: String, card_name: Option<String>) -> LegalityIssue {
    LegalityIssue {
        code,
        message,
        severity: "error",
        card_name,
    }
}

fn card_name(card: &LegalityCard<'_>) -> String {
    card.card
        .map_or_else(|| card.oracle_id.to_string(), |record| record.name.clone())
}

fn color_identity(card: &LegalityCard<'_>) -> BTreeSet<String> {
    card.card
        .map(|record| json::strings(&record.color_identity))
        .unwrap_or_default()
        .into_iter()
        .collect()
}

fn colors_message(colors: &BTreeSet<String>) -> String {
    if colors.is_empty() {
        "none".to_owned()
    } else {
        colors.iter().map(String::as_str).collect()
    }
}

fn pluralize_color(count: usize) -> &'static str {
    if count == 1 { "color" } else { "colors" }
}

fn is_basic_land(card: &LegalityCard<'_>) -> bool {
    card.card.is_some_and(CardRecord::is_basic_land)
}

/// `DeckLegality.evaluate/1`.
#[must_use]
pub fn evaluate(format: DeckFormat, cards: &[LegalityCard<'_>]) -> DeckLegality {
    let counted: Vec<&LegalityCard<'_>> = cards
        .iter()
        .filter(|card| counts_toward_deck(card.zone))
        .collect();
    let mut issues = card_legality_issues(format, &counted);
    if format == DeckFormat::Commander {
        issues.extend(deck_size_issues(&counted));
        issues.extend(commander_count_issues(&counted));
        issues.extend(singleton_issues(&counted));
        issues.extend(color_identity_issues(&counted));
    }
    DeckLegality {
        status: if issues.is_empty() {
            "legal"
        } else {
            "illegal"
        },
        issues,
    }
}

fn card_legality_issues(format: DeckFormat, cards: &[&LegalityCard<'_>]) -> Vec<LegalityIssue> {
    let mut seen = HashSet::new();
    cards
        .iter()
        .filter(|card| seen.insert(card.oracle_id))
        .filter_map(|card| {
            let legalities = card
                .card
                .map(|record| json::object(&record.legalities))
                .unwrap_or_default();
            let status = match legalities.get(format.as_str()) {
                Some(Value::String(status)) if status == "legal" => return None,
                Some(Value::String(status)) => status.clone(),
                Some(Value::Null) | None => "missing".to_owned(),
                Some(other) => other.to_string(),
            };
            let name = card_name(card);
            Some(issue(
                "card_legality",
                format!("{name} is not legal in {format} (status: {status})."),
                Some(name),
            ))
        })
        .collect()
}

fn total(cards: &[&LegalityCard<'_>]) -> u32 {
    cards
        .iter()
        .fold(0u32, |sum, card| sum.saturating_add(card.quantity))
}

fn deck_size_issues(cards: &[&LegalityCard<'_>]) -> Option<LegalityIssue> {
    let count = total(cards);
    (count != 100).then(|| {
        issue(
            "commander_deck_size",
            format!(
                "Commander decks must contain exactly 100 counted cards; this deck has {count}."
            ),
            None,
        )
    })
}

fn commander_count_issues(cards: &[&LegalityCard<'_>]) -> Option<LegalityIssue> {
    let commanders: Vec<&LegalityCard<'_>> = cards
        .iter()
        .copied()
        .filter(|card| card.zone == Zone::Commander)
        .collect();
    let count = total(&commanders);
    match (count, commanders.as_slice()) {
        (1, _) => None,
        (2, [a, b]) => {
            let paired = match (a.card, b.card) {
                (Some(left), Some(right)) => commander::valid_pair(left, right),
                _ => false,
            };
            (!paired).then(|| {
                issue(
                    "commander_count",
                    format!(
                        "{} and {} can't be paired as commanders; two commanders require a pairing ability such as Partner, Partner with, Friends forever, Doctor's companion, or Choose a Background.",
                        card_name(a),
                        card_name(b)
                    ),
                    None,
                )
            })
        }
        _ => Some(issue(
            "commander_count",
            format!(
                "Commander decks must have exactly one commander, or two with a pairing ability such as Partner; this deck has {count}."
            ),
            None,
        )),
    }
}

fn singleton_issues(cards: &[&LegalityCard<'_>]) -> Vec<LegalityIssue> {
    let mut order: Vec<&OracleId> = Vec::new();
    let mut groups: HashMap<&OracleId, Vec<&LegalityCard<'_>>> = HashMap::new();
    for card in cards.iter().copied().filter(|card| !is_basic_land(card)) {
        groups
            .entry(card.oracle_id)
            .or_insert_with(|| {
                order.push(card.oracle_id);
                Vec::new()
            })
            .push(card);
    }
    let mut issues: Vec<LegalityIssue> = order
        .into_iter()
        .filter_map(|key| {
            let group = groups.get(key)?;
            let count = total(group);
            let first = group.first()?;
            (count > 1).then(|| {
                let name = card_name(first);
                issue(
                    "commander_singleton",
                    format!(
                        "{name} appears {count} times; Commander allows only one copy of a non-basic land."
                    ),
                    Some(name),
                )
            })
        })
        .collect();
    issues.sort_by(|a, b| a.card_name.cmp(&b.card_name));
    issues
}

fn color_identity_issues(cards: &[&LegalityCard<'_>]) -> Vec<LegalityIssue> {
    let (commanders, others): (Vec<&LegalityCard<'_>>, Vec<&LegalityCard<'_>>) = cards
        .iter()
        .copied()
        .partition(|card| card.zone == Zone::Commander);
    let commander_colors: BTreeSet<String> =
        commanders.iter().flat_map(|c| color_identity(c)).collect();
    // Commanders such as The Prismatic Piper or Clara Oswald choose a color
    // before the game; each adds one chosen color to the deck's identity.
    let chosen_slots = commanders
        .iter()
        .filter(|card| {
            card.card.is_some_and(|record| {
                commander::chooses_color_before_game(record.oracle_text.as_deref())
            })
        })
        .count();

    let extras: Vec<(&LegalityCard<'_>, BTreeSet<String>)> = others
        .iter()
        .filter_map(|card| {
            let extra: BTreeSet<String> = color_identity(card)
                .difference(&commander_colors)
                .cloned()
                .collect();
            (!extra.is_empty()).then_some((*card, extra))
        })
        .collect();

    let per_card: Vec<LegalityIssue> = extras
        .iter()
        .filter(|(_, extra)| extra.len() > chosen_slots)
        .map(|(card, _)| {
            let colors = color_identity(card);
            let name = card_name(card);
            let message = if chosen_slots == 0 {
                format!(
                    "{name} color identity {} is outside commander color identity {}.",
                    colors_message(&colors),
                    colors_message(&commander_colors)
                )
            } else {
                format!(
                    "{name} color identity {} needs more colors beyond the commanders' color identity {} than the {chosen_slots} chosen {} the commanders can add.",
                    colors_message(&colors),
                    colors_message(&commander_colors),
                    pluralize_color(chosen_slots)
                )
            };
            issue("commander_color_identity", message, Some(name))
        })
        .collect();

    if !per_card.is_empty() {
        return per_card;
    }
    let combined: BTreeSet<String> = extras
        .iter()
        .flat_map(|(_, extra)| extra.iter().cloned())
        .collect();
    if combined.len() > chosen_slots {
        vec![issue(
            "commander_color_identity",
            format!(
                "Cards outside the commanders' color identity {} use {}, but the commanders can only add {chosen_slots} chosen {}.",
                colors_message(&commander_colors),
                colors_message(&combined),
                pluralize_color(chosen_slots)
            ),
            None,
        )]
    } else {
        Vec::new()
    }
}
