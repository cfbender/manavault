//! Collection listings, totals, and value summaries
//! (`CardCollection.ItemQueries` and `ItemQueries.ValueSummary`).

use std::cmp::Ordering;
use std::collections::HashMap;

use lotus::{OracleId, ScryfallId};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use crate::catalog::printing::Printing;
use crate::catalog::sql::json_list;
use crate::collection::filters::{
    ALLOCATED_SQL, FROM_SQL, ItemFilters, NOT_LIST_SQL, Sort, base_query, price_cents_sql,
};
use crate::collection::item::{CollectionItem, load_items, load_printings};
use crate::collection::location::json_ids;

/// Listing options (`limit`, `offset`, `sort`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Page {
    pub limit: i64,
    pub offset: i64,
    pub sort: Sort,
}

impl Default for Page {
    fn default() -> Self {
        Self {
            limit: 100,
            offset: 0,
            sort: Sort::default(),
        }
    }
}

/// Collection items matching the filters, one page (`list_items/2`).
pub async fn list_items(
    pool: &SqlitePool,
    filters: &ItemFilters,
    page: Page,
) -> Result<Vec<CollectionItem>, sqlx::Error> {
    let mut builder = base_query("i.id", filters);
    builder.push(" ORDER BY ");
    builder.push(page.sort.items_order());
    builder.push(" LIMIT ");
    builder.push_bind(page.limit);
    builder.push(" OFFSET ");
    builder.push_bind(page.offset);
    let mut conn = pool.acquire().await?;
    let ids: Vec<i64> = builder
        .build_query_scalar::<i64>()
        .fetch_all(&mut *conn)
        .await?;
    load_items(&mut conn, &ids).await
}

/// Every item matching the filters by name, for exports (`stream_items/2`).
pub async fn all_items(
    conn: &mut SqliteConnection,
    filters: &ItemFilters,
) -> Result<Vec<CollectionItem>, sqlx::Error> {
    let mut builder = base_query("i.id", filters);
    builder.push(" ORDER BY ");
    builder.push(Sort::default().items_order());
    let ids: Vec<i64> = builder
        .build_query_scalar::<i64>()
        .fetch_all(&mut *conn)
        .await?;
    let mut items = Vec::with_capacity(ids.len());
    for chunk in ids.chunks(500) {
        items.extend(load_items(conn, chunk).await?);
    }
    Ok(items)
}

/// The ids of every item matching the filters (`list_item_ids/1`).
pub async fn list_item_ids(
    pool: &SqlitePool,
    filters: &ItemFilters,
) -> Result<Vec<i64>, sqlx::Error> {
    base_query("i.id", filters)
        .build_query_scalar::<i64>()
        .fetch_all(pool)
        .await
}

/// The items of one printing, as a listing group.
#[derive(Debug, Clone)]
pub struct ItemGroup {
    pub printing_id: ScryfallId,
    pub quantity: i64,
    pub items: Vec<CollectionItem>,
}

/// Items grouped by printing, paged over the groups (`list_item_groups/2`).
/// Under the `for_trade` filter, a group still lists every copy of its
/// printing.
pub async fn list_item_groups(
    pool: &SqlitePool,
    filters: &ItemFilters,
    page: Page,
) -> Result<Vec<ItemGroup>, sqlx::Error> {
    let mut builder = base_query("i.scryfall_id", filters);
    builder.push(" GROUP BY i.scryfall_id ORDER BY ");
    builder.push(page.sort.groups_order());
    builder.push(" LIMIT ");
    builder.push_bind(page.limit);
    builder.push(" OFFSET ");
    builder.push_bind(page.offset);
    let mut conn = pool.acquire().await?;
    let printing_ids: Vec<String> = builder
        .build_query_scalar::<String>()
        .fetch_all(&mut *conn)
        .await?;
    if printing_ids.is_empty() {
        return Ok(Vec::new());
    }
    let item_filters = ItemFilters {
        for_trade: false,
        ..filters.clone()
    };
    let mut builder = base_query("i.id", &item_filters);
    builder.push(" AND i.scryfall_id IN (SELECT value FROM json_each(");
    builder.push_bind(json_list(&printing_ids));
    builder.push(")) ORDER BY i.id ASC");
    let ids: Vec<i64> = builder
        .build_query_scalar::<i64>()
        .fetch_all(&mut *conn)
        .await?;
    let mut by_printing: HashMap<String, Vec<CollectionItem>> = HashMap::new();
    for item in load_items(&mut conn, &ids).await? {
        by_printing
            .entry(item.record.scryfall_id.to_string())
            .or_default()
            .push(item);
    }
    Ok(printing_ids
        .into_iter()
        .map(|printing_id| {
            let items = by_printing.remove(&printing_id).unwrap_or_default();
            ItemGroup {
                quantity: items.iter().map(|item| item.record.quantity.as_i64()).sum(),
                printing_id: ScryfallId::from(printing_id),
                items,
            }
        })
        .collect())
}

