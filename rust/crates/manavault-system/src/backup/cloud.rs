//! Cloud backup operations (`Manavault.Backup.Cloud`): run a backup, list
//! remote backups, stage a restore, and apply a staged restore at boot.

use std::path::{Path, PathBuf};

use serde_json::json;
use time::OffsetDateTime;

use super::google_drive::GoogleDrive;
use super::local::{self, BackupError, Paths, Reason};
use super::s3::S3;
use super::settings::{self, CloudSettings, Provider, Status};
use super::{Remote, retention};
use manavault_core::config::Config;
use manavault_core::state::AppState;
use manavault_core::timefmt;

const CHOOSE_PROVIDER: &str = "Choose Google Drive or S3 before running cloud backups.";
const STAGED: &str = "Restore is staged. Restart ManaVault to apply it.";

enum Client<'a> {
    S3(S3<'a>),
    Drive(GoogleDrive<'a>),
}

fn client<'a>(state: &'a AppState, settings: &'a CloudSettings) -> Result<Client<'a>, String> {
    match settings.provider() {
        Some(Provider::S3) => Ok(Client::S3(S3 {
            http: &state.http,
            settings,
        })),
        Some(Provider::GoogleDrive) => Ok(Client::Drive(GoogleDrive {
            http: &state.http,
            settings,
            urls: &state.config.platform_urls,
        })),
        Some(Provider::None) | None => Err(CHOOSE_PROVIDER.to_owned()),
    }
}

impl Client<'_> {
    async fn upload(&self, artifact: &Path) -> Result<Remote, String> {
        match self {
            Self::S3(client) => client.upload(artifact).await,
            Self::Drive(client) => client.upload(artifact).await,
        }
    }

    async fn list(&self) -> Result<Vec<Remote>, String> {
        match self {
            Self::S3(client) => client.list().await,
            Self::Drive(client) => client.list().await,
        }
    }

    async fn download(&self, id: &str, destination: &Path) -> Result<(), String> {
        match self {
            Self::S3(client) => client.download(id, destination).await,
            Self::Drive(client) => client.download(id, destination).await,
        }
    }

    async fn delete(&self, id: &str) -> Result<(), String> {
        match self {
            Self::S3(client) => client.delete(id).await,
            Self::Drive(client) => client.delete(id).await,
        }
    }
}

fn backup_message(remote: &Remote, deleted: usize) -> String {
    match deleted {
        0 => format!("Uploaded {}", remote.name),
        1 => format!("Uploaded {}; pruned 1 old cloud backup", remote.name),
        count => format!("Uploaded {}; pruned {count} old cloud backups", remote.name),
    }
}

async fn backup_steps(
    state: &AppState,
    settings: &CloudSettings,
) -> Result<(Remote, usize), String> {
    let client = client(state, settings)?;
    if let Client::S3(s3) = &client {
        s3.list().await?;
    }
    let artifact = local::create(&state.db, &Paths::from_config(&state.config), Reason::Cloud)
        .await
        .map_err(|error| error.0)?;
    let remote = client.upload(&artifact).await?;
    let deleted = match settings.retention_count {
        Some(count) => {
            let backups = client.list().await?;
            retention::prune(Some(count), &remote, backups, |backup| {
                let client = &client;
                async move { client.delete(&backup.id).await }
            })
            .await?
            .len()
        }
        None => 0,
    };
    Ok((remote, deleted))
}

/// Creates a backup and uploads it (`Cloud.run_backup/1`), recording the
/// outcome on the settings row.
pub async fn run_backup(state: &AppState) -> Result<Remote, String> {
    let settings = settings::get(state)
        .await
        .map_err(|error| error.to_string())?;
    let result = backup_steps(state, &settings).await;
    let status = match &result {
        Ok((remote, deleted)) => Status {
            last_backup_at: Some(timefmt::now()),
            last_backup_status: Some("ok".to_owned()),
            last_backup_message: Some(backup_message(remote, *deleted)),
            last_backup_path: Some(remote.id.clone()),
            ..Status::default()
        },
        Err(message) => Status {
            last_backup_at: Some(timefmt::now()),
            last_backup_status: Some("error".to_owned()),
            last_backup_message: Some(message.clone()),
            ..Status::default()
        },
    };
    if let Err(error) = settings::update_status(state, status).await {
        tracing::error!(%error, "could not record the cloud backup status");
    }
    result.map(|(remote, _)| remote)
}

/// Remote backups; none when no provider is chosen (`Cloud.list_backups/1`).
pub async fn list_backups(state: &AppState) -> Result<Vec<Remote>, String> {
    let settings = settings::get(state)
        .await
        .map_err(|error| error.to_string())?;
    if settings.provider == "none" {
        return Ok(Vec::new());
    }
    client(state, &settings)?.list().await
}

/// A staged restore.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreResult {
    pub status: String,
    pub message: String,
    pub path: Option<String>,
}

