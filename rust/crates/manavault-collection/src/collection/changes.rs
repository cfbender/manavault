//! Collection item writes: the `CollectionItem` changesets and
//! `Collection.{Items, ItemAttrs, BulkUpdateItems, SetTradeQuantity,
//! DeleteItems}`.
//!
//! Attributes are cast field by field: an absent field keeps its
//! value, `null` (or `""` for text) clears it, and validations of a field run
//! only when its value changes.

use async_graphql::MaybeUndefined;
use lotus::{Condition, Finish, Quantity, ScryfallId};
use sqlx::{SqliteConnection, SqlitePool};

use crate::collection::item::{CollectionItem, CollectionItemRecord, load_items};
use crate::collection::location::json_ids;
use crate::collection_item_query;
use manavault_catalog::catalog::price::price_cents_for_printing;
use manavault_catalog::catalog::printing::PrintingRecord;
use manavault_catalog::pricing::PriceStore;
use manavault_catalog::printing_query;
use manavault_core::timestamp::Timestamp;
use manavault_core::validation::{BLANK, INVALID, ValidationError};

/// Why an item write failed.
#[derive(Debug, thiserror::Error)]
pub enum ItemError {
    /// The item does not exist (`get_collection_item!/1` raised).
    #[error("Collection item was not found.")]
    NotFound,
    /// Some of the targeted ids do not exist (`{:not_found, ids}`).
    #[error("One or more collection items were not found.")]
    Missing(Vec<i64>),
    /// Validation errors.
    #[error(transparent)]
    Invalid(#[from] ValidationError),
    /// `:invalid_for_trade_quantity`.
    #[error("Trade quantity must be between zero and the number of copies owned.")]
    InvalidTradeQuantity,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Item attributes to write (`CollectionItemInput` /
/// `CollectionItemUpdateInput`, or the attrs map of an import row).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ItemChanges {
    pub scryfall_id: MaybeUndefined<String>,
    pub quantity: MaybeUndefined<i64>,
    pub condition: MaybeUndefined<String>,
    pub language: MaybeUndefined<String>,
    pub finish: MaybeUndefined<String>,
    pub location_id: MaybeUndefined<i64>,
    pub notes: MaybeUndefined<String>,
    pub purchase_price_cents: MaybeUndefined<i64>,
    pub for_trade: MaybeUndefined<bool>,
    pub for_trade_quantity: MaybeUndefined<i64>,
}

/// The item's fields while a changeset is applied; `None` is `nil`.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Draft {
    scryfall_id: Option<String>,
    quantity: Option<i64>,
    condition: Option<String>,
    language: Option<String>,
    finish: Option<String>,
    location_id: Option<i64>,
    notes: Option<String>,
    purchase_price_cents: Option<i64>,
    for_trade: Option<bool>,
    for_trade_quantity: Option<i64>,
}

impl Draft {
    /// The schema defaults of a new item.
    fn new_item() -> Self {
        Self {
            scryfall_id: None,
            quantity: Some(1),
            condition: Some(Condition::NearMint.as_str().to_owned()),
            language: Some("en".to_owned()),
            finish: Some(Finish::Nonfoil.as_str().to_owned()),
            location_id: None,
            notes: None,
            purchase_price_cents: None,
            for_trade: Some(false),
            for_trade_quantity: Some(0),
        }
    }