/// Collection totals for a filter set (`item_totals/1`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, FromRow)]
pub struct Totals {
    /// Copies (offered copies under the `for_trade` filter).
    pub quantity: i64,
    /// Item rows; pagination uses this.
    pub entries: i64,
    /// Distinct printings.
    pub groups: i64,
}

pub async fn totals(pool: &SqlitePool, filters: &ItemFilters) -> Result<Totals, sqlx::Error> {
    let quantity = if filters.for_trade {
        "i.for_trade_quantity"
    } else {
        "i.quantity"
    };
    base_query(
        &format!(
            "COALESCE(SUM({quantity}), 0) AS quantity, COUNT(i.id) AS entries, COUNT(DISTINCT i.scryfall_id) AS groups"
        ),
        filters,
    )
    .build_query_as::<Totals>()
    .fetch_one(pool)
    .await
}

/// Copies, current value, and purchase basis of a set of items.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, FromRow)]
pub struct ValueTotals {
    pub item_count: i64,
    pub total_price_cents: i64,
    /// Purchase prices, falling back to current prices for copies without one.
    pub purchase_price_cents: i64,
}

fn value_columns() -> String {
    let price = price_cents_sql();
    format!(
        "COALESCE(SUM(i.quantity), 0) AS item_count, \
         CAST(COALESCE(SUM(i.quantity * COALESCE({price}, 0)), 0) AS INTEGER) AS total_price_cents, \
         CAST(COALESCE(SUM(i.quantity * COALESCE(i.purchase_price_cents, {price}, 0)), 0) AS INTEGER) AS purchase_price_cents"
    )
}

/// The value summary of the items matching the filters (`value_summary/1`).
pub async fn value_summary(
    pool: &SqlitePool,
    filters: &ItemFilters,
) -> Result<ValueTotals, sqlx::Error> {
    base_query(&value_columns(), filters)
        .build_query_as::<ValueTotals>()
        .fetch_one(pool)
        .await
}

#[derive(FromRow)]
struct LocationTotalsRow {
    location_id: Option<i64>,
    item_count: i64,
    total_price_cents: i64,
    purchase_price_cents: i64,
}

/// Value summaries of unallocated copies per location; the `None` key is the
/// unfiled bucket (`location_summaries/0`). With `only`, just those
/// locations (the location value-summary batch).
pub async fn location_summaries(
    pool: &SqlitePool,
    only: Option<&[i64]>,
) -> Result<HashMap<Option<i64>, ValueTotals>, sqlx::Error> {
    let mut builder = sqlx::QueryBuilder::new(format!(
        "SELECT i.location_id AS location_id, {} FROM collection_items AS i \
         JOIN scryfall_printings AS p ON p.scryfall_id = i.scryfall_id \
         WHERE NOT ({ALLOCATED_SQL})",
        value_columns()
    ));
    if let Some(ids) = only {
        builder.push(" AND i.location_id IN (SELECT value FROM json_each(");
        builder.push_bind(json_ids(ids));
        builder.push("))");
    }
    builder.push(" GROUP BY i.location_id");
    Ok(builder
        .build_query_as::<LocationTotalsRow>()
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| {
            (
                row.location_id,
                ValueTotals {
                    item_count: row.item_count,
                    total_price_cents: row.total_price_cents,
                    purchase_price_cents: row.purchase_price_cents,
                },
            )
        })
        .collect())
}

/// One printing's copies and value, for the value dashboard.
#[derive(Debug, Clone)]
pub struct ValuePosition {
    pub scryfall_id: ScryfallId,
    pub quantity: i64,
    pub total_price_cents: i64,
    pub purchase_price_cents: i64,
    pub value_gain_cents: i64,
}

/// A ranked position with its printing and the items behind it.
#[derive(Debug, Clone)]
pub struct RankedPosition {
    pub position: ValuePosition,
    pub printing: Printing,
    pub items: Vec<CollectionItem>,
}

