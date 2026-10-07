//! The allocation mutations that move single copies, proxies, pull lists,
//! and collection selections into decks (`AllocationResolvers`):
//! `addCollectionItemToDeck`, `bulkAddCollectionItemsToDeck`,
//! `allocateDeckCardItem`, `deallocateDeckCardItem`,
//! `bulkDeallocateDeckCards`, `allocateDeckCardProxy`,
//! `deallocateDeckCardProxy`, `previewBulkAllocateDeck`, and
//! `allocateDeckPullList`. The rules live in `manavault_allocation`; this
//! module decodes ids, keeps the Elixir checks' order where it shows in the
//! error message, and loads the GraphQL `DeckCard`s and `CollectionItem`s.

use async_graphql::{Context, ID, Object, SimpleObject};
use manavault_allocation::{
    AllocationError, AllocationMode, BulkAllocationPreview, CollectionItemId, DeckCardId, DeckId,
    Quantity, Zone, parse_quantity,
};
use sqlx::SqlitePool;

use crate::collection::graphql::inputs::{CollectionItemSelector, selected_ids};
use crate::collection::item::CollectionItem;
use crate::deck_intel::errors::deck_allocation_error;
use crate::deck_intel::schema::{AllocateDeckPullListPayload, PullListEntryArgs};
use crate::decks::DeckCard;
use crate::decks::schema::DeckPullListEntryInput;
use crate::graphql::relay::{node_int, node_ints};
use crate::graphql::{NodeKind, Result, internal_error, state, user_error};

const DECK_CARD_NOT_FOUND: &str = "Deck card was not found.";
const COLLECTION_ITEM_NOT_FOUND: &str = "Collection item was not found.";

fn parse_deck_id(id: &ID) -> Result<DeckId> {
    Ok(DeckId(node_int(id, NodeKind::Deck)?))
}

fn parse_deck_card_id(id: &ID) -> Result<DeckCardId> {
    Ok(DeckCardId(node_int(id, NodeKind::DeckCard)?))
}

fn parse_item_id(id: &ID) -> Result<CollectionItemId> {
    Ok(CollectionItemId(node_int(id, NodeKind::CollectionItem)?))
}

/// The deck card as a GraphQL object, after a successful change
/// (`fetch_deck_card/1`: "Deck card was not found." if it vanished).
async fn fetch_deck_card(pool: &SqlitePool, id: DeckCardId) -> Result<DeckCard> {
    DeckCard::load(pool, id)
        .await
        .map_err(internal_error)?
        .ok_or_else(|| user_error(DECK_CARD_NOT_FOUND))
}

/// Deck cards as GraphQL objects, in the order of `ids`.
async fn deck_cards(pool: &SqlitePool, ids: &[DeckCardId]) -> Result<Vec<DeckCard>> {
    DeckCard::load_many(pool, ids).await.map_err(internal_error)
}

/// The zone argument of the add-to-deck mutations: omitted is mainboard;
/// anything but `DeckCard.zones/0` fails the deck card changeset.
///
/// An explicit `null` is mainboard too. (Elixir passed `nil` on: the single
/// add raised comparing `zone == nil` in its query and the bulk add failed
/// with "zone can't be blank"; async-graphql also reads an unset `$zone`
/// variable as `null`, which Absinthe treated as omitted.)
fn zone_arg(zone: Option<&str>) -> std::result::Result<Zone, &'static str> {
    match zone {
        None => Ok(Zone::Mainboard),
        Some(zone) => crate::decks::model::parse_zone(zone).ok_or("zone is invalid"),
    }
}

/// The deck must exist and its decklist be editable; Elixir checked both
/// before the deck card changeset rejected a zone.
async fn ensure_decklist_editable(pool: &SqlitePool, id: DeckId) -> Result<()> {
    manavault_allocation::deck(pool, id)
        .await
        .map_err(deck_allocation_error)?
        .ok_or(AllocationError::DeckNotFound)
        .and_then(|deck| deck.ensure_decklist_editable())
        .map_err(deck_allocation_error)
}

