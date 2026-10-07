//! `ManavaultWeb.PublicShareSchema`: the read-only GraphQL API behind
//! `/share/graphql`. Every root field takes a share token (or a card id) and
//! answers `null` (or an empty result) for anything that is not currently
//! shared.

use std::sync::LazyLock;

use async_graphql::{Context, EmptyMutation, EmptySubscription, ID, Object, Schema};
use lotus::OracleId;
use manavault_allocation::BuylistOptions;

use super::types::{PublicBuylistEntry, PublicCard, PublicDeck, PublicNode};
use crate::deck_intel::buylist::{self, PrintingMode};
use crate::decks::records;
use crate::graphql::relay::node_str;
use crate::graphql::{NodeKind, Result, internal_error, state};
use crate::trade::schema::{BinderList, WantsList};
use crate::web::public_graphql::MAX_DEPTH;

/// The public schema type.
pub type PublicSchema = Schema<PublicQuery, EmptyMutation, EmptySubscription>;

/// `public_shared_deck/1`: the deck currently shared as `token`. Malformed
/// tokens never reach the database.
async fn shared_deck(ctx: &Context<'_>, token: &str) -> Result<Option<crate::decks::Deck>> {
    Ok(records::get_by_share_token(&state(ctx).db, token)
        .await
        .map_err(internal_error)?
        .map(crate::decks::Deck::new))
}

/// `public_buylist_opts/1`: the owner's collection is always ignored.
fn buylist_options(
    include_basic_lands: Option<bool>,
    include_considering: Option<bool>,
) -> BuylistOptions {
    BuylistOptions {
        include_basic_lands: include_basic_lands.unwrap_or(false),
        assume_no_owned: true,
        include_considering: include_considering.unwrap_or(false),
    }
}

/// `QueryResolvers.card_id/2`: a card global id, or any other id taken as a
/// raw oracle id.
fn card_id(id: &ID) -> OracleId {
    OracleId::from(node_str(id, NodeKind::Card).unwrap_or_else(|_| id.to_string()))
}

/// The public root query.
#[derive(Default)]
pub struct PublicQuery;

#[Object(name = "Query")]
impl PublicQuery {
    #[graphql(complexity = "10_000 + child_complexity")]
    async fn deck(&self, ctx: &Context<'_>, id: ID) -> Result<Option<PublicDeck>> {
        Ok(shared_deck(ctx, id.as_str()).await?.map(PublicDeck))
    }

    #[graphql(complexity = "10_000 + child_complexity")]
    async fn card(&self, ctx: &Context<'_>, id: ID) -> Result<Option<PublicCard>> {
        Ok(
            crate::catalog::Card::load_with_printings(&state(ctx).db, &card_id(&id))
                .await
                .map_err(internal_error)?
                .map(PublicCard),
        )
    }

    #[graphql(complexity = "10_000 + child_complexity")]
    async fn card_by_name(&self, ctx: &Context<'_>, name: String) -> Result<Option<PublicCard>> {
        let pool = &state(ctx).db;
        let Some(card) = crate::catalog::search::cards_by_name::find(pool, &name)
            .await
            .map_err(internal_error)?
        else {
            return Ok(None);
        };
        Ok(
            crate::catalog::Card::load_with_printings(pool, &card.oracle_id)
                .await
                .map_err(internal_error)?
                .map(PublicCard),
        )
    }

    #[graphql(complexity = "20_000 + child_complexity")]
    async fn deck_buylist(
        &self,
        ctx: &Context<'_>,
        id: ID,
        printing_mode: Option<String>,
        include_basic_lands: Option<bool>,
        assume_no_owned: Option<bool>,
        include_considering: Option<bool>,
    ) -> Result<Vec<PublicBuylistEntry>> {
        // Accepted for the shared document shape; public buylists always
        // assume nothing is owned.
        let _ = assume_no_owned;
        let Some(deck) = shared_deck(ctx, id.as_str()).await? else {
            return Ok(Vec::new());
        };
        let mode = PrintingMode::parse(printing_mode.as_deref().unwrap_or("none"));
        let entries = buylist::deck_buylist(
            state(ctx),
            deck.row.id,
            mode,
            buylist_options(include_basic_lands, include_considering),
        )
        .await
        .map_err(internal_error)?;
        Ok(entries.into_iter().map(PublicBuylistEntry).collect())
    }

    #[graphql(complexity = "20_000 + child_complexity")]
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
        let _ = assume_no_owned;
        let Some(deck) = shared_deck(ctx, id.as_str()).await? else {
            return Ok(String::new());
        };
        let mode = PrintingMode::parse(printing_mode.as_deref().unwrap_or("none"));
        buylist::export_deck_buylist(
            state(ctx),
            deck.row.id,
            format.as_deref().unwrap_or("text"),
            mode,
            buylist_options(include_basic_lands, include_considering),
        )
        .await
        .map_err(internal_error)
    }

    /// The same resolver as the owner schema's `wantsList`
    /// (`trade::ShareListQueries`), with the public schema's cost.
    #[graphql(complexity = "20_000 + child_complexity")]
    async fn wants_list(&self, ctx: &Context<'_>, id: ID) -> Result<Option<WantsList>> {
        Ok(crate::trade::share::wants_list(&state(ctx).db, id.as_str())
            .await
            .map_err(internal_error)?
            .map(|entries| WantsList { entries }))
    }

    /// See [`Self::wants_list`].
    #[graphql(complexity = "20_000 + child_complexity")]
    async fn binder_list(&self, ctx: &Context<'_>, id: ID) -> Result<Option<BinderList>> {
        Ok(
            crate::trade::share::binder_list(&state(ctx).db, id.as_str())
                .await
                .map_err(internal_error)?
                .map(|entries| BinderList { entries }),
        )
    }
}

fn builder() -> async_graphql::SchemaBuilder<PublicQuery, EmptyMutation, EmptySubscription> {
    Schema::build(PublicQuery, EmptyMutation, EmptySubscription)
        .register_output_type::<PublicNode>()
        .limit_complexity(usize::try_from(super::protection::MAX_COMPLEXITY).unwrap_or(usize::MAX))
        .limit_depth(MAX_DEPTH)
        .extension(crate::graphql::order::ResponseOrder)
        .extension(crate::graphql::nullable_errors::NullableErrors)
        .extension(crate::graphql::undefined_variables::UndefinedVariables)
}

/// The public schema. It holds no app data: each request carries the
/// [`crate::state::AppState`] and its own catalog data loader.
pub fn schema() -> &'static PublicSchema {
    static SCHEMA: LazyLock<PublicSchema> = LazyLock::new(|| builder().finish());
    &SCHEMA
}

/// The public schema's SDL, for structural comparison
/// (`rust/scripts/sdl_diff.py`).
#[must_use]
pub fn sdl() -> String {
    schema().sdl()
}
