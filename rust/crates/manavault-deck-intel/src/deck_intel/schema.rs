//! Root fields: `deckBuylist`, `deckBuylistExport`, `deckEdhrec`,
//! `deckRecommander`, `deckCombos`, `previewDeckDisassembly`,
//! `disassembleDeck`, and `bulkAllocateDeck` (`DeckOperations`,
//! `QueryResolvers`, `DeckMutations`, `AllocationResolvers`).

use async_graphql::{Context, ID, Object, SimpleObject};
use manavault_allocation::{
    AllocationError, AllocationMode, BulkAllocationResult, BuylistOptions, DeckId, DisassemblyMove,
    DisassemblyResult, PullListEntry,
};

use crate::deck_intel::buylist::{self, DeckBuylistEntry, PrintingMode};
use crate::deck_intel::edhrec::{self, DeckEdhrec, DeckEdhrecError, DeckEdhrecOptions};
use crate::deck_intel::errors::{deck_allocation_error, deck_read_error, disassembly_error};
use crate::deck_intel::recommander::{self, DeckRecommander, RecommanderError};
use crate::deck_intel::spellbook::{self, DeckCombo, SpellbookError};
use manavault_core::graphql::relay::node_int;
use manavault_core::graphql::{NodeKind, Result, state, user_error};

fn deck_id(id: &ID) -> Result<DeckId> {
    Ok(DeckId(node_int(id, NodeKind::Deck)?))
}

fn count(value: u32) -> i64 {
    i64::from(value)
}

/// `DeckDisassemblyMove`. Ids are raw database ids, as earlier releases
/// returned them.
#[derive(Debug, Clone, SimpleObject)]
pub struct DeckDisassemblyMove {
    pub collection_item_id: ID,
    pub card_name: String,
    pub card_id: ID,
    pub image_url: Option<String>,
    pub quantity: i64,
    pub finish: String,
    /// The deck's id (the copies leave the deck).
    pub from_location_id: Option<ID>,
    pub from_location_name: String,
    pub to_location_id: Option<ID>,
    pub to_location_name: String,
}

impl From<DisassemblyMove> for DeckDisassemblyMove {
    fn from(m: DisassemblyMove) -> Self {
        Self {
            collection_item_id: ID(m.collection_item_id.0.to_string()),
            card_name: m.card_name,
            card_id: ID(m.card_id.to_string()),
            image_url: m.image_url,
            quantity: m.quantity.as_i64(),
            finish: m.finish.as_str().to_owned(),
            from_location_id: Some(ID(m.from_deck_id.0.to_string())),
            from_location_name: m.from_location_name,
            to_location_id: m.to_location_id.map(|id| ID(id.0.to_string())),
            to_location_name: m.to_location_name,
        }
    }
}

/// `DeckDisassemblyResult`.
#[derive(Debug, Clone, SimpleObject)]
pub struct DeckDisassemblyResult {
    pub checked_count: i64,
    pub moved_count: i64,
    pub skipped_count: i64,
    pub dry_run: bool,
    pub moves: Vec<DeckDisassemblyMove>,
}

impl From<DisassemblyResult> for DeckDisassemblyResult {
    fn from(result: DisassemblyResult) -> Self {
        Self {
            checked_count: count(result.checked_count),
            moved_count: count(result.moved_count),
            skipped_count: count(result.skipped_count),
            dry_run: result.dry_run,
            moves: result.moves.into_iter().map(Into::into).collect(),
        }
    }
}

/// `DeckBulkAllocationResult`.
#[derive(Debug, Clone, Copy, SimpleObject)]
pub struct DeckBulkAllocationResult {
    pub allocated: i64,
    pub cards: i64,
    pub skipped: i64,
}

impl From<BulkAllocationResult> for DeckBulkAllocationResult {
    fn from(result: BulkAllocationResult) -> Self {
        Self {
            allocated: count(result.allocated),
            cards: count(result.cards),
            skipped: count(result.skipped),
        }
    }
}

#[derive(SimpleObject)]
pub struct PreviewDeckDisassemblyPayload {
    pub disassembly_result: DeckDisassemblyResult,
}

#[derive(SimpleObject)]
pub struct DisassembleDeckPayload {
    pub disassembly_result: DeckDisassemblyResult,
}

#[derive(SimpleObject)]
pub struct BulkAllocateDeckPayload {
    pub allocation_result: Option<DeckBulkAllocationResult>,
}

#[derive(SimpleObject)]
pub struct AllocateDeckPullListPayload {
    pub allocation_result: Option<DeckBulkAllocationResult>,
}

fn buylist_options(
    include_basic_lands: Option<bool>,
    assume_no_owned: Option<bool>,
    include_considering: Option<bool>,
) -> BuylistOptions {
    BuylistOptions {
        include_basic_lands: include_basic_lands.unwrap_or(false),
        assume_no_owned: assume_no_owned.unwrap_or(false),
        include_considering: include_considering.unwrap_or(false),
    }
}

fn edhrec_error(error: DeckEdhrecError) -> async_graphql::Error {
    match error {
        DeckEdhrecError::Allocation(error) => deck_read_error(error),
        other => user_error(other.to_string()),
    }
}

fn recommander_error(error: RecommanderError) -> async_graphql::Error {
    match error {
        RecommanderError::Allocation(error) => deck_read_error(error),
        other => user_error(other.to_string()),
    }
}

fn spellbook_error(error: SpellbookError) -> async_graphql::Error {
    match error {
        SpellbookError::Allocation(error) => deck_read_error(error),
        other => user_error(other.to_string()),
    }
}

#[derive(Default)]
pub struct DeckIntelQueries;

