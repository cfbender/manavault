//! Collection imports (`Collection.Import`): preview a file against the
//! catalog, then commit the resolved rows, optionally auto-sorting the new
//! items.
//!
//! Preview rows round-trip through the client, so a commit re-checks that
//! their locations and printings still exist. Rows whose printing is a token
//! become owned token items instead of collection items.

pub mod parse;

use std::collections::HashSet;

use async_graphql::MaybeUndefined;
use lotus::{Finish, ScryfallId};
use sqlx::{SqliteConnection, SqlitePool};

use crate::catalog::printing::Printing;
use crate::catalog::search::printings::{PrintingFilters, search_printings};
use crate::catalog::sql::json_list;
use crate::collection::auto_sort::rules::AutoSortError;
use crate::collection::auto_sort::{self, AutoSortOptions, AutoSortResult, Source};
use crate::collection::changes::{ItemChanges, ItemError, create_in, preferred_finish};
use crate::collection::item::load_printings;
use crate::pricing::PriceStore;
use crate::timefmt;
use parse::{Format, ParseError};

/// How well a row resolved to a printing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RowStatus {
    Exact,
    Ambiguous,
    Unresolved,
}

impl RowStatus {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::Ambiguous => "ambiguous",
            Self::Unresolved => "unresolved",
        }
    }

    /// A status sent back by the client; anything unknown is unresolved.
    #[must_use]
    pub fn parse(value: &str) -> Self {
        match value {
            "exact" => Self::Exact,
            "ambiguous" => Self::Ambiguous,
            _ => Self::Unresolved,
        }
    }
}

/// A row's attributes. A preview fills every field; a committed row carries
/// what the client sent (absent fields take the item defaults).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImportAttrs {
    pub name: MaybeUndefined<String>,
    pub set_code: MaybeUndefined<String>,
    pub collector_number: MaybeUndefined<String>,
    pub quantity: MaybeUndefined<i64>,
    pub finish: MaybeUndefined<String>,
    pub condition: MaybeUndefined<String>,
    pub language: MaybeUndefined<String>,
    pub scryfall_id: MaybeUndefined<String>,
    pub back_scryfall_id: MaybeUndefined<String>,
    pub location_id: Option<i64>,
    pub purchase_price_cents: MaybeUndefined<i64>,
}

/// A non-blank text value.
fn present(field: &MaybeUndefined<String>) -> Option<&str> {
    field.value().map(String::as_str).filter(|v| !v.is_empty())
}

/// A previewed (or committed) row.
#[derive(Debug, Clone)]
pub struct ImportRow {
    pub row_number: i64,
    pub status: RowStatus,
    pub attrs: ImportAttrs,
    pub printing: Option<Printing>,
    pub candidates: Vec<Printing>,
}

/// A previewed file.
#[derive(Debug, Clone)]
pub struct ImportPreview {
    pub location_id: Option<i64>,
    pub rows: Vec<ImportRow>,
}

impl ImportPreview {
    fn count(&self, status: RowStatus) -> i64 {
        i64::try_from(self.rows.iter().filter(|row| row.status == status).count())
            .unwrap_or(i64::MAX)
    }

    #[must_use]
    pub fn total(&self) -> i64 {
        i64::try_from(self.rows.len()).unwrap_or(i64::MAX)
    }

    #[must_use]
    pub fn exact(&self) -> i64 {
        self.count(RowStatus::Exact)
    }

    #[must_use]
    pub fn ambiguous(&self) -> i64 {
        self.count(RowStatus::Ambiguous)
    }

    #[must_use]
    pub fn unresolved(&self) -> i64 {
        self.count(RowStatus::Unresolved)
    }
}

/// Why an import failed (`Errors.import_error/1`).
#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error("Import location was not found.")]
    LocationNotFound,
    #[error("A card printing in this import no longer exists. Preview the import again.")]
    PrintingNotFound,
    #[error("Import file must be a CSV or TXT file.")]
    InvalidFormat,
    #[error("Could not parse that import file.")]
    InvalidFile,
    #[error("Import purchase price must be a dollar amount.")]
    InvalidPurchasePrice,
    /// A row's changeset errors, already rendered.
    #[error("{0}")]
    Invalid(String),
    #[error("Could not import collection file.")]
    Failed,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl From<ParseError> for ImportError {
    fn from(error: ParseError) -> Self {
        match error {
            ParseError::InvalidFormat => Self::InvalidFormat,
            ParseError::InvalidFile => Self::InvalidFile,
        }
    }
}

impl From<ItemError> for ImportError {
    fn from(error: ItemError) -> Self {
        match error {
            ItemError::Db(error) => Self::Db(error),
            other => Self::Invalid(other.to_string()),
        }
    }
}

