//! Owned token copies (`Manavault.Catalog.TokenItem` and
//! `Manavault.Catalog.Tokens.Items`).

use std::collections::HashMap;

use async_graphql::{ID, MaybeUndefined, Object};
use lotus::{Finish, OracleId, Quantity, ScryfallId};
use sqlx::SqlitePool;

use crate::catalog::printing::Printing;
use crate::catalog::search::name_match;
use crate::catalog::sql::json_list;
use crate::graphql::{NodeKind, global_id};
use crate::timefmt;

/// A `token_items` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenItemRecord {
    pub id: i64,
    pub scryfall_id: ScryfallId,
    /// The other printed side of a double-sided token.
    pub back_scryfall_id: Option<ScryfallId>,
    pub quantity: Quantity,
    pub finish: Finish,
}

/// A token item with its printings loaded.
#[derive(Debug, Clone)]
pub struct TokenItem {
    pub record: TokenItemRecord,
    pub printing: Printing,
    pub back_printing: Option<Printing>,
}

/// Why a token item write failed.
#[derive(Debug, thiserror::Error)]
pub enum TokenItemError {
    #[error("That printing is not a token.")]
    NotAToken,
    #[error("Token printing not found.")]
    PrintingNotFound,
    /// The item does not exist.
    #[error("Token item was not found.")]
    NotFound,
    /// Changeset validation errors, already rendered.
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Attributes for adding copies (`TokenItemInput`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NewTokenItem {
    pub scryfall_id: Option<String>,
    pub back_scryfall_id: Option<String>,
    pub finish: Option<String>,
    pub quantity: Option<i64>,
}

/// Changes to an item (`TokenItemUpdateInput`). An explicit `null` is turned
/// into the default (quantity 1, `nonfoil`).
#[derive(Debug, Clone, Default)]
pub struct TokenItemChanges {
    pub quantity: MaybeUndefined<i64>,
    pub finish: MaybeUndefined<String>,
}

fn finish_or_default(finish: Option<&str>) -> String {
    match finish {
        None | Some("") => Finish::DEFAULT.as_str().to_owned(),
        Some(finish) => finish.to_owned(),
    }
}

/// `TokenItem.changeset/2` validation: renders errors the way
/// `Errors.changeset_error_message/1` does (fields in alphabetical order).
fn validate(quantity: i64, finish: &str) -> Result<(Quantity, Finish), TokenItemError> {
    let finish = Finish::parse(finish);
    let quantity = u32::try_from(quantity).ok().and_then(Quantity::new);
    let mut errors = Vec::new();
    if finish.is_none() {
        errors.push("finish is invalid");
    }
    if quantity.is_none() {
        errors.push("quantity must be greater than 0");
    }
    match (quantity, finish) {
        (Some(quantity), Some(finish)) => Ok((quantity, finish)),
        _ => Err(TokenItemError::Invalid(errors.join(", "))),
    }
}

async fn token_printing(
    pool: &SqlitePool,
    scryfall_id: Option<&str>,
) -> Result<(), TokenItemError> {
    let Some(scryfall_id) = scryfall_id else {
        return Err(TokenItemError::PrintingNotFound);
    };
    let layout = sqlx::query_scalar!(
        r#"SELECT c.layout AS "layout?" FROM scryfall_printings AS p
           JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           WHERE p.scryfall_id = ?1"#,
        scryfall_id
    )
    .fetch_optional(pool)
    .await?;
    match layout {
        None => Err(TokenItemError::PrintingNotFound),
        Some(layout) if layout.as_deref().is_some_and(lotus::card::is_token_layout) => Ok(()),
        Some(_) => Err(TokenItemError::NotAToken),
    }
}

/// One item row.
pub async fn get_record(
    pool: &SqlitePool,
    id: i64,
) -> Result<Option<TokenItemRecord>, sqlx::Error> {
    sqlx::query_as!(
        TokenItemRecord,
        r#"SELECT id AS "id!", scryfall_id AS "scryfall_id!: ScryfallId",
                  back_scryfall_id AS "back_scryfall_id?: ScryfallId",
                  quantity AS "quantity!: Quantity", finish AS "finish!: Finish"
           FROM token_items WHERE id = ?1"#,
        id
    )
    .fetch_optional(pool)
    .await
}

/// Loads the printings of item rows.
async fn with_printings(
    pool: &SqlitePool,
    records: Vec<TokenItemRecord>,
) -> Result<Vec<TokenItem>, sqlx::Error> {
    let mut ids: Vec<ScryfallId> = records
        .iter()
        .flat_map(|record| {
            std::iter::once(record.scryfall_id.clone()).chain(record.back_scryfall_id.clone())
        })
        .collect();
    ids.sort();
    ids.dedup();
    let printings = Printing::load_many(pool, &ids).await?;
    Ok(records
        .into_iter()
        .filter_map(|record| {
            let printing = printings.get(&record.scryfall_id)?.clone();
            let back_printing = record
                .back_scryfall_id
                .as_ref()
                .and_then(|id| printings.get(id).cloned());
            Some(TokenItem {
                record,
                printing,
                back_printing,
            })
        })
        .collect())
}

/// One item with its printings (`get_token_item!/1`).
pub async fn get(pool: &SqlitePool, id: i64) -> Result<TokenItem, TokenItemError> {
    let record = get_record(pool, id)
        .await?
        .ok_or(TokenItemError::NotFound)?;
    with_printings(pool, vec![record])
        .await?
        .pop()
        .ok_or(TokenItemError::NotFound)
}

/// Owned tokens, alphabetically by token name; `q` matches either printed
/// side (`Items.list/1`).
pub async fn list(pool: &SqlitePool, q: &str) -> Result<Vec<TokenItem>, sqlx::Error> {
    let name = q.trim();
    let pattern = name_match::like_pattern(name);
    let records = sqlx::query_as!(
        TokenItemRecord,
        r#"SELECT item.id AS "id!", item.scryfall_id AS "scryfall_id!: ScryfallId",
                  item.back_scryfall_id AS "back_scryfall_id?: ScryfallId",
                  item.quantity AS "quantity!: Quantity", item.finish AS "finish!: Finish"
           FROM token_items AS item
           JOIN scryfall_printings AS p ON p.scryfall_id = item.scryfall_id
           JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           LEFT JOIN scryfall_printings AS back ON back.scryfall_id = item.back_scryfall_id
           LEFT JOIN scryfall_cards AS back_card ON back_card.oracle_id = back.oracle_id
           WHERE ?1 = ''
              OR c.normalized_name LIKE ?2 ESCAPE '\'
              OR back_card.normalized_name LIKE ?2 ESCAPE '\'
           ORDER BY c.name ASC, p.set_code ASC, p.collector_number ASC, item.id ASC"#,
        name,
        pattern
    )
    .fetch_all(pool)
    .await?;
    with_printings(pool, records).await
}

/// Total owned token copies (`Items.count/0`).
pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT COALESCE(SUM(quantity), 0) AS "count!: i64" FROM token_items"#)
        .fetch_one(pool)
        .await
}

/// Records owned copies of a token printing. Copies of the same printing,
/// back face, and finish merge into one row (`Items.add/1`).
pub async fn add(pool: &SqlitePool, attrs: NewTokenItem) -> Result<TokenItem, TokenItemError> {
    let back = attrs.back_scryfall_id.filter(|id| !id.is_empty());
    token_printing(pool, attrs.scryfall_id.as_deref()).await?;
    if back.is_some() {
        token_printing(pool, back.as_deref()).await?;
    }
    let scryfall_id = attrs.scryfall_id.unwrap_or_default();
    let finish = finish_or_default(attrs.finish.as_deref());
    // `Util.parse_quantity/1`: integers pass through; a missing value is 1.
    let quantity = attrs.quantity.unwrap_or(1);
    let now = timefmt::now();

    let mut tx = crate::db::begin_write(pool).await?;
    let existing = sqlx::query!(
        r#"SELECT id AS "id!", quantity AS "quantity!: i64" FROM token_items
           WHERE scryfall_id = ?1 AND finish = ?2 AND back_scryfall_id IS ?3 LIMIT 1"#,
        scryfall_id,
        finish,
        back
    )
    .fetch_optional(&mut *tx)
    .await?;
    let id = if let Some(item) = existing {
        let (quantity, _) = validate(item.quantity.saturating_add(quantity), &finish)?;
        let quantity = quantity.as_i64();
        sqlx::query!(
            "UPDATE token_items SET quantity = ?1, updated_at = ?2 WHERE id = ?3",
            quantity,
            now,
            item.id
        )
        .execute(&mut *tx)
        .await?;
        item.id
    } else {
        let (quantity, finish) = validate(quantity, &finish)?;
        let quantity = quantity.as_i64();
        let finish = finish.as_str();
        sqlx::query_scalar!(
            r#"INSERT INTO token_items (scryfall_id, back_scryfall_id, quantity, finish, inserted_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?5) RETURNING id AS "id!""#,
            scryfall_id,
            back,
            quantity,
            finish,
            now
        )
        .fetch_one(&mut *tx)
        .await?
    };
    tx.commit().await?;
    get(pool, id).await
}

/// Changes an item's quantity or finish (`Items.update/2`).
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    changes: TokenItemChanges,
) -> Result<TokenItem, TokenItemError> {
    let record = get_record(pool, id)
        .await?
        .ok_or(TokenItemError::NotFound)?;
    let quantity = match changes.quantity {
        MaybeUndefined::Undefined => record.quantity.as_i64(),
        // `Util.parse_quantity(nil)` is 1.
        MaybeUndefined::Null => 1,
        MaybeUndefined::Value(quantity) => quantity,
    };
    let finish = match changes.finish {
        MaybeUndefined::Undefined => record.finish.as_str().to_owned(),
        MaybeUndefined::Null => finish_or_default(None),
        MaybeUndefined::Value(finish) => finish_or_default(Some(&finish)),
    };
    let (quantity, finish) = validate(quantity, &finish)?;
    let quantity = quantity.as_i64();
    let finish = finish.as_str();
    let now = timefmt::now();
    sqlx::query!(
        "UPDATE token_items SET quantity = ?1, finish = ?2, updated_at = ?3 WHERE id = ?4",
        quantity,
        finish,
        now,
        id
    )
    .execute(pool)
    .await?;
    get(pool, id).await
}

