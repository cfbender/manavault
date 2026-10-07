//! Matching a resolved list against the trade binder and the want list,
//! grouped per card (`Manavault.Trade.Matcher`).

use std::collections::{BTreeMap, HashMap};

use lotus::OracleId;
use sqlx::SqlitePool;

use crate::trade::binder;
use crate::trade::collection_item_stub::BinderItem;
use crate::trade::entry_resolver::Resolved;
use crate::trade::want::{self, Want};

/// One card of the list that is in the trade binder.
#[derive(Debug, Clone, PartialEq)]
pub struct BinderMatch {
    pub card_name: String,
    pub oracle_id: OracleId,
    pub their_quantity: i64,
    pub items: Vec<BinderItem>,
}

/// One want matched by a card of the list.
#[derive(Debug, Clone, PartialEq)]
pub struct WantMatch {
    pub card_name: String,
    pub oracle_id: OracleId,
    pub their_quantity: i64,
    pub want: Want,
}

/// `TradeMatchResult`.
#[derive(Debug, Clone, PartialEq)]
pub struct MatchResult {
    pub source_name: Option<String>,
    pub entry_count: i64,
    pub unrecognized: Vec<String>,
    pub binder_matches: Vec<BinderMatch>,
    pub want_matches: Vec<WantMatch>,
}

struct Aggregate {
    card_name: String,
    quantity: i64,
}

/// Matches the resolved entries: binder matches carry the for-trade items of
/// each card (quantities are for-trade quantities); want matches pair each
/// card with every want for it. Both are sorted by card name. Unresolved
/// entries are counted and reported but never match.
pub async fn match_list(
    pool: &SqlitePool,
    source_name: Option<String>,
    resolved: Resolved,
) -> Result<MatchResult, sqlx::Error> {
    let entry_count = i64::try_from(resolved.entries.len()).unwrap_or(i64::MAX);
    // Keyed by oracle id in order, like the Elixir map the result is built
    // from, so ties in the card-name sort come out the same way.
    let mut aggregates: BTreeMap<OracleId, Aggregate> = BTreeMap::new();
    for entry in resolved.entries {
        let Some(oracle_id) = entry.oracle_id else {
            continue;
        };
        aggregates
            .entry(oracle_id)
            .and_modify(|aggregate| aggregate.quantity += entry.entry.quantity)
            .or_insert(Aggregate {
                card_name: entry.entry.name,
                quantity: entry.entry.quantity,
            });
    }
    let oracle_ids: Vec<OracleId> = aggregates.keys().cloned().collect();

    let mut items_by_oracle: HashMap<OracleId, Vec<BinderItem>> = HashMap::new();
    for (oracle_id, item) in binder::items_for_oracle_ids(pool, &oracle_ids).await? {
        items_by_oracle.entry(oracle_id).or_default().push(item);
    }
    let mut binder_matches: Vec<BinderMatch> = aggregates
        .iter()
        .filter_map(|(oracle_id, aggregate)| {
            let items = items_by_oracle.remove(oracle_id)?;
            Some(BinderMatch {
                card_name: aggregate.card_name.clone(),
                oracle_id: oracle_id.clone(),
                their_quantity: aggregate.quantity,
                items,
            })
        })
        .collect();
    binder_matches.sort_by(|a, b| a.card_name.cmp(&b.card_name));

    let mut wants_by_oracle: HashMap<OracleId, Vec<Want>> = HashMap::new();
    for want in want::by_oracle_ids(pool, &oracle_ids).await? {
        wants_by_oracle
            .entry(want.oracle_id.clone())
            .or_default()
            .push(want);
    }
    let mut want_matches: Vec<WantMatch> = aggregates
        .iter()
        .flat_map(|(oracle_id, aggregate)| {
            wants_by_oracle
                .remove(oracle_id)
                .unwrap_or_default()
                .into_iter()
                .map(|want| WantMatch {
                    card_name: aggregate.card_name.clone(),
                    oracle_id: oracle_id.clone(),
                    their_quantity: aggregate.quantity,
                    want,
                })
        })
        .collect();
    want_matches.sort_by(|a, b| a.card_name.cmp(&b.card_name));

    Ok(MatchResult {
        source_name,
        entry_count,
        unrecognized: resolved.unrecognized,
        binder_matches,
        want_matches,
    })
}
