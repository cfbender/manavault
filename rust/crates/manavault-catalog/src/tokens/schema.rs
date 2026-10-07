//! Token root fields (`ManavaultWeb.Schema.Catalog.TokenOperations` and
//! `TokenResolvers`).

use async_graphql::{Context, ID, InputObject, MaybeUndefined, Object, SimpleObject};

use crate::catalog::printing::Printing;
use crate::tokens::back_options::{TokenBackOptions, token_back_options};
use crate::tokens::items::{self, NewTokenItem, TokenItem, TokenItemChanges, TokenItemError};
use crate::tokens::search::{TokenPrintingFilters, search_token_printings};
use manavault_core::graphql::relay::{node_int, node_ints, node_str};
use manavault_core::graphql::{NodeKind, Result, state, user_error};

fn error(error: TokenItemError) -> async_graphql::Error {
    match error {
        TokenItemError::Db(error) => {
            tracing::error!(%error, "token item query failed");
            user_error("Something went wrong.")
        }
        other => user_error(other.to_string()),
    }
}

fn db_error(error: impl std::fmt::Display) -> async_graphql::Error {
    tracing::error!(%error, "token query failed");
    user_error("Something went wrong.")
}

/// `TokenItemInput`.
#[derive(Debug, Clone, InputObject)]
pub struct TokenItemInput {
    pub scryfall_id: ID,
    pub back_scryfall_id: Option<ID>,
    pub finish: Option<String>,
    pub quantity: Option<i64>,
}

/// `TokenItemUpdateInput`.
#[derive(Debug, Clone, InputObject)]
pub struct TokenItemUpdateInput {
    pub quantity: MaybeUndefined<i64>,
    pub finish: MaybeUndefined<String>,
}

/// `RelayHelpers.optional_node_id/3` for printing ids: `null` and `""` are absent.
fn optional_printing_id(id: Option<&ID>) -> Result<Option<String>> {
    match id {
        None => Ok(None),
        Some(id) if id.is_empty() => Ok(None),
        Some(id) => node_str(id, NodeKind::Printing).map(Some),
    }
}

#[derive(SimpleObject)]
pub struct AddTokenItemPayload {
    pub token_item: Option<TokenItem>,
}

#[derive(SimpleObject)]
pub struct UpdateTokenItemPayload {
    pub token_item: Option<TokenItem>,
}

#[derive(SimpleObject)]
pub struct DeleteTokenItemPayload {
    pub token_item: Option<TokenItem>,
}

#[derive(SimpleObject)]
pub struct DeleteTokenItemsPayload {
    pub deleted_count: i64,
}

#[derive(Default)]
pub struct TokenQueries;

#[Object]
impl TokenQueries {
    /// Owned tokens, alphabetically by name. `q` matches either printed side.
    async fn token_items(&self, ctx: &Context<'_>, q: Option<String>) -> Result<Vec<TokenItem>> {
        items::list(&state(ctx).db, q.as_deref().unwrap_or(""))
            .await
            .map_err(db_error)
    }

    /// Total owned token copies.
    async fn token_item_count(&self, ctx: &Context<'_>) -> Result<i64> {
        items::count(&state(ctx).db).await.map_err(db_error)
    }

    /// Token printings by name or set, newest first. Empty when no filter is given.
    ///
    /// Like `scannerPrintings`, this takes raw Scryfall IDs.
    async fn token_printings(
        &self,
        ctx: &Context<'_>,
        q: Option<String>,
        set_code: Option<String>,
        exclude_scryfall_id: Option<ID>,
        limit: Option<i64>,
    ) -> Result<Vec<Printing>> {
        let filters = TokenPrintingFilters {
            q: q.unwrap_or_default(),
            set_code: set_code.unwrap_or_default(),
            exclude_scryfall_id: exclude_scryfall_id.map(|id| id.0),
        };
        let limit = limit.unwrap_or(60).min(200);
        search_token_printings(&state(ctx).db, &filters, limit)
            .await
            .map_err(db_error)
    }

    /// Back-face candidates for a token printing, by its Scryfall ID.
    async fn token_back_options(
        &self,
        ctx: &Context<'_>,
        scryfall_id: ID,
    ) -> Result<TokenBackOptions> {
        token_back_options(&state(ctx).db, scryfall_id.as_str())
            .await
            .map_err(db_error)
    }
}

#[derive(Default)]
pub struct TokenMutations;

#[Object]
impl TokenMutations {
    async fn add_token_item(
        &self,
        ctx: &Context<'_>,
        input: TokenItemInput,
    ) -> Result<Option<AddTokenItemPayload>> {
        let scryfall_id = optional_printing_id(Some(&input.scryfall_id))?;
        let back_scryfall_id = optional_printing_id(input.back_scryfall_id.as_ref())?;
        let item = items::add(
            &state(ctx).db,
            NewTokenItem {
                scryfall_id,
                back_scryfall_id,
                finish: input.finish,
                quantity: input.quantity,
            },
        )
        .await
        .map_err(error)?;
        Ok(Some(AddTokenItemPayload {
            token_item: Some(item),
        }))
    }

    async fn update_token_item(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: TokenItemUpdateInput,
    ) -> Result<Option<UpdateTokenItemPayload>> {
        let id = node_int(&id, NodeKind::TokenItem)?;
        let changes = TokenItemChanges {
            quantity: input.quantity,
            finish: input.finish,
        };
        let item = items::update(&state(ctx).db, id, changes)
            .await
            .map_err(error)?;
        Ok(Some(UpdateTokenItemPayload {
            token_item: Some(item),
        }))
    }

    async fn delete_token_item(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DeleteTokenItemPayload>> {
        let id = node_int(&id, NodeKind::TokenItem)?;
        let item = items::delete(&state(ctx).db, id).await.map_err(error)?;
        Ok(Some(DeleteTokenItemPayload {
            token_item: Some(item),
        }))
    }

    async fn delete_token_items(
        &self,
        ctx: &Context<'_>,
        ids: Vec<ID>,
    ) -> Result<Option<DeleteTokenItemsPayload>> {
        let ids = node_ints(&ids, NodeKind::TokenItem)?;
        let deleted_count = items::delete_many(&state(ctx).db, &ids)
            .await
            .map_err(db_error)?;
        Ok(Some(DeleteTokenItemsPayload { deleted_count }))
    }
}
