//! Trade GraphQL (`ManavaultWeb.Schema.Catalog.TradeTypes`,
//! `TradeOperations`, `TradeMutations`, `TradeListTypes`,
//! `TradeListOperations`, `TradeListResolvers`).

use async_graphql::{Context, ID, Object, SimpleObject};

use crate::catalog::card::Card;
use crate::catalog::price::format_cents;
use crate::catalog::printing::Printing;
use crate::graphql::relay::node_int;
use crate::graphql::{NodeKind, Result, global_id, internal_error, state, user_error};
use crate::trade::binder::BinderEntry;
use crate::trade::collection_check::{self, CheckCard, CheckResult};
use crate::trade::collection_item_stub::BinderItem;
use crate::trade::deck_diff::{self, DiffChange, DiffEntry, DiffError, DiffResult};
use crate::trade::entry_resolver;
use crate::trade::list_source::{self, ResolveError, ResolvedList};
use crate::trade::matcher::{self, BinderMatch, MatchResult, WantMatch};
use crate::trade::share::{self, ShareKind, WantsEntry};
use crate::trade::want::{self, CreateWantError, UpdateWantError, Want};

/// `TradeWant`.
#[Object(name = "TradeWant")]
impl Want {
    async fn id(&self) -> ID {
        ID(self.id.to_string())
    }

    async fn quantity(&self) -> i64 {
        self.quantity.as_i64()
    }

    async fn card(&self, ctx: &Context<'_>) -> Result<Option<Card>> {
        crate::catalog::loader::card(ctx, &self.oracle_id).await
    }

    async fn printing(&self, ctx: &Context<'_>) -> Result<Option<Printing>> {
        match &self.preferred_printing_id {
            Some(id) => Printing::load(&state(ctx).db, id)
                .await
                .map_err(internal_error),
            None => Ok(None),
        }
    }

    async fn image_url(&self) -> Option<String> {
        self.display_image_url()
    }
}

/// `WantsListEntry`.
#[Object(name = "WantsListEntry")]
impl WantsEntry {
    async fn card_name(&self) -> &str {
        &self.card_name
    }

    async fn quantity(&self) -> i64 {
        self.quantity
    }

    async fn type_line(&self) -> Option<&str> {
        self.type_line.as_deref()
    }

    async fn set_code(&self) -> Option<&str> {
        self.set_code.as_deref()
    }

    async fn collector_number(&self) -> Option<&str> {
        self.collector_number.as_deref()
    }

    async fn image_url(&self) -> Option<&str> {
        self.image_url.as_deref()
    }
}

/// `BinderListEntry`.
#[Object(name = "BinderListEntry")]
impl BinderEntry {
    async fn card_name(&self) -> &str {
        &self.card_name
    }

    async fn quantity(&self) -> i64 {
        self.quantity
    }

    async fn type_line(&self) -> Option<&str> {
        self.type_line.as_deref()
    }

    async fn set_code(&self) -> Option<&str> {
        self.set_code.as_deref()
    }

    async fn collector_number(&self) -> Option<&str> {
        self.collector_number.as_deref()
    }

    async fn image_url(&self) -> Option<&str> {
        self.image_url.as_deref()
    }

    async fn finish(&self) -> Option<&str> {
        Some(&self.finish)
    }

    async fn condition(&self) -> Option<&str> {
        Some(&self.condition)
    }
}

/// `BinderList`.
#[derive(SimpleObject)]
pub struct BinderList {
    pub entries: Vec<BinderEntry>,
}

/// `WantsList`.
#[derive(SimpleObject)]
pub struct WantsList {
    pub entries: Vec<WantsEntry>,
}

/// `CollectionCheckResult`.
#[Object(name = "CollectionCheckResult")]
impl CheckResult {
    async fn source_name(&self) -> Option<&str> {
        self.source_name.as_deref()
    }

    async fn entry_count(&self) -> i64 {
        self.entry_count
    }

    async fn requested_quantity(&self) -> i64 {
        self.requested_quantity
    }