/// Downloads a remote backup to `restores/pending.zip`, to be applied at the
/// next boot (`Cloud.stage_restore/2`).
pub async fn stage_restore(state: &AppState, remote_id: &str) -> Result<RestoreResult, String> {
    let settings = settings::get(state)
        .await
        .map_err(|error| error.to_string())?;
    let destination = Paths::from_config(&state.config)
        .restores_dir()
        .join("pending.zip");
    let result = async {
        let client = client(state, &settings)?;
        if let Some(parent) = destination.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        client.download(remote_id, &destination).await
    }
    .await;
    let path = destination.display().to_string();
    let status = match &result {
        Ok(()) => Status {
            last_restore_at: Some(timefmt::now()),
            last_restore_status: Some("pending_restart".to_owned()),
            last_restore_message: Some(STAGED.to_owned()),
            pending_restore_path: Some(path.clone()),
            ..Status::default()
        },
        Err(message) => Status {
            last_restore_at: Some(timefmt::now()),
            last_restore_status: Some("error".to_owned()),
            last_restore_message: Some(message.clone()),
            ..Status::default()
        },
    };
    if let Err(error) = settings::update_status(state, status).await {
        tracing::error!(%error, "could not record the restore status");
    }
    result.map(|()| RestoreResult {
        status: "pending_restart".to_owned(),
        message: STAGED.to_owned(),
        path: Some(path),
    })
}

