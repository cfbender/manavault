//! `POST /vendors/star-city-games/deck-builder`: hands a decklist to
//! `StarCityGames`' affiliate endpoint and redirects to the deck builder it
//! prepared.

use std::time::Duration;

use axum::extract::{Form, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use super::auth_controller::redirect;
use crate::state::AppState;

const DECK_BUILDER_URL: &str = "https://starcitygames.com/shop/deck-builder/";

/// `~r/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i`.
fn rfc4122_uuid(id: &str) -> bool {
    let groups: Vec<&str> = id.split('-').collect();
    let [first, second, third, fourth, fifth] = groups.as_slice() else {
        return false;
    };
    let hex = |group: &str, len: usize| {
        group.len() == len && group.chars().all(|ch| ch.is_ascii_hexdigit())
    };
    hex(first, 8)
        && hex(second, 4)
        && hex(third, 4)
        && hex(fourth, 4)
        && hex(fifth, 12)
        && third.starts_with(['1', '2', '3', '4', '5'])
        && fourth.starts_with(['8', '9', 'a', 'b', 'A', 'B'])
}

/// Creates the deck builder link for a decklist.
pub async fn create_deck_builder_url(state: &AppState, decklist: &str) -> Result<String, String> {
    if decklist.trim().is_empty() {
        return Err("empty_decklist".to_owned());
    }
    let response = state
        .http
        .post(&state.config.platform_urls.star_city_games_affiliate)
        .header("accept", "application/json")
        .header(
            "user-agent",
            "ManaVault/0.1 (+https://github.com/cfbender/manavault)",
        )
        .timeout(Duration::from_secs(15))
        .json(&json!({"data": decklist}))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("http_status {}", status.as_u16()));
    }
    let body: Value = response.json().await.map_err(|_| "invalid_response")?;
    match body.get("affiliateDataID").and_then(Value::as_str) {
        Some(id) if rfc4122_uuid(id) => Ok(format!("{DECK_BUILDER_URL}?data={id}")),
        _ => Err("invalid_response".to_owned()),
    }
}

/// The deck builder form: the decklist as `data`.
#[derive(Debug, Default, serde::Deserialize)]
pub struct DeckBuilderForm {
    data: Option<String>,
}

/// The handler.
pub async fn star_city_games(
    State(state): State<AppState>,
    Form(form): Form<DeckBuilderForm>,
) -> Response {
    let Some(decklist) = form.data.as_deref() else {
        return (StatusCode::UNPROCESSABLE_ENTITY, "A decklist is required.").into_response();
    };
    match create_deck_builder_url(&state, decklist).await {
        Ok(url) => redirect(&url),
        Err(reason) => {
            tracing::warn!("StarCityGames deck handoff failed: {reason}");
            (
                StatusCode::BAD_GATEWAY,
                "StarCityGames is unavailable. Please try again later.",
            )
                .into_response()
        }
    }
}
