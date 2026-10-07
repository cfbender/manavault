//! `check_collection` (`AI.CollectionStatusTool`): lets the model check
//! whether the user already owns cards it is considering, so it can favor
//! cards the user can add without buying anything.
//!
//! The counts follow `Catalog.EDHRec.Response.CollectionStatus` for cards
//! not in the deck: owned copies outside list locations, minus copies
//! allocated to active decks.
//! TODO(integration): share the decks port's `CollectionStatus` once merged.

use std::collections::HashMap;

use lotus::OracleId;
use serde_json::{Value, json};
use sqlx::SqlitePool;

use super::{names_argument, resolve_cards};
use manavault_catalog::catalog::card::CardRecord;
use manavault_catalog::catalog::sql::json_list;

pub const TOOL_NAME: &str = "check_collection";
const MAX_NAMES: usize = 40;

/// The function tool definition.
#[must_use]
pub fn definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": TOOL_NAME,
            "description": "Check the user's ManaVault collection for Magic: The Gathering cards by exact name. For each card, returns status plus copy counts: available means the user owns a copy not used by another active deck; owned_in_other_decks means every owned copy is already in another active deck; not_owned means the user has no copies; basic_land means it is always available. Use it on candidate additions that are not in the deck before recommending them. You can call it in the same turn as lookup_cards. Names not found in the catalog are listed in not_found.",
            "parameters": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "maxItems": MAX_NAMES,
                        "description": format!("Exact English card names to check (up to {MAX_NAMES}). The front face name is enough for double-faced cards.")
                    }
                },
                "required": ["names"]
            }
        }
    })
}

/// One card's collection counts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
struct Counts {
    owned: i64,
    available: i64,
    elsewhere: i64,
}

#[derive(Default)]
struct Prefetched {
    /// Collection item id and quantity, per oracle id.
    candidates: HashMap<OracleId, Vec<(i64, i64)>>,
    /// Copies allocated to active decks, per oracle id and collection item.
    allocations: HashMap<OracleId, HashMap<i64, i64>>,
}

/// `CollectionStatus.prefetch/1`: candidates and allocation counts for many
/// cards in two queries.
async fn prefetch(pool: &SqlitePool, oracle_ids: &[OracleId]) -> Result<Prefetched, sqlx::Error> {
    let mut prefetched = Prefetched::default();
    if oracle_ids.is_empty() {
        return Ok(prefetched);
    }
    let ids = json_list(oracle_ids);
    let candidates = sqlx::query!(
        r#"SELECT ci.id AS "id!", ci.quantity, p.oracle_id AS "oracle_id!: OracleId"
           FROM collection_items AS ci
           JOIN scryfall_printings AS p ON p.scryfall_id = ci.scryfall_id
           JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           LEFT JOIN locations AS l ON l.id = ci.location_id
           WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
             AND (l.id IS NULL OR l.kind != 'list')
           ORDER BY c.name, p.set_code, p.collector_number, ci.id"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    for row in candidates {
        prefetched
            .candidates
            .entry(row.oracle_id)
            .or_default()
            .push((row.id, row.quantity));
    }
    let allocations = sqlx::query!(
        r#"SELECT dc.oracle_id AS "oracle_id!: OracleId", a.collection_item_id,
             SUM(a.quantity) AS "quantity!: i64"
           FROM deck_allocations AS a
           JOIN deck_cards AS dc ON dc.id = a.deck_card_id
           JOIN decks AS d ON d.id = dc.deck_id
           WHERE d.status = 'active' AND dc.oracle_id IN (SELECT value FROM json_each(?1))
           GROUP BY dc.oracle_id, a.collection_item_id"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    for row in allocations {
        prefetched
            .allocations
            .entry(row.oracle_id)
            .or_default()
            .insert(row.collection_item_id, row.quantity);
    }
    Ok(prefetched)
}

fn counts(card: &CardRecord, prefetched: &Prefetched) -> Counts {
    let empty_candidates = Vec::new();
    let empty_allocations = HashMap::new();
    let candidates = prefetched
        .candidates
        .get(&card.oracle_id)
        .unwrap_or(&empty_candidates);
    let allocations = prefetched
        .allocations
        .get(&card.oracle_id)
        .unwrap_or(&empty_allocations);
    Counts {
        owned: candidates.iter().map(|(_, quantity)| quantity).sum(),
        elsewhere: allocations.values().sum(),
        available: candidates
            .iter()
            .map(|(id, quantity)| (quantity - allocations.get(id).copied().unwrap_or(0)).max(0))
            .sum(),
    }
}

