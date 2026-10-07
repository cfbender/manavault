//! The public share schema's object types
//! (`ManavaultWeb.Schema.PublicShareTypes`).
//!
//! They share GraphQL names with the owner schema's types (`Card`,
//! `Printing`, `Deck`, ...) but expose only public fields: owned counts are
//! always zero, `PublicCardSummary` cannot lead back to printings, and deck
//! cards report the `shared` allocation state without candidates. Collection
//! items and locations exist only because the allocation candidate type
//! names them; public shares never produce one, so their Rust types cannot
//! be constructed.

use std::convert::Infallible;
use std::sync::Arc;

use async_graphql::{Context, ID, Object};
use serde_json::Value;

use crate::catalog::card::{CardLegality, CardRecord, CardRuling, ScryfallOracleTag};
use crate::catalog::{json, price};
use crate::decks::contents::LoadedDeckCard;
use crate::decks::schema::types::{DeckLegality, DeckTag};
use crate::graphql::relay::{self, PageArgs};
use crate::graphql::{Json, NodeKind, Result, global_id, internal_error, state};
use crate::timefmt;

/// Page size caps of the public connections (`clamp_connection_args/2`).
pub const MAX_PRINTINGS_PAGE: i64 = 300;
/// See [`MAX_PRINTINGS_PAGE`].
pub const MAX_DECK_CARDS_PAGE: i64 = 500;

/// `clamp_connection_args/2`: `first` and `last` are clamped into
/// `0..=max`. Omitted arguments stay omitted.
#[must_use]
pub fn clamp_page_args(args: PageArgs, max: i64) -> PageArgs {
    let clamp = |value: Option<i64>| value.map(|value| value.clamp(0, max));
    PageArgs {
        first: clamp(args.first),
        last: clamp(args.last),
        ..args
    }
}

fn oracle_tags(record: &CardRecord) -> Vec<Option<ScryfallOracleTag>> {
    match json::decode(&record.oracle_tags) {
        Some(Value::Array(items)) => items
            .into_iter()
            .map(|item| match item {
                Value::Object(map) => Some(ScryfallOracleTag(map)),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// `Card` as the public schema shows it.
#[derive(Debug, Clone)]
pub struct PublicCard(pub crate::catalog::Card);

impl PublicCard {
    async fn printing_list(&self, ctx: &Context<'_>) -> Result<Vec<PublicPrinting>> {
        let record = &self.0.record;
        let printings = match &self.0.printings {
            Some(printings) => printings.clone(),
            None => crate::catalog::loader::printings_of(ctx, &record.oracle_id).await?,
        };
        Ok(printings
            .iter()
            .cloned()
            .map(|printing| PublicPrinting(printing.with_card(record.clone())))
            .collect())
    }
}

#[Object(name = "Card")]
impl PublicCard {
    /// The ID of an object
    async fn id(&self) -> ID {
        global_id(NodeKind::Card, &self.0.record.oracle_id)
    }

    async fn oracle_id(&self) -> ID {
        ID(self.0.record.oracle_id.to_string())
    }

    async fn name(&self) -> &str {
        &self.0.record.name
    }

    async fn type_line(&self) -> Option<&str> {
        self.0.record.type_line.as_deref()
    }

    async fn mana_cost(&self) -> Option<&str> {
        self.0.record.mana_cost.as_deref()
    }

    async fn oracle_text(&self) -> Option<&str> {
        self.0.record.oracle_text.as_deref()
    }

    async fn cmc(&self) -> Option<f64> {
        self.0.record.cmc
    }

    async fn colors(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.0.record.colors))
    }

    async fn color_identity(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.0.record.color_identity))
    }

    async fn game_changer(&self) -> bool {
        self.0.record.game_changer
    }

    async fn edhrec_rank(&self) -> Option<i64> {
        self.0.record.edhrec_rank
    }

    async fn edhrec_commander_rank(&self) -> Option<i64> {
        self.0.record.edhrec_commander_rank
    }

    async fn edhrec_saltiness(&self) -> Option<f64> {
        self.0.record.edhrec_saltiness
    }

    async fn oracle_tags(&self) -> Option<Vec<Option<ScryfallOracleTag>>> {
        Some(oracle_tags(&self.0.record))
    }

    async fn deck_category(&self) -> Option<&str> {
        self.0.record.deck_category.as_deref()
    }

    async fn deck_themes(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.0.record.deck_themes))
    }

    async fn rulings(&self, ctx: &Context<'_>) -> Vec<CardRuling> {
        crate::catalog::scryfall::rulings::card_rulings(
            state(ctx),
            self.0.record.rulings_uri.as_deref(),
        )
        .await
    }

    async fn legalities(&self) -> Vec<CardLegality> {
        crate::catalog::card::legality_entries(&self.0.record.legalities)
    }

    #[graphql(complexity = "300 * child_complexity")]
    async fn printings(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
    ) -> Result<Option<PrintingConnection>> {
        let args = clamp_page_args(
            PageArgs::new(after, first, before, last),
            MAX_PRINTINGS_PAGE,
        );
        let printings = self.printing_list(ctx).await?;
        Ok(Some(
            relay::connection_from_list(printings, &args, None)?.into(),
        ))
    }

    /// Tokens this card creates. Public shares never reveal how many the owner has.
    async fn produced_tokens(&self, ctx: &Context<'_>) -> Result<Vec<PublicProducedToken>> {
        let tokens = crate::catalog::loader::produced_tokens(ctx, &self.0.record.oracle_id).await?;
        Ok(tokens
            .iter()
            .map(|token| PublicProducedToken(PublicPrinting(token.printing.clone())))
            .collect())
    }
}

