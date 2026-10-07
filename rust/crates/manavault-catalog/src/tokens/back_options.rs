//! Back-face candidates for a single-faced token printing
//! (`Manavault.Catalog.Tokens.BackOptions`).

use std::collections::{BTreeMap, HashSet};

use async_graphql::SimpleObject;
use lotus::ScryfallId;
use sqlx::SqlitePool;

use crate::catalog::printing::{Printing, with_cards};
use crate::printing_query;
use crate::tokens::known_backs;
use crate::tokens::search::{TokenPrintingFilters, search_token_printings};

const SAME_SET_LIMIT: i64 = 100;

/// Possible back faces of a single-faced token printing. `known` are tokens
/// Wizards' galleries show printed on its back; `sameSet` are the set's other
/// tokens, for printings without pairing data.
#[derive(Debug, Clone, Default, SimpleObject)]
pub struct TokenBackOptions {
    pub known: Vec<Printing>,
    pub same_set: Vec<Printing>,
}

/// `known` lists backs recorded on owned copies of this token (either side,
/// most-owned first), then gallery pairings in data order; `same_set` lists
/// the set's other tokens minus the known ones. Both empty for an unknown id.
pub async fn token_back_options(
    pool: &SqlitePool,
    scryfall_id: &str,
) -> Result<TokenBackOptions, sqlx::Error> {
    let Some(printing) = printing_query!("WHERE p.scryfall_id = ?1", scryfall_id)
        .fetch_optional(pool)
        .await?
    else {
        return Ok(TokenBackOptions::default());
    };
    let mut known = learned_backs(pool, &printing.scryfall_id).await?;
    known.extend(gallery_backs(pool, &printing.set_code, &printing.collector_number).await?);
    let mut seen = HashSet::new();
    known.retain(|candidate| seen.insert(candidate.record.scryfall_id.clone()));

    let filters = TokenPrintingFilters {
        q: String::new(),
        set_code: printing.set_code.clone(),
        exclude_scryfall_id: Some(printing.scryfall_id.to_string()),
    };
    let same_set = search_token_printings(pool, &filters, SAME_SET_LIMIT)
        .await?
        .into_iter()
        .filter(|candidate| !seen.contains(&candidate.record.scryfall_id))
        .collect();
    Ok(TokenBackOptions { known, same_set })
}

/// Backs recorded on owned items of this token in either direction, by
/// total owned copies (ties by id).
async fn learned_backs(
    pool: &SqlitePool,
    scryfall_id: &ScryfallId,
) -> Result<Vec<Printing>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT scryfall_id AS "front!: ScryfallId", back_scryfall_id AS "back!: ScryfallId",
                  quantity AS "quantity!: i64"
           FROM token_items
           WHERE back_scryfall_id IS NOT NULL AND (scryfall_id = ?1 OR back_scryfall_id = ?1)"#,
        scryfall_id
    )
    .fetch_all(pool)
    .await?;
    let mut totals: BTreeMap<ScryfallId, i64> = BTreeMap::new();
    for row in rows {
        let other = if &row.front == scryfall_id {
            row.back
        } else {
            row.front
        };
        if &other != scryfall_id {
            *totals.entry(other).or_default() += row.quantity;
        }
    }
    let mut ordered: Vec<(ScryfallId, i64)> = totals.into_iter().collect();
    ordered.sort_by_key(|(_, total)| std::cmp::Reverse(*total));
    let ids: Vec<ScryfallId> = ordered.into_iter().map(|(id, _)| id).collect();
    token_printings_in_order(pool, &ids).await
}

async fn token_printings_in_order(
    pool: &SqlitePool,
    ids: &[ScryfallId],
) -> Result<Vec<Printing>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let json = crate::catalog::sql::json_list(ids);
    let records = printing_query!(
        "JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
         WHERE p.scryfall_id IN (SELECT value FROM json_each(?1))
           AND c.layout IN ('token', 'double_faced_token', 'emblem')",
        json
    )
    .fetch_all(pool)
    .await?;
    let mut printings = with_cards(pool, records).await?;
    printings.sort_by_key(|printing| ids.iter().position(|id| *id == printing.record.scryfall_id));
    Ok(printings)
}

async fn gallery_backs(
    pool: &SqlitePool,
    set_code: &str,
    collector_number: &str,
) -> Result<Vec<Printing>, sqlx::Error> {
    let keys = known_backs::back_keys(set_code, collector_number);
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let json = serde_json::to_string(&keys).unwrap_or_else(|_| "[]".to_owned());
    let records = printing_query!(
        "JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
         WHERE EXISTS (SELECT 1 FROM json_each(?1) AS face
                       WHERE json_extract(face.value, '$[0]') = p.set_code
                         AND json_extract(face.value, '$[1]') = p.collector_number)
           AND c.layout IN ('token', 'double_faced_token', 'emblem')",
        json
    )
    .fetch_all(pool)
    .await?;
    let mut printings = with_cards(pool, records).await?;
    printings.sort_by_key(|printing| {
        keys.iter().position(|(set, number)| {
            *set == printing.record.set_code && *number == printing.record.collector_number
        })
    });
    Ok(printings)
}