/// Deletes an item, returning it as it was (`Items.delete/1`).
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<TokenItem, TokenItemError> {
    let item = get(pool, id).await?;
    sqlx::query!("DELETE FROM token_items WHERE id = ?1", id)
        .execute(pool)
        .await?;
    Ok(item)
}

/// Deletes the given items, returning how many went (`Items.delete_many/1`).
pub async fn delete_many(pool: &SqlitePool, ids: &[i64]) -> Result<i64, sqlx::Error> {
    let ids = serde_json::to_string(ids).unwrap_or_else(|_| "[]".to_owned());
    let result = sqlx::query!(
        "DELETE FROM token_items WHERE id IN (SELECT value FROM json_each(?1))",
        ids
    )
    .execute(pool)
    .await?;
    Ok(i64::try_from(result.rows_affected()).unwrap_or(i64::MAX))
}

/// Owned copies per token card, counting every printing and both faces of
/// a double-sided token (`Items.owned_token_counts/1`).
pub async fn owned_token_counts(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<HashMap<OracleId, i64>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = json_list(oracle_ids);
    let rows = sqlx::query!(
        r#"SELECT p.oracle_id AS "oracle_id!: OracleId", SUM(item.quantity) AS "count!: i64"
           FROM token_items AS item JOIN scryfall_printings AS p ON p.scryfall_id = item.scryfall_id
           WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
           GROUP BY p.oracle_id
           UNION ALL
           SELECT p.oracle_id AS "oracle_id!: OracleId", SUM(item.quantity) AS "count!: i64"
           FROM token_items AS item JOIN scryfall_printings AS p ON p.scryfall_id = item.back_scryfall_id
           WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
           GROUP BY p.oracle_id"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    let mut counts: HashMap<OracleId, i64> = HashMap::new();
    for row in rows {
        *counts.entry(row.oracle_id).or_default() += row.count;
    }
    Ok(counts)
}

#[Object]
impl TokenItem {
    /// The ID of an object
    pub async fn id(&self) -> ID {
        global_id(NodeKind::TokenItem, self.record.id)
    }

    async fn quantity(&self) -> i64 {
        self.record.quantity.as_i64()
    }

    async fn finish(&self) -> &str {
        self.record.finish.as_str()
    }

    async fn printing(&self) -> &Printing {
        &self.printing
    }

    async fn back_printing(&self) -> Option<&Printing> {
        self.back_printing.as_ref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_messages_match_changeset_errors() {
        assert!(validate(1, "foil").is_ok());
        let message = |q, f| validate(q, f).unwrap_err().to_string();
        assert_eq!(message(0, "foil"), "quantity must be greater than 0");
        assert_eq!(message(1, "shiny"), "finish is invalid");
        assert_eq!(
            message(-1, "shiny"),
            "finish is invalid, quantity must be greater than 0"
        );
    }
}