/// The status the model sees; `CollectionStatus` state names spelled out.
fn model_status(card: &CardRecord, counts: Counts) -> &'static str {
    if card.is_basic_land() {
        "basic_land"
    } else if counts.available > 0 {
        "available"
    } else if counts.owned > 0 {
        "owned_in_other_decks"
    } else {
        "not_owned"
    }
}

/// Runs a call. Malformed arguments get an explanatory error object.
pub async fn call(pool: &SqlitePool, arguments: &Value) -> Result<Value, sqlx::Error> {
    let Some(names) = names_argument(arguments) else {
        return Ok(json!({"error": "Provide a names array of exact card names."}));
    };
    let (cards, not_found) = resolve_cards(pool, names, MAX_NAMES).await?;
    let mut ids: Vec<OracleId> = cards.iter().map(|card| card.oracle_id.clone()).collect();
    ids.sort();
    ids.dedup();
    let prefetched = prefetch(pool, &ids).await?;
    let cards: Vec<Value> = cards
        .iter()
        .map(|card| {
            let counts = counts(card, &prefetched);
            json!({
                "name": card.name,
                "status": model_status(card, counts),
                "owned": counts.owned,
                "available": counts.available,
                "in_other_decks": counts.elsewhere
            })
        })
        .collect();
    Ok(json!({"cards": cards, "not_found": not_found}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::tests::{allocate, collection_item, insert_deck_with_status};
    use crate::test_app::TestApp;
    use manavault_catalog::testing::fixtures;

    #[test]
    fn exposes_a_function_tool_definition() {
        let definition = definition();
        assert_eq!(definition["function"]["name"], "check_collection");
        let parameters = &definition["function"]["parameters"];
        assert_eq!(parameters["required"], json!(["names"]));
        assert_eq!(parameters["properties"]["names"]["type"], "array");
        assert_eq!(parameters["properties"]["names"]["maxItems"], 40);
    }

    #[tokio::test]
    async fn reports_owned_free_and_in_deck_copies_for_each_card() {
        let app = TestApp::new().await;
        app.import_cards(&[
            fixtures::black_lotus(),
            fixtures::black_lotus_beta(),
            fixtures::time_walk(),
            fixtures::plains(),
            fixtures::legal_commander_card(),
        ])
        .await;
        let pool = app.db();
        collection_item(pool, "scryfall-printing-1", 1, None).await;
        let used_lotus = collection_item(pool, "scryfall-printing-3", 1, None).await;
        let used_walk = collection_item(pool, "scryfall-printing-2", 1, None).await;
        // Copies in list locations are not owned inventory.
        let list: i64 = sqlx::query_scalar(
            "INSERT INTO locations (name, kind, inserted_at, updated_at) VALUES ('Wishlist', 'list', 'now', 'now') RETURNING id",
        )
        .fetch_one(pool)
        .await
        .unwrap();
        collection_item(pool, "scryfall-printing-2", 3, Some(list)).await;
        let other = insert_deck_with_status(pool, "Other", "commander", "active").await;
        allocate(pool, other, "oracle-1", used_lotus, 1).await;
        allocate(pool, other, "oracle-2", used_walk, 1).await;
        // Allocations to inactive decks do not hold copies.
        let brewing = insert_deck_with_status(pool, "Brewing", "commander", "brewing").await;
        allocate(pool, brewing, "oracle-1", used_lotus, 1).await;

        let result = call(
            pool,
            &json!({"names": ["black lotus", "Time Walk", "Test Commander", "Plains", "Made Up Card", " "]}),
        )
        .await
        .unwrap();
        assert_eq!(result["not_found"], json!(["Made Up Card"]));
        assert_eq!(
            result["cards"],
            json!([
                {"name": "Black Lotus", "status": "available", "owned": 2, "available": 1, "in_other_decks": 1},
                {"name": "Time Walk", "status": "owned_in_other_decks", "owned": 1, "available": 0, "in_other_decks": 1},
                {"name": "Test Commander", "status": "not_owned", "owned": 0, "available": 0, "in_other_decks": 0},
                {"name": "Plains", "status": "basic_land", "owned": 0, "available": 0, "in_other_decks": 0}
            ])
        );
    }

    #[tokio::test]
    async fn describes_malformed_calls_instead_of_failing() {
        let app = TestApp::new().await;
        let result = call(app.db(), &json!({"names": "Sol Ring"})).await.unwrap();
        assert!(result["error"].as_str().unwrap().contains("names array"));
    }
}
