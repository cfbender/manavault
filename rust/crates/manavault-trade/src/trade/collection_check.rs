//! Checking a list against the collection (`Manavault.Trade.CollectionCheck`):
//! for each card, how many copies are free to pull, how many are owned but
//! allocated to decks, how many are missing, and what sourcing the rest
//! would cost at the cheapest printing's price.

use std::collections::{BTreeMap, HashMap};

use lotus::{OracleId, Zone};
use sqlx::SqlitePool;

use crate::trade::entry_resolver;
use crate::trade::list_source::{ListEntry, ResolvedList};
use manavault_catalog::catalog::card::CardRecord;
use manavault_catalog::catalog::price::format_cents;
use manavault_catalog::catalog::printing::Printing;
use manavault_catalog::catalog::sql::json_list;
use manavault_catalog::pricing::PriceStore;

/// A card row's state, worst first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RowStatus {
    Missing,
    Partial,
    AllocatedElsewhere,
    Ready,
    BasicLand,
}

impl RowStatus {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::Partial => "partial",
            Self::AllocatedElsewhere => "allocated_elsewhere",
            Self::Ready => "ready",
            Self::BasicLand => "basic_land",
        }
    }
}

/// `CollectionCheckCard`.
#[derive(Debug, Clone)]
pub struct CheckCard {
    pub card_name: String,
    pub oracle_id: OracleId,
    pub required: i64,
    pub owned: i64,
    pub available: i64,
    pub unavailable: i64,
    pub missing: i64,
    pub to_source: i64,
    pub status: RowStatus,
    pub printing: Option<Printing>,
    pub unit_price_cents: Option<i64>,
    pub total_price_cents: Option<i64>,
}

/// `CollectionCheckResult`.
#[derive(Debug, Clone)]
pub struct CheckResult {
    pub source_name: Option<String>,
    pub entry_count: i64,
    pub requested_quantity: i64,
    pub excluded_quantity: i64,
    pub available_quantity: i64,
    pub unavailable_quantity: i64,
    pub missing_quantity: i64,
    pub estimated_cost_cents: i64,
    pub unpriced_quantity: i64,
    pub unrecognized: Vec<String>,
    pub cards: Vec<CheckCard>,
}

impl CheckResult {
    #[must_use]
    pub fn cost_text(&self) -> String {
        format_cents(Some(self.estimated_cost_cents)).unwrap_or_default()
    }
}

fn total_quantity(entries: &[ListEntry]) -> i64 {
    entries.iter().map(|entry| entry.quantity).sum()
}

fn count(len: usize) -> i64 {
    i64::try_from(len).unwrap_or(i64::MAX)
}

/// Checks a resolved list. Considering entries are left out (and counted as
/// excluded) unless `include_considering`.
pub async fn check(
    pool: &SqlitePool,
    prices: &PriceStore,
    list: ResolvedList,
    include_considering: bool,
) -> Result<CheckResult, sqlx::Error> {
    let (included, excluded): (Vec<ListEntry>, Vec<ListEntry>) = if include_considering {
        (list.entries, Vec::new())
    } else {
        list.entries
            .into_iter()
            .partition(|entry| entry.zone != Zone::Considering)
    };
    let entry_count = count(included.len());
    let requested_quantity = total_quantity(&included);
    let excluded_quantity = total_quantity(&excluded);
    let resolved = entry_resolver::resolve(pool, included).await?;

    let mut requirements: BTreeMap<OracleId, (String, i64)> = BTreeMap::new();
    for entry in resolved.entries {
        if let Some(oracle_id) = entry.oracle_id {
            requirements
                .entry(oracle_id)
                .and_modify(|(_, quantity)| *quantity += entry.entry.quantity)
                .or_insert((entry.entry.name, entry.entry.quantity));
        }
    }
    let cards = rows(pool, prices, requirements).await?;

    let mut result = CheckResult {
        source_name: list.source_name,
        entry_count,
        requested_quantity,
        excluded_quantity,
        available_quantity: 0,
        unavailable_quantity: 0,
        missing_quantity: 0,
        estimated_cost_cents: 0,
        unpriced_quantity: 0,
        unrecognized: resolved.unrecognized,
        cards: Vec::new(),
    };
    for card in &cards {
        result.available_quantity += card.available;
        result.unavailable_quantity += card.unavailable;
        result.missing_quantity += card.missing;
        match card.total_price_cents {
            Some(total) => result.estimated_cost_cents += total,
            None => result.unpriced_quantity += card.to_source,
        }
    }
    result.cards = cards;
    Ok(result)
}

/// What the collection holds for one card, as
/// `AllocationStatus.collection_requirement_statuses/1` computes it for a
/// requirement that is not a deck card yet.
#[derive(Debug, Default, Clone, Copy)]
struct Holding {
    owned: i64,
    available: i64,
    allocated_elsewhere: i64,
}

