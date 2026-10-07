//! Auto-sort: filing loose collection items into boxes and binders by rules
//! (`Collection.AutoSort` with `Query`, `Rules`, `RuleMatcher`, `Apply`).
//!
//! Items allocated to decks are never moved, and items whose location
//! changed in the last 30 days are left alone unless the caller says
//! otherwise (imports sort their new items right away).

pub mod matcher;
pub mod rules;

use sqlx::{SqliteConnection, SqlitePool};

use crate::collection::changes::{ItemError, move_to};
use crate::collection::filters::{ALLOCATED_SQL, FROM_SQL, NOT_LIST_SQL};
use crate::collection::item::{CollectionItem, load_items};
use crate::collection::location::json_ids;
use manavault_catalog::pricing::PriceStore;
use rules::{AutoSortError, RuleInput, SortRule};

const BATCH_SIZE: i64 = 100;
const LOCATION_DEBOUNCE_DAYS: i64 = 30;

/// Which items to sort.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum Source {
    /// Every item outside list locations.
    #[default]
    Collection,
    /// Items without a location.
    Unfiled,
    /// Items in one location.
    Location(i64),
    /// Exactly these items (a fresh import).
    Items(Vec<i64>),
}

/// Auto-sort options (`AutoSort.run/1` opts).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AutoSortOptions {
    pub source: Source,
    /// Report the moves without making them.
    pub dry_run: bool,
    /// Unsaved rules to apply instead of the stored ones.
    pub rules: Option<Vec<RuleInput>>,
    pub ignore_location_debounce: bool,
}

/// One planned or made move (`RuleMatcher.move_summary/2`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutoSortMove {
    pub collection_item_id: i64,
    pub card_name: String,
    pub card_id: Option<String>,
    pub set_code: String,
    pub collector_number: String,
    pub image_url: Option<String>,
    pub quantity: i64,
    pub finish: String,
    pub from_location_id: Option<i64>,
    pub from_location_name: String,
    pub to_location_id: i64,
    pub to_location_name: String,
}

/// What a sort checked and moved.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AutoSortResult {
    pub checked_count: i64,
    pub moved_count: i64,
    pub skipped_count: i64,
    pub dry_run: bool,
    pub moves: Vec<AutoSortMove>,
}

fn move_summary(item: &CollectionItem, rule: &SortRule) -> AutoSortMove {
    let (from_location_id, from_location_name) = match &item.location {
        Some(location) => (Some(location.id), location.name.clone()),
        None => (None, "Unfiled".to_owned()),
    };
    AutoSortMove {
        collection_item_id: item.record.id,
        card_name: item.card().map(|c| c.name.clone()).unwrap_or_default(),
        card_id: Some(item.oracle_id().to_string()),
        set_code: item.printing.record.set_code.clone(),
        collector_number: item.printing.record.collector_number.clone(),
        image_url: item.image_url(),
        quantity: item.record.quantity.as_i64(),
        finish: item.record.finish.as_str().to_owned(),
        from_location_id,
        from_location_name,
        to_location_id: rule.location_id,
        to_location_name: rule.location_name.clone(),
    }
}

/// The next batch of candidate item ids after `after_id` (`Query.batch/3`).
async fn batch_ids(
    conn: &mut SqliteConnection,
    options: &AutoSortOptions,
    after_id: i64,
) -> Result<Vec<i64>, sqlx::Error> {
    let mut builder = sqlx::QueryBuilder::new(format!(
        "SELECT i.id {FROM_SQL} WHERE NOT ({ALLOCATED_SQL}) AND i.id > "
    ));
    builder.push_bind(after_id);
    if !options.ignore_location_debounce {
        let cutoff = time::OffsetDateTime::now_utc() - time::Duration::days(LOCATION_DEBOUNCE_DAYS);
        builder.push(" AND (i.location_changed_at IS NULL OR i.location_changed_at < ");
        builder.push_bind(manavault_core::timefmt::utc_seconds(cutoff));
        builder.push(")");
    }
    match &options.source {
        Source::Collection => {
            builder.push(format!(" AND {NOT_LIST_SQL}"));
        }
        Source::Unfiled => {
            builder.push(" AND i.location_id IS NULL");
        }
        Source::Location(id) => {
            builder.push(" AND i.location_id = ");
            builder.push_bind(*id);
        }
        Source::Items(ids) => {
            builder.push(" AND i.id IN (SELECT value FROM json_each(");
            builder.push_bind(json_ids(ids));
            builder.push("))");
        }
    }
    builder.push(" ORDER BY i.id ASC LIMIT ");
    builder.push_bind(BATCH_SIZE);
    builder
        .build_query_scalar::<i64>()
        .fetch_all(&mut *conn)
        .await
}

/// Sorts through an open connection (or transaction), in batches of 100.
pub async fn run_in(
    conn: &mut SqliteConnection,
    prices: &PriceStore,
    options: &AutoSortOptions,
) -> Result<AutoSortResult, AutoSortError> {
    let rules = match &options.rules {
        Some(inputs) => rules::input_rules(conn, inputs).await?,
        None => rules::enabled_rules(conn).await?,
    };
    let mut result = AutoSortResult {
        dry_run: options.dry_run,
        ..AutoSortResult::default()
    };
    let mut after_id = 0;
    loop {
        let ids = batch_ids(conn, options, after_id).await?;
        let Some(last) = ids.last().copied() else {
            break;
        };
        after_id = last;
        let items = load_items(conn, &ids).await?;
        result.checked_count += i64::try_from(ids.len()).unwrap_or(0);
        for item in &items {
            match matcher::matching_rule(&rules, item, prices) {
                Some(rule) if Some(rule.location_id) != item.record.location_id => {
                    if !options.dry_run {
                        move_to(conn, &item.record, rule.location_id)
                            .await
                            .map_err(|error| match error {
                                ItemError::Db(error) => AutoSortError::Db(error),
                                other => AutoSortError::Item(other),
                            })?;
                    }
                    result.moved_count += 1;
                    result.moves.push(move_summary(item, rule));
                }
                _ => result.skipped_count += 1,
            }
        }
    }
    Ok(result)
}

/// Sorts the collection (`auto_sort_collection/1`).
pub async fn run(
    pool: &SqlitePool,
    prices: &PriceStore,
    options: &AutoSortOptions,
) -> Result<AutoSortResult, AutoSortError> {
    if options.dry_run {
        let mut conn = pool.acquire().await?;
        return run_in(&mut conn, prices, options).await;
    }
    let mut tx = manavault_core::db::begin_write(pool).await?;
    let result = run_in(&mut tx, prices, options).await?;
    tx.commit().await?;
    Ok(result)
}
