//! Card root fields (`ManavaultWeb.Schema.Catalog.CardOperations` and the
//! card parts of `QueryResolvers`).

use async_graphql::{Context, ID, InputObject, Object};
use lotus::OracleId;

use crate::catalog::card::{Card, CardConnection};
use crate::catalog::edhrec::{self, CardEdhrec};
use crate::catalog::printing::Printing;
use crate::catalog::search::cards::{SearchOptions, Sort, TokenScope, search_cards};
use crate::catalog::search::printings::{
    SetSuggestion, scanner_printings, search_sets, set_illustration_ids,
};
use crate::catalog::search::{cards_by_name, suggestions};
use crate::graphql::relay::{PageArgs, forward_window, from_slice, node_str};
use crate::graphql::{NodeKind, Result, state, user_error};

/// `CardSort`.
#[derive(Debug, Clone, Default, InputObject)]
pub struct CardSort {
    pub field: Option<String>,
    pub direction: Option<String>,
}

pub(crate) fn db_error(error: impl std::fmt::Display) -> async_graphql::Error {
    tracing::error!(%error, "catalog query failed");
    user_error("Something went wrong.")
}

/// A card id argument: a card global id, or (like `QueryResolvers.card_id/2`)
/// any undecodable or mistyped id taken as a raw oracle id.
fn card_id(id: &ID) -> OracleId {
    OracleId::from(node_str(id, NodeKind::Card).unwrap_or_else(|_| id.to_string()))
}

#[derive(Default)]
pub struct CardQueries;

#[Object]
impl CardQueries {
    async fn cards(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
        q: Option<String>,
        sort: Option<CardSort>,
        tokens: Option<TokenScope>,
    ) -> Result<CardConnection> {
        let args = PageArgs::new(after, first, before, last);
        let (offset, limit) = forward_window(&args, 24)?;
        let sort = sort.unwrap_or_default();
        let options = SearchOptions {
            limit: limit.saturating_add(1),
            offset,
            sort: Sort::parse(sort.field.as_deref(), sort.direction.as_deref()),
            tokens: tokens.unwrap_or_default(),
        };
        let mut cards = search_cards(&state(ctx).db, q.as_deref().unwrap_or(""), options)
            .await
            .map_err(db_error)?;
        let fetched = i64::try_from(cards.len()).unwrap_or(i64::MAX);
        cards.truncate(usize::try_from(limit.max(0)).unwrap_or(0));
        Ok(from_slice(cards, offset, offset > 0, fetched > limit).into())
    }

    async fn card_name_suggestions(
        &self,
        ctx: &Context<'_>,
        q: Option<String>,
        limit: Option<i64>,
    ) -> Result<Vec<String>> {
        suggestions::suggest_card_names(state(ctx), q.as_deref().unwrap_or(""), limit.unwrap_or(5))
            .await
            .map_err(db_error)
    }

    async fn set_suggestions(
        &self,
        ctx: &Context<'_>,
        q: Option<String>,
        limit: Option<i64>,
    ) -> Result<Vec<SetSuggestion>> {
        search_sets(
            &state(ctx).db,
            q.as_deref().unwrap_or(""),
            limit.unwrap_or(8),
        )
        .await
        .map_err(db_error)
    }

    async fn card(&self, ctx: &Context<'_>, id: ID) -> Result<Option<Card>> {
        Card::load_with_printings(&state(ctx).db, &card_id(&id))
            .await
            .map_err(db_error)
    }

    async fn card_by_name(&self, ctx: &Context<'_>, name: String) -> Result<Option<Card>> {
        let pool = &state(ctx).db;
        let Some(card) = cards_by_name::find(pool, &name).await.map_err(db_error)? else {
            return Ok(None);
        };
        Card::load_with_printings(pool, &card.oracle_id)
            .await
            .map_err(db_error)
    }

    async fn scanner_printings(
        &self,
        ctx: &Context<'_>,
        scryfall_id: ID,
        illustration_id: Option<ID>,
    ) -> Result<Vec<Printing>> {
        scanner_printings(
            &state(ctx).db,
            scryfall_id.as_str(),
            illustration_id.as_ref().map(|id| id.as_str()),
        )
        .await
        .map_err(db_error)
    }

    /// Illustration IDs printed in any of the given sets; the card scanner's set lock.
    async fn scanner_set_illustrations(
        &self,
        ctx: &Context<'_>,
        set_codes: Vec<String>,
    ) -> Result<Vec<ID>> {
        let codes: Vec<String> = set_codes.into_iter().take(50).collect();
        Ok(set_illustration_ids(&state(ctx).db, &codes)
            .await
            .map_err(db_error)?
            .into_iter()
            .map(ID)
            .collect())
    }

    /// Bug in earlier releases: EDHREC failures returned a bare error value
    /// the GraphQL layer could not render, so the request crashed. Failures
    /// are GraphQL errors worded like other EDHREC errors here.
    async fn card_edhrec(&self, ctx: &Context<'_>, name: String) -> Result<CardEdhrec> {
        let app = state(ctx);
        let page = edhrec::fetch_card_page(&app.http, &app.config.edhrec_json_base_url, &name)
            .await
            .map_err(|error| user_error(error.to_string()))?;
        edhrec::normalize_card_page(&app.db, &page)
            .await
            .map_err(db_error)
    }
}