/// A quantity argument (default 1). An invalid quantity is reported after
/// the deck card's own checks, as `ProxyAllocation` validated it last.
async fn proxy_quantity(
    pool: &SqlitePool,
    id: DeckCardId,
    quantity: Option<i64>,
    allocating: bool,
) -> Result<Quantity> {
    let invalid = match parse_quantity(quantity.unwrap_or(1)) {
        Ok(quantity) => return Ok(quantity),
        Err(error) => error,
    };
    let card = manavault_allocation::deck_card(pool, id)
        .await
        .map_err(deck_allocation_error)?
        .ok_or_else(|| user_error(DECK_CARD_NOT_FOUND))?;
    if allocating {
        card.allocatable().map_err(deck_allocation_error)?;
    } else {
        card.ensure_editable().map_err(deck_allocation_error)?;
    }
    Err(deck_allocation_error(invalid))
}

/// `DeckBulkAllocationEntry`.
#[derive(SimpleObject)]
pub struct DeckBulkAllocationEntry {
    pub deck_card: DeckCard,
    pub item: CollectionItem,
    pub quantity: i64,
    pub exact: bool,
}

/// `DeckBulkAllocationPreview`.
#[derive(SimpleObject)]
pub struct DeckBulkAllocationPreview {
    pub mode: String,
    pub allocated: i64,
    pub cards: i64,
    pub skipped: i64,
    pub entries: Vec<DeckBulkAllocationEntry>,
}

impl DeckBulkAllocationPreview {
    /// Loads every entry's deck card and collection item in two batches.
    async fn load(pool: &SqlitePool, preview: BulkAllocationPreview) -> Result<Self> {
        let mut card_ids: Vec<DeckCardId> = Vec::new();
        for entry in &preview.entries {
            if !card_ids.contains(&entry.deck_card.id) {
                card_ids.push(entry.deck_card.id);
            }
        }
        let item_ids: Vec<i64> = preview.entries.iter().map(|e| e.item.id.0).collect();
        let cards = deck_cards(pool, &card_ids).await?;
        let mut items = CollectionItem::load_many(pool, &item_ids)
            .await
            .map_err(internal_error)?;
        let mut entries = Vec::with_capacity(preview.entries.len());
        for entry in preview.entries {
            let deck_card = cards
                .iter()
                .find(|card| card.row.id == entry.deck_card.id)
                .cloned()
                .ok_or_else(|| user_error(DECK_CARD_NOT_FOUND))?;
            let item = items
                .remove(&entry.item.id.0)
                .ok_or_else(|| user_error(COLLECTION_ITEM_NOT_FOUND))?;
            entries.push(DeckBulkAllocationEntry {
                deck_card,
                item,
                quantity: entry.quantity.as_i64(),
                exact: entry.exact,
            });
        }
        Ok(Self {
            mode: preview.mode.as_str().to_owned(),
            allocated: i64::from(preview.allocated),
            cards: i64::from(preview.cards),
            skipped: i64::from(preview.skipped),
            entries,
        })
    }
}

#[derive(SimpleObject)]
pub struct AddCollectionItemToDeckPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct BulkAddCollectionItemsToDeckPayload {
    pub deck_cards: Vec<DeckCard>,
}

#[derive(SimpleObject)]
pub struct AllocateDeckCardItemPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct DeallocateDeckCardItemPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct BulkDeallocateDeckCardsPayload {
    pub deck_cards: Vec<DeckCard>,
}

#[derive(SimpleObject)]
pub struct AllocateDeckCardProxyPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct DeallocateDeckCardProxyPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct PreviewBulkAllocateDeckPayload {
    pub allocation_preview: Option<DeckBulkAllocationPreview>,
}

#[derive(Default)]
pub struct AllocationMutations;

