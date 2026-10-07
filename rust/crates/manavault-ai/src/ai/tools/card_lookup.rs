//! `lookup_cards` (`AI.CardLookupTool`): lets the model look up cards in the
//! local Scryfall catalog. Models cannot know cards printed after their
//! training data, so before recommending an addition they can fetch its real
//! rules text, color identity, and legality from the catalog ManaVault uses
//! to validate recommendations.

use serde_json::{Map, Value, json};
use sqlx::SqlitePool;

use super::{names_argument, resolve_cards};
use manavault_catalog::catalog::card::CardRecord;

pub const TOOL_NAME: &str = "lookup_cards";
const MAX_NAMES: usize = 20;

/// The function tool definition.
#[must_use]
pub fn definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": TOOL_NAME,
            "description": "Look up Magic: The Gathering cards by exact name in ManaVault's Scryfall catalog. Returns each card's mana cost, type line, oracle text, color identity, and the formats it is legal in. Use it to verify any card you consider recommending that is not in the deck, especially cards from recent sets that may be newer than your training data. Names not found in the catalog are listed in not_found.",
            "parameters": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "maxItems": MAX_NAMES,
                        "description": format!("Exact English card names to look up (up to {MAX_NAMES}). The front face name is enough for double-faced cards.")
                    }
                },
                "required": ["names"]
            }
        }
    })
}

/// Runs a call. Malformed arguments get an explanatory error object.
pub async fn call(pool: &SqlitePool, arguments: &Value) -> Result<Value, sqlx::Error> {
    let Some(names) = names_argument(arguments) else {
        return Ok(json!({"error": "Provide a names array of exact card names."}));
    };
    let (cards, not_found) = resolve_cards(pool, names, MAX_NAMES).await?;
    Ok(json!({
        "cards": cards.iter().map(card_details).collect::<Vec<_>>(),
        "not_found": not_found
    }))
}

fn card_details(card: &CardRecord) -> Value {
    let legalities: Map<String, Value> = match serde_json::from_str(&card.legalities) {
        Ok(Value::Object(map)) => map,
        _ => Map::new(),
    };
    let mut legal_in: Vec<&String> = legalities
        .iter()
        .filter(|(_, status)| matches!(status.as_str(), Some("legal" | "restricted")))
        .map(|(format, _)| format)
        .collect();
    legal_in.sort();
    let color_identity: Value = match serde_json::from_str(&card.color_identity) {
        Ok(Value::Array(colors)) => Value::Array(colors),
        _ => json!([]),
    };
    json!({
        "name": card.name,
        "mana_cost": card.mana_cost,
        "mana_value": card.cmc,
        "type_line": card.type_line,
        "oracle_text": card.oracle_text,
        "color_identity": color_identity,
        "legal_in": legal_in,
        "game_changer": card.game_changer
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::tests::legality_card;
    use crate::test_app::TestApp;
    use manavault_catalog::testing::fixtures;

    #[test]
    fn exposes_a_function_tool_definition() {
        let definition = definition();
        assert_eq!(definition["type"], "function");
        assert_eq!(definition["function"]["name"], "lookup_cards");
        let parameters = &definition["function"]["parameters"];
        assert_eq!(parameters["required"], json!(["names"]));
        assert_eq!(parameters["properties"]["names"]["type"], "array");
        assert_eq!(parameters["properties"]["names"]["maxItems"], 20);
    }

    #[tokio::test]
    async fn returns_catalog_details_for_known_cards_and_lists_unknown_names() {
        let app = TestApp::new().await;
        app.import_cards(&[
            fixtures::legal_commander_card(),
            legality_card(
                "Recent Removal",
                &["W", "B"],
                &json!({"commander": "legal", "vintage": "restricted", "modern": "not_legal", "standard": "banned"}),
            ),
        ])
        .await;
        let result = call(
            app.db(),
            &json!({"names": ["recent removal", "Test Commander", "Made Up Card", " ", "Recent Removal", 7]}),
        )
        .await
        .unwrap();
        assert_eq!(result["not_found"], json!(["Made Up Card"]));
        let cards = result["cards"].as_array().unwrap();
        assert_eq!(cards.len(), 2);
        assert_eq!(
            cards[0],
            json!({
                "name": "Recent Removal",
                "mana_cost": "{1}{U}",
                "mana_value": 2.0,
                "type_line": "Instant",
                "oracle_text": "Take an extra turn after this turn.",
                "color_identity": ["W", "B"],
                "legal_in": ["commander", "vintage"],
                "game_changer": false
            })
        );
        assert_eq!(cards[1]["name"], "Test Commander");
        assert_eq!(cards[1]["type_line"], "Legendary Creature — Cat");
    }

    #[tokio::test]
    async fn describes_malformed_calls_instead_of_failing() {
        let app = TestApp::new().await;
        let result = call(app.db(), &json!({"names": "Sol Ring"})).await.unwrap();
        assert!(result["error"].as_str().unwrap().contains("names array"));
    }
}
