//! Deck root fields (`ManavaultWeb.Schema.Catalog.DeckOperations`,
//! `DeckMutations`, `DeckSwapResolvers`, and the deck parts of
//! `QueryResolvers`).

pub mod errors;
pub mod types;

use async_graphql::{Context, Enum, ID, InputObject, MaybeUndefined, Object, SimpleObject};
use lotus::ScryfallId;

use crate::decks::cards::{self, CardRef, DeckCardChanges, NewDeckCard};
use crate::decks::contents::load_contents;
use crate::decks::model::{DeckCardId, DeckId};
use crate::decks::records::{self, DeckChanges, PlayOutcome};
use crate::decks::swap::{self, CutDestination, Swap, SwapAdd, SwapCut};
use crate::decks::tags::{self, DeckTagChanges, DefaultTagEntry};
use crate::decks::validation::Change;
use crate::decks::{decklist, external, picker};
use errors::{
    add_card_error, card_tag_error, commander_error, deck_edit_error, deck_error,
    deck_import_error, deck_swap_error, tag_error,
};
use manavault_core::graphql::relay::{self, PageArgs, node_int, node_str, optional_node_int};
use manavault_core::graphql::{NodeKind, Result, internal_error, state, user_error};
use types::{
    Deck, DeckCard, DeckConnection, DeckImportResult, DeckSwapPreview, DeckTag, DefaultDeckTag,
};

fn deck_id(id: &ID) -> Result<DeckId> {
    node_int(id, NodeKind::Deck).map(DeckId)
}

fn deck_card_id(id: &ID) -> Result<DeckCardId> {
    node_int(id, NodeKind::DeckCard).map(DeckCardId)
}

fn deck_card_ids(ids: &[ID]) -> Result<Vec<DeckCardId>> {
    ids.iter().map(deck_card_id).collect()
}

/// `parse_raw_id/1`: tag ids are plain integers.
fn raw_id(id: &ID) -> Result<i64> {
    id.parse::<i64>()
        .map_err(|_| user_error(format!("Invalid ID: {}", id.as_str())))
}

fn change<T>(value: MaybeUndefined<T>) -> Change<T> {
    match value {
        MaybeUndefined::Undefined => None,
        MaybeUndefined::Null => Some(None),
        MaybeUndefined::Value(value) => Some(Some(value)),
    }
}

/// `RelayHelpers.put_optional_node_id/4` for printing ids.
fn printing_change(value: MaybeUndefined<ID>) -> Result<Change<ScryfallId>> {
    Ok(match value {
        MaybeUndefined::Undefined => None,
        MaybeUndefined::Null => Some(None),
        MaybeUndefined::Value(id) if id.is_empty() => Some(None),
        MaybeUndefined::Value(id) => {
            Some(Some(ScryfallId::new(node_str(&id, NodeKind::Printing)?)))
        }
    })
}

async fn hydrate_one(
    ctx: &Context<'_>,
    row: crate::decks::model::DeckCardRow,
) -> Result<Option<DeckCard>> {
    Ok(DeckCard::hydrate(&state(ctx).db, vec![row])
        .await
        .map_err(internal_error)?
        .pop())
}

async fn hydrate(
    ctx: &Context<'_>,
    rows: Vec<crate::decks::model::DeckCardRow>,
) -> Result<Vec<DeckCard>> {
    DeckCard::hydrate(&state(ctx).db, rows)
        .await
        .map_err(internal_error)
}

/// `DeckPlayOutcome`.
#[derive(Enum, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "DeckPlayOutcome")]
pub enum DeckPlayOutcome {
    Played,
    Skipped,
}

/// `DeckSwapCutDestination`.
#[derive(Enum, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "DeckSwapCutDestination")]
pub enum DeckSwapCutDestination {
    Remove,
    Considering,
}