impl From<AutoSortError> for ImportError {
    fn from(error: AutoSortError) -> Self {
        match error {
            AutoSortError::Db(error) => Self::Db(error),
            AutoSortError::Invalid(message) => Self::Invalid(message),
            _ => Self::Failed,
        }
    }
}

/// Preview options (`CollectionImportPreviewInput`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PreviewOptions {
    pub format: Option<String>,
    pub file_name: Option<String>,
    /// The location every row goes to.
    pub location_id: Option<i64>,
    /// The purchase price of rows without one.
    pub purchase_price_cents: Option<i64>,
}

/// Parses and resolves an import file (`preview_collection_import/2`).
pub async fn preview(
    pool: &SqlitePool,
    text: &str,
    options: &PreviewOptions,
) -> Result<ImportPreview, ImportError> {
    if let Some(location_id) = options.location_id {
        let exists = sqlx::query_scalar!(
            r#"SELECT count(*) AS "count!: i64" FROM locations WHERE id = ?1"#,
            location_id
        )
        .fetch_one(pool)
        .await?;
        if exists == 0 {
            return Err(ImportError::LocationNotFound);
        }
    }
    if options.purchase_price_cents.is_some_and(|cents| cents < 0) {
        return Err(ImportError::InvalidPurchasePrice);
    }
    let rows = parse::parse(
        text,
        Format::parse(options.format.as_deref()),
        options.file_name.as_deref(),
    )?;
    let rows: Vec<(parse::RowAttrs, i64)> = rows
        .iter()
        .map(|(row, number)| {
            let mut attrs = parse::attrs(row);
            if attrs.purchase_price_cents.is_none() {
                attrs.purchase_price_cents = options.purchase_price_cents;
            }
            (attrs, *number)
        })
        .collect();

    let mut ids: Vec<ScryfallId> = rows
        .iter()
        .filter(|(attrs, _)| !attrs.scryfall_id.is_empty())
        .map(|(attrs, _)| ScryfallId::from(attrs.scryfall_id.clone()))
        .collect();
    ids.sort();
    ids.dedup();
    let mut conn = pool.acquire().await?;
    let by_id = load_printings(&mut conn, &ids).await?;
    drop(conn);

    let mut preview_rows = Vec::with_capacity(rows.len());
    for (attrs, row_number) in rows {
        let candidates = if attrs.scryfall_id.is_empty() {
            candidates(pool, &attrs).await?
        } else {
            by_id
                .get(&ScryfallId::from(attrs.scryfall_id.clone()))
                .cloned()
                .into_iter()
                .collect()
        };
        preview_rows.push(preview_row(
            attrs,
            row_number,
            options.location_id,
            candidates,
        ));
    }
    Ok(ImportPreview {
        location_id: options.location_id,
        rows: preview_rows,
    })
}

fn preview_row(
    attrs: parse::RowAttrs,
    row_number: i64,
    location_id: Option<i64>,
    mut candidates: Vec<Printing>,
) -> ImportRow {
    let mut import_attrs = ImportAttrs {
        name: MaybeUndefined::Value(attrs.name),
        set_code: MaybeUndefined::Value(attrs.set_code),
        collector_number: MaybeUndefined::Value(attrs.collector_number),
        quantity: MaybeUndefined::Value(attrs.quantity),
        finish: MaybeUndefined::Value(attrs.finish),
        condition: MaybeUndefined::Value(attrs.condition),
        language: MaybeUndefined::Value(attrs.language),
        scryfall_id: MaybeUndefined::Value(attrs.scryfall_id),
        back_scryfall_id: MaybeUndefined::Value(attrs.back_scryfall_id),
        location_id,
        purchase_price_cents: attrs
            .purchase_price_cents
            .map_or(MaybeUndefined::Null, MaybeUndefined::Value),
    };
    if candidates.len() == 1
        && let Some(printing) = candidates.pop()
    {
        import_attrs.scryfall_id = MaybeUndefined::Value(printing.record.scryfall_id.to_string());
        import_attrs.finish = MaybeUndefined::Value(preferred_finish(
            &printing.record,
            import_attrs.finish.value().map(String::as_str),
        ));
        return ImportRow {
            row_number,
            status: RowStatus::Exact,
            attrs: import_attrs,
            printing: Some(printing),
            candidates: Vec::new(),
        };
    }
    ImportRow {
        row_number,
        status: if candidates.is_empty() {
            RowStatus::Unresolved
        } else {
            RowStatus::Ambiguous
        },
        attrs: import_attrs,
        printing: None,
        candidates,
    }
}