/// `ProducedToken`: the owned count is always zero.
#[derive(Debug, Clone)]
pub struct PublicProducedToken(pub PublicPrinting);

#[Object(name = "ProducedToken")]
impl PublicProducedToken {
    async fn printing(&self) -> &PublicPrinting {
        &self.0
    }

    async fn owned_count(&self) -> i64 {
        0
    }
}

/// `PublicCardSummary`: a printing's card without a way back to printings,
/// so documents cannot recurse `card { printings { card ... } }`.
#[derive(Debug, Clone)]
pub struct PublicCardSummary(pub Arc<CardRecord>);

#[Object(name = "PublicCardSummary")]
impl PublicCardSummary {
    async fn id(&self) -> ID {
        global_id(NodeKind::Card, &self.0.oracle_id)
    }

    async fn oracle_id(&self) -> ID {
        ID(self.0.oracle_id.to_string())
    }

    async fn name(&self) -> &str {
        &self.0.name
    }

    async fn type_line(&self) -> Option<&str> {
        self.0.type_line.as_deref()
    }

    async fn mana_cost(&self) -> Option<&str> {
        self.0.mana_cost.as_deref()
    }

    async fn oracle_text(&self) -> Option<&str> {
        self.0.oracle_text.as_deref()
    }

    async fn cmc(&self) -> Option<f64> {
        self.0.cmc
    }

    async fn colors(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.0.colors))
    }

    async fn color_identity(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.0.color_identity))
    }

    async fn game_changer(&self) -> bool {
        self.0.game_changer
    }

    async fn edhrec_rank(&self) -> Option<i64> {
        self.0.edhrec_rank
    }

    async fn oracle_tags(&self) -> Option<Vec<Option<ScryfallOracleTag>>> {
        Some(oracle_tags(&self.0))
    }

    async fn deck_category(&self) -> Option<&str> {
        self.0.deck_category.as_deref()
    }

    async fn deck_themes(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.0.deck_themes))
    }

    async fn rulings(&self, ctx: &Context<'_>) -> Vec<CardRuling> {
        crate::catalog::scryfall::rulings::card_rulings(state(ctx), self.0.rulings_uri.as_deref())
            .await
    }

    async fn legalities(&self) -> Vec<CardLegality> {
        crate::catalog::card::legality_entries(&self.0.legalities)
    }
}

/// `Printing` as the public schema shows it: the owned count is always zero.
#[derive(Debug, Clone)]
pub struct PublicPrinting(pub crate::catalog::Printing);

#[Object(name = "Printing")]
impl PublicPrinting {
    /// The ID of an object
    async fn id(&self) -> ID {
        global_id(NodeKind::Printing, &self.0.scryfall_id)
    }

    async fn scryfall_id(&self) -> ID {
        ID(self.0.scryfall_id.to_string())
    }

    async fn oracle_id(&self) -> ID {
        ID(self.0.oracle_id.to_string())
    }

    async fn set_code(&self) -> Option<&str> {
        Some(&self.0.set_code)
    }

    async fn set_name(&self) -> Option<&str> {
        self.0.set_name.as_deref()
    }

    async fn collector_number(&self) -> Option<&str> {
        Some(&self.0.collector_number)
    }

    async fn illustration_id(&self) -> Option<ID> {
        self.0.illustration_id.clone().map(ID)
    }

    async fn lang(&self) -> Option<&str> {
        Some(&self.0.lang)
    }

