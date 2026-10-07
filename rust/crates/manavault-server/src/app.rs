//! Wiring: state, workers, cron schedule, and the HTTP server.

use std::sync::Arc;

use crate::config::Config;
use crate::graphql;
use crate::jobs::{CronEntry, DynWorker, Jobs};
use crate::logs::LogHub;
use crate::state::AppState;
use crate::web;

/// Every background worker.
#[must_use]
pub fn workers() -> Vec<Arc<dyn DynWorker>> {
    vec![
        Arc::new(crate::catalog::scryfall::worker::ScryfallCatalogWorker),
        Arc::new(crate::scryfall_assets::worker::ScryfallAssetsWorker),
        Arc::new(crate::pricing::worker::VendorSyncWorker),
        Arc::new(crate::scanner::update_worker::BundleUpdateWorker),
        Arc::new(crate::backup::worker::CloudBackupWorker),
        Arc::new(crate::decks::external::ExternalDeckSyncWorker),
        Arc::new(crate::ai::workers::DeckAnalysisWorker),
        Arc::new(crate::ai::workers::DeckQuestionWorker),
        Arc::new(crate::share::preview::render_worker::RenderWorker),
    ]
}

/// The periodic job schedule (crontab).
#[must_use]
pub fn crontab() -> Vec<CronEntry> {
    use crate::catalog::scryfall::worker::NAME as SCRYFALL_CATALOG;
    use crate::pricing::worker::NAME as VENDOR_SYNC;
    use crate::scryfall_assets::worker::NAME as SCRYFALL_ASSETS;
    let entry = |expression, worker| CronEntry { expression, worker };
    vec![
        entry("@reboot", SCRYFALL_CATALOG),
        entry("@daily", SCRYFALL_CATALOG),
        entry("@reboot", SCRYFALL_ASSETS),
        entry("@daily", SCRYFALL_ASSETS),
        entry("@reboot", crate::scanner::update_worker::WORKER),
        entry("0 */6 * * *", crate::scanner::update_worker::WORKER),
        entry("@reboot", VENDOR_SYNC),
        entry("*/30 * * * *", VENDOR_SYNC),
        entry("* * * * *", crate::backup::worker::WORKER),
        entry("0 * * * *", crate::decks::external::WORKER),
    ]
}

#[derive(Debug, thiserror::Error)]
pub enum StartError {
    #[error("database: {0}")]
    Db(#[from] crate::db::DbError),
    #[error("database: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("http client: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("backup: {0}")]
    Backup(#[from] crate::backup::BackupError),
}

/// Opens the database and builds the shared state.
pub async fn build_state(config: Config, logs: LogHub) -> Result<AppState, StartError> {
    for dir in config.writable_dirs() {
        std::fs::create_dir_all(dir)?;
    }
    // `Backup.PendingRestore`: a staged cloud restore replaces the database
    // before anything opens it.
    if let Some(applied) = crate::backup::cloud::apply_pending_restore(&config)? {
        tracing::info!("applied staged cloud restore from {}", applied.display());
    }
    let pool = crate::db::connect(&config.database_path, config.pool_size).await?;
    crate::backup::migration_backup::run(&config, &pool).await?;
    crate::db::prepare(&pool).await?;
    let jobs = Jobs::new(pool.clone(), workers());
    let state = AppState::new(config, pool, logs, jobs)?;
    // Loading the active vendor's ~150k prices takes about a second, so it
    // runs after startup instead of delaying the listener. Until it finishes
    // the store has no source and price reads fall back to Scryfall's prices,
    // as earlier releases' price store did while its table was still loading.
    let warm = state.clone();
    tokio::spawn(async move {
        if let Err(error) = warm.prices.refresh(&warm.db).await {
            tracing::error!(%error, "could not load vendor prices");
        }
    });
    Ok(state)
}

/// Builds the HTTP router for a state.
#[must_use]
pub fn router(state: AppState) -> axum::Router {
    let schema = graphql::build_schema(state.clone());
    web::router(web::WebState { app: state, schema })
}

/// Runs the server until interrupted.
pub async fn run(config: Config, logs: LogHub) -> Result<(), StartError> {
    let port = config.port;
    let state = build_state(config, logs).await?;
    if state.config.jobs_enabled {
        state.jobs.start(state.clone(), crontab());
    }
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("ManaVault listening on http://0.0.0.0:{port}");
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;
    Ok(())
}

/// Resolves on Ctrl-C (SIGINT) or SIGTERM, which `docker stop` and systemd send.
async fn shutdown_signal() {
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => {
                tracing::warn!(%error, "could not listen for SIGTERM");
                std::future::pending::<()>().await;
            }
        }
    };
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        () = terminate => {}
    }
    tracing::info!("shutting down");
}
