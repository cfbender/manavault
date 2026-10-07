//! Stand-in for the collection's GraphQL `CollectionItem`, used only by
//! `TradeBinderMatch.items` until the collection port lands.
//!
//! INTEGRATION: the collection module owns the real `CollectionItem` type
//! (with prices, allocations, location, ...). When merging, delete this file,
//! load the real items by [`BinderItem::id`], and override each item's
//! `quantity` with its for-trade quantity (`Matcher` returns
//! `%{item | quantity: item.for_trade_quantity}`). Two Rust types with the
//! GraphQL name `CollectionItem` cannot coexist in one schema.

use async_graphql::{Context, ID, Object};
use lotus::ScryfallId;

use crate::catalog::printing::Printing;
use crate::graphql::{NodeKind, global_id, internal_error, state};

/// A for-trade collection item as the trade matcher returns it: `quantity`
/// is the item's for-trade quantity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BinderItem {
    pub id: i64,
    pub quantity: i64,
    pub condition: String,
    pub language: String,
    pub finish: String,
    pub for_trade: bool,
    pub for_trade_quantity: i64,
    pub notes: Option<String>,
    pub scryfall_id: ScryfallId,
}

/// The subset of `CollectionItem` the trade match page reads.
#[Object(name = "CollectionItem")]
impl BinderItem {
    /// The ID of an object
    async fn id(&self) -> ID {
        global_id(NodeKind::CollectionItem, self.id)
    }

    async fn quantity(&self) -> i64 {
        self.quantity
    }

    async fn condition(&self) -> &str {
        &self.condition
    }

    async fn language(&self) -> &str {
        &self.language
    }

    async fn finish(&self) -> &str {
        &self.finish
    }

    async fn for_trade(&self) -> bool {
        self.for_trade
    }

    async fn for_trade_quantity(&self) -> i64 {
        self.for_trade_quantity
    }

    async fn notes(&self) -> Option<&str> {
        self.notes.as_deref()
    }

    async fn printing(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<Printing>> {
        Printing::load(&state(ctx).db, &self.scryfall_id)
            .await
            .map_err(internal_error)
    }
}
