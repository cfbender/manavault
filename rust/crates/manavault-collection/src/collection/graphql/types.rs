//! The `CollectionItem` and `Location` nodes and their companion types
//! (`CollectionTypes` with the `CollectionFields` resolvers).

use async_graphql::{Context, ID, Object, SimpleObject};

use crate::collection::filters::{ItemFilters, LocationFilter, Sort};
use crate::collection::graphql::values::{
    CollectionValueSummary, format_percent, value_gain_percent,
};
use crate::collection::item::CollectionItem;
use crate::collection::loader;
use crate::collection::location::{Location, Place};
use crate::collection::queries::{self, ItemGroup, Page, ValueTotals};
use manavault_catalog::catalog::price::{format_cents, format_signed_cents};
use manavault_catalog::catalog::printing::Printing;
use manavault_core::graphql::relay::{PageArgs, from_slice, offset_and_limit};
use manavault_core::graphql::{NodeKind, Result, global_id, internal_error, state};

#[Object]
impl CollectionItem {
    /// The ID of an object
    pub async fn id(&self) -> ID {
        global_id(NodeKind::CollectionItem, self.record.id)
    }

    async fn quantity(&self) -> i64 {
        self.record.quantity.as_i64()
    }

    async fn condition(&self) -> &str {
        self.record.condition.as_str()
    }

    async fn language(&self) -> &str {
        &self.record.language
    }

    async fn finish(&self) -> &str {
        self.record.finish.as_str()
    }

    async fn for_trade(&self) -> bool {
        self.record.for_trade
    }

    async fn for_trade_quantity(&self) -> i64 {
        self.record.for_trade_quantity
    }

    async fn notes(&self) -> Option<&str> {
        self.record.notes.as_deref()
    }

    async fn printing(&self) -> Option<&Printing> {
        Some(&self.printing)
    }

    async fn current_price_cents(&self, ctx: &Context<'_>) -> Option<i64> {
        self.price_cents(&state(ctx).prices)
    }

    async fn purchase_price_cents(&self, ctx: &Context<'_>) -> Option<i64> {
        CollectionItem::purchase_basis_cents(self, &state(ctx).prices)
    }

    async fn price_text(&self, ctx: &Context<'_>) -> Option<String> {
        format_cents(self.price_cents(&state(ctx).prices))
    }

    async fn purchase_price_text(&self, ctx: &Context<'_>) -> Option<String> {
        format_cents(CollectionItem::purchase_basis_cents(
            self,
            &state(ctx).prices,
        ))
    }

    async fn value_gain_cents(&self, ctx: &Context<'_>) -> Option<i64> {
        CollectionItem::gain_cents(self, &state(ctx).prices)
    }

    async fn value_gain_text(&self, ctx: &Context<'_>) -> Option<String> {
        format_signed_cents(CollectionItem::gain_cents(self, &state(ctx).prices))
    }

    async fn value_gain_percent(&self, ctx: &Context<'_>) -> Option<f64> {
        let prices = &state(ctx).prices;
        value_gain_percent(
            CollectionItem::gain_cents(self, prices),
            CollectionItem::purchase_basis_cents(self, prices),
        )
    }

    async fn value_gain_percent_text(&self, ctx: &Context<'_>) -> Option<String> {
        let prices = &state(ctx).prices;
        format_percent(value_gain_percent(
            CollectionItem::gain_cents(self, prices),
            CollectionItem::purchase_basis_cents(self, prices),
        ))
    }

    /// The selected source's price of one copy when the item was added, or
    /// its current price when none was recorded.
    async fn acquisition_market_price_cents(&self, ctx: &Context<'_>) -> Option<i64> {
        CollectionItem::acquisition_market_basis_cents(self, &state(ctx).prices)
    }

    async fn acquisition_market_price_text(&self, ctx: &Context<'_>) -> Option<String> {
        format_cents(CollectionItem::acquisition_market_basis_cents(
            self,
            &state(ctx).prices,
        ))
    }

