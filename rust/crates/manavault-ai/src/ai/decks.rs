//! The deck rows AI features read and write: decks and their cards through
//! the decks module, plus the analysis columns only AI writes
//! (`Catalog.save_deck_analysis/2`). The Rust decks module keeps no deck
//! cache, so saving needs no invalidation.

use lotus::Zone;
use sqlx::SqlitePool;

use manavault_catalog::catalog::card::CardRecord;
use manavault_core::timestamp::Timestamp;

/// The deck fields prompts use.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckInfo {
    pub id: i64,
    pub name: String,
    pub format: String,
    pub primer: Option<String>,
    /// Archived decks are frozen and are not analyzed.
    pub archived: bool,
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
    Ok(
        manavault_collection::decks::model::load_deck(
            pool,
            manavault_collection::decks::DeckId(id),
        )
        .await?
        .map(|deck| DeckInfo {
            id: deck.id.0,
            name: deck.name,
            format: deck.format.as_str().to_owned(),
            primer: deck.primer,
            archived: deck.status == manavault_collection::decks::model::DeckStatus::Archived,
        }),
    )
}

/// Every deck id, in `Catalog.list_decks/0` order (name, then id).
pub async fn list_ids(pool: &SqlitePool) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT id AS "id!" FROM decks ORDER BY name ASC, id ASC"#)
        .fetch_all(pool)
        .await
}

/// A deck's cards with their catalog cards, ordered by zone, card name, and
/// id like `Decks.Preloads` (`Catalog.deck_cards/1`).
pub async fn deck_cards(
    pool: &SqlitePool,
    deck_id: i64,
) -> Result<Vec<DeckCardInput>, sqlx::Error> {
    let contents = manavault_collection::decks::contents::load_deck_contents(
        pool,
        manavault_collection::decks::DeckId(deck_id),
    )
    .await?;
    Ok(contents
        .cards
        .iter()
        .map(|card| DeckCardInput {
            card: card.card.as_ref().clone(),
            quantity: card.row.quantity.as_i64(),
            zone: card.row.zone,
        })
        .collect())
}

/// The saved analysis columns (`Deck.analysis_changeset/2`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedAnalysis {
    pub ai_analysis: String,
    pub ai_analysis_model: String,
    pub ai_analyzed_at: Timestamp,
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
    let now = Timestamp::now();
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
