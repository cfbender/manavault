//! Diffing a resolved list against a deck (`Manavault.Trade.DeckDiff`),
//! leaving out the considering zone on both sides: cards only in the list
//! are adds, cards only in the deck are cuts, and cards in both at different
//! quantities are changes.
//!
//! Basic lands compare by card name rather than oracle id, because Scryfall
//! sometimes gives the same basic different oracle ids across sets, which
//! would otherwise show up as a cut and an add for a deck that already has
//! the right number of Plains.

use std::collections::{BTreeMap, HashMap};

use lotus::{OracleId, Zone};
use sqlx::SqlitePool;

use crate::catalog::sql::json_list;
use crate::trade::entry_resolver::{Resolved, ResolvedEntry};
use crate::trade::want::image_url;

pub const NOT_FOUND: &str = "That deck couldn't be found.";

/// Basic land names an unresolved entry may have.
const BASIC_LAND_NAMES: [&str; 12] = [
    "plains",
    "island",
    "swamp",
    "mountain",
    "forest",
    "wastes",
    "snow-covered plains",
    "snow-covered island",
    "snow-covered swamp",
    "snow-covered mountain",
    "snow-covered forest",
    "snow-covered wastes",
];

/// An add or cut row (`DeckDiffEntry`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffEntry {
    pub card_name: String,
    pub quantity: i64,
    pub oracle_id: Option<OracleId>,
    pub image_url: Option<String>,
    /// Every deck card behind a cut, sorted (empty for adds).
    pub deck_card_ids: Vec<i64>,
}

/// A quantity change (`DeckDiffChange`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffChange {
    pub card_name: String,
    pub from_quantity: i64,
    pub to_quantity: i64,
    pub oracle_id: Option<OracleId>,
    pub deck_card_ids: Vec<i64>,
}

/// `DeckDiffResult`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffResult {
    pub source_name: Option<String>,
    pub unrecognized: Vec<String>,
    pub adds: Vec<DiffEntry>,
    pub cuts: Vec<DiffEntry>,
    pub changes: Vec<DiffChange>,
}

/// Why a diff failed.
#[derive(Debug, thiserror::Error)]
pub enum DiffError {
    #[error("That deck couldn't be found.")]
    NotFound,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

struct DeckCard {
    id: i64,
    oracle_id: OracleId,
    quantity: i64,
    name: String,
    basic: bool,
    image_url: Option<String>,
}

struct EntryCard {
    name: String,
    basic: bool,
}

/// Deck-side totals for one key.
struct DeckTotal<'a> {
    quantity: i64,
    first: &'a DeckCard,
    ids: Vec<i64>,
}

impl DeckTotal<'_> {
    fn sorted_ids(&self) -> Vec<i64> {
        let mut ids = self.ids.clone();
        ids.sort_unstable();
        ids
    }
}

fn deck_totals<'a, K: Ord>(
    cards: impl Iterator<Item = &'a DeckCard>,
    key: impl Fn(&'a DeckCard) -> K,
) -> BTreeMap<K, DeckTotal<'a>> {
    let mut totals: BTreeMap<K, DeckTotal<'a>> = BTreeMap::new();
    for card in cards {
        totals
            .entry(key(card))
            .and_modify(|total| {
                total.quantity += card.quantity;
                total.ids.push(card.id);
            })
            .or_insert(DeckTotal {
                quantity: card.quantity,
                first: card,
                ids: vec![card.id],
            });
    }
    totals
}