impl ValuePosition {
    fn gain_ratio(&self) -> f64 {
        ratio(self.value_gain_cents, self.purchase_price_cents)
    }
}

/// `gain / purchase` as a float, for ranking.
fn ratio(gain: i64, purchase: i64) -> f64 {
    let (Ok(gain), Ok(purchase)) = (i32::try_from(gain), i32::try_from(purchase)) else {
        return 0.0;
    };
    f64::from(gain) / f64::from(purchase)
}

/// The value dashboard (`value_dashboard/0`).
#[derive(Debug, Clone)]
pub struct ValueDashboard {
    pub summary: ValueTotals,
    pub position_count: i64,
    pub gain_position_count: i64,
    pub loss_position_count: i64,
    pub biggest_gains: Vec<RankedPosition>,
    pub biggest_losses: Vec<RankedPosition>,
    pub biggest_percent_gains: Vec<RankedPosition>,
    pub biggest_percent_losses: Vec<RankedPosition>,
}

#[derive(FromRow)]
struct PositionRow {
    scryfall_id: String,
    item_count: i64,
    total_price_cents: i64,
    purchase_price_cents: i64,
}

fn count(len: usize) -> i64 {
    i64::try_from(len).unwrap_or(i64::MAX)
}

pub async fn value_dashboard(pool: &SqlitePool) -> Result<ValueDashboard, sqlx::Error> {
    let summary = value_summary(pool, &ItemFilters::default()).await?;
    let positions: Vec<ValuePosition> = sqlx::QueryBuilder::new(format!(
        "SELECT i.scryfall_id AS scryfall_id, {} {FROM_SQL} WHERE {NOT_LIST_SQL} GROUP BY i.scryfall_id",
        value_columns()
    ))
    .build_query_as::<PositionRow>()
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| ValuePosition {
        scryfall_id: ScryfallId::from(row.scryfall_id),
        quantity: row.item_count,
        total_price_cents: row.total_price_cents,
        purchase_price_cents: row.purchase_price_cents,
        value_gain_cents: row.total_price_cents - row.purchase_price_cents,
    })
    .collect();

    let gains: Vec<&ValuePosition> = positions
        .iter()
        .filter(|p| p.value_gain_cents > 0)
        .collect();
    let losses: Vec<&ValuePosition> = positions
        .iter()
        .filter(|p| p.value_gain_cents < 0)
        .collect();

    let mut biggest_gains = gains.clone();
    biggest_gains.sort_by(|a, b| {
        b.value_gain_cents
            .cmp(&a.value_gain_cents)
            .then_with(|| a.scryfall_id.cmp(&b.scryfall_id))
    });
    let mut biggest_losses = losses.clone();
    biggest_losses.sort_by(|a, b| {
        a.value_gain_cents
            .cmp(&b.value_gain_cents)
            .then_with(|| a.scryfall_id.cmp(&b.scryfall_id))
    });
    let mut percent_gains: Vec<&ValuePosition> = gains
        .iter()
        .copied()
        .filter(|p| p.purchase_price_cents > 0)
        .collect();
    percent_gains.sort_by(|a, b| {
        b.gain_ratio()
            .partial_cmp(&a.gain_ratio())
            .unwrap_or(Ordering::Equal)
            .then_with(|| b.value_gain_cents.cmp(&a.value_gain_cents))
            .then_with(|| a.scryfall_id.cmp(&b.scryfall_id))
    });
    let mut percent_losses: Vec<&ValuePosition> = losses
        .iter()
        .copied()
        .filter(|p| p.purchase_price_cents > 0)
        .collect();
    percent_losses.sort_by(|a, b| {
        a.gain_ratio()
            .partial_cmp(&b.gain_ratio())
            .unwrap_or(Ordering::Equal)
            .then_with(|| a.value_gain_cents.cmp(&b.value_gain_cents))
            .then_with(|| a.scryfall_id.cmp(&b.scryfall_id))
    });

    let rankings: Vec<Vec<ValuePosition>> =
        [biggest_gains, biggest_losses, percent_gains, percent_losses]
            .into_iter()
            .map(|ranking| ranking.into_iter().take(5).cloned().collect())
            .collect();
    let mut ranked_ids: Vec<ScryfallId> = rankings
        .iter()
        .flatten()
        .map(|position| position.scryfall_id.clone())
        .collect();
    ranked_ids.sort();
    ranked_ids.dedup();

    let mut conn = pool.acquire().await?;
    let printings = load_printings(&mut conn, &ranked_ids).await?;
    let mut builder = sqlx::QueryBuilder::new(format!(
        "SELECT i.id FROM collection_items AS i LEFT JOIN locations AS l ON l.id = i.location_id \
         WHERE {NOT_LIST_SQL} AND i.scryfall_id IN (SELECT value FROM json_each("
    ));
    builder.push_bind(json_list(&ranked_ids));
    builder.push(")) ORDER BY i.id");
    let item_ids: Vec<i64> = builder
        .build_query_scalar::<i64>()
        .fetch_all(&mut *conn)
        .await?;
    let mut items_by_printing: HashMap<ScryfallId, Vec<CollectionItem>> = HashMap::new();
    for item in load_items(&mut conn, &item_ids).await? {
        items_by_printing
            .entry(item.record.scryfall_id.clone())
            .or_default()
            .push(item);
    }
    let attach = |ranking: Vec<ValuePosition>| -> Vec<RankedPosition> {
        ranking
            .into_iter()
            .filter_map(|position| {
                Some(RankedPosition {
                    printing: printings.get(&position.scryfall_id)?.clone(),
                    items: items_by_printing
                        .get(&position.scryfall_id)
                        .cloned()
                        .unwrap_or_default(),
                    position,
                })
            })
            .collect()
    };
    let mut rankings = rankings.into_iter().map(attach);
    let mut next = || rankings.next().unwrap_or_default();
    let (biggest_gains, biggest_losses, biggest_percent_gains, biggest_percent_losses) =
        (next(), next(), next(), next());

    Ok(ValueDashboard {
        summary,
        position_count: count(positions.len()),
        gain_position_count: count(gains.len()),
        loss_position_count: count(losses.len()),
        biggest_gains,
        biggest_losses,
        biggest_percent_gains,
        biggest_percent_losses,
    })
}