    /// Current minus acquisition market price of one copy.
    async fn market_gain_cents(&self, ctx: &Context<'_>) -> Option<i64> {
        CollectionItem::acquisition_market_gain_cents(self, &state(ctx).prices)
    }

    async fn market_gain_text(&self, ctx: &Context<'_>) -> Option<String> {
        format_signed_cents(CollectionItem::acquisition_market_gain_cents(
            self,
            &state(ctx).prices,
        ))
    }

    /// Copies of this item allocated to decks.
    async fn allocated_quantity(&self, ctx: &Context<'_>) -> Result<i64> {
        Ok(loader::allocations(ctx, self.record.id)
            .await?
            .allocated_quantity)
    }

    /// Copies of this card owned across the collection, lists excluded.
    async fn total_owned_copies(&self, ctx: &Context<'_>) -> Result<i64> {
        loader::owned_copies(ctx, self.oracle_id()).await
    }

    /// The decks this item's copies are allocated to, by deck name.
    async fn allocation_decks(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Vec<CollectionItemAllocationDeck>> {
        Ok(loader::allocations(ctx, self.record.id)
            .await?
            .decks
            .iter()
            .map(|deck| CollectionItemAllocationDeck {
                deck_id: deck.deck_id,
                quantity: deck.quantity,
            })
            .collect())
    }

    async fn location(&self) -> Option<Location> {
        self.location_object()
    }
}

/// `CollectionItemAllocationDeck`: copies of an item allocated to one deck.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollectionItemAllocationDeck {
    /// The deck, for the `deck` field.
    pub deck_id: i64,
    pub quantity: i64,
}

#[Object]
impl CollectionItemAllocationDeck {
    /// The deck, loaded in one batch for every item on the page.
    async fn deck(&self, ctx: &Context<'_>) -> Result<crate::decks::Deck> {
        let deck = loader::deck(ctx, crate::decks::DeckId(self.deck_id))
            .await?
            .ok_or_else(|| manavault_core::graphql::user_error("Deck was not found."))?;
        Ok(crate::decks::Deck::new(deck.as_ref().clone()))
    }

    async fn quantity(&self) -> i64 {
        self.quantity
    }
}

/// `CollectionItemGroup`: the items of one printing.
#[derive(Clone)]
pub struct CollectionItemGroup(pub ItemGroup);

#[Object]
impl CollectionItemGroup {
    async fn printing_id(&self) -> String {
        self.0.printing_id.to_string()
    }

    async fn quantity(&self) -> i64 {
        self.0.quantity
    }

    async fn items(&self) -> &[CollectionItem] {
        &self.0.items
    }
}

manavault_core::connection_types!(CollectionItemConnection, CollectionItemEdge, CollectionItem);
manavault_core::connection_types!(
    CollectionItemGroupConnection,
    CollectionItemGroupEdge,
    CollectionItemGroup
);
manavault_core::connection_types!(LocationConnection, LocationEdge, Location);

/// `RelayHelpers.slice_window/3`: relay arguments over a known total, else
/// the first `default` rows.
pub(crate) fn slice_window(args: &PageArgs, total: i64, default: i64) -> Result<(i64, i64)> {
    if args.is_relay() {
        offset_and_limit(&args.clone().with_default_first(default), total)
    } else {
        Ok((0, default))
    }
}

/// A page of collection items over their row count (not their copies, which
/// would page past the last row).
pub(crate) async fn items_connection(
    ctx: &Context<'_>,
    filters: &ItemFilters,
    sort: Sort,
    args: &PageArgs,
) -> Result<CollectionItemConnection> {
    let pool = &state(ctx).db;
    let total = queries::totals(pool, filters)
        .await
        .map_err(internal_error)?
        .entries;
    let (offset, limit) = slice_window(args, total, 100)?;
    let items = queries::list_items(
        pool,
        filters,
        Page {
            limit,
            offset,
            sort,
        },
    )
    .await
    .map_err(internal_error)?;
    Ok(from_slice(items, offset, offset > 0, offset + limit < total).into())
}

