//! GraphQL object types of decks (`ManavaultWeb.Schema.Catalog.DeckTypes`,
//! `DeckFields`).

use std::sync::Arc;

use async_graphql::{Context, ID, Object};
use sqlx::SqlitePool;
use tokio::sync::OnceCell;

use crate::catalog::card::{Card, CardRecord};
use crate::catalog::printing::Printing;
use crate::decks::allocations::{self, AllocationStatus, StatusInput};
use crate::decks::contents::{self, DeckContents, LoadedDeckCard};
use crate::decks::legality::{DeckLegality as Legality, LegalityIssue};
use crate::decks::model::{
    DeckCardId, DeckCardRow, DeckId, DeckRow, DeckTagRow, DefaultDeckTagRow,
};
use crate::graphql::relay::{self, PageArgs};
use crate::graphql::{NodeKind, Result, global_id, internal_error, state};
use crate::timefmt;

/// A deck as a GraphQL object. Its cards load once per object, on the
/// first field that needs them (counts, legality, cover, deck cards).
#[derive(Clone)]
pub struct Deck {
    pub row: Arc<DeckRow>,
    contents: Arc<OnceCell<Arc<DeckContents>>>,
}

impl Deck {
    #[must_use]
    pub fn new(row: DeckRow) -> Self {
        Self {
            row: Arc::new(row),
            contents: Arc::new(OnceCell::new()),
        }
    }

    /// A deck whose cards are already loaded (deck list pages).
    #[must_use]
    pub fn with_contents(row: DeckRow, contents: Arc<DeckContents>) -> Self {
        Self {
            row: Arc::new(row),
            contents: Arc::new(OnceCell::new_with(Some(contents))),
        }
    }

    /// `Decks.get_deck!/2` without preloads.
    pub async fn load(
        pool: &SqlitePool,
        id: DeckId,
    ) -> std::result::Result<Option<Self>, sqlx::Error> {
        Ok(crate::decks::model::load_deck(pool, id)
            .await?
            .map(Self::new))
    }

    /// The deck's cards in deck order.
    pub async fn contents(
        &self,
        pool: &SqlitePool,
    ) -> std::result::Result<Arc<DeckContents>, sqlx::Error> {
        self.contents
            .get_or_try_init(|| contents::load_deck_contents(pool, self.row.id))
            .await
            .cloned()
    }

    async fn loaded(&self, ctx: &Context<'_>) -> Result<Arc<DeckContents>> {
        self.contents(&state(ctx).db).await.map_err(internal_error)
    }
}

fn iso(value: Option<&String>) -> Option<String> {
    value.map(|text| timefmt::iso8601(text))
}

#[Object(name = "Deck")]
impl Deck {
    /// The ID of an object
    async fn id(&self) -> ID {
        global_id(NodeKind::Deck, self.row.id.0)
    }

    async fn name(&self) -> &str {
        &self.row.name
    }

    async fn format(&self) -> &str {
        self.row.format.as_str()
    }

    async fn status(&self) -> &str {
        self.row.status.as_str()
    }

    async fn included_for_play(&self) -> bool {
        self.row.included_for_play
    }

    async fn play_count(&self) -> i64 {
        self.row.play_count
    }

    async fn skip_count(&self) -> i64 {
        self.row.skip_count
    }

    async fn primer(&self) -> Option<&str> {
        self.row.primer.as_deref()
    }

    async fn ai_analysis(&self) -> Option<&str> {
        self.row.ai_analysis.as_deref()
    }

    async fn ai_analysis_model(&self) -> Option<&str> {
        self.row.ai_analysis_model.as_deref()
    }

    async fn commander_bracket(&self) -> Option<i64> {
        self.row.commander_bracket
    }

    async fn commander_bracket_estimate(&self) -> Option<i64> {
        self.row.commander_bracket_estimate
    }

    async fn commander_bracket_rating(&self) -> Option<&str> {
        self.row.commander_bracket_rating.as_deref()
    }

    async fn share_token(&self) -> Option<&str> {
        self.row.share_token.as_deref()
    }

