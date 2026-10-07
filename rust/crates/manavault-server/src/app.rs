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
    vec![]
}

/// The Oban crontab from `config/config.exs`.
#[must_use]
pub fn crontab() -> Vec<CronEntry> {
    vec![]
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
}

/// Opens the database and builds the shared state.
pub async fn build_state(config: Config, logs: LogHub) -> Result<AppState, StartError> {
    for dir in config.writable_dirs() {
        std::fs::create_dir_all(dir)?;
    }
    let pool = crate::db::connect(&config.database_path, config.pool_size).await?;
    crate::db::prepare(&pool).await?;
    let jobs = Jobs::new(pool.clone(), workers());
    Ok(AppState::new(config, pool, logs, jobs)?)
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