#[Object]
impl AllocationMutations {
    /// Adds one copy of a collection item to a deck and reserves it.
    async fn add_collection_item_to_deck(
        &self,
        ctx: &Context<'_>,
        id: ID,
        deck_id: ID,
        zone: Option<String>,
    ) -> Result<Option<AddCollectionItemToDeckPayload>> {
        let pool = &state(ctx).db;
        let item_id = parse_item_id(&id)?;
        let deck_id = parse_deck_id(&deck_id)?;
        let zone = match zone_arg(zone.as_deref()) {
            Ok(zone) => zone,
            Err(message) => {
                ensure_decklist_editable(pool, deck_id).await?;
                return Err(user_error(message));
            }
        };
        let card = manavault_allocation::add_collection_item_to_deck(pool, deck_id, item_id, zone)
            .await
            .map_err(|error| match error {
                // `get_collection_item!/1` raised on a missing item.
                AllocationError::CollectionItemNotFound => user_error(COLLECTION_ITEM_NOT_FOUND),
                other => deck_allocation_error(other),
            })?;
        Ok(Some(AddCollectionItemToDeckPayload {
            deck_card: Some(fetch_deck_card(pool, card.id).await?),
        }))
    }

    /// Adds one copy of each selected collection item to a deck.
    async fn bulk_add_collection_items_to_deck(
        &self,
        ctx: &Context<'_>,
        selector: CollectionItemSelector,
        deck_id: ID,
        zone: Option<String>,
    ) -> Result<Option<BulkAddCollectionItemsToDeckPayload>> {
        let pool = &state(ctx).db;
        let ids: Vec<CollectionItemId> = selected_ids(ctx, &selector)
            .await?
            .into_iter()
            .map(CollectionItemId)
            .collect();
        let deck_id = parse_deck_id(&deck_id)?;
        let zone = match zone_arg(zone.as_deref()) {
            Ok(zone) => zone,
            Err(message) => {
                ensure_decklist_editable(pool, deck_id).await?;
                if ids.is_empty() {
                    return Ok(Some(BulkAddCollectionItemsToDeckPayload {
                        deck_cards: Vec::new(),
                    }));
                }
                return Err(user_error(message));
            }
        };
        let cards =
            manavault_allocation::bulk_add_collection_items_to_deck(pool, deck_id, &ids, zone)
                .await
                .map_err(deck_allocation_error)?;
        let ids: Vec<DeckCardId> = cards.iter().map(|card| card.id).collect();
        Ok(Some(BulkAddCollectionItemsToDeckPayload {
            deck_cards: deck_cards(pool, &ids).await?,
        }))
    }

    async fn allocate_deck_card_item(
        &self,
        ctx: &Context<'_>,
        deck_card_id: ID,
        collection_item_id: ID,
    ) -> Result<Option<AllocateDeckCardItemPayload>> {
        let pool = &state(ctx).db;
        let card_id = parse_deck_card_id(&deck_card_id)?;
        let item_id = parse_item_id(&collection_item_id)?;
        let one = parse_quantity(1).map_err(deck_allocation_error)?;
        manavault_allocation::allocate(pool, card_id, item_id, one)
            .await
            .map_err(|error| match error {
                // `get_collection_item!/1` raised on a missing item.
                AllocationError::CollectionItemNotFound => user_error(COLLECTION_ITEM_NOT_FOUND),
                other => deck_allocation_error(other),
            })?;
        Ok(Some(AllocateDeckCardItemPayload {
            deck_card: Some(fetch_deck_card(pool, card_id).await?),
        }))
    }

    async fn deallocate_deck_card_item(
        &self,
        ctx: &Context<'_>,
        deck_card_id: ID,
        collection_item_id: ID,
    ) -> Result<Option<DeallocateDeckCardItemPayload>> {
        let pool = &state(ctx).db;
        let card_id = parse_deck_card_id(&deck_card_id)?;
        let item_id = parse_item_id(&collection_item_id)?;
        let one = parse_quantity(1).map_err(deck_allocation_error)?;
        manavault_allocation::deallocate(pool, card_id, item_id, one)
            .await
            .map_err(deck_allocation_error)?;
        Ok(Some(DeallocateDeckCardItemPayload {
            deck_card: Some(fetch_deck_card(pool, card_id).await?),
        }))
    }

