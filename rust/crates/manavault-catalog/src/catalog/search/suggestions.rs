//! Card name suggestions for the name combobox
//! (`Manavault.Catalog.Search.CardNameSuggestions`).
//!
//! Every playable card name and flavor-name alias is indexed in memory by
//! the first letter of each word and by trigrams; a term gathers candidates
//! from the index, then ranks them with [`name_match`].

use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};

use sqlx::SqlitePool;

use crate::catalog::search::name_match::{self, NameEntry};
use manavault_core::state::AppState;

/// The name index of one database.
#[derive(Debug, Default)]
pub struct NameIndex {
    entries: Vec<NameEntry>,
    by_initial: HashMap<char, Vec<usize>>,
    by_ngram: HashMap<String, Vec<usize>>,
}

/// Built indexes, keyed by database file so each app instance (and each
/// test database) has its own. Cleared after Scryfall imports.
static INDEXES: LazyLock<Mutex<HashMap<PathBuf, Arc<NameIndex>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn ngrams(value: &str) -> Vec<String> {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() >= 3 {
        let mut seen = BTreeSet::new();
        chars
            .windows(3)
            .map(|window| window.iter().collect::<String>())
            .filter(|gram| seen.insert(gram.clone()))
            .collect()
    } else if value.is_empty() {
        Vec::new()
    } else {
        vec![value.to_owned()]
    }
}

fn initials(text: &str) -> Vec<char> {
    text.split(' ')
        .filter_map(|token| token.chars().next())
        .collect()
}

impl NameIndex {
    fn build(entries: Vec<NameEntry>) -> Self {
        let mut by_initial: HashMap<char, Vec<usize>> = HashMap::new();
        let mut by_ngram: HashMap<String, Vec<usize>> = HashMap::new();
        for (index, entry) in entries.iter().enumerate() {
            let mut seen = BTreeSet::new();
            for initial in entry.tokens.iter().filter_map(|token| token.chars().next()) {
                if seen.insert(initial) {
                    by_initial.entry(initial).or_default().push(index);
                }
            }
            for gram in ngrams(&entry.compact_name) {
                by_ngram.entry(gram).or_default().push(index);
            }
        }
        Self {
            entries,
            by_initial,
            by_ngram,
        }
    }

    fn candidate_pool(&self, term: &str) -> Vec<&NameEntry> {
        let mut indexes: Vec<usize> = Vec::new();
        if term.len() >= 3 {
            for gram in ngrams(&term.replace(' ', "")) {
                indexes.extend(self.by_ngram.get(&gram).into_iter().flatten());
            }
        }
        for initial in initials(term) {
            indexes.extend(self.by_initial.get(&initial).into_iter().flatten());
        }
        let mut seen = BTreeSet::new();
        indexes
            .into_iter()
            .filter_map(|index| self.entries.get(index))
            .filter(|entry| {
                seen.insert((entry.result_name.as_str(), entry.normalized_name.as_str()))
            })
            .collect()
    }

    /// Up to `limit` suggested card names for `term`.
    #[must_use]
    pub fn suggest(&self, term: &str, limit: i64) -> Vec<String> {
        let term = name_match::normalize(term);
        if term.is_empty() {
            return Vec::new();
        }
        let mut ranked: Vec<((u8, usize, String), u8, &str)> = self
            .candidate_pool(&term)
            .into_iter()
            .filter(|entry| name_match::candidate(&term, entry))
            .map(|entry| {
                (
                    name_match::score(&term, entry),
                    entry.source_priority,
                    entry.result_name.as_str(),
                )
            })
            .collect();
        ranked.sort();
        let mut seen = BTreeSet::new();
        let names: Vec<String> = ranked
            .into_iter()
            .filter(|(_, _, name)| seen.insert(*name))
            .map(|(_, _, name)| name.to_owned())
            .collect();
        take(names, limit)
    }
}

/// `Enum.take/2`: a negative count takes from the end.
fn take(mut names: Vec<String>, limit: i64) -> Vec<String> {
    let count = usize::try_from(limit.unsigned_abs()).unwrap_or(usize::MAX);
    if limit >= 0 {
        names.truncate(count);
        names
    } else {
        let start = names.len().saturating_sub(count);
        names.split_off(start)
    }
}

async fn load(pool: &SqlitePool) -> Result<NameIndex, sqlx::Error> {
    let names = sqlx::query_scalar!(
        r#"SELECT DISTINCT c.name AS "name!" FROM scryfall_cards AS c
           WHERE (c.layout IS NULL OR c.layout NOT IN ('token', 'double_faced_token', 'emblem'))
           ORDER BY c.name ASC"#
    )
    .fetch_all(pool)
    .await?;
    let aliases = sqlx::query!(
        r#"SELECT DISTINCT c.name AS "name!", p.flavor_name AS "flavor_name!"
           FROM scryfall_printings AS p JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           WHERE (c.layout IS NULL OR c.layout NOT IN ('token', 'double_faced_token', 'emblem'))
             AND p.flavor_name IS NOT NULL AND p.flavor_name != ''
           ORDER BY c.name ASC, p.flavor_name ASC"#
    )
    .fetch_all(pool)
    .await?;
    let entries = names
        .iter()
        .map(|name| NameEntry::new(name, name, 0))
        .chain(
            aliases
                .iter()
                .map(|row| NameEntry::new(&row.name, &row.flavor_name, 1)),
        )
        .collect();
    Ok(NameIndex::build(entries))
}

fn cached(state: &AppState) -> Option<Arc<NameIndex>> {
    INDEXES
        .lock()
        .ok()?
        .get(&state.config.database_path)
        .cloned()
}

/// The name index, built on first use.
pub async fn index(state: &AppState) -> Result<Arc<NameIndex>, sqlx::Error> {
    if let Some(index) = cached(state) {
        return Ok(index);
    }
    let index = Arc::new(load(&state.db).await?);
    if let Ok(mut indexes) = INDEXES.lock() {
        indexes.insert(state.config.database_path.clone(), index.clone());
    }
    Ok(index)
}

/// Drops the name index (`clear_card_name_suggestion_cache/0`).
pub fn clear(state: &AppState) {
    if let Ok(mut indexes) = INDEXES.lock() {
        indexes.remove(&state.config.database_path);
    }
}

/// `Catalog.suggest_card_names/2`.
pub async fn suggest_card_names(
    state: &AppState,
    term: &str,
    limit: i64,
) -> Result<Vec<String>, sqlx::Error> {
    if name_match::normalize(term).is_empty() {
        return Ok(Vec::new());
    }
    Ok(index(state).await?.suggest(term, limit))
}
