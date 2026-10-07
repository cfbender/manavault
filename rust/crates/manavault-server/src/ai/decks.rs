//! The deck rows AI features read and write, straight from SQL.
//!
//! TODO(integration): the decks port owns `Catalog.get_deck!/1`,
//! `deck_cards/1`, and `save_deck_analysis/2`; switch to its functions (and
//! its deck cache invalidation, if it keeps one) once both are merged.

use std::collections::HashMap;

use lotus::{OracleId, Zone};
use sqlx::SqlitePool;

use crate::catalog::card::{CardRecord, load_records};
use crate::timefmt;

/// The deck fields prompts use.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckInfo {
    pub id: i64,
    pub name: String,
    pub format: String,
    pub primer: Option<String>,
}

/// A deck card with its catalog card, as prompts see it.
#[derive(Debug, Clone, PartialEq)]
pub struct DeckCardInput {
    pub card: CardRecord,
    pub quantity: i64,
    pub zone: Zone,
}

impl DeckCardInput {
    /// `DeckCard.counts_toward_deck_total?/1`: mainboard and commander.
    #[must_use]
    pub fn counts_toward_deck_total(&self) -> bool {
        self.zone.in_deck()
    }
}

/// `Catalog.get_deck/1`.
pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<DeckInfo>, sqlx::Error> {
    sqlx::query_as!(
        DeckInfo,
        r#"SELECT id AS "id!", name, format, primer FROM decks WHERE id = ?1"#,
        id
    )
    .fetch_optional(pool)
    .await
}

/// A deck's id and name by share token (`Catalog.get_deck_by_share_token/1`).
pub async fn by_share_token(
    pool: &SqlitePool,
    token: &str,
) -> Result<Option<DeckInfo>, sqlx::Error> {
    sqlx::query_as!(
        DeckInfo,
        r#"SELECT id AS "id!", name, format, primer FROM decks WHERE share_token = ?1 LIMIT 1"#,
        token
    )
    .fetch_optional(pool)
    .await
}

/// Every deck id, in `Catalog.list_decks/0` order (name, then id).
pub async fn list_ids(pool: &SqlitePool) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT id AS "id!" FROM decks ORDER BY name ASC, id ASC"#)
        .fetch_all(pool)
        .await
}

/// A deck's cards with their catalog cards, ordered by zone, card name, and
/// id like `Decks.Preloads`. Rows in an unknown zone are skipped; they never
/// count toward the deck.
pub async fn deck_cards(
    pool: &SqlitePool,
    deck_id: i64,
) -> Result<Vec<DeckCardInput>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT dc.oracle_id AS "oracle_id!: OracleId", dc.quantity, dc.zone
           FROM deck_cards AS dc JOIN scryfall_cards AS c ON c.oracle_id = dc.oracle_id
           WHERE dc.deck_id = ?1
           ORDER BY dc.zone ASC, c.name ASC, dc.id ASC"#,
        deck_id
    )
    .fetch_all(pool)
    .await?;
    let mut ids: Vec<OracleId> = rows.iter().map(|row| row.oracle_id.clone()).collect();
    ids.sort();
    ids.dedup();
    let cards: HashMap<OracleId, CardRecord> = load_records(pool, &ids)
        .await?
        .into_iter()
        .map(|card| (card.oracle_id.clone(), card))
        .collect();
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            Some(DeckCardInput {
                card: cards.get(&row.oracle_id)?.clone(),
                quantity: row.quantity,
                zone: Zone::parse(&row.zone)?,
            })
        })
        .collect())
}

/// The saved analysis columns (`Deck.analysis_changeset/2`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedAnalysis {
    pub ai_analysis: String,
    pub ai_analysis_model: String,
    pub ai_analyzed_at: String,
    pub commander_bracket: Option<i64>,
    pub commander_bracket_estimate: Option<i64>,
    pub commander_bracket_rating: Option<String>,
}

/// Why an analysis could not be saved.
#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    /// The changeset rejected it (lengths).
    #[error("invalid analysis")]
    Invalid,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// `Catalog.save_deck_analysis/2`.
pub async fn save_analysis(
    pool: &SqlitePool,
    deck_id: i64,
    analysis: &SavedAnalysis,
) -> Result<(), SaveError> {
    if analysis.ai_analysis.chars().count() > 100_000
        || analysis.ai_analysis_model.chars().count() > 200
        || analysis.ai_analysis.trim().is_empty()
        || analysis.ai_analysis_model.trim().is_empty()
    {
        return Err(SaveError::Invalid);
    }
    let now = timefmt::now();
    sqlx::query!(
        "UPDATE decks SET ai_analysis = ?1, ai_analysis_model = ?2, ai_analyzed_at = ?3,
           commander_bracket = ?4, commander_bracket_estimate = ?5, commander_bracket_rating = ?6,
           updated_at = ?7
         WHERE id = ?8",
        analysis.ai_analysis,
        analysis.ai_analysis_model,
        analysis.ai_analyzed_at,
        analysis.commander_bracket,
        analysis.commander_bracket_estimate,
        analysis.commander_bracket_rating,
        now,
        deck_id
    )
    .execute(pool)
    .await?;
    Ok(())
}