/// Printings matching a row's name, set, and number; a repeated reversible
/// name (`A // A`) retries as just `A`.
async fn candidates(
    pool: &SqlitePool,
    attrs: &parse::RowAttrs,
) -> Result<Vec<Printing>, sqlx::Error> {
    let found =
        printing_candidates(pool, &attrs.name, &attrs.set_code, &attrs.collector_number).await?;
    if !found.is_empty() {
        return Ok(found);
    }
    let faces: Vec<&str> = attrs.name.split("//").map(str::trim).collect();
    match faces.as_slice() {
        [front, back] if front == back && !front.is_empty() => {
            printing_candidates(pool, front, &attrs.set_code, &attrs.collector_number).await
        }
        _ => Ok(Vec::new()),
    }
}

async fn printing_candidates(
    pool: &SqlitePool,
    name: &str,
    set_code: &str,
    collector_number: &str,
) -> Result<Vec<Printing>, sqlx::Error> {
    let filters = PrintingFilters {
        name: name.to_owned(),
        set_code: set_code.to_owned(),
        collector_number: collector_number.to_owned(),
    };
    let wanted_set = set_code.to_lowercase();
    Ok(search_printings(pool, &filters, 6)
        .await?
        .into_iter()
        .filter(|printing| {
            (set_code.is_empty() || printing.record.set_code == wanted_set)
                && (collector_number.is_empty()
                    || printing.record.collector_number == collector_number)
        })
        .collect())
}

/// What a commit created.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ImportResult {
    pub imported: i64,
    pub skipped: i64,
    pub auto_sorted: i64,
}

/// Fails when any of `ids` is missing from `table.column`.
async fn check_references(
    conn: &mut SqliteConnection,
    ids: &[String],
    printings: bool,
) -> Result<bool, sqlx::Error> {
    let mut unique: Vec<&String> = ids.iter().filter(|id| !id.is_empty()).collect();
    unique.sort();
    unique.dedup();
    if unique.is_empty() {
        return Ok(true);
    }
    let json = json_list(&unique);
    let found = if printings {
        sqlx::query_scalar!(
            r#"SELECT count(*) AS "count!: i64" FROM scryfall_printings WHERE scryfall_id IN (SELECT value FROM json_each(?1))"#,
            json
        )
        .fetch_one(&mut *conn)
        .await?
    } else {
        sqlx::query_scalar!(
            r#"SELECT count(*) AS "count!: i64" FROM locations WHERE CAST(id AS TEXT) IN (SELECT value FROM json_each(?1))"#,
            json
        )
        .fetch_one(&mut *conn)
        .await?
    };
    Ok(usize::try_from(found).ok() == Some(unique.len()))
}

/// Creates the exact rows inside a transaction; returns the result and the
/// ids of the collection items created (`import_preview_rows/2`).
async fn import_rows(
    conn: &mut SqliteConnection,
    prices: &PriceStore,
    rows: &[ImportRow],
) -> Result<(ImportResult, Vec<i64>), ImportError> {
    let exact: Vec<&ImportAttrs> = rows
        .iter()
        .filter(|row| row.status == RowStatus::Exact)
        .map(|row| &row.attrs)
        .collect();
    let location_ids: Vec<String> = exact
        .iter()
        .filter_map(|attrs| attrs.location_id.map(|id| id.to_string()))
        .collect();
    if !check_references(conn, &location_ids, false).await? {
        return Err(ImportError::LocationNotFound);
    }
    let scryfall_ids: Vec<String> = exact
        .iter()
        .filter_map(|attrs| present(&attrs.scryfall_id).map(str::to_owned))
        .collect();
    let back_ids: Vec<String> = exact
        .iter()
        .filter_map(|attrs| present(&attrs.back_scryfall_id).map(str::to_owned))
        .collect();
    if !check_references(conn, &scryfall_ids, true).await?
        || !check_references(conn, &back_ids, true).await?
    {
        return Err(ImportError::PrintingNotFound);
    }
    let tokens = token_ids(conn, &scryfall_ids).await?;

    let mut result = ImportResult::default();
    let mut item_ids = Vec::new();
    for row in rows {
        if row.status != RowStatus::Exact {
            result.skipped += 1;
            continue;
        }
        let attrs = &row.attrs;
        if present(&attrs.scryfall_id).is_some_and(|id| tokens.contains(id)) {
            add_token(conn, attrs).await?;
            result.imported += 1;
            continue;
        }
        let changes = ItemChanges {
            scryfall_id: attrs.scryfall_id.clone(),
            quantity: attrs.quantity,
            condition: attrs.condition.clone(),
            language: attrs.language.clone(),
            finish: attrs.finish.clone(),
            location_id: attrs
                .location_id
                .map_or(MaybeUndefined::Null, MaybeUndefined::Value),
            notes: MaybeUndefined::Undefined,
            purchase_price_cents: attrs.purchase_price_cents,
            for_trade: MaybeUndefined::Undefined,
            for_trade_quantity: MaybeUndefined::Undefined,
        };
        item_ids.push(create_in(conn, prices, changes).await?);
        result.imported += 1;
    }
    Ok((result, item_ids))
}

