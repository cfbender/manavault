//! `reloadScryfallCatalog` and `reloadScryfallAssets`
//! (`ManavaultWeb.Schema.Catalog.CardOperations` card mutations).

use async_graphql::{Context, Object, SimpleObject};

use crate::catalog::scryfall::worker;
use crate::graphql::{self, state};

#[derive(Debug, Clone, SimpleObject)]
pub struct ScryfallReloadResult {
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, SimpleObject)]
pub struct ReloadScryfallCatalogPayload {
    pub reload_result: Option<ScryfallReloadResult>,
}

#[derive(Debug, Clone, SimpleObject)]
pub struct ReloadScryfallAssetsPayload {
    pub reload_result: Option<ScryfallReloadResult>,
}

#[derive(Default)]
pub struct ScryfallMutations;

#[Object]
impl ScryfallMutations {
    async fn reload_scryfall_catalog(
        &self,
        ctx: &Context<'_>,
    ) -> graphql::Result<Option<ReloadScryfallCatalogPayload>> {
        let state = state(ctx);
        worker::enqueue_forced(&state.jobs, &state.db, worker::NAME)
            .await
            .map_err(|_| graphql::user_error("Scryfall catalog reload could not be queued."))?;
        Ok(Some(ReloadScryfallCatalogPayload {
            reload_result: Some(ScryfallReloadResult {
                status: "queued".to_owned(),
                message: "Scryfall catalog reload queued.".to_owned(),
            }),
        }))
    }

    async fn reload_scryfall_assets(
        &self,
        ctx: &Context<'_>,
    ) -> graphql::Result<Option<ReloadScryfallAssetsPayload>> {
        let state = state(ctx);
        worker::enqueue_forced(&state.jobs, &state.db, crate::scryfall_assets::worker::NAME)
            .await
            .map_err(|_| graphql::user_error("Scryfall asset reload could not be queued."))?;
        Ok(Some(ReloadScryfallAssetsPayload {
            reload_result: Some(ScryfallReloadResult {
                status: "queued".to_owned(),
                message: "Scryfall symbol and set icon reload queued.".to_owned(),
            }),
        }))
    }
}