/// The deck's non-considering cards with their card name, whether they are
/// basic lands (snow basics included), and their image: the preferred
/// printing's, else the newest printing's.
async fn deck_cards(pool: &SqlitePool, deck_id: i64) -> Result<Vec<DeckCard>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT dc.id AS "id!", dc.oracle_id AS "oracle_id!: OracleId",
             dc.quantity AS "quantity!", c.name AS "name!", c.type_line AS "type_line?",
             dc.preferred_printing_id AS "preferred_printing_id?",
             pp.image_uris AS "preferred_image_uris?",
             (SELECT p.image_uris FROM scryfall_printings AS p WHERE p.oracle_id = dc.oracle_id
               ORDER BY p.released_at DESC, p.set_code ASC LIMIT 1) AS "first_image_uris?: String"
           FROM deck_cards AS dc
           JOIN scryfall_cards AS c ON c.oracle_id = dc.oracle_id
           LEFT JOIN scryfall_printings AS pp ON pp.scryfall_id = dc.preferred_printing_id
           WHERE dc.deck_id = ?1 AND dc.zone != 'considering'
           ORDER BY dc.zone ASC, c.name ASC, dc.id ASC"#,
        deck_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| DeckCard {
            id: row.id,
            oracle_id: row.oracle_id,
            quantity: row.quantity,
            basic: row.type_line.as_deref().is_some_and(lotus::is_basic_land),
            name: row.name,
            image_url: match (&row.preferred_printing_id, &row.preferred_image_uris) {
                (Some(_), Some(uris)) => image_url(uris),
                _ => row.first_image_uris.as_deref().and_then(image_url),
            },
        })
        .collect())
}

/// Name and basic-ness of every card the entries resolved to.
async fn entry_cards(
    pool: &SqlitePool,
    entries: &[&ResolvedEntry],
) -> Result<HashMap<OracleId, EntryCard>, sqlx::Error> {
    let mut ids: Vec<&OracleId> = entries
        .iter()
        .filter_map(|entry| entry.oracle_id.as_ref())
        .collect();
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = json_list(&ids.iter().map(|id| id.as_str()).collect::<Vec<_>>());
    let rows = sqlx::query!(
        r#"SELECT oracle_id AS "oracle_id!: OracleId", name AS "name!", type_line AS "type_line?"
           FROM scryfall_cards WHERE oracle_id IN (SELECT value FROM json_each(?1))"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.oracle_id,
                EntryCard {
                    name: row.name,
                    basic: row.type_line.as_deref().is_some_and(lotus::is_basic_land),
                },
            )
        })
        .collect())
}