    async fn external_source(&self) -> Option<&str> {
        self.row
            .external_source
            .map(crate::decks::model::ExternalSource::as_str)
    }

    async fn external_url(&self) -> Option<&str> {
        self.row.external_url.as_deref()
    }

    async fn external_sync_error(&self) -> Option<&str> {
        self.row.external_sync_error.as_deref()
    }

    async fn external_synced_at(&self) -> Option<String> {
        iso(self.row.external_synced_at.as_ref())
    }

    async fn ai_analyzed_at(&self) -> Option<String> {
        iso(self.row.ai_analyzed_at.as_ref())
    }

    async fn last_played_at(&self) -> Option<String> {
        iso(self.row.last_played_at.as_ref())
    }

    async fn cover_deck_card_id(&self) -> Option<ID> {
        self.row
            .cover_deck_card_id
            .map(|id| global_id(NodeKind::DeckCard, id.0))
    }

    async fn cover_image_url(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        let contents = self.loaded(ctx).await?;
        Ok(contents::cover_image_url(
            &contents.cards,
            self.row.cover_deck_card_id,
        ))
    }

    async fn commander_color_identity(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<Option<String>>>> {
        let contents = self.loaded(ctx).await?;
        Ok(contents::commander_color_identity(&contents.cards)
            .map(|colors| colors.into_iter().map(Some).collect()))
    }

    async fn card_count(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        let contents = self.loaded(ctx).await?;
        Ok(Some(i64::from(crate::decks::model::counted_quantity(
            contents.rows(),
        ))))
    }

    async fn unique_card_count(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        let contents = self.loaded(ctx).await?;
        Ok(Some(i64::from(contents.summary(None).unique_card_count)))
    }

    async fn legality(&self, ctx: &Context<'_>) -> Result<DeckLegality> {
        let contents = self.loaded(ctx).await?;
        Ok(DeckLegality(contents.legality(self.row.format)))
    }

    async fn deck_cards(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
    ) -> Result<Option<DeckCardConnection>> {
        let contents = self.loaded(ctx).await?;
        let cards = DeckCard::hydrate_loaded(&state(ctx).db, contents.cards.clone())
            .await
            .map_err(internal_error)?;
        let args = PageArgs::new(after, first, before, last);
        Ok(Some(
            relay::connection_from_list(cards, &args, None)?.into(),
        ))
    }

    async fn tags(&self, ctx: &Context<'_>) -> Result<Vec<DeckTag>> {
        let tags = crate::decks::tags::list_deck_tags(&state(ctx).db, self.row.id)
            .await
            .map_err(internal_error)?;
        Ok(tags.into_iter().map(DeckTag).collect())
    }

    // TODO(integration): `aiAnalysis*` fields beyond the stored columns,
    // `deckBuylist*`, `deckEdhrec`, `deckRecommander`, and `deckCombos` are
    // root fields owned by the AI and deck allocation modules.
}

/// A deck card with everything its GraphQL fields read.
#[derive(Debug, Clone)]
pub struct DeckCard {
    pub row: DeckCardRow,
    pub card: Option<Arc<CardRecord>>,
    pub preferred_printing: Option<Printing>,
    pub fallback_printing: Option<Printing>,
    pub tag_ids: Vec<i64>,
    pub allocation_status: AllocationStatus,
}

impl DeckCard {
    /// Adds tag ids and allocation statuses to loaded deck cards, batched.
    pub async fn hydrate_loaded(
        pool: &SqlitePool,
        cards: Vec<LoadedDeckCard>,
    ) -> std::result::Result<Vec<Self>, sqlx::Error> {
        let ids: Vec<DeckCardId> = cards.iter().map(|card| card.row.id).collect();
        let mut tag_ids = crate::decks::tags::tag_ids_by_deck_card(pool, &ids).await?;
        let inputs: Vec<StatusInput> = cards
            .iter()
            .map(|card| StatusInput::of(&card.row, card.card.is_basic_land()))
            .collect();
        let mut conn = pool.acquire().await?;
        let statuses = allocations::statuses(&mut conn, &inputs).await?;
        Ok(cards
            .into_iter()
            .zip(statuses)
            .map(|(card, allocation_status)| Self {
                tag_ids: tag_ids.remove(&card.row.id).unwrap_or_default(),
                row: card.row,
                card: Some(card.card),
                preferred_printing: card.preferred_printing,
                fallback_printing: card.fallback_printing,
                allocation_status,
            })
            .collect())
    }