    async fn rarity(&self) -> Option<&str> {
        self.0.rarity.as_deref()
    }

    async fn owned_count(&self) -> i64 {
        0
    }

    async fn finishes(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.0.finishes))
    }

    async fn image_url(&self) -> Option<String> {
        self.0.record.image_url()
    }

    async fn back_image_url(&self) -> Option<String> {
        self.0.record.back_image_url()
    }

    async fn art_crop_url(&self) -> Option<String> {
        self.0.record.art_crop_url()
    }

    async fn prices(&self) -> Option<Json> {
        Some(Json(json::value_or(
            &self.0.prices,
            Value::Object(serde_json::Map::new()),
        )))
    }

    async fn price_text(&self, ctx: &Context<'_>) -> Option<String> {
        price::format_cents(self.0.price_cents_for(&state(ctx).prices, None))
    }

    async fn released_at(&self) -> Option<&str> {
        self.0.released_at.as_deref()
    }

    async fn card(&self, ctx: &Context<'_>) -> Result<Option<PublicCardSummary>> {
        if let Some(card) = &self.0.card {
            return Ok(Some(PublicCardSummary(card.clone())));
        }
        Ok(crate::catalog::loader::card(ctx, &self.0.oracle_id)
            .await?
            .map(|card| PublicCardSummary(card.record)))
    }
}

crate::connection_types!(PrintingConnection, PrintingEdge, PublicPrinting);

/// Any value from an uninhabited one.
fn absurd<T>(never: Infallible) -> T {
    match never {}
}

/// `CollectionItem`: named by `DeckCardAllocationCandidate.item`, but public
/// shares never list candidates, so no value exists.
#[derive(Debug, Clone, Copy)]
pub struct PublicCollectionItem(Infallible);

#[Object(name = "CollectionItem")]
impl PublicCollectionItem {
    /// The ID of an object
    async fn id(&self) -> ID {
        absurd(self.0)
    }

    async fn quantity(&self) -> i64 {
        absurd(self.0)
    }

    async fn condition(&self) -> String {
        absurd(self.0)
    }

    async fn language(&self) -> String {
        absurd(self.0)
    }

    async fn finish(&self) -> String {
        absurd(self.0)
    }

    async fn price_text(&self) -> Option<String> {
        absurd(self.0)
    }

    async fn location(&self) -> Option<PublicLocation> {
        absurd(self.0)
    }

    async fn printing(&self) -> Option<PublicPrinting> {
        absurd(self.0)
    }
}

/// `Location`: only reachable through a [`PublicCollectionItem`].
#[derive(Debug, Clone, Copy)]
pub struct PublicLocation(Infallible);

#[Object(name = "Location")]
impl PublicLocation {
    /// The ID of an object
    async fn id(&self) -> ID {
        absurd(self.0)
    }

    async fn name(&self) -> String {
        absurd(self.0)
    }

    async fn kind(&self) -> String {
        absurd(self.0)
    }
}

/// `DeckCardAllocationCandidate`: never produced by public shares.
#[derive(Debug, Clone, Copy)]
pub struct PublicAllocationCandidate(Infallible);

#[Object(name = "DeckCardAllocationCandidate")]
impl PublicAllocationCandidate {
    async fn item(&self) -> PublicCollectionItem {
        absurd(self.0)
    }

    async fn allocated(&self) -> i64 {
        absurd(self.0)
    }

    async fn allocated_elsewhere(&self) -> i64 {
        absurd(self.0)
    }

    async fn available(&self) -> i64 {
        absurd(self.0)
    }
}

/// `DeckCardAllocationStatus` of a shared deck card: state `shared`, the
/// required quantity, and nothing about the owner's collection.
#[derive(Debug, Clone, Copy)]
pub struct SharedAllocationStatus {
    pub required: i64,
}

#[Object(name = "DeckCardAllocationStatus")]
impl SharedAllocationStatus {
    async fn state(&self) -> &str {
        "shared"
    }

    async fn required(&self) -> i64 {
        self.required
    }

    async fn owned(&self) -> i64 {
        0
    }

    async fn allocated(&self) -> i64 {
        0
    }

    async fn proxy_allocated(&self) -> i64 {
        0
    }

    async fn available(&self) -> i64 {
        0
    }

    async fn allocated_elsewhere(&self) -> i64 {
        0
    }

    async fn missing(&self) -> i64 {
        0
    }

    async fn candidates(&self) -> Vec<PublicAllocationCandidate> {
        Vec::new()
    }
}

/// `DeckBuylistEntry` without the owner schema's `printing` field.
#[derive(Debug, Clone)]
pub struct PublicBuylistEntry(pub crate::deck_intel::buylist::DeckBuylistEntry);