/// Copies outside list-kind locations, and how many deck allocations of the
/// same card reserve them.
async fn holdings(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<HashMap<OracleId, Holding>, sqlx::Error> {
    let ids = json_list(oracle_ids);
    let items = sqlx::query!(
        r#"SELECT i.id AS "id!", i.quantity AS "quantity!", p.oracle_id AS "oracle_id!: OracleId"
           FROM collection_items AS i
           JOIN scryfall_printings AS p ON p.scryfall_id = i.scryfall_id
           LEFT JOIN locations AS l ON l.id = i.location_id
           WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
             AND (l.id IS NULL OR l.kind != 'list')"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    let allocations = sqlx::query!(
        r#"SELECT dc.oracle_id AS "oracle_id!: OracleId",
             a.collection_item_id AS "collection_item_id!", SUM(a.quantity) AS "quantity!: i64"
           FROM deck_allocations AS a JOIN deck_cards AS dc ON dc.id = a.deck_card_id
           WHERE dc.oracle_id IN (SELECT value FROM json_each(?1))
           GROUP BY dc.oracle_id, a.collection_item_id"#,
        ids
    )
    .fetch_all(pool)
    .await?;

    let mut reserved: HashMap<(OracleId, i64), i64> = HashMap::new();
    let mut holdings: HashMap<OracleId, Holding> = HashMap::new();
    for allocation in allocations {
        holdings
            .entry(allocation.oracle_id.clone())
            .or_default()
            .allocated_elsewhere += allocation.quantity;
        *reserved
            .entry((allocation.oracle_id, allocation.collection_item_id))
            .or_default() += allocation.quantity;
    }
    for item in items {
        let elsewhere = reserved
            .get(&(item.oracle_id.clone(), item.id))
            .copied()
            .unwrap_or(0);
        let holding = holdings.entry(item.oracle_id).or_default();
        holding.owned += item.quantity;
        holding.available += (item.quantity - elsewhere).max(0);
    }
    Ok(holdings)
}

/// Sort key for printings: release date (missing dates last), set code,
/// collector number.
///
/// Bug in earlier releases, fixed here: the collection check compared
/// `released_at` dates structurally (day before month before year), not in
/// chronological order. ISO dates compare
/// chronologically as text.
fn printing_key(printing: &Printing) -> (String, String, String) {
    (
        printing
            .released_at
            .clone()
            .unwrap_or_else(|| "9999-12-31".to_owned()),
        printing.set_code.clone(),
        printing.collector_number.clone(),
    )
}

/// The cheapest priced printing (ties to the earliest), else the earliest
/// printing without a price.
fn priced_printing(
    printings: Vec<Printing>,
    prices: &PriceStore,
) -> (Option<Printing>, Option<i64>) {
    let cheapest = printings
        .iter()
        .filter_map(|printing| {
            printing
                .price_cents_for(prices, None)
                .map(|price| (price, printing))
        })
        .min_by(|(a_price, a), (b_price, b)| {
            a_price
                .cmp(b_price)
                .then_with(|| printing_key(a).cmp(&printing_key(b)))
        });
    if let Some((price, printing)) = cheapest {
        return (Some(printing.clone()), Some(price));
    }
    let earliest = printings
        .into_iter()
        .min_by(|a, b| printing_key(a).cmp(&printing_key(b)));
    (earliest, None)
}

async fn rows(
    pool: &SqlitePool,
    prices: &PriceStore,
    requirements: BTreeMap<OracleId, (String, i64)>,
) -> Result<Vec<CheckCard>, sqlx::Error> {
    if requirements.is_empty() {
        return Ok(Vec::new());
    }
    let oracle_ids: Vec<OracleId> = requirements.keys().cloned().collect();
    let cards: HashMap<OracleId, CardRecord> =
        manavault_catalog::catalog::card::load_records(pool, &oracle_ids)
            .await?
            .into_iter()
            .map(|card| (card.oracle_id.clone(), card))
            .collect();
    let mut printings =
        manavault_catalog::catalog::printing::printings_with_owned_counts(pool, &oracle_ids)
            .await?;
    let holdings = holdings(pool, &oracle_ids).await?;

    let mut rows = Vec::new();
    for (oracle_id, (card_name, required)) in requirements {
        let Some(card) = cards.get(&oracle_id) else {
            continue;
        };
        let holding = holdings.get(&oracle_id).copied().unwrap_or_default();
        let basic_land = card.is_basic_land();
        let available = if basic_land {
            required
        } else {
            required.min(holding.available)
        };
        let needed = (required - available).max(0);
        let unavailable = needed.min(holding.allocated_elsewhere);
        let missing = (needed - unavailable).max(0);
        let (printing, unit_price_cents) =
            priced_printing(printings.remove(&oracle_id).unwrap_or_default(), prices);
        let status = if basic_land {
            RowStatus::BasicLand
        } else if unavailable == 0 && missing == 0 {
            RowStatus::Ready
        } else if available > 0 {
            RowStatus::Partial
        } else if unavailable > 0 && missing == 0 {
            RowStatus::AllocatedElsewhere
        } else {
            RowStatus::Missing
        };
        rows.push(CheckCard {
            card_name,
            oracle_id,
            required,
            owned: holding.owned,
            available,
            unavailable,
            missing,
            to_source: needed,
            status,
            printing,
            unit_price_cents,
            total_price_cents: unit_price_cents.map(|price| price * needed),
        });
    }
    rows.sort_by(|a, b| {
        a.status
            .cmp(&b.status)
            .then_with(|| a.card_name.to_lowercase().cmp(&b.card_name.to_lowercase()))
    });
    Ok(rows)
}