    /// Returns every copy and proxy of the given deck cards.
    async fn bulk_deallocate_deck_cards(
        &self,
        ctx: &Context<'_>,
        deck_card_ids: Vec<ID>,
    ) -> Result<Option<BulkDeallocateDeckCardsPayload>> {
        let pool = &state(ctx).db;
        let ids: Vec<DeckCardId> = node_ints(&deck_card_ids, NodeKind::DeckCard)?
            .into_iter()
            .map(DeckCardId)
            .collect();
        let cards = manavault_allocation::bulk_deallocate_deck_cards(pool, &ids)
            .await
            .map_err(deck_allocation_error)?;
        let ids: Vec<DeckCardId> = cards.iter().map(|card| card.id).collect();
        Ok(Some(BulkDeallocateDeckCardsPayload {
            deck_cards: deck_cards(pool, &ids).await?,
        }))
    }

    async fn allocate_deck_card_proxy(
        &self,
        ctx: &Context<'_>,
        deck_card_id: ID,
        quantity: Option<i64>,
    ) -> Result<Option<AllocateDeckCardProxyPayload>> {
        let pool = &state(ctx).db;
        let card_id = parse_deck_card_id(&deck_card_id)?;
        let quantity = proxy_quantity(pool, card_id, quantity, true).await?;
        manavault_allocation::allocate_proxy(pool, card_id, quantity)
            .await
            .map_err(deck_allocation_error)?;
        Ok(Some(AllocateDeckCardProxyPayload {
            deck_card: Some(fetch_deck_card(pool, card_id).await?),
        }))
    }

    async fn deallocate_deck_card_proxy(
        &self,
        ctx: &Context<'_>,
        deck_card_id: ID,
        quantity: Option<i64>,
    ) -> Result<Option<DeallocateDeckCardProxyPayload>> {
        let pool = &state(ctx).db;
        let card_id = parse_deck_card_id(&deck_card_id)?;
        let quantity = proxy_quantity(pool, card_id, quantity, false).await?;
        manavault_allocation::deallocate_proxy(pool, card_id, quantity)
            .await
            .map_err(deck_allocation_error)?;
        Ok(Some(DeallocateDeckCardProxyPayload {
            deck_card: Some(fetch_deck_card(pool, card_id).await?),
        }))
    }

    /// What `bulkAllocateDeck` would reserve, without reserving it.
    async fn preview_bulk_allocate_deck(
        &self,
        ctx: &Context<'_>,
        id: ID,
        mode: String,
    ) -> Result<Option<PreviewBulkAllocateDeckPayload>> {
        let pool = &state(ctx).db;
        let deck_id = parse_deck_id(&id)?;
        let mode = match AllocationMode::parse(&mode) {
            Ok(mode) => mode,
            Err(invalid) => {
                // `get_deck!/1` ran before the mode was checked.
                manavault_allocation::deck(pool, deck_id)
                    .await
                    .map_err(deck_allocation_error)?
                    .ok_or_else(|| deck_allocation_error(AllocationError::DeckNotFound))?;
                return Err(deck_allocation_error(invalid));
            }
        };
        let preview = manavault_allocation::preview_bulk_allocate_deck(pool, deck_id, mode)
            .await
            .map_err(deck_allocation_error)?;
        Ok(Some(PreviewBulkAllocateDeckPayload {
            allocation_preview: Some(DeckBulkAllocationPreview::load(pool, preview).await?),
        }))
    }

    /// Reserves the chosen copies of a pull list; entries that no longer
    /// fit are skipped.
    async fn allocate_deck_pull_list(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
        entries: Vec<DeckPullListEntryInput>,
    ) -> Result<Option<AllocateDeckPullListPayload>> {
        let entries: Vec<PullListEntryArgs> = entries
            .into_iter()
            .map(|entry| PullListEntryArgs {
                deck_card_id: entry.deck_card_id,
                collection_item_id: entry.collection_item_id,
                quantity: entry.quantity,
            })
            .collect();
        crate::deck_intel::schema::allocate_deck_pull_list(ctx, &deck_id, &entries).await
    }
}