    /// Loads the cards and printings of deck card rows and hydrates them,
    /// keeping the row order. Rows need not exist any more (deleted cards
    /// in mutation payloads).
    pub async fn hydrate(
        pool: &SqlitePool,
        rows: Vec<DeckCardRow>,
    ) -> std::result::Result<Vec<Self>, sqlx::Error> {
        let loaded = contents::load_cards(pool, rows).await?;
        Self::hydrate_loaded(pool, loaded).await
    }

    /// One deck card.
    pub async fn load(
        pool: &SqlitePool,
        id: DeckCardId,
    ) -> std::result::Result<Option<Self>, sqlx::Error> {
        let Some(row) = crate::decks::model::load_deck_card(pool, id).await? else {
            return Ok(None);
        };
        Ok(Self::hydrate(pool, vec![row]).await?.pop())
    }

    /// Deck cards in the order of `ids`, skipping missing ones.
    pub async fn load_many(
        pool: &SqlitePool,
        ids: &[DeckCardId],
    ) -> std::result::Result<Vec<Self>, sqlx::Error> {
        let mut conn = pool.acquire().await?;
        let mut rows = crate::decks::model::load_deck_cards(&mut conn, ids).await?;
        drop(conn);
        let ordered: Vec<DeckCardRow> = ids.iter().filter_map(|id| rows.remove(id)).collect();
        Self::hydrate(pool, ordered).await
    }
}

#[Object(name = "DeckCard")]
impl DeckCard {
    /// The ID of an object
    async fn id(&self) -> ID {
        global_id(NodeKind::DeckCard, self.row.id.0)
    }

    async fn quantity(&self) -> i64 {
        self.row.quantity.as_i64()
    }

    async fn zone(&self) -> Option<&str> {
        Some(self.row.zone.as_str())
    }

    async fn finish(&self) -> Option<&str> {
        Some(self.row.finish.as_str())
    }

    async fn tag(&self) -> Option<&str> {
        self.row.tag.map(crate::decks::model::DeckCardTag::as_str)
    }

    /// The preferred printing's price in the card's finish
    /// (`Price.deck_card_price_cents/1`).
    async fn price_cents(&self, ctx: &Context<'_>) -> Option<i64> {
        self.preferred_printing.as_ref().and_then(|printing| {
            printing.price_cents_for(&state(ctx).prices, Some(self.row.finish.as_str()))
        })
    }

    async fn preferred_printing(&self) -> Option<&Printing> {
        self.preferred_printing.as_ref()
    }

    async fn card(&self) -> Option<Card> {
        self.card.clone().map(Card::from)
    }

    async fn fallback_printing(&self) -> Option<&Printing> {
        self.fallback_printing.as_ref()
    }

    async fn tag_ids(&self) -> Vec<ID> {
        self.tag_ids.iter().map(|id| ID(id.to_string())).collect()
    }

    async fn allocation_status(&self) -> DeckCardAllocationStatus {
        DeckCardAllocationStatus(self.allocation_status.clone())
    }
}

crate::connection_types!(DeckConnection, DeckEdge, Deck);
crate::connection_types!(DeckCardConnection, DeckCardEdge, DeckCard);

/// `DeckCardAllocationStatus`.
#[derive(Debug, Clone)]
pub struct DeckCardAllocationStatus(pub AllocationStatus);

#[Object(name = "DeckCardAllocationStatus")]
impl DeckCardAllocationStatus {
    async fn state(&self) -> &str {
        self.0.state.as_str()
    }

    async fn required(&self) -> i64 {
        i64::from(self.0.required)
    }

    async fn owned(&self) -> i64 {
        i64::from(self.0.owned)
    }

