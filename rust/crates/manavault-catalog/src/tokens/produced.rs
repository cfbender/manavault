//! The tokens a card creates, through Scryfall's producer → token links
//! (`Manavault.Catalog.Tokens.Produced`).

use std::collections::{HashMap, HashSet};

use async_graphql::SimpleObject;
use lotus::{OracleId, ScryfallId};
use sqlx::SqlitePool;

use crate::catalog::printing::Printing;
use crate::catalog::sql::json_list;
use crate::tokens::items::owned_token_counts;

/// A token a card creates, with how many copies of that token the user owns.
#[derive(Debug, Clone, SimpleObject)]
pub struct ProducedToken {
    pub printing: Printing,
    pub owned_count: i64,
}

/// Card oracle id → produced tokens. Each token appears once per card (its
/// newest linked printing, with its card), sorted by token name, with owned
/// copies across all its printings (`Produced.by_oracle_ids/1`).
pub async fn by_oracle_ids(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<HashMap<OracleId, Vec<ProducedToken>>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = json_list(oracle_ids);
    let links = sqlx::query!(
        r#"SELECT producer.oracle_id AS "producer!: OracleId", token.scryfall_id AS "token!: ScryfallId"
           FROM scryfall_card_tokens AS link
           JOIN scryfall_printings AS producer ON producer.scryfall_id = link.scryfall_id
           JOIN scryfall_printings AS token ON token.scryfall_id = link.token_scryfall_id
           JOIN scryfall_cards AS c ON c.oracle_id = token.oracle_id
           WHERE producer.oracle_id IN (SELECT value FROM json_each(?1))
             AND c.layout IN ('token', 'double_faced_token', 'emblem')
           ORDER BY token.released_at DESC, token.set_code ASC, token.collector_number ASC"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    let mut token_ids: Vec<ScryfallId> = links.iter().map(|link| link.token.clone()).collect();
    token_ids.sort();
    token_ids.dedup();
    let printings = Printing::load_many(pool, &token_ids).await?;
    let mut token_oracle_ids: Vec<OracleId> = printings
        .values()
        .map(|printing| printing.record.oracle_id.clone())
        .collect();
    token_oracle_ids.sort();
    token_oracle_ids.dedup();
    let owned = owned_token_counts(pool, &token_oracle_ids).await?;

    let mut grouped: HashMap<OracleId, Vec<Printing>> = HashMap::new();
    for link in links {
        if let Some(printing) = printings.get(&link.token) {
            grouped
                .entry(link.producer)
                .or_default()
                .push(printing.clone());
        }
    }
    Ok(grouped
        .into_iter()
        .map(|(producer, tokens)| {
            let mut seen = HashSet::new();
            let mut tokens: Vec<Printing> = tokens
                .into_iter()
                .filter(|printing| seen.insert(printing.record.oracle_id.clone()))
                .collect();
            tokens.sort_by(|a, b| {
                let name = |p: &Printing| p.card.as_ref().map(|card| card.name.clone());
                (name(a), &a.record.oracle_id).cmp(&(name(b), &b.record.oracle_id))
            });
            let tokens = tokens
                .into_iter()
                .map(|printing| ProducedToken {
                    owned_count: owned.get(&printing.record.oracle_id).copied().unwrap_or(0),
                    printing,
                })
                .collect();
            (producer, tokens)
        })
        .collect())
}
