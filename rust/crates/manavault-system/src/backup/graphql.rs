//! Backup GraphQL fields (`Schema.BackupTypes`, `BackupResolvers`,
//! `Catalog.BackupOperations`).

use async_graphql::{Context, ErrorExtensions, ID, Object, SimpleObject};

use super::settings::{self, BackupSettingsInput, CloudSettings, UpdateError, present};
use super::{Remote, cloud};
use manavault_core::graphql::{state, user_error};
use manavault_core::timestamp::Timestamp;

type GqlResult<T> = async_graphql::Result<T>;

#[derive(SimpleObject)]
#[graphql(name = "BackupSettings")]
pub struct BackupSettingsObject {
    pub id: i64,
    pub enabled: bool,
    pub provider: String,
    pub cron: String,
    pub retention_count: Option<i64>,
    pub s3_endpoint: Option<String>,
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    pub s3_prefix: Option<String>,
    pub s3_access_key_id: Option<String>,
    pub has_s3_secret_access_key: bool,
    pub google_client_id: Option<String>,
    pub google_folder_id: Option<String>,
    pub has_google_client_secret: bool,
    pub has_google_refresh_token: bool,
    pub last_backup_at: Option<String>,
    pub last_backup_status: Option<String>,
    pub last_backup_message: Option<String>,
    pub last_backup_path: Option<String>,
    pub last_restore_at: Option<String>,
    pub last_restore_status: Option<String>,
    pub last_restore_message: Option<String>,
    pub pending_restore_path: Option<String>,
}

impl From<CloudSettings> for BackupSettingsObject {
    /// `Settings.sanitize/1`: secrets become `has_*` flags.
    fn from(settings: CloudSettings) -> Self {
        Self {
            id: settings.id,
            enabled: settings.enabled,
            has_s3_secret_access_key: present(settings.s3_secret_access_key.as_deref()),
            has_google_client_secret: present(settings.google_client_secret.as_deref()),
            has_google_refresh_token: present(settings.google_refresh_token.as_deref()),
            provider: settings.provider,
            cron: settings.cron,
            retention_count: settings.retention_count,
            s3_endpoint: settings.s3_endpoint,
            s3_bucket: settings.s3_bucket,
            s3_region: settings.s3_region,
            s3_prefix: settings.s3_prefix,
            s3_access_key_id: settings.s3_access_key_id,
            google_client_id: settings.google_client_id,
            google_folder_id: settings.google_folder_id,
            last_backup_at: settings.last_backup_at.map(|at| at.to_string()),
            last_backup_status: settings.last_backup_status,
            last_backup_message: settings.last_backup_message,
            last_backup_path: settings.last_backup_path,
            last_restore_at: settings.last_restore_at.map(|at| at.to_string()),
            last_restore_status: settings.last_restore_status,
            last_restore_message: settings.last_restore_message,
            pending_restore_path: settings.pending_restore_path,
        }
    }
}

#[derive(SimpleObject)]
pub struct CloudBackup {
    pub id: ID,
    pub name: String,
    pub provider: String,
    pub size: Option<i64>,
    pub modified_at: Option<String>,
}

impl From<Remote> for CloudBackup {
    fn from(remote: Remote) -> Self {
        Self {
            id: ID(remote.id),
            name: remote.name,
            provider: remote.provider,
            size: remote.size,
            modified_at: remote.modified_at.map(|at| Timestamp::from(at).to_string()),
        }
    }
}

#[derive(SimpleObject)]
pub struct CloudBackupResult {
    pub id: Option<ID>,
    pub name: Option<String>,
    pub provider: Option<String>,
    pub size: Option<i64>,
    pub modified_at: Option<String>,
    pub status: String,
    pub message: String,
}

#[derive(SimpleObject)]
pub struct CloudRestoreResult {
    pub status: String,
    pub message: String,
    pub path: Option<String>,
}

#[derive(SimpleObject)]
pub struct UpdateBackupSettingsPayload {
    pub backup_settings: Option<BackupSettingsObject>,
}

#[derive(SimpleObject)]
pub struct RunCloudBackupPayload {
    pub cloud_backup: Option<CloudBackupResult>,
}

#[derive(SimpleObject)]
pub struct StageCloudRestorePayload {
    pub restore_result: Option<CloudRestoreResult>,
}

#[derive(Default)]
pub struct BackupQueries;

#[Object]
impl BackupQueries {
    async fn backup_settings(&self, ctx: &Context<'_>) -> GqlResult<BackupSettingsObject> {
        Ok(settings::get(state(ctx)).await?.into())
    }

    async fn cloud_backups(&self, ctx: &Context<'_>) -> GqlResult<Vec<CloudBackup>> {
        cloud::list_backups(state(ctx))
            .await
            .map(|backups| backups.into_iter().map(Into::into).collect())
            .map_err(user_error)
    }
}

#[derive(Default)]
pub struct BackupMutations;

