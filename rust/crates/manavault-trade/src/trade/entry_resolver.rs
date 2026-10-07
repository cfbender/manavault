//! Resolving list entries to catalog cards by exact normalized name
//! (`Manavault.Trade.EntryResolver`). A split or adventure name
//! (`A // B`) is tried whole first, then by its front face, so a source that
//! lists only the front face, or both faces of a card the catalog knows by
//! its front face, still resolves.

use lotus::OracleId;
use sqlx::SqlitePool;

use crate::trade::list_source::ListEntry;
use manavault_catalog::catalog::search::cards_by_name;

/// An entry with the card it resolved to, if any.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedEntry {
    pub entry: ListEntry,
    pub oracle_id: Option<OracleId>,
}

/// Every entry with its oracle id, plus the deduplicated names that did not
/// resolve, in first-seen order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub entries: Vec<ResolvedEntry>,
    pub unrecognized: Vec<String>,
}

/// The front face of `A // B` (whitespace around `//` ignored), if split.
fn front_face(name: &str) -> Option<&str> {
    name.find("//")
        .map(|index| name.get(..index).unwrap_or("").trim_end())
}

/// Resolves every entry with one batched name lookup.
pub async fn resolve(pool: &SqlitePool, entries: Vec<ListEntry>) -> Result<Resolved, sqlx::Error> {
    let mut names: Vec<&str> = Vec::new();
    for entry in &entries {
        names.push(&entry.name);
        if let Some(front) = front_face(&entry.name) {
            names.push(front);
        }
    }
    let cards = cards_by_name::by_names(pool, &names).await?;
    let lookup = |name: &str| {
        cards
            .get(&cards_by_name::key(name))
            .map(|card| card.oracle_id.clone())
    };
    let resolved: Vec<ResolvedEntry> = entries
        .into_iter()
        .map(|entry| {
            let oracle_id =
                lookup(&entry.name).or_else(|| front_face(&entry.name).and_then(lookup));
            ResolvedEntry { entry, oracle_id }
        })
        .collect();
    let mut unrecognized: Vec<String> = Vec::new();
    for entry in &resolved {
        if entry.oracle_id.is_none() && !unrecognized.contains(&entry.entry.name) {
            unrecognized.push(entry.entry.name.clone());
        }
    }
    Ok(Resolved {
        entries: resolved,
        unrecognized,
    })
}
