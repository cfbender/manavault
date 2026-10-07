//! Function tools offered to the AI provider during deck analysis and deck
//! questions (`AI.Tools`): catalog lookup (`lookup_cards`) and collection
//! status (`check_collection`).

pub mod card_lookup;
pub mod collection_status;

use std::collections::HashSet;

use serde_json::{Value, json};
use sqlx::SqlitePool;

use manavault_catalog::catalog::card::CardRecord;
use manavault_catalog::catalog::search::cards_by_name;

/// The tools, in the order they are offered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    CardLookup,
    CollectionStatus,
}

impl Tool {
    pub const ALL: [Self; 2] = [Self::CardLookup, Self::CollectionStatus];

    /// The function name the model calls.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::CardLookup => card_lookup::TOOL_NAME,
            Self::CollectionStatus => collection_status::TOOL_NAME,
        }
    }

    fn definition(self) -> Value {
        match self {
            Self::CardLookup => card_lookup::definition(),
            Self::CollectionStatus => collection_status::definition(),
        }
    }
}

/// `Tools.definitions/0`: OpenAI-style function tool definitions sent with
/// every completion request.
#[must_use]
pub fn definitions() -> Value {
    Value::Array(Tool::ALL.into_iter().map(Tool::definition).collect())
}

/// `Tools.call/2`: runs a tool call by name. Always returns a JSON object,
/// including for unknown tools, so the model gets feedback instead of the
/// request failing.
pub async fn call(
    pool: &SqlitePool,
    name: Option<&str>,
    arguments: &Value,
) -> Result<Value, sqlx::Error> {
    match Tool::ALL.into_iter().find(|tool| Some(tool.name()) == name) {
        Some(Tool::CardLookup) => card_lookup::call(pool, arguments).await,
        Some(Tool::CollectionStatus) => collection_status::call(pool, arguments).await,
        None => {
            let available = Tool::ALL.map(Tool::name).join(", ");
            let name = name.map_or_else(|| "nil".to_owned(), crate::ai::openrouter::inspect_str);
            Ok(json!({"error": format!("Unknown tool {name}. Available tools: {available}.")}))
        }
    }
}

/// The `names` array of a tool call, or `None` when it is malformed.
pub(crate) fn names_argument(arguments: &Value) -> Option<&Vec<Value>> {
    arguments.get("names")?.as_array()
}

/// `Tools.resolve_cards/2`: resolves model-supplied names against the
/// catalog, in request order, ignoring non-strings, blanks, and duplicates
/// and keeping at most `max_names`. Returns the cards and the names not
/// found.
pub async fn resolve_cards(
    pool: &SqlitePool,
    names: &[Value],
    max_names: usize,
) -> Result<(Vec<CardRecord>, Vec<String>), sqlx::Error> {
    let mut seen = HashSet::new();
    let names: Vec<&str> = names
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .filter(|name| seen.insert(cards_by_name::key(name)))
        .take(max_names)
        .collect();
    let cards = cards_by_name::by_names(pool, &names).await?;
    let mut found = Vec::new();
    let mut not_found = Vec::new();
    for name in names {
        match cards.get(&cards_by_name::key(name)) {
            Some(card) => found.push(card.clone()),
            None => not_found.push(name.to_owned()),
        }
    }
    Ok((found, not_found))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_app::TestApp;

    #[test]
    fn offers_the_card_lookup_and_collection_status_tools() {
        let names: Vec<Value> = definitions()
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| tool["function"]["name"].clone())
            .collect();
        assert_eq!(
            names,
            vec![json!("lookup_cards"), json!("check_collection")]
        );
    }

    #[tokio::test]
    async fn dispatches_calls_by_tool_name_and_describes_unknown_tools() {
        let app = TestApp::new().await;
        let args = json!({"names": ["Made Up Card"]});
        for tool in ["lookup_cards", "check_collection"] {
            assert_eq!(
                call(app.db(), Some(tool), &args).await.unwrap(),
                json!({"cards": [], "not_found": ["Made Up Card"]})
            );
        }
        let error = call(app.db(), Some("search_web"), &json!({"query": "Sol Ring"}))
            .await
            .unwrap();
        let error = error["error"].as_str().unwrap();
        assert!(error.contains(r#"Unknown tool "search_web""#));
        assert!(error.contains("lookup_cards, check_collection"));
    }
}