    async fn excluded_quantity(&self) -> i64 {
        self.excluded_quantity
    }

    async fn available_quantity(&self) -> i64 {
        self.available_quantity
    }

    async fn unavailable_quantity(&self) -> i64 {
        self.unavailable_quantity
    }

    async fn missing_quantity(&self) -> i64 {
        self.missing_quantity
    }

    async fn estimated_cost_cents(&self) -> i64 {
        self.estimated_cost_cents
    }

    async fn estimated_cost_text(&self) -> String {
        self.cost_text()
    }

    async fn unpriced_quantity(&self) -> i64 {
        self.unpriced_quantity
    }

    async fn unrecognized(&self) -> &[String] {
        &self.unrecognized
    }

    async fn cards(&self) -> &[CheckCard] {
        &self.cards
    }
}

/// `CollectionCheckCard`.
#[Object(name = "CollectionCheckCard")]
impl CheckCard {
    async fn card_name(&self) -> &str {
        &self.card_name
    }

    async fn oracle_id(&self) -> ID {
        ID(self.oracle_id.to_string())
    }

    async fn required(&self) -> i64 {
        self.required
    }

    async fn owned(&self) -> i64 {
        self.owned
    }

    async fn available(&self) -> i64 {
        self.available
    }

    async fn unavailable(&self) -> i64 {
        self.unavailable
    }

    async fn missing(&self) -> i64 {
        self.missing
    }

    async fn to_source(&self) -> i64 {
        self.to_source
    }

    async fn status(&self) -> &str {
        self.status.as_str()
    }

    async fn printing(&self) -> Option<&Printing> {
        self.printing.as_ref()
    }

    async fn set_code(&self) -> Option<&str> {
        self.printing
            .as_ref()
            .map(|printing| printing.set_code.as_str())
    }

    async fn collector_number(&self) -> Option<&str> {
        self.printing
            .as_ref()
            .map(|printing| printing.collector_number.as_str())
    }

    async fn unit_price_cents(&self) -> Option<i64> {
        self.unit_price_cents
    }

    async fn unit_price_text(&self) -> Option<String> {
        format_cents(self.unit_price_cents)
    }

    async fn total_price_cents(&self) -> Option<i64> {
        self.total_price_cents
    }

    async fn total_price_text(&self) -> Option<String> {
        format_cents(self.total_price_cents)
    }
}

/// `TradeMatchResult`.
#[Object(name = "TradeMatchResult")]
impl MatchResult {
    async fn source_name(&self) -> Option<&str> {
        self.source_name.as_deref()
    }

    async fn entry_count(&self) -> i64 {
        self.entry_count
    }

    async fn unrecognized(&self) -> &[String] {
        &self.unrecognized
    }

    async fn binder_matches(&self) -> &[BinderMatch] {
        &self.binder_matches
    }

    async fn want_matches(&self) -> &[WantMatch] {
        &self.want_matches
    }
}

/// `TradeBinderMatch`.
#[Object(name = "TradeBinderMatch")]
impl BinderMatch {
    async fn card_name(&self) -> &str {
        &self.card_name
    }

    async fn oracle_id(&self) -> ID {
        ID(self.oracle_id.to_string())
    }

    async fn their_quantity(&self) -> i64 {
        self.their_quantity
    }

    async fn items(&self) -> &[BinderItem] {
        &self.items
    }
}

/// `TradeWantMatch`.
#[Object(name = "TradeWantMatch")]
impl WantMatch {
    async fn card_name(&self) -> &str {
        &self.card_name
    }

    async fn oracle_id(&self) -> ID {
        ID(self.oracle_id.to_string())
    }

    async fn their_quantity(&self) -> i64 {
        self.their_quantity
    }

    async fn want(&self) -> &Want {
        &self.want
    }
}

/// `DeckDiffResult`.
#[Object(name = "DeckDiffResult")]
impl DiffResult {
    async fn source_name(&self) -> Option<&str> {
        self.source_name.as_deref()
    }

