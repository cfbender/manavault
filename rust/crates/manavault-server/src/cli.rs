//! Maintenance commands of the `manavault` binary. Each returns the line to
//! print.

use std::path::PathBuf;

use crate::backup::{self, Paths, Reason};
use crate::config::Config;

fn config() -> Result<Config, String> {
    Config::from_env().map_err(|error| error.to_string())
}

/// `manavault unban CLIENT_ID | --all`. Clears
/// persisted bans; a running server's short-lived windows expire on their own.
pub async fn unban(args: &[String]) -> Result<String, String> {
    const USAGE: &str = "Usage: manavault unban CLIENT_ID | --all";
    let config = config()?;
    let pool = crate::db::connect(&config.database_path, 1)
        .await
        .map_err(|error| error.to_string())?;
    match args {
        [flag] if flag == "--all" => {
            crate::auth::attempt_limiter::reset_all_persistent(&pool)
                .await
                .map_err(|error| error.to_string())?;
            Ok("Cleared all login bans".to_owned())
        }
        [client_id] if !client_id.starts_with("--") => {
            crate::auth::attempt_limiter::reset_persistent(&pool, client_id)
                .await
                .map_err(|error| error.to_string())?;
            Ok(format!("Cleared login ban for {client_id}"))
        }
        _ => Err(USAGE.to_owned()),
    }
}

/// `manavault migrate`: applies pending migrations to the configured database
/// (creating it if needed), after the same pre-migration backup the server
/// takes, without starting the server.
pub async fn migrate() -> Result<String, String> {
    let config = config()?;
    for dir in config.writable_dirs() {
        std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    let pool = crate::db::connect(&config.database_path, 1)
        .await
        .map_err(|error| error.to_string())?;
    crate::backup::migration_backup::run(&config, &pool)
        .await
        .map_err(|error| error.to_string())?;
    let outcome = crate::db::prepare(&pool)
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(match outcome.applied.len() {
        0 => format!("{} is up to date", config.database_path.display()),
        count => format!(
            "applied {count} migrations to {}",
            config.database_path.display()
        ),
    })
}

struct PathOptions {
    output_dir: Option<PathBuf>,
    data_dir: Option<PathBuf>,
    database: Option<PathBuf>,
    positional: Vec<String>,
}

fn parse_options(args: &[String], allow_output: bool) -> Result<PathOptions, String> {
    let mut options = PathOptions {
        output_dir: None,
        data_dir: None,
        database: None,
        positional: Vec::new(),
    };
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        let (name, inline) = match arg.split_once('=') {
            Some((name, value)) if name.starts_with("--") => (name, Some(value.to_owned())),
            _ => (arg.as_str(), None),
        };
        let mut value = || {
            inline
                .clone()
                .or_else(|| iter.next().cloned())
                .map(PathBuf::from)
                .ok_or_else(|| format!("missing value for {name}"))
        };
        match name {
            "--output-dir" | "-o" if allow_output => options.output_dir = Some(value()?),
            "--data-dir" => options.data_dir = Some(value()?),
            "--database" => options.database = Some(value()?),
            other if other.starts_with('-') => {
                return Err(format!("invalid options: {other:?}"));
            }
            other => options.positional.push(other.to_owned()),
        }
    }
    Ok(options)
}

fn paths(config: &Config, options: &PathOptions) -> Paths {
    let database_path = options
        .database
        .clone()
        .unwrap_or_else(|| config.database_path.clone());
    let data_dir = options
        .data_dir
        .clone()
        .unwrap_or_else(|| config.data_dir.clone());
    let backups_dir = options
        .output_dir
        .clone()
        .unwrap_or_else(|| data_dir.join("backups"));
    Paths {
        database_path,
        data_dir,
        backups_dir,
    }
}

/// `manavault backup` (`mix manavault.backup`).
pub async fn backup(args: &[String]) -> Result<String, String> {
    let options = parse_options(args, true)?;
    let config = config()?;
    let paths = paths(&config, &options);
    let pool = crate::db::connect(&paths.database_path, 1)
        .await
        .map_err(|error| error.to_string())?;
    let artifact = backup::local::create(&pool, &paths, Reason::Manual)
        .await
        .map_err(|error| error.0)?;
    pool.close().await;
    Ok(format!("Created backup: {}", artifact.display()))
}

/// `manavault restore PATH` (`mix manavault.restore`). Stop the server first.
pub fn restore(args: &[String]) -> Result<String, String> {
    let options = parse_options(args, false)?;
    let [artifact] = options.positional.as_slice() else {
        return Err("usage: manavault restore /path/to/backup.zip".to_owned());
    };
    let config = config()?;
    let paths = paths(&config, &options);
    let database =
        backup::local::restore(&PathBuf::from(artifact), &paths).map_err(|error| error.0)?;
    Ok(format!("Restored database: {}", database.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_path_options() {
        let args: Vec<String> = ["-o", "/out", "--database=/db/x.db", "file.zip"]
            .iter()
            .map(|s| (*s).to_owned())
            .collect();
        let options = parse_options(&args, true).unwrap();
        assert_eq!(options.output_dir, Some(PathBuf::from("/out")));
        assert_eq!(options.database, Some(PathBuf::from("/db/x.db")));
        assert_eq!(options.positional, vec!["file.zip".to_owned()]);
        assert!(parse_options(&["-o".to_owned(), "/x".to_owned()], false).is_err());
        assert!(parse_options(&["--bogus".to_owned()], true).is_err());
    }
}