/// The image of a card's newest printing (`Catalog.get_card_with_printings/1`
/// then its first printing).
async fn representative_image_url(
    pool: &SqlitePool,
    oracle_id: &OracleId,
) -> Result<Option<String>, sqlx::Error> {
    let uris = sqlx::query_scalar!(
        "SELECT image_uris FROM scryfall_printings WHERE oracle_id = ?1
         ORDER BY released_at DESC, set_code ASC, collector_number ASC LIMIT 1",
        oracle_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(uris.as_deref().and_then(image_url))
}

fn basic_name(name: &str) -> bool {
    BASIC_LAND_NAMES.contains(&name.trim().to_lowercase().as_str())
}

/// Diffs the resolved entries against the deck.
///
/// Bug in earlier releases, fixed here: the deck side and resolved entries only counted type
/// lines starting with `Basic Land` as basics, so `Basic Snow Land` cards
/// compared by oracle id while unresolved `Snow-Covered ...` names compared
/// by name. Basics are [`lotus::is_basic_land`] everywhere here.
pub async fn diff(
    pool: &SqlitePool,
    deck_id: i64,
    source_name: Option<String>,
    resolved: Resolved,
) -> Result<DiffResult, DiffError> {
    let exists = sqlx::query_scalar!(r#"SELECT id AS "id!" FROM decks WHERE id = ?1"#, deck_id)
        .fetch_optional(pool)
        .await?;
    if exists.is_none() {
        return Err(DiffError::NotFound);
    }
    let cards = deck_cards(pool, deck_id).await?;
    let considered: Vec<&ResolvedEntry> = resolved
        .entries
        .iter()
        .filter(|entry| entry.entry.zone != Zone::Considering)
        .collect();
    let entry_cards = entry_cards(pool, &considered).await?;
    let entry_basic = |entry: &ResolvedEntry| match &entry.oracle_id {
        None => basic_name(&entry.entry.name),
        Some(oracle_id) => entry_cards.get(oracle_id).is_some_and(|card| card.basic),
    };

    let deck_totals_by_oracle = deck_totals(cards.iter().filter(|c| !c.basic), |card| {
        card.oracle_id.clone()
    });
    let basic_deck_totals = deck_totals(cards.iter().filter(|c| c.basic), |card| card.name.clone());

    // Non-basic entries: known cards total by oracle id; unresolved names
    // can never match the deck and are always adds.
    let mut entry_totals: BTreeMap<OracleId, (String, i64)> = BTreeMap::new();
    let mut name_only: BTreeMap<String, i64> = BTreeMap::new();
    // Basic entries total by catalog name (or their own name if unresolved).
    let mut basic_entry_totals: BTreeMap<String, (Option<OracleId>, i64)> = BTreeMap::new();
    for entry in considered {
        let quantity = entry.entry.quantity;
        if entry_basic(entry) {
            let name = entry
                .oracle_id
                .as_ref()
                .and_then(|oracle_id| entry_cards.get(oracle_id))
                .map_or_else(|| entry.entry.name.clone(), |card| card.name.clone());
            basic_entry_totals
                .entry(name)
                .and_modify(|(_, total)| *total += quantity)
                .or_insert((entry.oracle_id.clone(), quantity));
        } else if let Some(oracle_id) = &entry.oracle_id {
            entry_totals
                .entry(oracle_id.clone())
                .and_modify(|(_, total)| *total += quantity)
                .or_insert((entry.entry.name.clone(), quantity));
        } else {
            *name_only.entry(entry.entry.name.clone()).or_default() += quantity;
        }
    }

    let mut adds = Vec::new();
    for (oracle_id, (name, quantity)) in &entry_totals {
        if !deck_totals_by_oracle.contains_key(oracle_id) {
            adds.push(DiffEntry {
                card_name: name.clone(),
                quantity: *quantity,
                oracle_id: Some(oracle_id.clone()),
                image_url: representative_image_url(pool, oracle_id).await?,
                deck_card_ids: Vec::new(),
            });
        }
    }
    for (name, quantity) in name_only {
        adds.push(DiffEntry {
            card_name: name,
            quantity,
            oracle_id: None,
            image_url: None,
            deck_card_ids: Vec::new(),
        });
    }
    for (name, (oracle_id, quantity)) in &basic_entry_totals {
        if !basic_deck_totals.contains_key(name) {
            let image_url = match oracle_id {
                Some(oracle_id) => representative_image_url(pool, oracle_id).await?,
                None => None,
            };
            adds.push(DiffEntry {
                card_name: name.clone(),
                quantity: *quantity,
                oracle_id: oracle_id.clone(),
                image_url,
                deck_card_ids: Vec::new(),
            });
        }
    }

    let mut cuts = Vec::new();
    for (oracle_id, total) in &deck_totals_by_oracle {
        if !entry_totals.contains_key(oracle_id) {
            cuts.push(DiffEntry {
                card_name: total.first.name.clone(),
                quantity: total.quantity,
                oracle_id: Some(oracle_id.clone()),
                image_url: total.first.image_url.clone(),
                deck_card_ids: total.sorted_ids(),
            });
        }
    }
    for (name, total) in &basic_deck_totals {
        if !basic_entry_totals.contains_key(name) {
            cuts.push(DiffEntry {
                card_name: name.clone(),
                quantity: total.quantity,
                oracle_id: Some(total.first.oracle_id.clone()),
                image_url: total.first.image_url.clone(),
                deck_card_ids: total.sorted_ids(),
            });
        }
    }

    let mut changes = Vec::new();
    for (oracle_id, (name, to_quantity)) in &entry_totals {
        if let Some(total) = deck_totals_by_oracle.get(oracle_id)
            && total.quantity != *to_quantity
        {
            changes.push(DiffChange {
                card_name: name.clone(),
                from_quantity: total.quantity,
                to_quantity: *to_quantity,
                oracle_id: Some(oracle_id.clone()),
                deck_card_ids: total.sorted_ids(),
            });
        }
    }
    for (name, (oracle_id, to_quantity)) in &basic_entry_totals {
        if let Some(total) = basic_deck_totals.get(name)
            && total.quantity != *to_quantity
        {
            changes.push(DiffChange {
                card_name: name.clone(),
                from_quantity: total.quantity,
                to_quantity: *to_quantity,
                oracle_id: oracle_id.clone(),
                deck_card_ids: total.sorted_ids(),
            });
        }
    }

    Ok(DiffResult {
        source_name,
        unrecognized: resolved.unrecognized,
        adds,
        cuts,
        changes,
    })
}