    async fn adds(&self) -> &[DiffEntry] {
        &self.adds
    }

    async fn cuts(&self) -> &[DiffEntry] {
        &self.cuts
    }

    async fn changes(&self) -> &[DiffChange] {
        &self.changes
    }

    async fn unrecognized(&self) -> &[String] {
        &self.unrecognized
    }
}

fn deck_card_ids(ids: &[i64]) -> Vec<ID> {
    ids.iter()
        .map(|id| global_id(NodeKind::DeckCard, id))
        .collect()
}

/// `DeckDiffEntry`.
#[Object(name = "DeckDiffEntry")]
impl DiffEntry {
    async fn card_name(&self) -> &str {
        &self.card_name
    }

    async fn quantity(&self) -> i64 {
        self.quantity
    }

    async fn oracle_id(&self) -> Option<ID> {
        self.oracle_id.as_ref().map(|id| ID(id.to_string()))
    }

    async fn image_url(&self) -> Option<&str> {
        self.image_url.as_deref()
    }

    /// Relay ids of the deck cards behind a cut row (empty for adds), for
    /// `updateDeckCardsTag`.
    async fn deck_card_ids(&self) -> Vec<ID> {
        deck_card_ids(&self.deck_card_ids)
    }
}

/// `DeckDiffChange`.
#[Object(name = "DeckDiffChange")]
impl DiffChange {
    async fn card_name(&self) -> &str {
        &self.card_name
    }

    async fn from_quantity(&self) -> i64 {
        self.from_quantity
    }

    async fn to_quantity(&self) -> i64 {
        self.to_quantity
    }

    async fn oracle_id(&self) -> Option<ID> {
        self.oracle_id.as_ref().map(|id| ID(id.to_string()))
    }

    async fn deck_card_ids(&self) -> Vec<ID> {
        deck_card_ids(&self.deck_card_ids)
    }
}

#[derive(SimpleObject)]
pub struct CreateTradeWantPayload {
    pub trade_want: Option<Want>,
}

#[derive(SimpleObject)]
pub struct UpdateTradeWantPayload {
    pub trade_want: Option<Want>,
}

#[derive(SimpleObject)]
pub struct DeleteTradeWantPayload {
    pub deleted_id: ID,
}

#[derive(SimpleObject)]
pub struct EnsureTradeWantsShareTokenPayload {
    pub token: String,
}

#[derive(SimpleObject)]
pub struct EnsureTradeBinderShareTokenPayload {
    pub token: String,
}

#[derive(SimpleObject)]
pub struct DisableTradeWantsSharingPayload {
    pub success: bool,
}

#[derive(SimpleObject)]
pub struct RotateTradeWantsShareTokenPayload {
    pub token: String,
}

#[derive(SimpleObject)]
pub struct DisableTradeBinderSharingPayload {
    pub success: bool,
}

#[derive(SimpleObject)]
pub struct RotateTradeBinderShareTokenPayload {
    pub token: String,
}

/// The owner's want list and share tokens.
#[derive(Default)]
pub struct TradeQueries;

#[Object]
impl TradeQueries {
    async fn trade_wants(&self, ctx: &Context<'_>) -> Result<Vec<Want>> {
        want::list(&state(ctx).db).await.map_err(internal_error)
    }

    async fn trade_wants_share_token(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        share::token(&state(ctx).db, ShareKind::Wants)
            .await
            .map_err(internal_error)
    }

    async fn trade_binder_share_token(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        share::token(&state(ctx).db, ShareKind::Binder)
            .await
            .map_err(internal_error)
    }
}

/// `binderList(id:)` and `wantsList(id:)`, served by both the owner schema
/// (so codegen-validated documents can serve the share pages) and the public
/// share schema (`/share/graphql`); merge this object into both.
#[derive(Default)]
pub struct ShareListQueries;

