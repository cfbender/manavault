//! Bulk clean: surplus copies of cheap cards to pull out of storage
//! (`Collection.BulkClean`).
//!
//! A card qualifies when its loose copies (not allocated to a deck and not on
//! a list) priced under `max_price_cents` add up to at least `min_copies`.
//! Everything above `keep_copies` is suggested, pulling the cheapest
//! printings first and then the largest stacks so fewer piles need to be
//! visited. With `prefer_keep_foils`, nonfoil copies are pulled before any
//! foil or etched copy. `kept` maps item ids to copies the user wants to keep
//! from that stack; those are never pulled and the card's other stacks make
//! up the difference. `swappable_copies` says how many more copies could
//! still be kept that way.

use std::collections::HashMap;

use sqlx::{FromRow, SqlitePool};

use crate::collection::changes::{ItemError, set_quantity};
use crate::collection::filters::{ALLOCATED_SQL, FROM_SQL, NOT_LIST_SQL, price_cents_sql};
use crate::collection::item::{CollectionItem, load_items};
use crate::collection_item_query;

/// Bulk clean options; `None` takes the default.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BulkCleanOptions {
    pub max_price_cents: Option<i64>,
    pub min_copies: Option<i64>,
    pub keep_copies: Option<i64>,
    pub prefer_keep_foils: Option<bool>,
    /// Copies to keep per item id.
    pub kept: HashMap<i64, i64>,
}

/// Copies to take from one stack.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BulkCleanPull {
    pub collection_item_id: i64,
    pub card_id: String,
    pub card_name: String,
    pub set_code: String,
    pub collector_number: String,
    pub image_url: Option<String>,
    pub finish: String,
    pub price_cents: i64,
    pub owned_quantity: i64,
    pub quantity: i64,
    pub from_location_id: Option<i64>,
    pub from_location_name: String,
}

/// The pulls for one card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BulkCleanCard {
    pub card_id: String,
    pub card_name: String,
    pub type_line: Option<String>,
    pub colors: Vec<String>,
    pub image_url: Option<String>,
    pub total_copies: i64,
    pub pull_quantity: i64,
    pub swappable_copies: i64,
    pub pull_value_cents: i64,
    pub pulls: Vec<BulkCleanPull>,
}

/// The whole suggestion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BulkCleanResult {
    pub max_price_cents: i64,
    pub min_copies: i64,
    pub keep_copies: i64,
    pub prefer_keep_foils: bool,
    pub card_count: i64,
    pub pull_quantity: i64,
    pub pull_value_cents: i64,
    pub cards: Vec<BulkCleanCard>,
}

#[derive(FromRow)]
struct Candidate {
    id: i64,
    price_cents: i64,
}

/// The suggested pulls (`collection_bulk_clean/1`).
pub async fn preview(
    pool: &SqlitePool,
    options: &BulkCleanOptions,
) -> Result<BulkCleanResult, sqlx::Error> {
    let max_price_cents = options.max_price_cents.unwrap_or(20).max(0);
    let min_copies = options.min_copies.unwrap_or(10).max(1);
    let keep_copies = options.keep_copies.unwrap_or(4).max(0);
    let prefer_keep_foils = options.prefer_keep_foils.unwrap_or(true);

    let price = price_cents_sql();
    let loose = format!("NOT ({ALLOCATED_SQL}) AND {NOT_LIST_SQL} AND {price} < ");
    let mut builder = sqlx::QueryBuilder::new(format!(
        "SELECT i.id AS id, {price} AS price_cents {FROM_SQL} WHERE {loose}"
    ));
    builder.push_bind(max_price_cents);
    builder.push(format!(
        " AND c.oracle_id IN (SELECT c.oracle_id {FROM_SQL} WHERE {loose}"
    ));
    builder.push_bind(max_price_cents);
    builder.push(" GROUP BY c.oracle_id HAVING SUM(i.quantity) >= ");
    builder.push_bind(min_copies);
    builder.push(")");
    let candidates: Vec<Candidate> = builder.build_query_as().fetch_all(pool).await?;

    let ids: Vec<i64> = candidates.iter().map(|c| c.id).collect();
    let prices: HashMap<i64, i64> = candidates.iter().map(|c| (c.id, c.price_cents)).collect();
    let mut conn = pool.acquire().await?;
    let mut by_card: HashMap<String, Vec<(CollectionItem, i64)>> = HashMap::new();
    for chunk in ids.chunks(500) {
        for item in load_items(&mut conn, chunk).await? {
            let price = prices.get(&item.record.id).copied().unwrap_or(0);
            by_card
                .entry(item.oracle_id().to_string())
                .or_default()
                .push((item, price));
        }
    }

    let mut cards: Vec<BulkCleanCard> = by_card
        .into_values()
        .filter_map(|rows| card_pulls(rows, keep_copies, prefer_keep_foils, &options.kept))
        .filter(|card| card.pull_quantity != 0)
        .collect();
    cards.sort_by(|a, b| {
        a.card_name
            .cmp(&b.card_name)
            .then_with(|| a.card_id.cmp(&b.card_id))
    });

    Ok(BulkCleanResult {
        max_price_cents,
        min_copies,
        keep_copies,
        prefer_keep_foils,
        card_count: i64::try_from(cards.len()).unwrap_or(i64::MAX),
        pull_quantity: cards.iter().map(|card| card.pull_quantity).sum(),
        pull_value_cents: cards.iter().map(|card| card.pull_value_cents).sum(),
        cards,
    })
}

