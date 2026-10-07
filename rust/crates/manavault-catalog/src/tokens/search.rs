//! Token printing search (`Manavault.Catalog.Tokens.SearchPrintings`).

use sqlx::SqlitePool;

use crate::catalog::printing::{Printing, with_cards};
use crate::catalog::search::name_match;
use crate::printing_query;

/// Filters for [`search_token_printings`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TokenPrintingFilters {
    /// Token name.
    pub q: String,
    pub set_code: String,
    /// The scanned front face when picking the back of a double-sided token.
    pub exclude_scryfall_id: Option<String>,
}

/// Token printings matching the filters, newest first, each with its card.
/// Empty when neither a name nor a set is given.
pub async fn search_token_printings(
    pool: &SqlitePool,
    filters: &TokenPrintingFilters,
    limit: i64,
) -> Result<Vec<Printing>, sqlx::Error> {
    let name = filters.q.trim();
    let set_code = filters.set_code.trim().to_lowercase();
    if name.is_empty() && set_code.is_empty() {
        return Ok(Vec::new());
    }
    let pattern = name_match::like_pattern(name);
    let exclude = filters
        .exclude_scryfall_id
        .as_deref()
        .filter(|id| !id.is_empty());
    let records = printing_query!(
        r"JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
          WHERE c.layout IN ('token', 'double_faced_token', 'emblem')
            AND (?1 = '' OR c.normalized_name LIKE ?2 ESCAPE '\')
            AND (?3 = '' OR p.set_code = ?3)
            AND (?4 IS NULL OR p.scryfall_id != ?4)
          ORDER BY p.released_at DESC, c.name ASC, p.set_code ASC, p.collector_number ASC
          LIMIT ?5",
        name,
        pattern,
        set_code,
        exclude,
        limit
    )
    .fetch_all(pool)
    .await?;
    with_cards(pool, records).await
}