/// `DeckInput`.
#[derive(InputObject)]
#[graphql(name = "DeckInput")]
pub struct DeckInput {
    pub name: String,
    pub format: MaybeUndefined<String>,
    pub status: MaybeUndefined<String>,
    pub included_for_play: MaybeUndefined<bool>,
}

/// `DeckUpdateInput`.
#[derive(InputObject)]
#[graphql(name = "DeckUpdateInput")]
pub struct DeckUpdateInput {
    pub name: MaybeUndefined<String>,
    pub format: MaybeUndefined<String>,
    pub status: MaybeUndefined<String>,
    pub included_for_play: MaybeUndefined<bool>,
    pub play_count: MaybeUndefined<i64>,
    pub skip_count: MaybeUndefined<i64>,
    pub last_played_at: MaybeUndefined<String>,
    pub primer: MaybeUndefined<String>,
    pub cover_deck_card_id: MaybeUndefined<ID>,
}

/// `DeckCardInput`.
#[derive(InputObject)]
#[graphql(name = "DeckCardInput")]
pub struct DeckCardInput {
    pub name: String,
    pub quantity: MaybeUndefined<i64>,
    pub zone: MaybeUndefined<String>,
    pub finish: MaybeUndefined<String>,
    pub preferred_printing_id: MaybeUndefined<ID>,
    pub tag: MaybeUndefined<String>,
}

/// `DeckCardUpdateInput`.
#[derive(InputObject)]
#[graphql(name = "DeckCardUpdateInput")]
pub struct DeckCardUpdateInput {
    pub zone: MaybeUndefined<String>,
    pub quantity: MaybeUndefined<i64>,
    pub finish: MaybeUndefined<String>,
    pub preferred_printing_id: MaybeUndefined<ID>,
    pub tag: MaybeUndefined<String>,
}

impl DeckCardUpdateInput {
    fn changes(self) -> Result<DeckCardChanges> {
        Ok(DeckCardChanges {
            quantity: change(self.quantity),
            proxy_quantity: None,
            zone: change(self.zone),
            finish: change(self.finish),
            preferred_printing_id: printing_change(self.preferred_printing_id)?,
            tag: change(self.tag),
        })
    }
}

/// `DeckPullListEntryInput`, used by `allocateDeckPullList` (deck
/// allocation module).
#[derive(InputObject)]
#[graphql(name = "DeckPullListEntryInput")]
pub struct DeckPullListEntryInput {
    pub deck_card_id: ID,
    pub collection_item_id: ID,
    /// Defaults to 1.
    pub quantity: Option<i64>,
}

/// `DeckSwapCutInput`.
#[derive(InputObject)]
#[graphql(name = "DeckSwapCutInput")]
pub struct DeckSwapCutInput {
    pub deck_card_id: ID,
    pub quantity: i64,
    /// Defaults to `REMOVE`.
    pub destination: Option<DeckSwapCutDestination>,
}

/// `DeckSwapAddInput`.
#[derive(InputObject)]
#[graphql(name = "DeckSwapAddInput")]
pub struct DeckSwapAddInput {
    /// Considering deck card to move into the mainboard.
    pub deck_card_id: Option<ID>,
    /// Card name to add to the mainboard when it is not already on the Considering board.
    pub name: Option<String>,
    pub quantity: i64,
}

/// `DeckSwapInput`.
#[derive(InputObject)]
#[graphql(name = "DeckSwapInput")]
pub struct DeckSwapInput {
    pub cuts: Vec<DeckSwapCutInput>,
    pub adds: Vec<DeckSwapAddInput>,
}

