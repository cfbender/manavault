//! Scryfall's set list, fetched by the catalog sync for block (`b:`) and set
//! group (`g:`) searches.

use lotus::scryfall::ScryfallClient;
use serde::Deserialize;
use sqlx::{QueryBuilder, SqlitePool};

use crate::catalog::scryfall::sync::format_fetch_error;

/// Every Scryfall set.
pub const SETS_URL: &str = "https://api.scryfall.com/sets";

/// Pages followed before giving up, far more than Scryfall's one page.
const MAX_PAGES: usize = 20;

/// Rows per insert: six bound values each, well under SQLite's limit.
const INSERT_BATCH: usize = 500;

/// One set of Scryfall's list. `code` is stored lowercased.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ScryfallSet {
    pub code: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub set_type: Option<String>,
    #[serde(default)]
    pub block_code: Option<String>,
    #[serde(default)]
    pub parent_set_code: Option<String>,
    #[serde(default)]
    pub released_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SetList {
    data: Vec<ScryfallSet>,
    #[serde(default)]
    has_more: bool,
    #[serde(default)]
    next_page: Option<String>,
}

/// Every set of the list at `url`, following `next_page` while `has_more`.
pub async fn fetch(client: &ScryfallClient, url: &str) -> Result<Vec<ScryfallSet>, String> {
    let mut sets = Vec::new();
    let mut next = Some(url.to_owned());
    for _ in 0..MAX_PAGES {
        let Some(url) = next.take() else {
            return Ok(sets);
        };
        let page: SetList = client
            .get_json(&url)
            .await
            .map_err(|error| format_fetch_error(&error))?;
        sets.extend(page.data);
        next = page.next_page.filter(|_| page.has_more);
    }
    match next {
        None => Ok(sets),
        Some(_) => Err(format!("Scryfall set list exceeded {MAX_PAGES} pages")),
    }
}

/// Replaces every stored set with `sets` in one transaction.
pub async fn replace(pool: &SqlitePool, sets: &[ScryfallSet]) -> Result<usize, sqlx::Error> {
    let mut tx = manavault_core::db::begin_write(pool).await?;
    sqlx::query!("DELETE FROM scryfall_sets")
        .execute(&mut *tx)
        .await?;
    for batch in sets.chunks(INSERT_BATCH) {
        QueryBuilder::new(
            "INSERT INTO scryfall_sets (code, name, set_type, block_code, parent_set_code, released_at) ",
        )
        .push_values(batch, |mut row, set| {
            row.push_bind(set.code.to_lowercase())
                .push_bind(&set.name)
                .push_bind(&set.set_type)
                .push_bind(set.block_code.as_deref().map(str::to_lowercase))
                .push_bind(set.parent_set_code.as_deref().map(str::to_lowercase))
                .push_bind(&set.released_at);
        })
        // Scryfall's codes are unique; a repeat keeps the first.
        .push(" ON CONFLICT (code) DO NOTHING")
        .build()
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(sets.len())
}