#[Object]
impl ShareListQueries {
    async fn binder_list(&self, ctx: &Context<'_>, id: ID) -> Result<Option<BinderList>> {
        Ok(share::binder_list(&state(ctx).db, id.as_str())
            .await
            .map_err(internal_error)?
            .map(|entries| BinderList { entries }))
    }

    async fn wants_list(&self, ctx: &Context<'_>, id: ID) -> Result<Option<WantsList>> {
        Ok(share::wants_list(&state(ctx).db, id.as_str())
            .await
            .map_err(internal_error)?
            .map(|entries| WantsList { entries }))
    }
}

/// `TradeMutations.parse_raw_id/1`: want ids are raw integers, not global ids.
fn raw_id(id: &ID) -> Result<i64> {
    id.parse()
        .map_err(|_| user_error(format!("Invalid ID: {}", id.as_str())))
}

const WANT_NOT_FOUND: &str = "Want was not found.";

fn resolve_error(error: ResolveError) -> async_graphql::Error {
    match error {
        ResolveError::User(message) => user_error(message),
        ResolveError::Db(error) => internal_error(error),
    }
}

async fn resolve_list(
    ctx: &Context<'_>,
    url: Option<&str>,
    text: Option<&str>,
) -> Result<ResolvedList> {
    let state = state(ctx);
    list_source::resolve(&state.db, &state.config, url, text)
        .await
        .map_err(resolve_error)
}

/// Want-list and share-token mutations, plus the trade list tools.
#[derive(Default)]
pub struct TradeMutations;

#[Object]
impl TradeMutations {
    async fn create_trade_want(
        &self,
        ctx: &Context<'_>,
        name: Option<String>,
        scryfall_id: Option<ID>,
        quantity: Option<i64>,
    ) -> Result<Option<CreateTradeWantPayload>> {
        let pool = &state(ctx).db;
        let (result, not_found) = match (name, scryfall_id) {
            (Some(_), Some(_)) => {
                return Err(user_error("Provide either name or scryfall_id, not both."));
            }
            (Some(name), None) => (
                want::create_by_name(pool, &name, quantity).await,
                format!("No card found named \"{name}\"."),
            ),
            (None, Some(scryfall_id)) => (
                want::create_by_printing(pool, scryfall_id.as_str(), quantity).await,
                format!("No printing found for \"{}\".", scryfall_id.as_str()),
            ),
            (None, None) => return Err(user_error("Provide a name or a scryfall_id.")),
        };
        match result {
            Ok(want) => Ok(Some(CreateTradeWantPayload {
                trade_want: Some(want),
            })),
            Err(CreateWantError::NotFound) => Err(user_error(not_found)),
            Err(CreateWantError::Db(error)) => Err(internal_error(error)),
        }
    }

    async fn update_trade_want(
        &self,
        ctx: &Context<'_>,
        id: ID,
        quantity: i64,
    ) -> Result<Option<UpdateTradeWantPayload>> {
        let id = raw_id(&id)?;
        let pool = &state(ctx).db;
        if want::get(pool, id).await.map_err(internal_error)?.is_none() {
            return Err(user_error(WANT_NOT_FOUND));
        }
        match want::update_quantity(pool, id, quantity).await {
            Ok(Some(want)) => Ok(Some(UpdateTradeWantPayload {
                trade_want: Some(want),
            })),
            Ok(None) => Err(user_error(WANT_NOT_FOUND)),
            Err(error @ UpdateWantError::InvalidQuantity) => Err(user_error(error.to_string())),
            Err(UpdateWantError::Db(error)) => Err(internal_error(error)),
        }
    }

