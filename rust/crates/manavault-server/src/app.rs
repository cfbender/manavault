//! Wiring: state, workers, cron schedule, and the HTTP server.

use std::sync::Arc;

use manavault_core::config::Config;
use manavault_core::jobs::{CronEntry, DynWorker, Jobs};
use manavault_core::logs::LogHub;
use manavault_core::state::AppState;

use crate::graphql;
use crate::web;

/// Every background worker: each domain crate's workers.
#[must_use]
pub fn workers() -> Vec<Arc<dyn DynWorker>> {
    manavault_catalog::workers()
        .into_iter()
        .chain(manavault_system::workers())
        .chain(manavault_collection::workers())
        .chain(manavault_ai::workers())
        .chain(manavault_share::workers())
        .collect()
}

/// The periodic job schedule (crontab).
#[must_use]
pub fn crontab() -> Vec<CronEntry> {
    use manavault_catalog::catalog::scryfall::worker::NAME as SCRYFALL_CATALOG;
    use manavault_catalog::pricing::worker::NAME as VENDOR_SYNC;
    use manavault_catalog::scryfall_assets::worker::NAME as SCRYFALL_ASSETS;
    let entry = |expression, worker| CronEntry { expression, worker };
    vec![
        entry("@reboot", SCRYFALL_CATALOG),
        entry("@daily", SCRYFALL_CATALOG),
        entry("@reboot", SCRYFALL_ASSETS),
        entry("@daily", SCRYFALL_ASSETS),
        entry("@reboot", manavault_system::scanner::update_worker::WORKER),
        entry(
            "0 */6 * * *",
            manavault_system::scanner::update_worker::WORKER,
        ),
        entry("@reboot", VENDOR_SYNC),
        entry("*/30 * * * *", VENDOR_SYNC),
        entry("* * * * *", manavault_system::backup::worker::WORKER),
        entry("0 * * * *", manavault_collection::decks::external::WORKER),
    ]
}

#[derive(Debug, thiserror::Error)]
pub enum StartError {
    #[error("database: {0}")]
    Db(#[from] manavault_core::db::DbError),
    #[error("database: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("http client: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("backup: {0}")]
    Backup(#[from] manavault_system::backup::BackupError),
}

/// Opens the database and builds the shared state.
pub async fn build_state(config: Config, logs: LogHub) -> Result<AppState, StartError> {
    for dir in config.writable_dirs() {
        std::fs::create_dir_all(dir)?;
    }
    // `Backup.PendingRestore`: a staged cloud restore replaces the database
    // before anything opens it.
    if let Some(applied) = manavault_system::backup::cloud::apply_pending_restore(&config)? {
        tracing::info!("applied staged cloud restore from {}", applied.display());
    }
    let pool = manavault_core::db::connect(&config.database_path, config.pool_size).await?;
    manavault_system::backup::migration_backup::run(&config, &pool).await?;
    manavault_core::db::prepare(&pool).await?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_crontab_schedules_every_periodic_worker() {
        let entries: Vec<(&str, &str)> = crontab()
            .iter()
            .map(|entry| (entry.expression, entry.worker))
            .collect();
        for expected in [
            ("@reboot", "scryfall_catalog"),
            ("@daily", "scryfall_catalog"),
            ("@reboot", "scryfall_assets"),
            ("@daily", "scryfall_assets"),
            ("@reboot", "vendor_prices"),
            ("*/30 * * * *", "vendor_prices"),
            ("@reboot", manavault_system::scanner::update_worker::WORKER),
            (
                "0 */6 * * *",
                manavault_system::scanner::update_worker::WORKER,
            ),
            ("* * * * *", manavault_system::backup::worker::WORKER),
            ("0 * * * *", manavault_collection::decks::external::WORKER),
        ] {
            assert!(entries.contains(&expected), "{expected:?}");
        }
        let names: Vec<&str> = workers().iter().map(|worker| worker.name()).collect();
        for (_, worker) in &entries {
            assert!(names.contains(worker), "{worker} has no worker");
        }
    }

    #[test]
    fn every_worker_times_out_before_it_counts_as_stuck() {
        assert_eq!(
            manavault_core::jobs::QUEUES,
            [
                ("ai", 2),
                ("backup", 1),
                ("catalog", 2),
                ("preview", 2),
                ("pricing", 1)
            ]
        );
        // Stuck jobs are requeued after `STUCK_AFTER`, so every worker must
        // time out sooner.
        for worker in workers() {
            assert!(
                worker.timeout() < manavault_core::jobs::STUCK_AFTER,
                "{}",
                worker.name()
            );
        }
    }
}
