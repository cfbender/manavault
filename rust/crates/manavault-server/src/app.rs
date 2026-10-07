//! Wiring: state, workers, cron schedule, and the HTTP server.

use std::sync::Arc;

use crate::config::Config;
use crate::graphql;
use crate::jobs::{CronEntry, Jobs, Worker};
use crate::logs::LogHub;
use crate::state::AppState;
use crate::web;

/// Every background worker.
#[must_use]
pub fn workers() -> Vec<Arc<dyn Worker>> {
    vec![
        Arc::new(crate::scanner::update_worker::BundleUpdateWorker),
        Arc::new(crate::backup::worker::CloudBackupWorker),
    ]
}

/// The Oban crontab from `config/config.exs`.
#[must_use]
pub fn crontab() -> Vec<CronEntry> {
    vec![
        CronEntry {
            expression: "@reboot",
            worker: crate::scanner::update_worker::WORKER,
        },
        CronEntry {
            expression: "0 */6 * * *",
            worker: crate::scanner::update_worker::WORKER,
        },
        CronEntry {
            expression: "* * * * *",
            worker: crate::backup::worker::WORKER,
        },
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
    state.prices.refresh(&state.db).await?;
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
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}