/// Applies `restores/pending.zip` if present (`Cloud.apply_pending_restore/1`,
/// run by `Backup.PendingRestore` at boot before the database opens). The
/// outcome is written to `restores/last-restore.json`; a failure stops the
/// boot.
pub fn apply_pending_restore(config: &Config) -> Result<Option<PathBuf>, BackupError> {
    let paths = Paths::from_config(config);
    let restore_dir = paths.restores_dir();
    let pending = restore_dir.join("pending.zip");
    if !pending.exists() {
        return Ok(None);
    }
    let applied = restore_dir.join(format!(
        "applied-{}.zip",
        local::timestamp(OffsetDateTime::now_utc())
    ));
    let result = local::restore(&pending, &paths).and_then(|_| {
        std::fs::rename(&pending, &applied)
            .map_err(|error| BackupError(format!("could not move the applied restore: {error}")))
    });
    let record = match &result {
        Ok(()) => json!({
            "status": "ok",
            "applied_at": local::iso8601_now(),
            "artifact_path": applied.display().to_string(),
        }),
        Err(error) => json!({
            "status": "error",
            "failed_at": local::iso8601_now(),
            "message": error.0,
        }),
    };
    let _ = std::fs::create_dir_all(&restore_dir);
    if let Err(error) = std::fs::write(restore_dir.join("last-restore.json"), record.to_string()) {
        tracing::warn!(%error, "could not write last-restore.json");
    }
    result?;
    tracing::info!("applied pending cloud restore from {}", applied.display());
    Ok(Some(applied))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::settings::BackupSettingsInput;
    use crate::test_app::TestApp;
    use async_graphql::MaybeUndefined;
    use wiremock::matchers::{method, path, path_regex, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn value(text: &str) -> MaybeUndefined<String> {
        MaybeUndefined::Value(text.to_owned())
    }

    async fn configure_s3(app: &TestApp, server: &MockServer, retention: Option<i64>) {
        settings::update(
            &app.state,
            BackupSettingsInput {
                provider: value("s3"),
                s3_endpoint: value(&server.uri()),
                s3_bucket: value("bucket"),
                s3_region: value("auto"),
                s3_prefix: value("manavault"),
                s3_access_key_id: value("key"),
                s3_secret_access_key: value("secret"),
                retention_count: retention.map_or(MaybeUndefined::Undefined, MaybeUndefined::Value),
                ..BackupSettingsInput::default()
            },
        )
        .await
        .unwrap();
    }

    fn listing(keys: &[(&str, &str)]) -> String {
        let contents = keys
            .iter()
            .map(|(key, modified)| {
                format!("<Contents><Key>{key}</Key><LastModified>{modified}</LastModified><Size>10</Size></Contents>")
            })
            .collect::<Vec<_>>()
            .concat();
        format!("<ListBucketResult>{contents}</ListBucketResult>")
    }

    #[tokio::test]
    async fn runs_an_s3_backup_with_retention() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/bucket"))
            .and(query_param("list-type", "2"))
            .and(query_param("prefix", "manavault/"))
            .respond_with(ResponseTemplate::new(200).set_body_string(listing(&[
                (
                    "manavault/manavault-cloud-20200101T000000Z.zip",
                    "2020-01-01T00:00:00.000Z",
                ),
                (
                    "manavault/manavault-cloud-20200102T000000Z.zip",
                    "2020-01-02T00:00:00.000Z",
                ),
            ])))
            .mount(&server)
            .await;
        Mock::given(method("PUT"))
            .and(path_regex(
                r"^/bucket/manavault/manavault-cloud-\d{8}T\d{6}Z\.zip$",
            ))
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("DELETE"))
            .and(path(
                "/bucket/manavault/manavault-cloud-20200101T000000Z.zip",
            ))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;
        let app = TestApp::new().await;
        configure_s3(&app, &server, Some(2)).await;
        let remote = run_backup(&app.state).await.unwrap();
        assert!(remote.id.starts_with("manavault/manavault-cloud-"));
        assert_eq!(remote.provider, "s3");
        let saved = settings::get(&app.state).await.unwrap();
        assert_eq!(saved.last_backup_status.as_deref(), Some("ok"));
        assert_eq!(
            saved.last_backup_message,
            Some(format!(
                "Uploaded {}; pruned 1 old cloud backup",
                remote.name
            ))
        );
        assert_eq!(saved.last_backup_path, Some(remote.id.clone()));
        // The local copy stays in the backups directory.
        assert!(app.state.config.backups_dir.join(&remote.name).exists());
    }

    #[tokio::test]
    async fn records_errors_and_requires_a_provider() {
        let app = TestApp::new().await;
        assert_eq!(run_backup(&app.state).await.unwrap_err(), CHOOSE_PROVIDER);
        let saved = settings::get(&app.state).await.unwrap();
        assert_eq!(saved.last_backup_status.as_deref(), Some("error"));
        assert_eq!(saved.last_backup_message.as_deref(), Some(CHOOSE_PROVIDER));
        assert_eq!(
            list_backups(&app.state).await.unwrap(),
            Vec::<Remote>::new()
        );

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(403).set_body_string(
                "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>",
            ))
            .mount(&server)
            .await;
        configure_s3(&app, &server, None).await;
        let error = run_backup(&app.state).await.unwrap_err();
        assert!(error.starts_with("S3 request failed with HTTP 403: AccessDenied: Access Denied"));
    }

    #[tokio::test]
    async fn stages_a_google_drive_restore_and_applies_it_at_boot() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"access_token": "t"})),
            )
            .mount(&server)
            .await;
        let uri = server.uri();
        let app = TestApp::with_config(|config| {
            config.platform_urls.google_oauth_token = format!("{uri}/token");
            config.platform_urls.google_drive_files = format!("{uri}/files");
            config.platform_urls.google_drive_upload = format!("{uri}/upload");
        })
        .await;
        settings::update(
            &app.state,
            BackupSettingsInput {
                provider: value("google_drive"),
                google_client_id: value("client"),
                google_client_secret: value("secret"),
                google_refresh_token: value("refresh"),
                ..BackupSettingsInput::default()
            },
        )
        .await
        .unwrap();
        // A real backup of this database, served as the remote file.
        let artifact = local::create(
            &app.state.db,
            &Paths::from_config(&app.state.config),
            Reason::Manual,
        )
        .await
        .unwrap();
        Mock::given(method("GET"))
            .and(path("/files/file-1"))
            .and(query_param("alt", "media"))
            .respond_with(
                ResponseTemplate::new(200).set_body_bytes(std::fs::read(&artifact).unwrap()),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/files"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"files": [
                {"id": "file-1", "name": "manavault-cloud-1.zip", "size": "42", "modifiedTime": "2026-06-27T03:00:00.123Z"}
            ]})))
            .mount(&server)
            .await;
        let listed = list_backups(&app.state).await.unwrap();
        assert_eq!(listed[0].size, Some(42));
        assert_eq!(
            listed[0].modified_at.as_deref(),
            Some("2026-06-27T03:00:00.123Z")
        );

        let staged = stage_restore(&app.state, "file-1").await.unwrap();
        assert_eq!(staged.status, "pending_restart");
        let pending = app.state.config.data_dir.join("restores/pending.zip");
        assert_eq!(staged.path, Some(pending.display().to_string()));
        assert!(pending.exists());
        let saved = settings::get(&app.state).await.unwrap();
        assert_eq!(
            saved.last_restore_status.as_deref(),
            Some("pending_restart")
        );

        // At boot, before the pool opens.
        let mut config = app.state.config.clone();
        let restored_db = app.state.config.data_dir.join("restored.db");
        config.database_path = restored_db.clone();
        let applied = apply_pending_restore(&config).unwrap().unwrap();
        assert!(
            applied
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("applied-")
        );
        assert!(!pending.exists());
        assert!(restored_db.exists());
        let record: serde_json::Value = serde_json::from_slice(
            &std::fs::read(app.state.config.data_dir.join("restores/last-restore.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(record["status"], "ok");
        assert_eq!(apply_pending_restore(&config).unwrap(), None);

        let error = stage_restore(&app.state, "missing").await.unwrap_err();
        assert!(
            error.starts_with("Google Drive download failed with HTTP 404"),
            "{error}"
        );
    }

    #[tokio::test]
    async fn a_failed_boot_restore_is_recorded() {
        let app = TestApp::new().await;
        let restores = app.state.config.data_dir.join("restores");
        std::fs::create_dir_all(&restores).unwrap();
        std::fs::write(restores.join("pending.zip"), b"not a zip").unwrap();
        assert!(apply_pending_restore(&app.state.config).is_err());
        let record: serde_json::Value =
            serde_json::from_slice(&std::fs::read(restores.join("last-restore.json")).unwrap())
                .unwrap();
        assert_eq!(record["status"], "error");
        assert!(
            record["message"]
                .as_str()
                .unwrap()
                .contains("failed to read backup")
        );
    }
}
