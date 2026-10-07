//! The `manavault` server binary.
//!
//! - `manavault` (or `manavault serve`): run the server.
//! - `manavault hash-password <password>`: print an owner password hash
//!   (`mix manavault.auth.hash`).
//! - `manavault sdl`: print the owner GraphQL schema.

use std::process::ExitCode;

use tracing_subscriber::layer::SubscriberExt as _;
use tracing_subscriber::util::SubscriberInitExt as _;
use tracing_subscriber::{EnvFilter, Layer as _};

use manavault_server::config::Config;
use manavault_server::logs::LogHub;

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("hash-password") => {
            let Some(password) = args.get(1) else {
                eprintln!("usage: manavault hash-password <password>");
                return ExitCode::FAILURE;
            };
            println!("{}", manavault_server::crypto::hash_password(password));
            ExitCode::SUCCESS
        }
        Some("sdl") => {
            print!("{}", manavault_server::graphql::sdl());
            ExitCode::SUCCESS
        }
        None | Some("serve") => serve().await,
        Some(other) => {
            eprintln!("unknown command {other}; expected serve, hash-password, or sdl");
            ExitCode::FAILURE
        }
    }
}

async fn serve() -> ExitCode {
    let logs = LogHub::new();
    let filter = EnvFilter::try_from_env("RUST_LOG")
        .unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn,tower_http=warn"));
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_filter(filter.clone()))
        .with(logs.layer().with_filter(filter))
        .init();
    let config = match Config::from_env() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::FAILURE;
        }
    };
    if config.env == manavault_server::config::Env::Prod && config.auth_disabled {
        tracing::warn!(
            "MANAVAULT_AUTH_DISABLED is set: authentication is OFF in production. Anyone who can reach this server has full owner access to the collection."
        );
    }
    match manavault_server::app::run(config, logs).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(%error, "server stopped");
            ExitCode::FAILURE
        }
    }
}