#[Object]
impl DeckIntelQueries {
    async fn deck_buylist(
        &self,
        ctx: &Context<'_>,
        id: ID,
        printing_mode: Option<String>,
        include_basic_lands: Option<bool>,
        assume_no_owned: Option<bool>,
        include_considering: Option<bool>,
    ) -> Result<Vec<DeckBuylistEntry>> {
        let deck_id = deck_id(&id)?;
        let mode = PrintingMode::parse(printing_mode.as_deref().unwrap_or("none"));
        let options = buylist_options(include_basic_lands, assume_no_owned, include_considering);
        buylist::deck_buylist(state(ctx), deck_id, mode, options)
            .await
            .map_err(deck_read_error)
    }

    async fn deck_buylist_export(
        &self,
        ctx: &Context<'_>,
        id: ID,
        format: Option<String>,
        printing_mode: Option<String>,
        include_basic_lands: Option<bool>,
        assume_no_owned: Option<bool>,
        include_considering: Option<bool>,
    ) -> Result<String> {
        let deck_id = deck_id(&id)?;
        let mode = PrintingMode::parse(printing_mode.as_deref().unwrap_or("none"));
        let options = buylist_options(include_basic_lands, assume_no_owned, include_considering);
        buylist::export_deck_buylist(
            state(ctx),
            deck_id,
            format.as_deref().unwrap_or("text"),
            mode,
            options,
        )
        .await
        .map_err(deck_read_error)
    }

    async fn deck_edhrec(
        &self,
        ctx: &Context<'_>,
        id: ID,
        exclude_lands: Option<bool>,
        commander_name: Option<String>,
        commander_theme: Option<String>,
        offset: Option<i64>,
    ) -> Result<DeckEdhrec> {
        let deck_id = deck_id(&id)?;
        let options = DeckEdhrecOptions {
            exclude_lands: exclude_lands.unwrap_or(false),
            offset: offset.unwrap_or(0),
            commander_name,
            commander_theme,
        };
        edhrec::deck_edhrec(state(ctx), deck_id, &options)
            .await
            .map_err(edhrec_error)
    }

    async fn deck_recommander(&self, ctx: &Context<'_>, id: ID) -> Result<DeckRecommander> {
        let deck_id = deck_id(&id)?;
        recommander::deck_recommander(state(ctx), deck_id)
            .await
            .map_err(recommander_error)
    }

    async fn deck_combos(&self, ctx: &Context<'_>, id: ID) -> Result<Vec<DeckCombo>> {
        let deck_id = deck_id(&id)?;
        spellbook::deck_combos(state(ctx), deck_id)
            .await
            .map_err(spellbook_error)
    }
}

#[derive(Default)]
pub struct DeckIntelMutations;

#[Object]
impl DeckIntelMutations {
    async fn preview_deck_disassembly(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<PreviewDeckDisassemblyPayload>> {
        let deck_id = deck_id(&id)?;
        let result = manavault_allocation::preview_deck_disassembly(&state(ctx).db, deck_id)
            .await
            .map_err(disassembly_error)?;
        Ok(Some(PreviewDeckDisassemblyPayload {
            disassembly_result: result.into(),
        }))
    }

    async fn disassemble_deck(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DisassembleDeckPayload>> {
        let deck_id = deck_id(&id)?;
        let result = manavault_allocation::disassemble_deck(&state(ctx).db, deck_id)
            .await
            .map_err(disassembly_error)?;
        Ok(Some(DisassembleDeckPayload {
            disassembly_result: result.into(),
        }))
    }

    async fn bulk_allocate_deck(
        &self,
        ctx: &Context<'_>,
        id: ID,
        mode: String,
    ) -> Result<Option<BulkAllocateDeckPayload>> {
        let deck_id = deck_id(&id)?;
        let mode = AllocationMode::parse(&mode).map_err(deck_allocation_error)?;
        let result = manavault_allocation::bulk_allocate_deck(&state(ctx).db, deck_id, mode)
            .await
            .map_err(deck_allocation_error)?;
        Ok(Some(BulkAllocateDeckPayload {
            allocation_result: Some(result.into()),
        }))
    }
}

/// One `DeckPullListEntryInput`, with its fields as received.
#[derive(Debug, Clone)]
pub struct PullListEntryArgs {
    pub deck_card_id: ID,
    pub collection_item_id: ID,
    pub quantity: Option<i64>,
}

/// The `allocateDeckPullList` resolver body
/// (`AllocationResolvers.allocate_deck_pull_list/3`), for the root field
/// that takes the deck engineer's `DeckPullListEntryInput`.
pub async fn allocate_deck_pull_list(
    ctx: &Context<'_>,
    deck_id_arg: &ID,
    entries: &[PullListEntryArgs],
) -> Result<Option<AllocateDeckPullListPayload>> {
    let deck_id = deck_id(deck_id_arg)?;
    let mut decoded = Vec::with_capacity(entries.len());
    for entry in entries {
        let deck_card_id = node_int(&entry.deck_card_id, NodeKind::DeckCard)?;
        let collection_item_id = node_int(&entry.collection_item_id, NodeKind::CollectionItem)?;
        decoded.push((deck_card_id, collection_item_id, entry.quantity));
    }
    let entries = decoded
        .into_iter()
        .map(|(deck_card_id, item_id, quantity)| {
            PullListEntry::new(deck_card_id, item_id, quantity)
        })
        .collect::<std::result::Result<Vec<_>, AllocationError>>()
        .map_err(deck_allocation_error)?;
    let result = manavault_allocation::allocate_deck_pull_list(&state(ctx).db, deck_id, &entries)
        .await
        .map_err(deck_allocation_error)?;
    Ok(Some(AllocateDeckPullListPayload {
        allocation_result: Some(result.into()),
    }))
}