/// `HomeSummary`.
#[derive(Debug, Clone, PartialEq, Eq, SimpleObject)]
pub struct HomeSummary {
    pub collection_count: i64,
    pub location_count: i64,
    pub deck_count: i64,
}

const UNFILED_NAME: &str = "Unfiled";
const UNFILED_DESCRIPTION: &str = "Cards without an assigned location.";

impl Location {
    /// The value summary: precomputed, or the location's unallocated items.
    async fn totals(&self, ctx: &Context<'_>) -> Result<ValueTotals> {
        if let Some(totals) = self.totals {
            return Ok(totals);
        }
        match &self.place {
            Place::Stored(record) => loader::location_totals(ctx, record.id).await,
            Place::Unfiled => Ok(queries::location_summaries(&state(ctx).db, None)
                .await
                .map_err(internal_error)?
                .remove(&None)
                .unwrap_or_default()),
        }
    }

    async fn summary(&self, ctx: &Context<'_>) -> Result<CollectionValueSummary> {
        Ok(self.totals(ctx).await?.into())
    }
}

#[Object]
impl Location {
    /// The ID of an object
    pub async fn id(&self) -> ID {
        match &self.place {
            Place::Stored(record) => global_id(NodeKind::Location, record.id),
            Place::Unfiled => global_id(NodeKind::Location, "unfiled"),
        }
    }

    async fn name(&self) -> &str {
        match &self.place {
            Place::Stored(record) => &record.name,
            Place::Unfiled => UNFILED_NAME,
        }
    }

    async fn kind(&self) -> &str {
        match &self.place {
            Place::Stored(record) => record.kind.as_str(),
            Place::Unfiled => "unfiled",
        }
    }

    async fn description(&self) -> Option<&str> {
        match &self.place {
            Place::Stored(record) => record.description.as_deref(),
            Place::Unfiled => Some(UNFILED_DESCRIPTION),
        }
    }

    async fn cover_printing(&self, ctx: &Context<'_>) -> Result<Option<Printing>> {
        match self
            .record()
            .and_then(|record| record.cover_scryfall_id.as_ref())
        {
            Some(id) => loader::printing(ctx, id).await,
            None => Ok(None),
        }
    }

    async fn item_count(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        Ok(Some(self.totals(ctx).await?.item_count))
    }

    async fn total_price_cents(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        Ok(Some(self.summary(ctx).await?.total_price_cents))
    }

    async fn total_price_text(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        Ok(self.summary(ctx).await?.total_price_text)
    }

    async fn purchase_price_cents(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        Ok(Some(self.summary(ctx).await?.purchase_price_cents))
    }

    async fn purchase_price_text(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        Ok(self.summary(ctx).await?.purchase_price_text)
    }

    async fn value_gain_cents(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        Ok(Some(self.summary(ctx).await?.value_gain_cents))
    }

    async fn value_gain_text(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        Ok(self.summary(ctx).await?.value_gain_text)
    }

    async fn value_gain_percent(&self, ctx: &Context<'_>) -> Result<Option<f64>> {
        Ok(self.summary(ctx).await?.value_gain_percent)
    }

    async fn value_gain_percent_text(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        Ok(self.summary(ctx).await?.value_gain_percent_text)
    }

    async fn value_summary(&self, ctx: &Context<'_>) -> Result<CollectionValueSummary> {
        self.summary(ctx).await
    }

    async fn collection_items(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
    ) -> Result<Option<CollectionItemConnection>> {
        let location = match &self.place {
            Place::Stored(record) => LocationFilter::Id(record.id),
            Place::Unfiled => LocationFilter::Unfiled,
        };
        let args = PageArgs::new(after, first, before, last);
        items_connection(ctx, &ItemFilters::at(location), Sort::default(), &args)
            .await
            .map(Some)
    }
}