#[Object(name = "DeckBuylistEntry")]
impl PublicBuylistEntry {
    async fn card_name(&self) -> &str {
        &self.0.card_name
    }

    async fn quantity(&self) -> i64 {
        self.0.quantity
    }

    async fn missing(&self) -> i64 {
        self.0.missing
    }

    async fn unavailable(&self) -> i64 {
        self.0.unavailable
    }

    async fn reason(&self) -> &str {
        &self.0.reason
    }

    async fn finish(&self) -> Option<&str> {
        self.0.finish.as_deref()
    }

    async fn set_code(&self) -> Option<&str> {
        self.0.set_code.as_deref()
    }

    async fn collector_number(&self) -> Option<&str> {
        self.0.collector_number.as_deref()
    }

    async fn language(&self) -> Option<&str> {
        self.0.language.as_deref()
    }

    async fn unit_price_cents(&self) -> Option<i64> {
        self.0.unit_price_cents
    }

    async fn total_price_cents(&self) -> Option<i64> {
        self.0.total_price_cents
    }

    async fn unit_price_text(&self) -> Option<String> {
        price::format_cents(self.0.unit_price_cents)
    }

    async fn total_price_text(&self) -> Option<String> {
        price::format_cents(self.0.total_price_cents)
    }
}

/// A shared deck. Its cards load once, on the first field that needs them.
#[derive(Clone)]
pub struct PublicDeck(pub crate::decks::Deck);

impl PublicDeck {
    async fn contents(&self, ctx: &Context<'_>) -> Result<Arc<crate::decks::DeckContents>> {
        self.0
            .contents(&state(ctx).db)
            .await
            .map_err(internal_error)
    }
}

fn iso(value: Option<&String>) -> Option<String> {
    value.map(|text| timefmt::iso8601(text))
}

#[Object(name = "Deck")]
impl PublicDeck {
    /// The ID of an object
    async fn id(&self) -> ID {
        global_id(NodeKind::Deck, self.0.row.id.0)
    }

    async fn name(&self) -> &str {
        &self.0.row.name
    }

    async fn format(&self) -> &str {
        self.0.row.format.as_str()
    }

    async fn status(&self) -> &str {
        self.0.row.status.as_str()
    }

    async fn primer(&self) -> Option<&str> {
        self.0.row.primer.as_deref()
    }

    async fn ai_analysis(&self) -> Option<&str> {
        self.0.row.ai_analysis.as_deref()
    }

    async fn ai_analysis_model(&self) -> Option<&str> {
        self.0.row.ai_analysis_model.as_deref()
    }

    async fn commander_bracket(&self) -> Option<i64> {
        self.0.row.commander_bracket
    }

    async fn commander_bracket_estimate(&self) -> Option<i64> {
        self.0.row.commander_bracket_estimate
    }

    async fn commander_bracket_rating(&self) -> Option<&str> {
        self.0.row.commander_bracket_rating.as_deref()
    }

    async fn share_token(&self) -> Option<&str> {
        self.0.row.share_token.as_deref()
    }

    async fn external_source(&self) -> Option<&str> {
        self.0
            .row
            .external_source
            .map(crate::decks::model::ExternalSource::as_str)
    }

    async fn external_url(&self) -> Option<&str> {
        self.0.row.external_url.as_deref()
    }

    async fn external_sync_error(&self) -> Option<&str> {
        self.0.row.external_sync_error.as_deref()
    }

    async fn external_synced_at(&self) -> Option<String> {
        iso(self.0.row.external_synced_at.as_ref())
    }

    async fn ai_analyzed_at(&self) -> Option<String> {
        iso(self.0.row.ai_analyzed_at.as_ref())
    }

    async fn cover_deck_card_id(&self) -> Option<ID> {
        self.0
            .row
            .cover_deck_card_id
            .map(|id| global_id(NodeKind::DeckCard, id.0))
    }

    async fn cover_image_url(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        let contents = self.contents(ctx).await?;
        Ok(crate::decks::contents::cover_image_url(
            &contents.cards,
            self.0.row.cover_deck_card_id,
        ))
    }

    async fn card_count(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        let contents = self.contents(ctx).await?;
        Ok(Some(i64::from(crate::decks::model::counted_quantity(
            contents.rows(),
        ))))
    }

