//! For-trade collection items found by the trade matcher. GraphQL presents
//! them as the collection's `CollectionItem` with `quantity` replaced by the
//! for-trade quantity (`Matcher` returns
//! `%{item | quantity: item.for_trade_quantity}`).

use lotus::ScryfallId;

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