    async fn allocated(&self) -> i64 {
        i64::from(self.0.allocated)
    }

    async fn proxy_allocated(&self) -> i64 {
        i64::from(self.0.proxy_allocated)
    }

    async fn available(&self) -> i64 {
        i64::from(self.0.available)
    }

    async fn allocated_elsewhere(&self) -> i64 {
        i64::from(self.0.allocated_elsewhere)
    }

    async fn missing(&self) -> i64 {
        i64::from(self.0.missing)
    }

    async fn deck_zone(&self) -> Option<&str> {
        self.0.deck_zone.map(lotus::Zone::as_str)
    }

    // TODO(integration): `candidates: [DeckCardAllocationCandidate!]!` needs
    // the collection module's `CollectionItem` type; `self.0.candidates`
    // already holds each candidate's item id and counts.
}

/// `DeckLegality`.
#[derive(Debug, Clone)]
pub struct DeckLegality(pub Legality);

#[Object(name = "DeckLegality")]
impl DeckLegality {
    async fn status(&self) -> &str {
        self.0.status
    }

    async fn issues(&self) -> Vec<DeckLegalityIssue> {
        self.0
            .issues
            .iter()
            .cloned()
            .map(DeckLegalityIssue)
            .collect()
    }
}

/// `DeckLegalityIssue`.
#[derive(Debug, Clone)]
pub struct DeckLegalityIssue(pub LegalityIssue);

#[Object(name = "DeckLegalityIssue")]
impl DeckLegalityIssue {
    async fn code(&self) -> &str {
        self.0.code
    }

    async fn message(&self) -> &str {
        &self.0.message
    }

    async fn severity(&self) -> &str {
        self.0.severity
    }

    async fn card_name(&self) -> Option<&str> {
        self.0.card_name.as_deref()
    }
}

/// `DeckTag`. Its id is the raw database id, not a global id.
#[derive(Debug, Clone)]
pub struct DeckTag(pub DeckTagRow);

#[Object(name = "DeckTag")]
impl DeckTag {
    async fn id(&self) -> ID {
        ID(self.0.id.to_string())
    }

    async fn name(&self) -> &str {
        &self.0.name
    }

    async fn color(&self) -> &str {
        &self.0.color
    }

    async fn target_count(&self) -> Option<i64> {
        self.0.target_count
    }

    async fn position(&self) -> i64 {
        self.0.position
    }

    async fn card_count(&self) -> i64 {
        self.0.card_count
    }
}

/// `DefaultDeckTag`.
#[derive(Debug, Clone)]
pub struct DefaultDeckTag(pub DefaultDeckTagRow);

#[Object(name = "DefaultDeckTag")]
impl DefaultDeckTag {
    async fn id(&self) -> ID {
        ID(self.0.id.to_string())
    }

    async fn name(&self) -> &str {
        &self.0.name
    }

    async fn color(&self) -> &str {
        &self.0.color
    }

    async fn target_count(&self) -> Option<i64> {
        self.0.target_count
    }

    async fn position(&self) -> i64 {
        self.0.position
    }
}

/// `DeckImportResult`.
#[derive(Debug, Clone)]
pub struct DeckImportResult(pub crate::decks::decklist::ImportResult);

#[Object(name = "DeckImportResult")]
impl DeckImportResult {
    async fn imported(&self) -> i64 {
        self.0.imported
    }

    async fn unresolved(&self) -> &[String] {
        &self.0.unresolved
    }

    async fn skipped_printings(&self) -> &[String] {
        &self.0.skipped_printings
    }
}

/// `DeckSwapPreview`.
#[derive(Debug, Clone)]
pub struct DeckSwapPreview(pub crate::decks::swap::SwapPreview);

#[Object(name = "DeckSwapPreview")]
impl DeckSwapPreview {
    async fn legality(&self) -> DeckLegality {
        DeckLegality(self.0.legality.clone())
    }

    async fn card_count(&self) -> i64 {
        i64::from(self.0.card_count)
    }

    async fn unresolved_names(&self) -> &[String] {
        &self.0.unresolved_names
    }
}