impl DeckSwapInput {
    fn swap(self) -> Result<Swap> {
        let cuts = self
            .cuts
            .into_iter()
            .map(|cut| {
                Ok(SwapCut {
                    deck_card_id: deck_card_id(&cut.deck_card_id)?,
                    quantity: cut.quantity,
                    destination: match cut.destination {
                        Some(DeckSwapCutDestination::Considering) => CutDestination::Considering,
                        Some(DeckSwapCutDestination::Remove) | None => CutDestination::Remove,
                    },
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let adds = self
            .adds
            .into_iter()
            .map(|add| {
                Ok(SwapAdd {
                    deck_card_id: optional_node_int(add.deck_card_id.as_ref(), NodeKind::DeckCard)?
                        .map(DeckCardId),
                    name: add.name,
                    quantity: add.quantity,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Swap { cuts, adds })
    }
}

/// `DeckTagInput`.
#[derive(InputObject)]
#[graphql(name = "DeckTagInput")]
pub struct DeckTagInput {
    pub name: String,
    pub color: MaybeUndefined<String>,
    pub target_count: MaybeUndefined<i64>,
}

impl DeckTagInput {
    fn changes(self) -> DeckTagChanges {
        DeckTagChanges {
            name: Some(Some(self.name)),
            color: change(self.color),
            target_count: change(self.target_count),
            position: None,
        }
    }
}

/// `DefaultDeckTagInput`.
#[derive(InputObject)]
#[graphql(name = "DefaultDeckTagInput")]
pub struct DefaultDeckTagInput {
    pub name: String,
    pub color: String,
    pub target_count: Option<i64>,
}

#[derive(Default)]
pub struct DeckQueries;

#[Object]
impl DeckQueries {
    async fn default_deck_tags(&self, ctx: &Context<'_>) -> Result<Vec<DefaultDeckTag>> {
        let tags = tags::list_default_deck_tags(&state(ctx).db)
            .await
            .map_err(internal_error)?;
        Ok(tags.into_iter().map(DefaultDeckTag).collect())
    }

    /// Decks by name, with their cards loaded in one batch for the summary
    /// fields.
    async fn decks(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
    ) -> Result<DeckConnection> {
        let pool = &state(ctx).db;
        let total = records::count_decks(pool).await.map_err(internal_error)?;
        let args = PageArgs::new(after, first, before, last);
        let (offset, limit) = if args.is_relay() {
            relay::offset_and_limit(&args.with_default_first(100), total)?
        } else {
            (0, 100)
        };
        let rows = records::list_decks(pool, offset, limit)
            .await
            .map_err(internal_error)?;
        let ids: Vec<DeckId> = rows.iter().map(|row| row.id).collect();
        let mut contents = load_contents(pool, &ids).await.map_err(internal_error)?;
        let decks: Vec<Deck> = rows
            .into_iter()
            .map(|row| {
                let loaded = contents.remove(&row.id).unwrap_or_default();
                Deck::with_contents(row, loaded)
            })
            .collect();
        Ok(relay::from_slice(decks, offset, offset > 0, offset + limit < total).into())
    }

    async fn random_deck(&self, ctx: &Context<'_>, exclude_id: Option<ID>) -> Result<Option<Deck>> {
        let exclude = optional_node_int(exclude_id.as_ref(), NodeKind::Deck)?.map(DeckId);
        let random: f64 = rand::random();
        let deck = picker::random_deck(
            &state(ctx).db,
            exclude,
            time::OffsetDateTime::now_utc(),
            random,
        )
        .await
        .map_err(internal_error)?;
        Ok(deck.map(Deck::new))
    }

    async fn deck(&self, ctx: &Context<'_>, id: ID) -> Result<Option<Deck>> {
        let deck = records::get_deck(&state(ctx).db, deck_id(&id)?)
            .await
            .map_err(deck_error)?;
        Ok(Some(Deck::new(deck)))
    }

    async fn shared_deck(&self, ctx: &Context<'_>, token: String) -> Result<Option<Deck>> {
        let deck = records::get_by_share_token(&state(ctx).db, &token)
            .await
            .map_err(internal_error)?;
        Ok(deck.map(Deck::new))
    }

    async fn deck_export_text(&self, ctx: &Context<'_>, id: ID) -> Result<String> {
        let pool = &state(ctx).db;
        let deck = records::get_deck(pool, deck_id(&id)?)
            .await
            .map_err(deck_error)?;
        let contents = crate::decks::contents::load_deck_contents(pool, deck.id)
            .await
            .map_err(internal_error)?;
        Ok(decklist::export(&contents.cards))
    }

    async fn deck_swap_preview(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
        input: DeckSwapInput,
    ) -> Result<DeckSwapPreview> {
        let id = self::deck_id(&deck_id)?;
        let swap = input.swap()?;
        swap::preview(&state(ctx).db, id, &swap)
            .await
            .map(DeckSwapPreview)
            .map_err(deck_swap_error)
    }
}

#[derive(SimpleObject)]
pub struct CreateDeckPayload {
    pub deck: Option<Deck>,
}

#[derive(SimpleObject)]
pub struct UpdateDeckPayload {
    pub deck: Option<Deck>,
}

#[derive(SimpleObject)]
pub struct RecordDeckPlayPayload {
    pub deck: Option<Deck>,
}

#[derive(SimpleObject)]
pub struct EnsureDeckShareTokenPayload {
    pub deck: Option<Deck>,
}

#[derive(SimpleObject)]
pub struct DisableDeckSharingPayload {
    pub deck: Option<Deck>,
}

#[derive(SimpleObject)]
pub struct RotateDeckShareTokenPayload {
    pub deck: Option<Deck>,
}

#[derive(SimpleObject)]
pub struct LinkDeckExternalSourcePayload {
    pub deck: Option<Deck>,
    pub unresolved: Vec<String>,
}

#[derive(SimpleObject)]
pub struct UnlinkDeckExternalSourcePayload {
    pub deck: Option<Deck>,
}

#[derive(SimpleObject)]
pub struct SyncDeckExternalSourcePayload {
    pub deck: Option<Deck>,
    pub unresolved: Vec<String>,
}

#[derive(SimpleObject)]
pub struct AddDeckCardPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct ImportDecklistPayload {
    pub import_result: Option<DeckImportResult>,
}

#[derive(SimpleObject)]
pub struct DeleteDeckPayload {
    pub deck: Option<Deck>,
}

#[derive(SimpleObject)]
pub struct UpdateDeckCardPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct UpdateDeckCardsTagPayload {
    pub deck_cards: Vec<DeckCard>,
}

#[derive(SimpleObject)]
pub struct CreateDeckTagPayload {
    pub deck_tag: Option<DeckTag>,
}

#[derive(SimpleObject)]
pub struct UpdateDeckTagPayload {
    pub deck_tag: Option<DeckTag>,
}

#[derive(SimpleObject)]
pub struct DeleteDeckTagPayload {
    pub deck_tag_id: ID,
}

#[derive(SimpleObject)]
pub struct ReorderDeckTagsPayload {
    pub tags: Vec<DeckTag>,
}

#[derive(SimpleObject)]
pub struct ReplaceDefaultDeckTagsPayload {
    pub tags: Vec<DefaultDeckTag>,
}

#[derive(SimpleObject)]
pub struct AssignDeckCardTagPayload {
    pub deck_card: Option<DeckCard>,
    pub deck_tags: Vec<DeckTag>,
}

#[derive(SimpleObject)]
pub struct UnassignDeckCardTagPayload {
    pub deck_card: Option<DeckCard>,
    pub deck_tags: Vec<DeckTag>,
}

#[derive(SimpleObject)]
pub struct BulkUpdateDeckCardsPayload {
    pub deck_cards: Vec<DeckCard>,
}

#[derive(SimpleObject)]
pub struct ApplyDeckSwapPayload {
    pub deck: Deck,
}

#[derive(SimpleObject)]
pub struct BulkDeleteDeckCardsPayload {
    pub deck_cards: Vec<DeckCard>,
}

#[derive(SimpleObject)]
pub struct OptimizeDeckCardPrintingsPayload {
    pub deck_cards: Vec<DeckCard>,
}

#[derive(SimpleObject)]
pub struct DeleteDeckCardPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct SetDeckCommanderPayload {
    pub deck_card: Option<DeckCard>,
}

#[derive(SimpleObject)]
pub struct AddDeckPartnerPayload {
    pub deck_card: Option<DeckCard>,
}

fn external_error(error: &external::SyncError) -> async_graphql::Error {
    match error.graphql_message() {
        Some(message) => user_error(message),
        None => internal_error(error),
    }
}

async fn tags_of(ctx: &Context<'_>, deck: DeckId) -> Result<Vec<DeckTag>> {
    Ok(tags::list_deck_tags(&state(ctx).db, deck)
        .await
        .map_err(internal_error)?
        .into_iter()
        .map(DeckTag)
        .collect())
}

#[derive(Default)]
pub struct DeckMutations;

#[Object]
impl DeckMutations {
    async fn create_deck(
        &self,
        ctx: &Context<'_>,
        input: DeckInput,
    ) -> Result<Option<CreateDeckPayload>> {
        let changes = DeckChanges {
            name: Some(Some(input.name)),
            format: change(input.format),
            status: change(input.status),
            included_for_play: change(input.included_for_play),
            ..DeckChanges::default()
        };
        let deck = records::create_deck(&state(ctx).db, &changes)
            .await
            .map_err(deck_error)?;
        Ok(Some(CreateDeckPayload {
            deck: Some(Deck::new(deck)),
        }))
    }

    async fn update_deck(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: DeckUpdateInput,
    ) -> Result<Option<UpdateDeckPayload>> {
        let id = deck_id(&id)?;
        let cover = match input.cover_deck_card_id {
            MaybeUndefined::Undefined => None,
            MaybeUndefined::Null => Some(None),
            MaybeUndefined::Value(cover) => {
                Some(optional_node_int(Some(&cover), NodeKind::DeckCard)?.map(DeckCardId))
            }
        };
        let changes = DeckChanges {
            name: change(input.name),
            format: change(input.format),
            status: change(input.status),
            included_for_play: change(input.included_for_play),
            play_count: change(input.play_count),
            skip_count: change(input.skip_count),
            last_played_at: change(input.last_played_at),
            primer: change(input.primer),
            cover_deck_card_id: cover,
        };
        let deck = records::update_deck(&state(ctx).db, id, &changes)
            .await
            .map_err(deck_error)?;
        Ok(Some(UpdateDeckPayload {
            deck: Some(Deck::new(deck)),
        }))
    }

    async fn record_deck_play(
        &self,
        ctx: &Context<'_>,
        id: ID,
        outcome: DeckPlayOutcome,
    ) -> Result<Option<RecordDeckPlayPayload>> {
        let outcome = match outcome {
            DeckPlayOutcome::Played => PlayOutcome::Played,
            DeckPlayOutcome::Skipped => PlayOutcome::Skipped,
        };
        let deck = records::record_play(&state(ctx).db, deck_id(&id)?, outcome)
            .await
            .map_err(deck_error)?;
        Ok(Some(RecordDeckPlayPayload {
            deck: Some(Deck::new(deck)),
        }))
    }

    async fn ensure_deck_share_token(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<EnsureDeckShareTokenPayload>> {
        let deck = records::ensure_share_token(&state(ctx).db, deck_id(&id)?)
            .await
            .map_err(deck_error)?;
        Ok(Some(EnsureDeckShareTokenPayload {
            deck: Some(Deck::new(deck)),
        }))
    }

    async fn disable_deck_sharing(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DisableDeckSharingPayload>> {
        let deck = records::disable_sharing(&state(ctx).db, deck_id(&id)?)
            .await
            .map_err(deck_error)?;
        Ok(Some(DisableDeckSharingPayload {
            deck: Some(Deck::new(deck)),
        }))
    }

    async fn rotate_deck_share_token(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<RotateDeckShareTokenPayload>> {
        let deck = records::rotate_share_token(&state(ctx).db, deck_id(&id)?)
            .await
            .map_err(deck_error)?;
        Ok(Some(RotateDeckShareTokenPayload {
            deck: Some(Deck::new(deck)),
        }))
    }

    async fn link_deck_external_source(
        &self,
        ctx: &Context<'_>,
        id: ID,
        url: String,
    ) -> Result<Option<LinkDeckExternalSourcePayload>> {
        let synced = external::link(state(ctx), deck_id(&id)?, &url)
            .await
            .map_err(|error| external_error(&error))?;
        Ok(Some(LinkDeckExternalSourcePayload {
            deck: Some(Deck::new(synced.deck)),
            unresolved: synced.unresolved,
        }))
    }

    async fn unlink_deck_external_source(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<UnlinkDeckExternalSourcePayload>> {
        let deck = external::unlink(&state(ctx).db, deck_id(&id)?)
            .await
            .map_err(|error| external_error(&error.into()))?;
        Ok(Some(UnlinkDeckExternalSourcePayload {
            deck: Some(Deck::new(deck)),
        }))
    }

    async fn sync_deck_external_source(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<SyncDeckExternalSourcePayload>> {
        let synced = external::sync(state(ctx), deck_id(&id)?)
            .await
            .map_err(|error| external_error(&error))?;
        Ok(Some(SyncDeckExternalSourcePayload {
            deck: Some(Deck::new(synced.deck)),
            unresolved: synced.unresolved,
        }))
    }

    async fn add_deck_card(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
        input: DeckCardInput,
    ) -> Result<Option<AddDeckCardPayload>> {
        let id = self::deck_id(&deck_id)?;
        let new = NewDeckCard {
            card: CardRef::Name(input.name),
            changes: DeckCardChanges {
                quantity: change(input.quantity),
                proxy_quantity: None,
                zone: change(input.zone),
                finish: change(input.finish),
                preferred_printing_id: printing_change(input.preferred_printing_id)?,
                tag: change(input.tag),
            },
        };
        let row = cards::add_card_to_deck(&state(ctx).db, id, &new)
            .await
            .map_err(add_card_error)?;
        Ok(Some(AddDeckCardPayload {
            deck_card: hydrate_one(ctx, row).await?,
        }))
    }

    async fn import_decklist(
        &self,
        ctx: &Context<'_>,
        id: ID,
        text: String,
        replace_existing: Option<bool>,
        zone: Option<String>,
    ) -> Result<Option<ImportDecklistPayload>> {
        let result = decklist::import_decklist(
            &state(ctx).db,
            deck_id(&id)?,
            &text,
            replace_existing.unwrap_or(false),
            zone.as_deref(),
        )
        .await
        .map_err(deck_import_error)?;
        Ok(Some(ImportDecklistPayload {
            import_result: Some(DeckImportResult(result)),
        }))
    }

    async fn delete_deck(&self, ctx: &Context<'_>, id: ID) -> Result<Option<DeleteDeckPayload>> {
        let deck = records::delete_deck(&state(ctx).db, deck_id(&id)?)
            .await
            .map_err(deck_import_error)?;
        Ok(Some(DeleteDeckPayload {
            deck: Some(Deck::new(deck)),
        }))
    }

    async fn update_deck_card(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: DeckCardUpdateInput,
    ) -> Result<Option<UpdateDeckCardPayload>> {
        let id = deck_card_id(&id)?;
        let changes = input.changes()?;
        let row = cards::update_deck_card(&state(ctx).db, id, &changes)
            .await
            .map_err(deck_edit_error)?;
        Ok(Some(UpdateDeckCardPayload {
            deck_card: hydrate_one(ctx, row).await?,
        }))
    }

    async fn update_deck_cards_tag(
        &self,
        ctx: &Context<'_>,
        deck_card_ids: Vec<ID>,
        tag: Option<String>,
    ) -> Result<Option<UpdateDeckCardsTagPayload>> {
        let ids = self::deck_card_ids(&deck_card_ids)?;
        let rows = cards::update_tags(&state(ctx).db, &ids, tag)
            .await
            .map_err(deck_edit_error)?;
        Ok(Some(UpdateDeckCardsTagPayload {
            deck_cards: hydrate(ctx, rows).await?,
        }))
    }

    async fn create_deck_tag(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
        input: DeckTagInput,
    ) -> Result<Option<CreateDeckTagPayload>> {
        let pool = &state(ctx).db;
        let deck = records::get_deck(pool, self::deck_id(&deck_id)?)
            .await
            .map_err(deck_error)?;
        let tag = tags::create_deck_tag(pool, deck.id, &input.changes())
            .await
            .map_err(tag_error)?;
        Ok(Some(CreateDeckTagPayload {
            deck_tag: Some(DeckTag(tag)),
        }))
    }

    async fn update_deck_tag(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: DeckTagInput,
    ) -> Result<Option<UpdateDeckTagPayload>> {
        let tag = tags::update_deck_tag(&state(ctx).db, raw_id(&id)?, &input.changes())
            .await
            .map_err(tag_error)?;
        Ok(Some(UpdateDeckTagPayload {
            deck_tag: Some(DeckTag(tag)),
        }))
    }

    async fn delete_deck_tag(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DeleteDeckTagPayload>> {
        let tag = tags::delete_deck_tag(&state(ctx).db, raw_id(&id)?)
            .await
            .map_err(tag_error)?;
        Ok(Some(DeleteDeckTagPayload {
            deck_tag_id: ID(tag.id.to_string()),
        }))
    }

    async fn reorder_deck_tags(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
        tag_ids: Vec<ID>,
    ) -> Result<Option<ReorderDeckTagsPayload>> {
        let pool = &state(ctx).db;
        let id = self::deck_id(&deck_id)?;
        let ordered = tag_ids.iter().map(raw_id).collect::<Result<Vec<i64>>>()?;
        let deck = records::get_deck(pool, id).await.map_err(deck_error)?;
        let tags = tags::reorder_deck_tags(pool, deck.id, &ordered)
            .await
            .map_err(deck_edit_error)?;
        Ok(Some(ReorderDeckTagsPayload {
            tags: tags.into_iter().map(DeckTag).collect(),
        }))
    }

    async fn replace_default_deck_tags(
        &self,
        ctx: &Context<'_>,
        tags: Vec<DefaultDeckTagInput>,
    ) -> Result<Option<ReplaceDefaultDeckTagsPayload>> {
        let entries: Vec<DefaultTagEntry> = tags
            .into_iter()
            .map(|tag| DefaultTagEntry {
                name: tag.name,
                color: tag.color,
                target_count: tag.target_count,
            })
            .collect();
        let tags = tags::replace_default_deck_tags(&state(ctx).db, &entries)
            .await
            .map_err(deck_error)?;
        Ok(Some(ReplaceDefaultDeckTagsPayload {
            tags: tags.into_iter().map(DefaultDeckTag).collect(),
        }))
    }

    async fn assign_deck_card_tag(
        &self,
        ctx: &Context<'_>,
        deck_card_id: ID,
        tag_id: ID,
    ) -> Result<Option<AssignDeckCardTagPayload>> {
        let card_id = self::deck_card_id(&deck_card_id)?;
        let tag_id = raw_id(&tag_id)?;
        let deck = tags::assign_deck_card_tag(&state(ctx).db, card_id, tag_id)
            .await
            .map_err(card_tag_error)?;
        Ok(Some(AssignDeckCardTagPayload {
            deck_card: DeckCard::load(&state(ctx).db, card_id)
                .await
                .map_err(internal_error)?,
            deck_tags: tags_of(ctx, deck).await?,
        }))
    }

    async fn unassign_deck_card_tag(
        &self,
        ctx: &Context<'_>,
        deck_card_id: ID,
        tag_id: ID,
    ) -> Result<Option<UnassignDeckCardTagPayload>> {
        let card_id = self::deck_card_id(&deck_card_id)?;
        let tag_id = raw_id(&tag_id)?;
        let deck = tags::unassign_deck_card_tag(&state(ctx).db, card_id, tag_id)
            .await
            .map_err(card_tag_error)?;
        Ok(Some(UnassignDeckCardTagPayload {
            deck_card: DeckCard::load(&state(ctx).db, card_id)
                .await
                .map_err(internal_error)?,
            deck_tags: tags_of(ctx, deck).await?,
        }))
    }

    async fn bulk_update_deck_cards(
        &self,
        ctx: &Context<'_>,
        deck_card_ids: Vec<ID>,
        input: DeckCardUpdateInput,
    ) -> Result<Option<BulkUpdateDeckCardsPayload>> {
        let ids = self::deck_card_ids(&deck_card_ids)?;
        let changes = input.changes()?;
        let rows = cards::bulk_update(&state(ctx).db, &ids, &changes)
            .await
            .map_err(deck_edit_error)?;
        Ok(Some(BulkUpdateDeckCardsPayload {
            deck_cards: hydrate(ctx, rows).await?,
        }))
    }

    async fn apply_deck_swap(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
        input: DeckSwapInput,
    ) -> Result<Option<ApplyDeckSwapPayload>> {
        let id = self::deck_id(&deck_id)?;
        let swap = input.swap()?;
        let deck = swap::apply(&state(ctx).db, id, &swap)
            .await
            .map_err(deck_swap_error)?;
        Ok(Some(ApplyDeckSwapPayload {
            deck: Deck::new(deck),
        }))
    }

    async fn bulk_delete_deck_cards(
        &self,
        ctx: &Context<'_>,
        deck_card_ids: Vec<ID>,
    ) -> Result<Option<BulkDeleteDeckCardsPayload>> {
        let ids = self::deck_card_ids(&deck_card_ids)?;
        let rows = cards::bulk_delete(&state(ctx).db, &ids)
            .await
            .map_err(deck_edit_error)?;
        Ok(Some(BulkDeleteDeckCardsPayload {
            deck_cards: hydrate(ctx, rows).await?,
        }))
    }

    async fn optimize_deck_card_printings(
        &self,
        ctx: &Context<'_>,
        deck_card_ids: Vec<ID>,
    ) -> Result<Option<OptimizeDeckCardPrintingsPayload>> {
        let ids = self::deck_card_ids(&deck_card_ids)?;
        let app = state(ctx);
        let rows = cards::optimize_printings(&app.db, &app.prices, &ids)
            .await
            .map_err(deck_edit_error)?;
        Ok(Some(OptimizeDeckCardPrintingsPayload {
            deck_cards: hydrate(ctx, rows).await?,
        }))
    }

    async fn delete_deck_card(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DeleteDeckCardPayload>> {
        let row = cards::delete_deck_card(&state(ctx).db, deck_card_id(&id)?)
            .await
            .map_err(deck_edit_error)?;
        Ok(Some(DeleteDeckCardPayload {
            deck_card: hydrate_one(ctx, row).await?,
        }))
    }

    async fn set_deck_commander(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<SetDeckCommanderPayload>> {
        let row = cards::set_commander(&state(ctx).db, deck_card_id(&id)?)
            .await
            .map_err(commander_error)?;
        Ok(Some(SetDeckCommanderPayload {
            deck_card: hydrate_one(ctx, row).await?,
        }))
    }

    async fn add_deck_partner(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<AddDeckPartnerPayload>> {
        let row = cards::add_partner(&state(ctx).db, deck_card_id(&id)?)
            .await
            .map_err(commander_error)?;
        Ok(Some(AddDeckPartnerPayload {
            deck_card: hydrate_one(ctx, row).await?,
        }))
    }

    // Allocation mutations are in `deck_intel` (`AllocationMutations`,
    // `DeckIntelMutations`); analyzeDeck/askDeckQuestion in `ai::schema`.
}
