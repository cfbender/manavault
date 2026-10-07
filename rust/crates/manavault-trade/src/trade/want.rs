//! The want list (`Manavault.Trade.Want`, `Query`, `CreateWant`,
//! `UpdateWant`, `DeleteWant`, `Trade.want_image_url/1`): cards the owner is
//! looking to acquire, either any printing of a card (a *generic* want) or
//! one specific printing.

use lotus::{OracleId, Quantity, ScryfallId};
use sqlx::SqlitePool;

use crate::catalog::printing::Printing;
use crate::catalog::search::cards_by_name;
use crate::catalog::sql::json_list;

/// A `trade_wants` row with the image the want shows: its preferred
/// printing's image when it names one, else the image of the card's most
/// recently released printing.
#[derive(Debug, Clone, PartialEq)]
pub struct Want {
    pub id: i64,
    pub oracle_id: OracleId,
    pub preferred_printing_id: Option<ScryfallId>,
    pub quantity: Quantity,
    pub preferred_image_uris: Option<String>,
    pub latest_image_uris: Option<String>,
}

impl Want {
    /// `Trade.want_image_url/1`: the preferred printing's image when the want
    /// names a printing (even when that printing has no image), else the
    /// card's latest printing's image.
    #[must_use]
    pub fn display_image_url(&self) -> Option<String> {
        match (&self.preferred_printing_id, &self.preferred_image_uris) {
            (Some(_), Some(uris)) => image_url(uris),
            _ => self.latest_image_uris.as_deref().and_then(image_url),
        }
    }
}

/// `normal || large || small || png` of a stored `image_uris` JSON value.
#[must_use]
pub fn image_url(image_uris: &str) -> Option<String> {
    let value = serde_json::from_str(image_uris)
        .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()));
    crate::catalog::printing::image_url(&value)
}

/// Selects wants (`w`) into [`Want`]; the argument is the rest of the query
/// after the joins.
macro_rules! want_query {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            Want,
            r#"SELECT w.id AS "id!", w.oracle_id AS "oracle_id!: OracleId",
                 w.preferred_printing_id AS "preferred_printing_id?: ScryfallId",
                 w.quantity AS "quantity!: Quantity",
                 pp.image_uris AS "preferred_image_uris?",
                 (SELECT p.image_uris FROM scryfall_printings AS p
                   WHERE p.oracle_id = w.oracle_id
                   ORDER BY p.released_at DESC, p.set_code ASC, p.collector_number ASC
                   LIMIT 1) AS "latest_image_uris?: String"
               FROM trade_wants AS w
               LEFT JOIN scryfall_printings AS pp ON pp.scryfall_id = w.preferred_printing_id "#
                + $tail
            $(, $arg)*
        )
    };
}

/// Every want, newest first (`Trade.list_wants/0`).
pub async fn list(pool: &SqlitePool) -> Result<Vec<Want>, sqlx::Error> {
    want_query!("ORDER BY w.inserted_at DESC, w.id DESC")
        .fetch_all(pool)
        .await
}

/// Wants for the given oracle ids, newest first (`Trade.wants_by_oracle_ids/1`).
pub async fn by_oracle_ids(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<Vec<Want>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ids = json_list(oracle_ids);
    want_query!(
        "WHERE w.oracle_id IN (SELECT value FROM json_each(?1))
         ORDER BY w.inserted_at DESC, w.id DESC",
        ids
    )
    .fetch_all(pool)
    .await
}

/// One want (`Trade.get_want!/1`, `None` instead of raising).
pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<Want>, sqlx::Error> {
    want_query!("WHERE w.id = ?1", id)
        .fetch_optional(pool)
        .await
}