    fn from_record(record: &CollectionItemRecord) -> Self {
        Self {
            scryfall_id: Some(record.scryfall_id.to_string()),
            quantity: Some(record.quantity.as_i64()),
            condition: Some(record.condition.as_str().to_owned()),
            language: Some(record.language.clone()),
            finish: Some(record.finish.as_str().to_owned()),
            location_id: record.location_id,
            notes: record.notes.clone(),
            purchase_price_cents: record.purchase_price_cents,
            for_trade: Some(record.for_trade),
            for_trade_quantity: Some(record.for_trade_quantity),
        }
    }
}

fn cast<T>(value: &MaybeUndefined<T>, current: Option<T>) -> Option<T>
where
    T: Clone,
{
    match value {
        MaybeUndefined::Undefined => current,
        MaybeUndefined::Null => None,
        MaybeUndefined::Value(value) => Some(value.clone()),
    }
}

/// Empty values: `""` casts to `None`.
fn cast_text(value: &MaybeUndefined<String>, current: Option<String>) -> Option<String> {
    cast(value, current).filter(|text| !text.is_empty())
}

fn blank(value: Option<&str>) -> bool {
    value.is_none_or(|text| text.trim().is_empty())
}

/// A validated item, ready to write.
struct ValidItem {
    scryfall_id: ScryfallId,
    quantity: Quantity,
    condition: Condition,
    language: String,
    finish: Finish,
    location_id: Option<i64>,
    notes: Option<String>,
    purchase_price_cents: Option<i64>,
    for_trade: bool,
    for_trade_quantity: i64,
    /// Set when the item moved into a location (`put_location_changed_at/1`).
    moved: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Create,
    Update,
}

/// Applies a changeset (`create_changeset/2` / `update_changeset/2`, then
/// `ItemAttrs.validate_finish_available/1`).
///
/// Earlier releases raised on a printing or location that does not exist
/// (SQLite foreign key errors carry no constraint name); here they are
/// "does not exist" validation errors on the field.
async fn apply(
    conn: &mut SqliteConnection,
    mode: Mode,
    current: &Draft,
    changes: &ItemChanges,
) -> Result<Option<ValidItem>, ItemError> {
    let mut next = Draft {
        scryfall_id: cast_text(&changes.scryfall_id, current.scryfall_id.clone()),
        quantity: cast(&changes.quantity, current.quantity),
        condition: cast_text(&changes.condition, current.condition.clone()),
        language: cast_text(&changes.language, current.language.clone()),
        finish: cast_text(&changes.finish, current.finish.clone()),
        location_id: cast(&changes.location_id, current.location_id),
        notes: cast_text(&changes.notes, current.notes.clone()),
        purchase_price_cents: cast(&changes.purchase_price_cents, current.purchase_price_cents),
        for_trade: cast(&changes.for_trade, current.for_trade),
        for_trade_quantity: cast(&changes.for_trade_quantity, current.for_trade_quantity),
    };
    sync_for_trade(&mut next, changes);
    let moved = next.location_id.is_some() && next.location_id != current.location_id;

    let mut errors = ValidationError::new();
    for (field, missing) in [
        ("quantity", next.quantity.is_none()),
        ("condition", blank(next.condition.as_deref())),
        ("language", blank(next.language.as_deref())),
        ("finish", blank(next.finish.as_deref())),
        ("for_trade_quantity", next.for_trade_quantity.is_none()),
    ] {
        if missing {
            errors.add(field, BLANK);
        }
    }
    if next.quantity != current.quantity && next.quantity.is_some_and(|q| q <= 0) {
        errors.add("quantity", "must be greater than 0");
    }
    if next.purchase_price_cents != current.purchase_price_cents
        && next.purchase_price_cents.is_some_and(|p| p < 0)
    {
        errors.add("purchase_price_cents", "must be greater than or equal to 0");
    }
    let trade_changed = next.for_trade_quantity != current.for_trade_quantity;
    if trade_changed && next.for_trade_quantity.is_some_and(|q| q < 0) {
        errors.add("for_trade_quantity", "must be greater than or equal to 0");
    }
    if trade_changed
        && let (Some(offered), Some(owned)) = (next.for_trade_quantity, next.quantity)
        && offered > owned
    {
        errors.add("for_trade_quantity", "cannot exceed quantity owned");
    }
    if next.condition != current.condition
        && next
            .condition
            .as_deref()
            .is_some_and(|c| Condition::parse(c).is_none())
    {
        errors.add("condition", INVALID);
    }
    if next.finish != current.finish
        && next
            .finish
            .as_deref()
            .is_some_and(|f| Finish::parse(f).is_none())
    {
        errors.add("finish", INVALID);
    }
    if mode == Mode::Create && blank(next.scryfall_id.as_deref()) {
        errors.add("scryfall_id", BLANK);
    }
    if mode == Mode::Update && next.scryfall_id.is_none() {
        errors.add("scryfall_id", BLANK);
    }
    if !errors.is_empty() {
        return Err(errors.into());
    }

    if next == *current && mode == Mode::Update {
        return Ok(None);
    }

    let scryfall_id = next.scryfall_id.clone().unwrap_or_default();
    let finish_text = next.finish.clone().unwrap_or_default();
    let printing = printing_query!("WHERE p.scryfall_id = ?1", scryfall_id)
        .fetch_optional(&mut *conn)
        .await?;
    match &printing {
        Some(printing) if !printing.finish_list().contains(&finish_text) => {
            errors.add("finish", "is not available for this printing");
        }
        Some(_) => {}
        None => errors.add("scryfall_id", "does not exist"),
    }
    if errors.has("finish") {
        return Err(errors.into());
    }
    if next.location_id != current.location_id
        && let Some(location_id) = next.location_id
    {
        let exists = sqlx::query_scalar!(
            r#"SELECT count(*) AS "count!: i64" FROM locations WHERE id = ?1"#,
            location_id
        )
        .fetch_one(&mut *conn)
        .await?;
        if exists == 0 {
            errors.add("location_id", "does not exist");
        }
    }
    errors.into_result()?;

    let invalid = |field| ItemError::Invalid(ValidationError::single(field, INVALID));
    Ok(Some(ValidItem {
        scryfall_id: ScryfallId::from(scryfall_id),
        quantity: next
            .quantity
            .and_then(|q| u32::try_from(q).ok())
            .and_then(Quantity::new)
            .ok_or_else(|| invalid("quantity"))?,
        condition: next
            .condition
            .as_deref()
            .and_then(Condition::parse)
            .ok_or_else(|| invalid("condition"))?,
        language: next.language.unwrap_or_default(),
        finish: Finish::parse(&finish_text).ok_or_else(|| invalid("finish"))?,
        location_id: next.location_id,
        notes: next.notes,
        purchase_price_cents: next.purchase_price_cents,
        for_trade: next.for_trade.unwrap_or(false),
        for_trade_quantity: next.for_trade_quantity.unwrap_or(0),
        moved,
    }))
}

/// `CollectionItem.sync_for_trade_fields/1`: `for_trade_quantity` wins over
/// the legacy `for_trade` flag, and lowering `quantity` caps the offer.
fn sync_for_trade(next: &mut Draft, changes: &ItemChanges) {
    if !changes.for_trade_quantity.is_undefined() {
        if let Some(offered) = next.for_trade_quantity {
            next.for_trade = Some(offered > 0);
        }
    } else if !changes.for_trade.is_undefined() {
        next.for_trade_quantity = if next.for_trade == Some(true) {
            next.quantity
        } else {
            Some(0)
        };
    } else if !changes.quantity.is_undefined()
        && let Some(quantity) = next.quantity
    {
        let offered = next.for_trade_quantity.unwrap_or(0).min(quantity);
        next.for_trade_quantity = Some(offered);
        next.for_trade = Some(offered > 0);
    }
}

/// `Finishes.preferred/2`: `current` when the printing offers it, else its
/// first finish, else `nonfoil`.
#[must_use]
pub fn preferred_finish(printing: &PrintingRecord, current: Option<&str>) -> String {
    let available = printing.finish_list();
    match current {
        Some(finish) if available.iter().any(|f| f == finish) => finish.to_owned(),
        _ => available
            .into_iter()
            .next()
            .unwrap_or_else(|| Finish::Nonfoil.as_str().to_owned()),
    }
}

/// Creates an item (`Collection.Items.create/1`): an unavailable finish falls
/// back to one the printing offers, and a missing purchase price defaults to
/// the printing's current price.
pub async fn create_in(
    conn: &mut SqliteConnection,
    prices: &PriceStore,
    mut changes: ItemChanges,
) -> Result<i64, ItemError> {
    let printing = match &changes.scryfall_id {
        MaybeUndefined::Value(id) => {
            printing_query!("WHERE p.scryfall_id = ?1", id)
                .fetch_optional(&mut *conn)
                .await?
        }
        _ => None,
    };
    if let Some(printing) = &printing {
        // `ItemAttrs.coerce_finish_to_available/1`.
        if let MaybeUndefined::Value(finish) = &changes.finish
            && !printing.finish_list().contains(finish)
        {
            changes.finish = MaybeUndefined::Value(preferred_finish(printing, Some(finish)));
        }
        // `ItemAttrs.put_default_purchase_price/1`.
        if !matches!(changes.purchase_price_cents, MaybeUndefined::Value(_)) {
            let finish = match &changes.finish {
                MaybeUndefined::Value(finish) => finish.clone(),
                _ => preferred_finish(printing, None),
            };
            if let Some(cents) = price_cents_for_printing(prices, printing, Some(&finish)) {
                changes.purchase_price_cents = MaybeUndefined::Value(cents);
            }
        }
    }
    let valid = apply(conn, Mode::Create, &Draft::new_item(), &changes)
        .await?
        .ok_or_else(|| ItemError::Invalid(ValidationError::single("scryfall_id", BLANK)))?;
    let now = Timestamp::now();
    let changed_at = valid.moved.then_some(now);
    let id = sqlx::query_scalar!(
        r#"INSERT INTO collection_items
             (scryfall_id, quantity, condition, language, finish, location_id, notes,
              purchase_price_cents, for_trade, for_trade_quantity, location_changed_at,
              inserted_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
           RETURNING id AS "id!""#,
        valid.scryfall_id,
        valid.quantity,
        valid.condition,
        valid.language,
        valid.finish,
        valid.location_id,
        valid.notes,
        valid.purchase_price_cents,
        valid.for_trade,
        valid.for_trade_quantity,
        changed_at,
        now
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(id)
}

/// Creates an item and loads it with its printing and location.
pub async fn create(
    pool: &SqlitePool,
    prices: &PriceStore,
    changes: ItemChanges,
) -> Result<CollectionItem, ItemError> {
    let mut conn = pool.acquire().await?;
    let id = create_in(&mut conn, prices, changes).await?;
    load_items(&mut conn, &[id])
        .await?
        .into_iter()
        .next()
        .ok_or(ItemError::NotFound)
}

/// Applies an update changeset to a loaded row and writes it.
async fn update_record(
    conn: &mut SqliteConnection,
    record: &CollectionItemRecord,
    changes: &ItemChanges,
) -> Result<(), ItemError> {
    let Some(valid) = apply(conn, Mode::Update, &Draft::from_record(record), changes).await? else {
        return Ok(());
    };
    let now = Timestamp::now();
    let changed_at = if valid.moved {
        Some(now)
    } else {
        record.location_changed_at
    };
    sqlx::query!(
        r#"UPDATE collection_items SET scryfall_id = ?1, quantity = ?2, condition = ?3,
             language = ?4, finish = ?5, location_id = ?6, notes = ?7, purchase_price_cents = ?8,
             for_trade = ?9, for_trade_quantity = ?10, location_changed_at = ?11, updated_at = ?12
           WHERE id = ?13"#,
        valid.scryfall_id,
        valid.quantity,
        valid.condition,
        valid.language,
        valid.finish,
        valid.location_id,
        valid.notes,
        valid.purchase_price_cents,
        valid.for_trade,
        valid.for_trade_quantity,
        changed_at,
        now,
        record.id
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Moves an item to a location (the auto-sort move).
pub async fn move_to(
    conn: &mut SqliteConnection,
    record: &CollectionItemRecord,
    location_id: i64,
) -> Result<(), ItemError> {
    let changes = ItemChanges {
        location_id: MaybeUndefined::Value(location_id),
        ..ItemChanges::default()
    };
    update_record(conn, record, &changes).await
}

/// Sets an item's quantity (bulk clean's partial removal).
pub async fn set_quantity(
    conn: &mut SqliteConnection,
    record: &CollectionItemRecord,
    quantity: i64,
) -> Result<(), ItemError> {
    let changes = ItemChanges {
        quantity: MaybeUndefined::Value(quantity),
        ..ItemChanges::default()
    };
    update_record(conn, record, &changes).await
}

/// Updates one item (`Collection.Items.update/2`).
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    changes: ItemChanges,
) -> Result<CollectionItem, ItemError> {
    let mut tx = manavault_core::db::begin_write(pool).await?;
    let record = collection_item_query!("WHERE i.id = ?1", id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(ItemError::NotFound)?;
    update_record(&mut tx, &record, &changes).await?;
    let item = load_items(&mut tx, &[id])
        .await?
        .into_iter()
        .next()
        .ok_or(ItemError::NotFound)?;
    tx.commit().await?;
    Ok(item)
}

async fn records_by_id(
    conn: &mut SqliteConnection,
    ids: &[i64],
) -> Result<Vec<CollectionItemRecord>, sqlx::Error> {
    let mut unique = ids.to_vec();
    unique.sort_unstable();
    unique.dedup();
    let mut records = Vec::with_capacity(unique.len());
    for chunk in unique.chunks(500) {
        let json = json_ids(chunk);
        records.extend(
            collection_item_query!(
                "WHERE i.id IN (SELECT value FROM json_each(?1)) ORDER BY i.id",
                json
            )
            .fetch_all(&mut *conn)
            .await?,
        );
    }
    Ok(records)
}

fn missing_ids(ids: &[i64], records: &[CollectionItemRecord]) -> Vec<i64> {
    let mut missing = Vec::new();
    for id in ids {
        if !records.iter().any(|record| record.id == *id) && !missing.contains(id) {
            missing.push(*id);
        }
    }
    missing
}

/// Applies one set of changes to many items in a transaction
/// (`BulkUpdateItems.run/2`). Returns how many updates were made (one per
/// requested id, duplicates included).
pub async fn bulk_update(
    pool: &SqlitePool,
    ids: &[i64],
    changes: ItemChanges,
) -> Result<usize, ItemError> {
    let mut tx = manavault_core::db::begin_write(pool).await?;
    let records = records_by_id(&mut tx, ids).await?;
    let missing = missing_ids(ids, &records);
    if !missing.is_empty() {
        return Err(ItemError::Missing(missing));
    }
    for id in ids {
        if let Some(record) = records.iter().find(|record| record.id == *id) {
            update_record(&mut tx, record, &changes).await?;
        }
    }
    tx.commit().await?;
    Ok(ids.len())
}

/// The outcome of [`set_trade_quantity`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TradeQuantityResult {
    pub updated_count: usize,
    pub quantity: i64,
    pub total_quantity: i64,
}

/// Offers `quantity` copies across the items, filling them in id order
/// (`SetTradeQuantity.run/2`).
pub async fn set_trade_quantity(
    pool: &SqlitePool,
    ids: &[i64],
    quantity: i64,
) -> Result<TradeQuantityResult, ItemError> {
    if quantity < 0 {
        return Err(ItemError::InvalidTradeQuantity);
    }
    let mut tx = manavault_core::db::begin_write(pool).await?;
    let records = records_by_id(&mut tx, ids).await?;
    let missing = missing_ids(ids, &records);
    if !missing.is_empty() {
        return Err(ItemError::Missing(missing));
    }
    let total_quantity: i64 = records.iter().map(|r| r.quantity.as_i64()).sum();
    if quantity > total_quantity {
        return Err(ItemError::InvalidTradeQuantity);
    }
    let mut remaining = quantity;
    for record in &records {
        let offered = record.quantity.as_i64().min(remaining);
        let changes = ItemChanges {
            for_trade_quantity: MaybeUndefined::Value(offered),
            ..ItemChanges::default()
        };
        update_record(&mut tx, record, &changes).await?;
        remaining -= offered;
    }
    tx.commit().await?;
    Ok(TradeQuantityResult {
        updated_count: records.len(),
        quantity,
        total_quantity,
    })
}

/// Deletes many items (`DeleteItems.run/1`); their deck allocations go with
/// them. Returns how many were deleted.
pub async fn delete_many(pool: &SqlitePool, ids: &[i64]) -> Result<u64, sqlx::Error> {
    let mut tx = manavault_core::db::begin_write(pool).await?;
    let mut deleted = 0;
    for chunk in ids.chunks(500) {
        let json = json_ids(chunk);
        deleted += sqlx::query!(
            "DELETE FROM collection_items WHERE id IN (SELECT value FROM json_each(?1))",
            json
        )
        .execute(&mut *tx)
        .await?
        .rows_affected();
    }
    tx.commit().await?;
    Ok(deleted)
}

/// Deletes one item and returns it as it was (`delete_collection_item/1`).
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<CollectionItem, ItemError> {
    let mut tx = manavault_core::db::begin_write(pool).await?;
    let item = load_items(&mut tx, &[id])
        .await?
        .into_iter()
        .next()
        .ok_or(ItemError::NotFound)?;
    sqlx::query!("DELETE FROM collection_items WHERE id = ?1", id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(item)
}
