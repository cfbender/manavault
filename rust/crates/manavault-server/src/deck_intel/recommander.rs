//! Recommander deck recommendations (`Catalog.Recommander`,
//! `Recommander.Client`, `Recommander.Payload`, `Recommander.Response`).

use std::time::Duration;

use async_graphql::{ID, SimpleObject};
use lotus::Zone;
use manavault_allocation::{AllocationError, DeckId};
use serde_json::{Map, Value, json};

use crate::catalog::card::Card;
use crate::catalog::edhrec::{CardLookup, entry_name, entry_number};
use crate::deck_intel::DeckContext;
use crate::deck_intel::status::DeckCardAllocationStatus;
use crate::deck_intel::suggest::{Suggested, collection_statuses, matching_deck_card};
use crate::state::AppState;

const USER_AGENT: &str = "ManaVault/0.1 (+https://github.com/cfbender/manavault)";

/// Why a Recommander request failed; the messages are
/// `Errors.recommander_error/1`'s.
#[derive(Debug, thiserror::Error)]
pub enum RecommanderError {
    #[error("Recommander requires a commander.")]
    MissingCommander,
    #[error("Recommander supports a commander and at most one partner.")]
    TooManyCommanders,
    #[error("Recommander returned an unexpected response.")]
    UnexpectedResponse,
    #[error("Recommander returned HTTP {0}.")]
    Http(u16),
    #[error("Could not reach Recommander: {0}")]
    RequestFailed(String),
    #[error("{}", api_error_message(.0, .1))]
    Api(String, Vec<String>),
    #[error(transparent)]
    Allocation(#[from] AllocationError),
}

fn api_error_message(code: &str, messages: &[String]) -> String {
    match code {
        "error_rate_limited" => {
            "Recommander is rate limiting requests; try again in a minute.".to_owned()
        }
        "error_booting" | "error_model_loading" => {
            "Recommander is starting up; try again in a moment.".to_owned()
        }
        "error_invalid_deck" | "error_invalid_cards" => {
            "Recommander could not understand this deck's cards.".to_owned()
        }
        "error_not_found" => "Recommander does not have data for this commander.".to_owned(),
        _ => match messages.first() {
            Some(message) => format!("Recommander error: {message}"),
            None => format!("Recommander returned an error ({code})."),
        },
    }
}

/// `DeckRecommanderCommander`.
#[derive(Debug, Clone, PartialEq, Eq, SimpleObject)]
pub struct DeckRecommanderCommander {
    pub name: String,
    pub oracle_id: Option<ID>,
    pub url: Option<String>,
}

/// `DeckRecommanderCard`.
#[derive(Debug, Clone, SimpleObject)]
pub struct DeckRecommanderCard {
    pub name: String,
    pub oracle_id: Option<ID>,
    pub rank: i64,
    pub score: Option<f64>,
    pub card: Option<Card>,
    pub collection_status: DeckCardAllocationStatus,
}

/// `DeckRecommander`.
#[derive(Debug, Clone, SimpleObject)]
pub struct DeckRecommander {
    pub commanders: Vec<DeckRecommanderCommander>,
    pub recommendations: Vec<DeckRecommanderCard>,
}

/// The request body, keyed by oracle id (`Payload.recommend_payload/1`).
/// Only decided cards shape the result: considering cards are left out so
/// Recommander can recommend them.
pub(crate) fn recommend_payload(deck: &DeckContext) -> Result<Value, RecommanderError> {
    let mut commanders: Vec<&manavault_allocation::NamedDeckCard> = deck
        .cards
        .iter()
        .filter(|named| named.card.zone == Zone::Commander)
        .collect();
    commanders.sort_by(|a, b| a.name.cmp(&b.name));
    let mut commander_ids: Vec<&str> = Vec::new();
    for named in commanders {
        let id = named.card.oracle_id.as_str();
        if !id.is_empty() && !commander_ids.contains(&id) {
            commander_ids.push(id);
        }
    }
    let (commander, partner) = match commander_ids.as_slice() {
        [] => return Err(RecommanderError::MissingCommander),
        [commander] => (*commander, None),
        [commander, partner] => (*commander, Some(*partner)),
        _ => return Err(RecommanderError::TooManyCommanders),
    };
    let mut cards: Vec<&str> = deck
        .cards
        .iter()
        .filter(|named| named.card.zone == Zone::Mainboard)
        .map(|named| named.card.oracle_id.as_str())
        .filter(|id| !id.is_empty())
        .collect();
    cards.sort_unstable();
    cards.dedup();
    Ok(json!({
        "card_format": "oracle_id",
        "commander": commander,
        "partner": partner,
        "deck": cards,
    }))
}

/// Posts the payload (`Client.fetch_recommendations/1`).
pub async fn fetch_recommendations(
    http: &reqwest::Client,
    url: &str,
    payload: &Value,
) -> Result<Vec<Value>, RecommanderError> {
    let response = http
        .post(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .json(payload)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|error| RecommanderError::RequestFailed(error.to_string()))?;
    let status = response.status();
    if status.as_u16() == 429 {
        return Err(RecommanderError::Api(
            "error_rate_limited".to_owned(),
            Vec::new(),
        ));
    }
    let body = response
        .bytes()
        .await
        .map_err(|error| RecommanderError::RequestFailed(error.to_string()))?;
    let envelope = match serde_json::from_slice::<Value>(&body) {
        Ok(Value::Object(map)) => Some(map),
        _ => None,
    };
    if status.is_success() {
        unwrap_envelope(&envelope.ok_or(RecommanderError::UnexpectedResponse)?)
    } else {
        // Some failures carry the standard envelope on non-2xx statuses;
        // its result code is more useful than the bare status.
        match envelope {
            Some(envelope)
                if envelope
                    .get("result_code")
                    .and_then(Value::as_str)
                    .is_some_and(|code| code != "success") =>
            {
                unwrap_envelope(&envelope)
            }
            _ => Err(RecommanderError::Http(status.as_u16())),
        }
    }
}

fn unwrap_envelope(envelope: &Map<String, Value>) -> Result<Vec<Value>, RecommanderError> {
    match envelope.get("result_code") {
        Some(Value::String(code)) if code == "success" => {
            match envelope
                .get("data")
                .and_then(Value::as_object)
                .and_then(|data| data.get("recommendations"))
            {
                Some(Value::Array(recommendations)) => Ok(recommendations.clone()),
                None | Some(Value::Null) => Ok(Vec::new()),
                Some(_) => Err(RecommanderError::UnexpectedResponse),
            }
        }
        Some(Value::String(code)) => {
            let messages = envelope
                .get("error")
                .and_then(Value::as_object)
                .and_then(|error| error.get("messages"))
                .and_then(Value::as_array)
                .map(|messages| {
                    messages
                        .iter()
                        .filter_map(|m| m.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            Err(RecommanderError::Api(code.clone(), messages))
        }
        _ => Err(RecommanderError::UnexpectedResponse),
    }
}

/// Recommendations for a deck (`Recommander.recs/2`).
pub async fn deck_recommander(
    state: &AppState,
    deck_id: DeckId,
) -> Result<DeckRecommander, RecommanderError> {
    let deck = DeckContext::load(&state.db, deck_id).await?;
    let payload = recommend_payload(&deck)?;
    let recommendations =
        fetch_recommendations(&state.http, &state.config.deck_intel.recommander, &payload).await?;
    Ok(normalize(state, &deck, &recommendations).await?)
}

/// A named recommendation resolved against the catalog and the deck.
struct Resolved<'a> {
    entry: &'a Map<String, Value>,
    name: &'a str,
    oracle_id: Option<&'a str>,
    suggested: Suggested<'a>,
}

/// Ranks recommendations by score, best first, and resolves cards and
/// collection statuses (`Response.normalize/2`).
pub(crate) async fn normalize(
    state: &AppState,
    deck: &DeckContext,
    recommendations: &[Value],
) -> Result<DeckRecommander, AllocationError> {
    let mut entries: Vec<&Map<String, Value>> = recommendations
        .iter()
        .filter_map(Value::as_object)
        .collect();
    let score = |entry: &Map<String, Value>| {
        entry_number(entry, "score")
            .and_then(|n| n.as_f64())
            .unwrap_or(0.0)
    };
    // Stable, like `Enum.sort_by/2`.
    entries.sort_by(|a, b| score(b).total_cmp(&score(a)));

    let oracle_ids: Vec<Option<String>> = entries
        .iter()
        .map(|entry| {
            entry
                .get("oracle_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect();
    let names: Vec<String> = entries.iter().map(|entry| entry_name(entry)).collect();
    let identifiers: Vec<String> = oracle_ids.iter().flatten().cloned().collect();
    let lookup = CardLookup::build(&state.db, &identifiers, &names).await?;

    let resolved: Vec<Resolved<'_>> = entries
        .iter()
        .zip(&names)
        .zip(&oracle_ids)
        .filter(|((_, name), _)| !name.is_empty())
        .map(|((entry, name), oracle_id)| {
            let oracle_id = oracle_id.as_deref();
            Resolved {
                entry,
                name,
                oracle_id,
                suggested: Suggested {
                    local_card: lookup.local_card(oracle_id, name),
                    deck_card: matching_deck_card(deck, oracle_id, name),
                },
            }
        })
        .collect();
    let suggestions: Vec<Suggested<'_>> = resolved.iter().map(|r| r.suggested).collect();
    let statuses = collection_statuses(&state.db, &suggestions).await?;

    let mut commanders: Vec<DeckRecommanderCommander> = deck
        .cards
        .iter()
        .filter(|named| named.card.zone == Zone::Commander)
        .map(|named| {
            let oracle_id = named.card.oracle_id.to_string();
            DeckRecommanderCommander {
                name: named.name.clone(),
                url: (!oracle_id.is_empty())
                    .then(|| format!("https://recommander.cards/card/{oracle_id}")),
                oracle_id: Some(ID(oracle_id)),
            }
        })
        .collect();
    commanders.sort_by(|a, b| a.name.cmp(&b.name));

    let recommendations = resolved
        .into_iter()
        .zip(statuses)
        .zip(1i64..)
        .map(|((resolved, status), rank)| DeckRecommanderCard {
            name: resolved.name.to_owned(),
            oracle_id: resolved
                .oracle_id
                .map(str::to_owned)
                .or_else(|| {
                    resolved
                        .suggested
                        .local_card
                        .map(|card| card.oracle_id.to_string())
                })
                .map(ID),
            rank,
            score: entry_number(resolved.entry, "score").and_then(|n| n.as_f64()),
            card: resolved.suggested.local_card.cloned().map(Card::from),
            collection_status: status,
        })
        .collect();
    Ok(DeckRecommander {
        commanders,
        recommendations,
    })
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn api_errors_map_to_friendly_messages() {
        let message = |code: &str, messages: &[&str]| {
            RecommanderError::Api(
                code.to_owned(),
                messages.iter().map(|m| (*m).to_owned()).collect(),
            )
            .to_string()
        };
        assert_eq!(
            message("error_rate_limited", &[]),
            "Recommander is rate limiting requests; try again in a minute."
        );
        assert_eq!(
            message("error_not_found", &[]),
            "Recommander does not have data for this commander."
        );
        assert_eq!(
            message("error_booting", &[]),
            "Recommander is starting up; try again in a moment."
        );
        assert_eq!(
            message("error_invalid_cards", &[]),
            "Recommander could not understand this deck's cards."
        );
        assert_eq!(
            message("error_unknown", &["boom"]),
            "Recommander error: boom"
        );
        assert_eq!(
            message("error_unknown", &[]),
            "Recommander returned an error (error_unknown)."
        );
        assert_eq!(
            RecommanderError::Http(500).to_string(),
            "Recommander returned HTTP 500."
        );
        assert_eq!(
            RecommanderError::MissingCommander.to_string(),
            "Recommander requires a commander."
        );
    }
}
