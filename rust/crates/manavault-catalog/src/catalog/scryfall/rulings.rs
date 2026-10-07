//! A card's Scryfall rulings (`Manavault.Catalog.Scryfall.Rulings` and
//! `Cached.card_rulings/2`), fetched from its stored `rulings_uri`.

use lotus::scryfall::rulings::RulingsList;

use crate::catalog::cache;
use crate::catalog::card::CardRuling;
use crate::state::AppState;

/// Fetches and decodes the rulings at `rulings_uri`. Any failure (HTTP
/// error, undecodable body, a ruling without a comment) reads as no rulings.
pub async fn fetch(http: &reqwest::Client, rulings_uri: &str) -> Option<Vec<CardRuling>> {
    let response = http
        .get(rulings_uri)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body = response.bytes().await.ok()?;
    let list: RulingsList = serde_json::from_slice(&body).ok()?;
    Some(
        list.data
            .into_iter()
            .map(|ruling| CardRuling {
                source: ruling.source,
                published_at: ruling.published_at,
                comment: ruling.comment,
            })
            .collect(),
    )
}

/// A card's rulings, cached for six hours per `rulings_uri`.
///
/// Bug in earlier releases: the external cache also cached the empty list a failed
/// fetch returns, hiding a card's rulings for six hours after one network
/// error. Only successful fetches are cached here.
pub async fn card_rulings(state: &AppState, rulings_uri: Option<&str>) -> Vec<CardRuling> {
    let Some(rulings_uri) = rulings_uri.filter(|uri| !uri.is_empty()) else {
        return Vec::new();
    };
    let key = format!("rulings:{rulings_uri}");
    if let Some(rulings) = cache::get::<Vec<CardRuling>>(state, &key).await {
        return rulings;
    }
    match fetch(&state.http, rulings_uri).await {
        Some(rulings) => {
            cache::put(state, &key, &rulings, cache::EXTERNAL_TTL).await;
            rulings
        }
        None => Vec::new(),
    }
}