/// Owned copies per card outside list locations, deck allocations included
/// (`CollectionItem.total_owned_copies`).
pub async fn owned_copies(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<HashMap<OracleId, i64>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = json_list(oracle_ids);
    let rows = sqlx::query!(
        r#"SELECT p.oracle_id AS "oracle_id!: OracleId",
                  COALESCE(SUM(i.quantity), 0) AS "owned!: i64"
           FROM collection_items AS i
           JOIN scryfall_printings AS p ON p.scryfall_id = i.scryfall_id
           LEFT JOIN locations AS l ON l.id = i.location_id
           WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
             AND (l.id IS NULL OR l.kind != 'list')
           GROUP BY p.oracle_id"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.oracle_id, row.owned))
        .collect())
}

/// Copies of an item reserved for one deck.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckAllocationSummary {
    pub deck_id: i64,
    pub deck_name: String,
    pub quantity: i64,
}

/// Each item's deck allocations: the total allocated and the copies per
/// deck, decks by name (`allocated_quantity`, `allocation_decks`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ItemAllocations {
    pub allocated_quantity: i64,
    pub decks: Vec<DeckAllocationSummary>,
}

pub async fn allocations(
    pool: &SqlitePool,
    item_ids: &[i64],
) -> Result<HashMap<i64, ItemAllocations>, sqlx::Error> {
    if item_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = json_ids(item_ids);
    let rows = sqlx::query!(
        r#"SELECT allocation.collection_item_id AS "item_id!", deck.id AS "deck_id!",
                  deck.name AS "deck_name!", SUM(allocation.quantity) AS "quantity!: i64"
           FROM deck_allocations AS allocation
           JOIN deck_cards AS deck_card ON deck_card.id = allocation.deck_card_id
           JOIN decks AS deck ON deck.id = deck_card.deck_id
           WHERE allocation.collection_item_id IN (SELECT value FROM json_each(?1))
           GROUP BY allocation.collection_item_id, deck.id
           ORDER BY deck.name ASC, deck.id ASC"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    let mut by_item: HashMap<i64, ItemAllocations> = HashMap::new();
    for row in rows {
        let entry = by_item.entry(row.item_id).or_default();
        entry.allocated_quantity += row.quantity;
        entry.decks.push(DeckAllocationSummary {
            deck_id: row.deck_id,
            deck_name: row.deck_name,
            quantity: row.quantity,
        });
    }
    Ok(by_item)
}

/// Decks that are not archived (`count_non_archived_decks/0`).
pub async fn count_non_archived_decks(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT count(*) AS "count!: i64" FROM decks WHERE status != 'archived'"#)
        .fetch_one(pool)
        .await
}