/// Which of the printings are tokens.
async fn token_ids(
    conn: &mut SqliteConnection,
    scryfall_ids: &[String],
) -> Result<HashSet<String>, sqlx::Error> {
    if scryfall_ids.is_empty() {
        return Ok(HashSet::new());
    }
    let json = json_list(scryfall_ids);
    Ok(sqlx::query_scalar!(
        r#"SELECT p.scryfall_id AS "scryfall_id!" FROM scryfall_printings AS p
           JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           WHERE p.scryfall_id IN (SELECT value FROM json_each(?1))
             AND c.layout IN ('token', 'double_faced_token', 'emblem')"#,
        json
    )
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .collect())
}

/// Adds (or merges into) an owned token item (`Tokens.add_token_item/1`),
/// inside the import transaction.
async fn add_token(conn: &mut SqliteConnection, attrs: &ImportAttrs) -> Result<(), ImportError> {
    let scryfall_id = present(&attrs.scryfall_id).unwrap_or_default().to_owned();
    let back = present(&attrs.back_scryfall_id).map(str::to_owned);
    if let Some(back) = &back {
        let layout = sqlx::query_scalar!(
            r#"SELECT c.layout AS "layout?" FROM scryfall_printings AS p
               JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id WHERE p.scryfall_id = ?1"#,
            back
        )
        .fetch_optional(&mut *conn)
        .await?;
        match layout {
            None => return Err(ImportError::PrintingNotFound),
            Some(layout) if layout.as_deref().is_some_and(lotus::card::is_token_layout) => {}
            Some(_) => return Err(ImportError::Failed),
        }
    }
    let finish_text = present(&attrs.finish).unwrap_or("nonfoil").to_owned();
    let quantity = match &attrs.quantity {
        MaybeUndefined::Value(quantity) => *quantity,
        _ => 1,
    };
    let existing = sqlx::query!(
        r#"SELECT id AS "id!", quantity AS "quantity!: i64" FROM token_items
           WHERE scryfall_id = ?1 AND finish = ?2 AND back_scryfall_id IS ?3 LIMIT 1"#,
        scryfall_id,
        finish_text,
        back
    )
    .fetch_optional(&mut *conn)
    .await?;
    let total = existing
        .as_ref()
        .map_or(quantity, |item| item.quantity.saturating_add(quantity));
    let finish = Finish::parse(&finish_text);
    let mut errors = crate::collection::changes::FieldErrors::default();
    if finish.is_none() {
        errors.add("finish", "is invalid");
    }
    if total <= 0 {
        errors.add("quantity", "must be greater than 0");
    }
    if !errors.is_empty() {
        return Err(ImportError::Invalid(errors.render()));
    }
    let now = timefmt::now();
    if let Some(item) = existing {
        sqlx::query!(
            "UPDATE token_items SET quantity = ?1, updated_at = ?2 WHERE id = ?3",
            total,
            now,
            item.id
        )
        .execute(&mut *conn)
        .await?;
    } else {
        sqlx::query!(
            "INSERT INTO token_items (scryfall_id, back_scryfall_id, quantity, finish, inserted_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            scryfall_id,
            back,
            total,
            finish_text,
            now
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Creates the exact rows of a preview, optionally auto-sorting the new
/// items (`import_collection_preview/2`).
pub async fn commit(
    pool: &SqlitePool,
    prices: &PriceStore,
    rows: &[ImportRow],
    auto_sort: bool,
) -> Result<ImportResult, ImportError> {
    let mut tx = crate::db::begin_write(pool).await?;
    let (mut result, item_ids) = import_rows(&mut tx, prices, rows).await?;
    if auto_sort {
        let options = AutoSortOptions {
            source: Source::Items(item_ids),
            ignore_location_debounce: true,
            ..AutoSortOptions::default()
        };
        result.auto_sorted = auto_sort::run_in(&mut tx, prices, &options)
            .await?
            .moved_count;
    }
    tx.commit().await?;
    Ok(result)
}

/// The moves auto-sort would make for the rows once imported, without
/// importing anything (`preview_collection_import_auto_sort/2`).
pub async fn preview_auto_sort(
    pool: &SqlitePool,
    prices: &PriceStore,
    rows: &[ImportRow],
) -> Result<AutoSortResult, ImportError> {
    let mut tx = crate::db::begin_write(pool).await?;
    let (_, item_ids) = import_rows(&mut tx, prices, rows).await?;
    let options = AutoSortOptions {
        source: Source::Items(item_ids),
        dry_run: true,
        ignore_location_debounce: true,
        ..AutoSortOptions::default()
    };
    let result = auto_sort::run_in(&mut tx, prices, &options).await?;
    tx.rollback().await?;
    Ok(result)
}
