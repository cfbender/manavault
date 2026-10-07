//! Combos in a deck from Commander Spellbook (`Catalog.CommanderSpellbook`).

use std::fmt::Write as _;
use std::time::Duration;

use async_graphql::{ID, SimpleObject};
use lotus::Zone;
use manavault_allocation::{AllocationError, DeckId};
use serde_json::{Map, Value, json};

use crate::deck_intel::DeckContext;
use crate::state::AppState;

const USER_AGENT: &str = "ManaVault/1.0";

/// Why a Commander Spellbook request failed
/// (`Errors.commander_spellbook_error/1` messages).
#[derive(Debug, thiserror::Error)]
pub enum SpellbookError {
    #[error("Commander Spellbook returned an unexpected response.")]
    UnexpectedResponse,
    #[error("Commander Spellbook returned HTTP {0}.")]
    Http(u16),
    #[error("Could not reach Commander Spellbook. Try again in a moment.")]
    RequestFailed(String),
    #[error(transparent)]
    Allocation(#[from] AllocationError),
}

/// `DeckComboCard`.
#[derive(Debug, Clone, PartialEq, Eq, SimpleObject)]
pub struct DeckComboCard {
    pub name: String,
    pub quantity: i64,
    pub image_url: Option<String>,
}

/// `DeckCombo`.
#[derive(Debug, Clone, PartialEq, Eq, SimpleObject)]
pub struct DeckCombo {
    pub id: ID,
    pub url: String,
    pub cards: Vec<DeckComboCard>,
    pub produces: Vec<String>,
    pub description: String,
    pub mana_needed: Option<String>,
    pub prerequisites: Vec<String>,
    pub notes: Option<String>,
}

/// Commander and mainboard cards by name; considering cards are left out.
pub(crate) fn payload(deck: &DeckContext) -> Value {
    let entries = |zone: Zone| {
        let mut cards: Vec<&manavault_allocation::NamedDeckCard> = deck
            .cards
            .iter()
            .filter(|named| named.card.zone == zone)
            .collect();
        cards.sort_by(|a, b| (&a.name, a.card.id).cmp(&(&b.name, b.card.id)));
        cards
            .into_iter()
            .map(|named| json!({"card": named.name, "quantity": named.card.quantity.get()}))
            .collect::<Vec<_>>()
    };
    json!({"main": entries(Zone::Mainboard), "commanders": entries(Zone::Commander)})
}

/// The deck's combos (`CommanderSpellbook.combos/2`). An empty deck makes no
/// request.
pub async fn deck_combos(
    state: &AppState,
    deck_id: DeckId,
) -> Result<Vec<DeckCombo>, SpellbookError> {
    let deck = DeckContext::load(&state.db, deck_id).await?;
    let payload = payload(&deck);
    let is_empty = |key: &str| {
        payload
            .get(key)
            .and_then(Value::as_array)
            .is_none_or(Vec::is_empty)
    };
    if is_empty("main") && is_empty("commanders") {
        return Ok(Vec::new());
    }
    let response = fetch(
        &state.http,
        &state.config.deck_intel.commander_spellbook,
        &payload,
    )
    .await?;
    normalize(&response)
}

async fn fetch(
    http: &reqwest::Client,
    url: &str,
    payload: &Value,
) -> Result<Map<String, Value>, SpellbookError> {
    let response = http
        .post(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .json(payload)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|error| SpellbookError::RequestFailed(error.to_string()))?;
    let status = response.status();
    let body = response
        .bytes()
        .await
        .map_err(|error| SpellbookError::RequestFailed(error.to_string()))?;
    match serde_json::from_slice::<Value>(&body) {
        Ok(Value::Object(map)) if status.is_success() => Ok(map),
        _ => Err(SpellbookError::Http(status.as_u16())),
    }
}

/// `normalize/1`: the `results.included` combos.
pub(crate) fn normalize(response: &Map<String, Value>) -> Result<Vec<DeckCombo>, SpellbookError> {
    match response
        .get("results")
        .and_then(Value::as_object)
        .and_then(|results| results.get("included"))
    {
        Some(Value::Array(included)) => Ok(included
            .iter()
            .filter_map(Value::as_object)
            .map(normalize_combo)
            .collect()),
        _ => Err(SpellbookError::UnexpectedResponse),
    }
}

fn string_value(map: &Map<String, Value>, key: &str) -> String {
    map.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn optional_string(map: &Map<String, Value>, key: &str) -> Option<String> {
    let value = string_value(map, key);
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Non-blank trimmed lines (`String.split(value, ~r/\R/u)`).
fn lines(value: &str) -> Vec<String> {
    value
        .split([
            '\n', '\r', '\u{000B}', '\u{000C}', '\u{0085}', '\u{2028}', '\u{2029}',
        ])
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

/// `URI.encode/1`: percent-encodes everything but unreserved and reserved
/// characters.
fn uri_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        let keep = byte.is_ascii_alphanumeric() || b"-._~:/?#[]@!$&'()*+,;=".contains(&byte);
        if keep {
            encoded.push(char::from(byte));
        } else {
            let _ = write!(encoded, "%{byte:02X}");
        }
    }
    encoded
}

fn normalize_combo(combo: &Map<String, Value>) -> DeckCombo {
    let id = match combo.get("id") {
        Some(Value::String(id)) => id.clone(),
        Some(Value::Number(id)) => id.to_string(),
        _ => String::new(),
    };
    let cards = match combo.get("uses") {
        Some(Value::Array(uses)) => uses
            .iter()
            .filter_map(Value::as_object)
            .filter_map(|use_| {
                let card = use_.get("card").and_then(Value::as_object)?;
                let name = card.get("name").and_then(Value::as_str)?;
                let quantity = use_
                    .get("quantity")
                    .and_then(Value::as_i64)
                    .filter(|quantity| *quantity > 0)
                    .unwrap_or(1);
                let image = |key: &str| card.get(key).and_then(Value::as_str).map(str::to_owned);
                Some(DeckComboCard {
                    name: name.to_owned(),
                    quantity,
                    image_url: image("imageUriFrontSmall").or_else(|| image("imageUriFrontNormal")),
                })
            })
            .collect(),
        _ => Vec::new(),
    };
    let produces = match combo.get("produces") {
        Some(Value::Array(produces)) => produces
            .iter()
            .filter_map(|produce| {
                produce
                    .get("feature")
                    .and_then(|feature| feature.get("name"))
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            })
            .collect(),
        _ => Vec::new(),
    };
    let mut prerequisites = lines(&string_value(combo, "easyPrerequisites"));
    prerequisites.extend(lines(&string_value(combo, "notablePrerequisites")));
    DeckCombo {
        url: format!("https://commanderspellbook.com/combo/{}", uri_encode(&id)),
        id: ID(id),
        cards,
        produces,
        description: string_value(combo, "description"),
        mana_needed: optional_string(combo, "manaNeeded"),
        prerequisites,
        notes: optional_string(combo, "notes"),
    }
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn normalizes_included_combos() {
        let response = json!({
            "results": {"included": [{
                "id": "1-2",
                "uses": [
                    {"card": {"name": "Black Lotus", "imageUriFrontSmall": "https://example.test/lotus.jpg"}, "quantity": 1},
                    {"card": {"name": "Time Walk"}, "quantity": 2},
                    {"card": {"name": "Odd"}, "quantity": 0},
                    {"card": {}}
                ],
                "produces": [{"feature": {"name": "Infinite turns"}}, {"feature": {}}],
                "description": "Cast Time Walk.\nRepeat.",
                "manaNeeded": "{1}{U}",
                "easyPrerequisites": "Black Lotus is untapped.",
                "notablePrerequisites": "Your library has cards.\r\nYou can cast Time Walk.\n\n",
                "notes": "  "
            }]}
        });
        let combos = normalize(response.as_object().unwrap()).unwrap();
        assert_eq!(
            combos,
            [DeckCombo {
                id: ID("1-2".into()),
                url: "https://commanderspellbook.com/combo/1-2".into(),
                cards: vec![
                    DeckComboCard {
                        name: "Black Lotus".into(),
                        quantity: 1,
                        image_url: Some("https://example.test/lotus.jpg".into())
                    },
                    DeckComboCard {
                        name: "Time Walk".into(),
                        quantity: 2,
                        image_url: None
                    },
                    DeckComboCard {
                        name: "Odd".into(),
                        quantity: 1,
                        image_url: None
                    },
                ],
                produces: vec!["Infinite turns".into()],
                description: "Cast Time Walk.\nRepeat.".into(),
                mana_needed: Some("{1}{U}".into()),
                prerequisites: vec![
                    "Black Lotus is untapped.".into(),
                    "Your library has cards.".into(),
                    "You can cast Time Walk.".into()
                ],
                notes: None,
            }]
        );
        assert!(matches!(
            normalize(json!({}).as_object().unwrap()),
            Err(SpellbookError::UnexpectedResponse)
        ));
        assert_eq!(uri_encode("a b/é"), "a%20b/%C3%A9");
    }
}