fn card_pulls(
    mut rows: Vec<(CollectionItem, i64)>,
    keep_copies: i64,
    prefer_keep_foils: bool,
    kept: &HashMap<i64, i64>,
) -> Option<BulkCleanCard> {
    rows.sort_by_key(|(item, price)| {
        let foil_rank =
            i64::from(prefer_keep_foils && item.record.finish != lotus::Finish::Nonfoil);
        (
            foil_rank,
            *price,
            -item.record.quantity.as_i64(),
            item.record.id,
        )
    });
    let total_copies: i64 = rows
        .iter()
        .map(|(item, _)| item.record.quantity.as_i64())
        .sum();
    let pullable = |item: &CollectionItem| {
        (item.record.quantity.as_i64() - kept.get(&item.record.id).copied().unwrap_or(0)).max(0)
    };
    let pullable_copies: i64 = rows.iter().map(|(item, _)| pullable(item)).sum();
    let mut remaining = (total_copies - keep_copies).max(0).min(pullable_copies);
    let mut pulls = Vec::new();
    for (item, price) in &rows {
        if remaining == 0 {
            break;
        }
        let quantity = pullable(item).min(remaining);
        if quantity == 0 {
            continue;
        }
        remaining -= quantity;
        pulls.push(pull(item, *price, quantity));
    }
    let pull_quantity: i64 = pulls.iter().map(|pull| pull.quantity).sum();
    let (first, _) = rows.first()?;
    let card = first.card()?;
    Some(BulkCleanCard {
        card_id: card.oracle_id.to_string(),
        card_name: card.name.clone(),
        type_line: card.type_line.clone(),
        colors: card.colors_list(),
        image_url: first.image_url(),
        total_copies,
        pull_quantity,
        swappable_copies: pullable_copies - pull_quantity,
        pull_value_cents: pulls.iter().map(|p| p.quantity * p.price_cents).sum(),
        pulls,
    })
}

fn pull(item: &CollectionItem, price_cents: i64, quantity: i64) -> BulkCleanPull {
    let (from_location_id, from_location_name) = match &item.location {
        Some(location) => (Some(location.id), location.name.clone()),
        None => (None, "Unfiled".to_owned()),
    };
    BulkCleanPull {
        collection_item_id: item.record.id,
        card_id: item.oracle_id().to_string(),
        card_name: item.card().map(|c| c.name.clone()).unwrap_or_default(),
        set_code: item.printing.record.set_code.clone(),
        collector_number: item.printing.record.collector_number.clone(),
        image_url: item.image_url(),
        finish: item.record.finish.as_str().to_owned(),
        price_cents,
        owned_quantity: item.record.quantity.as_i64(),
        quantity,
        from_location_id,
        from_location_name,
    }
}

/// Copies to remove from one stack.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PullRequest {
    pub collection_item_id: i64,
    pub quantity: i64,
}

/// Why removing pulls failed.
#[derive(Debug, thiserror::Error)]
pub enum RemovePullsError {
    /// The collection changed since the suggestion (`:stale_pull`).
    #[error("Your collection changed since this list was made. Refresh and try again.")]
    Stale,
    #[error("Could not remove pulled cards")]
    Failed,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Removes pulled copies, deleting emptied stacks (`remove_bulk_clean_pulls/1`).
pub async fn remove(pool: &SqlitePool, pulls: &[PullRequest]) -> Result<i64, RemovePullsError> {
    let mut tx = manavault_core::db::begin_write(pool).await?;
    let mut removed = 0;
    for pull in pulls {
        let id = pull.collection_item_id;
        let record = collection_item_query!("WHERE i.id = ?1", id)
            .fetch_optional(&mut *tx)
            .await?;
        let allocated = sqlx::query_scalar!(
            r#"SELECT count(*) AS "count!: i64" FROM deck_allocations WHERE collection_item_id = ?1"#,
            id
        )
        .fetch_one(&mut *tx)
        .await?;
        let Some(record) = record else {
            return Err(RemovePullsError::Stale);
        };
        let owned = record.quantity.as_i64();
        if allocated > 0 || pull.quantity < 1 || pull.quantity > owned {
            return Err(RemovePullsError::Stale);
        }
        if pull.quantity == owned {
            sqlx::query!("DELETE FROM collection_items WHERE id = ?1", id)
                .execute(&mut *tx)
                .await?;
        } else {
            set_quantity(&mut tx, &record, owned - pull.quantity)
                .await
                .map_err(|error| match error {
                    ItemError::Db(error) => RemovePullsError::Db(error),
                    _ => RemovePullsError::Failed,
                })?;
        }
        removed += pull.quantity;
    }
    tx.commit().await?;
    Ok(removed)
}