#[Object]
impl BackupMutations {
    async fn update_backup_settings(
        &self,
        ctx: &Context<'_>,
        input: BackupSettingsInput,
    ) -> GqlResult<Option<UpdateBackupSettingsPayload>> {
        match settings::update(state(ctx), input).await {
            Ok(settings) => Ok(Some(UpdateBackupSettingsPayload {
                backup_settings: Some(settings.into()),
            })),
            Err(UpdateError::Invalid(errors)) => Err(errors.extend()),
            Err(UpdateError::Db(error)) => Err(error.into()),
        }
    }

    async fn run_cloud_backup(
        &self,
        ctx: &Context<'_>,
    ) -> GqlResult<Option<RunCloudBackupPayload>> {
        let remote = cloud::run_backup(state(ctx)).await.map_err(user_error)?;
        Ok(Some(RunCloudBackupPayload {
            cloud_backup: Some(CloudBackupResult {
                id: Some(ID(remote.id)),
                name: Some(remote.name),
                provider: Some(remote.provider),
                size: remote.size,
                modified_at: remote.modified_at.map(|at| Timestamp::from(at).to_string()),
                status: "ok".to_owned(),
                message: "Backup uploaded.".to_owned(),
            }),
        }))
    }

    async fn stage_cloud_restore(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> GqlResult<Option<StageCloudRestorePayload>> {
        let result = cloud::stage_restore(state(ctx), &id)
            .await
            .map_err(user_error)?;
        Ok(Some(StageCloudRestorePayload {
            restore_result: Some(CloudRestoreResult {
                status: result.status,
                message: result.message,
                path: result.path,
            }),
        }))
    }
}

#[cfg(test)]
mod tests {
    use crate::test_app::TestApp;
    use serde_json::json;

    const SETTINGS: &str = "{ backupSettings { id enabled provider cron retentionCount s3Endpoint hasS3SecretAccessKey hasGoogleClientSecret hasGoogleRefreshToken lastBackupAt lastBackupStatus } }";

    #[tokio::test]
    async fn settings_round_trip_without_exposing_secrets() {
        let app = TestApp::new().await;
        assert_eq!(
            app.gql_data(SETTINGS, json!({})).await["backupSettings"],
            json!({
                "id": 1, "enabled": false, "provider": "none", "cron": "0 3 * * *",
                "retentionCount": null, "s3Endpoint": null, "hasS3SecretAccessKey": false,
                "hasGoogleClientSecret": false, "hasGoogleRefreshToken": false,
                "lastBackupAt": null, "lastBackupStatus": null
            })
        );
        let mutation = "mutation($input: BackupSettingsInput!) { updateBackupSettings(input: $input) { backupSettings { provider enabled retentionCount s3Endpoint hasS3SecretAccessKey } } }";
        let data = app
            .gql_data(
                mutation,
                json!({"input": {
                    "enabled": true, "provider": "s3", "cron": "0 4 * * *", "retentionCount": 5,
                    "s3Endpoint": "https://s3.test", "s3Bucket": "b", "s3Region": "auto",
                    "s3AccessKeyId": "key", "s3SecretAccessKey": "secret"
                }}),
            )
            .await;
        assert_eq!(
            data["updateBackupSettings"]["backupSettings"],
            json!({"provider": "s3", "enabled": true, "retentionCount": 5, "s3Endpoint": "https://s3.test", "hasS3SecretAccessKey": true})
        );
        // Omitted input fields keep their saved values.
        let data = app
            .gql_data(mutation, json!({"input": {"retentionCount": 7}}))
            .await;
        assert_eq!(
            data["updateBackupSettings"]["backupSettings"],
            json!({"provider": "s3", "enabled": true, "retentionCount": 7, "s3Endpoint": "https://s3.test", "hasS3SecretAccessKey": true})
        );
        let response = app
            .gql(
                mutation,
                json!({"input": {"retentionCount": 1001, "cron": "0 3 * *"}}),
            )
            .await;
        assert_eq!(
            response["errors"][0]["message"],
            "cron must contain five fields, retention count must be less than or equal to 1000"
        );
    }

    #[tokio::test]
    async fn cloud_operations_report_provider_errors() {
        let app = TestApp::new().await;
        assert_eq!(
            app.gql_data("{ cloudBackups { id } }", json!({})).await,
            json!({"cloudBackups": []})
        );
        let response = app
            .gql(
                "mutation { runCloudBackup { cloudBackup { status message } } }",
                json!({}),
            )
            .await;
        assert_eq!(
            response["errors"][0]["message"],
            "Choose Google Drive or S3 before running cloud backups."
        );
        let response = app
            .gql(
                r#"mutation { stageCloudRestore(id: "x") { restoreResult { status } } }"#,
                json!({}),
            )
            .await;
        assert_eq!(
            response["errors"][0]["message"],
            "Choose Google Drive or S3 before running cloud backups."
        );
        let settings = app.gql_data(SETTINGS, json!({})).await;
        assert_eq!(settings["backupSettings"]["lastBackupStatus"], "error");
        assert!(
            settings["backupSettings"]["lastBackupAt"]
                .as_str()
                .unwrap()
                .ends_with('Z')
        );
    }
}