/// Why a want could not be created.
#[derive(Debug, thiserror::Error)]
pub enum CreateWantError {
    /// No card or printing matches.
    #[error("not found")]
    NotFound,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Resolves `name` to a card and records a generic want for it, bumping an
/// existing generic want's quantity instead of adding a row; a want for a
/// specific printing of the same card is left alone
/// (`Trade.create_want_by_name/2`). A missing or non-positive quantity
/// counts as one.
pub async fn create_by_name(
    pool: &SqlitePool,
    name: &str,
    quantity: Option<i64>,
) -> Result<Want, CreateWantError> {
    let card = cards_by_name::find(pool, name)
        .await?
        .ok_or(CreateWantError::NotFound)?;
    upsert(pool, &card.oracle_id, None, Quantity::or_one(quantity)).await
}

/// Resolves `scryfall_id` to a printing and records a want for exactly that
/// printing, bumping an existing want for the same printing; a generic want
/// for the card coexists (`Trade.create_want_by_printing/2`).
pub async fn create_by_printing(
    pool: &SqlitePool,
    scryfall_id: &str,
    quantity: Option<i64>,
) -> Result<Want, CreateWantError> {
    let scryfall_id = ScryfallId::new(scryfall_id);
    let printing = Printing::load(pool, &scryfall_id)
        .await?
        .ok_or(CreateWantError::NotFound)?;
    upsert(
        pool,
        &printing.record.oracle_id,
        Some(&scryfall_id),
        Quantity::or_one(quantity),
    )
    .await
}

/// Inserts the want or bumps the matching one. Earlier releases inserted and
/// bumped on a unique-index conflict; doing both inside one `BEGIN
/// IMMEDIATE` transaction gives the same result without the retry.
async fn upsert(
    pool: &SqlitePool,
    oracle_id: &OracleId,
    preferred_printing_id: Option<&ScryfallId>,
    quantity: Quantity,
) -> Result<Want, CreateWantError> {
    let mut tx = crate::db::begin_write(pool).await?;
    let existing = sqlx::query!(
        r#"SELECT id AS "id!", quantity AS "quantity!: Quantity" FROM trade_wants
           WHERE oracle_id = ?1 AND preferred_printing_id IS ?2"#,
        oracle_id,
        preferred_printing_id
    )
    .fetch_optional(&mut *tx)
    .await?;
    let now = crate::timefmt::now();
    let id = match existing {
        Some(row) => {
            let total = row.quantity.saturating_add(quantity);
            sqlx::query!(
                "UPDATE trade_wants SET quantity = ?1, updated_at = ?2 WHERE id = ?3",
                total,
                now,
                row.id
            )
            .execute(&mut *tx)
            .await?;
            row.id
        }
        None => {
            sqlx::query!(
                "INSERT INTO trade_wants (oracle_id, preferred_printing_id, quantity, inserted_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                oracle_id,
                preferred_printing_id,
                quantity,
                now
            )
            .execute(&mut *tx)
            .await?
            .last_insert_rowid()
        }
    };
    tx.commit().await?;
    get(pool, id)
        .await?
        .ok_or(CreateWantError::Db(sqlx::Error::RowNotFound))
}

/// Why a want's quantity could not be changed.
#[derive(Debug, thiserror::Error)]
pub enum UpdateWantError {
    /// The `quantity_changeset` validation.
    #[error("quantity must be greater than or equal to 1")]
    InvalidQuantity,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Sets a want's quantity, which must be at least one
/// (`Trade.update_want_quantity/2`).
pub async fn update_quantity(
    pool: &SqlitePool,
    id: i64,
    quantity: i64,
) -> Result<Option<Want>, UpdateWantError> {
    let quantity = Quantity::try_from(quantity).map_err(|_| UpdateWantError::InvalidQuantity)?;
    let now = crate::timefmt::now();
    sqlx::query!(
        "UPDATE trade_wants SET quantity = ?1, updated_at = ?2 WHERE id = ?3",
        quantity,
        now,
        id
    )
    .execute(pool)
    .await?;
    Ok(get(pool, id).await?)
}

/// Deletes a want; whether it existed (`Trade.delete_want/1`).
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM trade_wants WHERE id = ?1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