    async fn delete_trade_want(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DeleteTradeWantPayload>> {
        let id = raw_id(&id)?;
        if want::delete(&state(ctx).db, id)
            .await
            .map_err(internal_error)?
        {
            Ok(Some(DeleteTradeWantPayload {
                deleted_id: ID(id.to_string()),
            }))
        } else {
            Err(user_error(WANT_NOT_FOUND))
        }
    }

    async fn ensure_trade_wants_share_token(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<EnsureTradeWantsShareTokenPayload>> {
        let token = share::ensure_token(&state(ctx).db, ShareKind::Wants)
            .await
            .map_err(internal_error)?;
        Ok(Some(EnsureTradeWantsShareTokenPayload { token }))
    }

    async fn ensure_trade_binder_share_token(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<EnsureTradeBinderShareTokenPayload>> {
        let token = share::ensure_token(&state(ctx).db, ShareKind::Binder)
            .await
            .map_err(internal_error)?;
        Ok(Some(EnsureTradeBinderShareTokenPayload { token }))
    }

    async fn disable_trade_wants_sharing(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<DisableTradeWantsSharingPayload>> {
        share::disable(&state(ctx).db, ShareKind::Wants)
            .await
            .map_err(internal_error)?;
        Ok(Some(DisableTradeWantsSharingPayload { success: true }))
    }

    async fn rotate_trade_wants_share_token(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<RotateTradeWantsShareTokenPayload>> {
        let token = rotate(ctx, ShareKind::Wants).await?;
        Ok(Some(RotateTradeWantsShareTokenPayload { token }))
    }

    async fn disable_trade_binder_sharing(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<DisableTradeBinderSharingPayload>> {
        share::disable(&state(ctx).db, ShareKind::Binder)
            .await
            .map_err(internal_error)?;
        Ok(Some(DisableTradeBinderSharingPayload { success: true }))
    }

    async fn rotate_trade_binder_share_token(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<RotateTradeBinderShareTokenPayload>> {
        let token = rotate(ctx, ShareKind::Binder).await?;
        Ok(Some(RotateTradeBinderShareTokenPayload { token }))
    }

    /// Checks a pasted list or deck link against unallocated collection
    /// copies and replacement prices.
    async fn collection_check(
        &self,
        ctx: &Context<'_>,
        url: Option<String>,
        text: Option<String>,
        include_considering: Option<bool>,
    ) -> Result<CheckResult> {
        let list = resolve_list(ctx, url.as_deref(), text.as_deref()).await?;
        let state = state(ctx);
        collection_check::check(
            &state.db,
            &state.prices,
            list,
            include_considering.unwrap_or(false),
        )
        .await
        .map_err(internal_error)
    }

    /// Matches a pasted list or deck link against the trade binder and the
    /// want list.
    async fn trade_matches(
        &self,
        ctx: &Context<'_>,
        url: Option<String>,
        text: Option<String>,
    ) -> Result<MatchResult> {
        let list = resolve_list(ctx, url.as_deref(), text.as_deref()).await?;
        let pool = &state(ctx).db;
        let resolved = entry_resolver::resolve(pool, list.entries)
            .await
            .map_err(internal_error)?;
        matcher::match_list(pool, list.source_name, resolved)
            .await
            .map_err(internal_error)
    }

    /// Diffs a pasted list or deck link against a deck's non-considering
    /// cards.
    async fn deck_diff(
        &self,
        ctx: &Context<'_>,
        deck_id: ID,
        url: Option<String>,
        text: Option<String>,
    ) -> Result<DiffResult> {
        let deck_id = node_int(&deck_id, NodeKind::Deck)?;
        let list = resolve_list(ctx, url.as_deref(), text.as_deref()).await?;
        let pool = &state(ctx).db;
        let resolved = entry_resolver::resolve(pool, list.entries)
            .await
            .map_err(internal_error)?;
        deck_diff::diff(pool, deck_id, list.source_name, resolved)
            .await
            .map_err(|error| match error {
                DiffError::NotFound => user_error(deck_diff::NOT_FOUND),
                DiffError::Db(error) => internal_error(error),
            })
    }
}

async fn rotate(ctx: &Context<'_>, kind: ShareKind) -> Result<String> {
    share::rotate(&state(ctx).db, kind)
        .await
        .map_err(|error| match error {
            share::RotateError::Collision => user_error(error.to_string()),
            share::RotateError::Db(error) => internal_error(error),
        })
}