    async fn commander_color_identity(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<Option<String>>>> {
        let contents = self.contents(ctx).await?;
        Ok(
            crate::decks::contents::commander_color_identity(&contents.cards)
                .map(|colors| colors.into_iter().map(Some).collect()),
        )
    }

    async fn unique_card_count(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        let contents = self.contents(ctx).await?;
        Ok(Some(i64::from(contents.summary(None).unique_card_count)))
    }

    async fn legality(&self, ctx: &Context<'_>) -> Result<DeckLegality> {
        let contents = self.contents(ctx).await?;
        Ok(DeckLegality(contents.legality(self.0.row.format)))
    }

    async fn tags(&self, ctx: &Context<'_>) -> Result<Vec<DeckTag>> {
        let tags = crate::decks::tags::list_deck_tags(&state(ctx).db, self.0.row.id)
            .await
            .map_err(internal_error)?;
        Ok(tags.into_iter().map(DeckTag).collect())
    }

    #[graphql(complexity = "500 * child_complexity")]
    async fn deck_cards(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
    ) -> Result<Option<DeckCardConnection>> {
        let args = clamp_page_args(
            PageArgs::new(after, first, before, last),
            MAX_DECK_CARDS_PAGE,
        );
        let contents = self.contents(ctx).await?;
        let cards = PublicDeckCard::hydrate(&state(ctx).db, &contents.cards)
            .await
            .map_err(internal_error)?;
        Ok(Some(
            relay::connection_from_list(cards, &args, None)?.into(),
        ))
    }
}

/// A shared deck card.
#[derive(Debug, Clone)]
pub struct PublicDeckCard {
    pub card: LoadedDeckCard,
    pub tag_ids: Vec<i64>,
}

impl PublicDeckCard {
    /// Adds tag ids to loaded deck cards (one query).
    pub async fn hydrate(
        pool: &sqlx::SqlitePool,
        cards: &[LoadedDeckCard],
    ) -> std::result::Result<Vec<Self>, sqlx::Error> {
        let ids: Vec<_> = cards.iter().map(|card| card.row.id).collect();
        let mut tag_ids = crate::decks::tags::tag_ids_by_deck_card(pool, &ids).await?;
        Ok(cards
            .iter()
            .map(|card| Self {
                tag_ids: tag_ids.remove(&card.row.id).unwrap_or_default(),
                card: card.clone(),
            })
            .collect())
    }
}

#[Object(name = "DeckCard")]
impl PublicDeckCard {
    /// The ID of an object
    async fn id(&self) -> ID {
        global_id(NodeKind::DeckCard, self.card.row.id.0)
    }

    async fn quantity(&self) -> i64 {
        self.card.row.quantity.as_i64()
    }

    async fn zone(&self) -> Option<&str> {
        Some(self.card.row.zone.as_str())
    }

    async fn finish(&self) -> Option<&str> {
        Some(self.card.row.finish.as_str())
    }

    async fn tag(&self) -> Option<&str> {
        self.card
            .row
            .tag
            .map(crate::decks::model::DeckCardTag::as_str)
    }

    /// The preferred printing's price in the card's finish.
    async fn price_cents(&self, ctx: &Context<'_>) -> Option<i64> {
        self.card.preferred_printing.as_ref().and_then(|printing| {
            printing.price_cents_for(&state(ctx).prices, Some(self.card.row.finish.as_str()))
        })
    }

    async fn preferred_printing(&self) -> Option<PublicPrinting> {
        self.card.preferred_printing.clone().map(PublicPrinting)
    }

    async fn card(&self) -> Option<PublicCard> {
        Some(PublicCard(crate::catalog::Card::from(
            self.card.card.clone(),
        )))
    }

    async fn fallback_printing(&self) -> Option<PublicPrinting> {
        self.card.fallback_printing.clone().map(PublicPrinting)
    }

    async fn tag_ids(&self) -> Vec<ID> {
        self.tag_ids.iter().map(|id| ID(id.to_string())).collect()
    }

    async fn allocation_status(&self) -> SharedAllocationStatus {
        SharedAllocationStatus {
            required: self.card.row.quantity.as_i64(),
        }
    }
}

crate::connection_types!(DeckCardConnection, DeckCardEdge, PublicDeckCard);

// The `Node` interface. The public schema has no `node` field; the
// interface only marks which types carry global ids.
#[derive(async_graphql::Interface)]
#[graphql(
    name = "Node",
    field(name = "id", ty = "ID", desc = "The ID of the object.")
)]
pub enum PublicNode {
    Card(PublicCard),
    Printing(PublicPrinting),
    CollectionItem(PublicCollectionItem),
    Location(PublicLocation),
    Deck(PublicDeck),
    DeckCard(PublicDeckCard),
}
