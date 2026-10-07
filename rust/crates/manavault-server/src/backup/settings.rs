//! Cloud backup settings (`Manavault.Backup.Settings` and `CloudSettings`):
//! the `backup_settings` singleton row. Provider secrets are stored
//! encrypted (`Manavault.Encrypted.Binary`) and are never returned; a blank
//! or missing secret in an update keeps the saved one.

use async_graphql::{InputObject, MaybeUndefined};

use super::cron::Schedule;
use crate::settings::changeset::{BLANK, Errors, INVALID};
use crate::state::AppState;
use crate::timefmt;

const SINGLETON_ID: i64 = 1;

/// Where backups go.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    None,
    S3,
    GoogleDrive,
}

impl Provider {
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "none" => Some(Self::None),
            "s3" => Some(Self::S3),
            "google_drive" => Some(Self::GoogleDrive),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::S3 => "s3",
            Self::GoogleDrive => "google_drive",
        }
    }
}

/// The settings row with secrets decrypted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudSettings {
    pub id: i64,
    pub enabled: bool,
    /// The stored provider text (`none`, `s3`, or `google_drive`).
    pub provider: String,
    pub cron: String,
    pub retention_count: Option<i64>,
    pub s3_endpoint: Option<String>,
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    pub s3_prefix: Option<String>,
    pub s3_access_key_id: Option<String>,
    pub s3_secret_access_key: Option<String>,
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub google_refresh_token: Option<String>,
    pub google_folder_id: Option<String>,
    pub last_backup_at: Option<String>,
    pub last_backup_status: Option<String>,
    pub last_backup_message: Option<String>,
    pub last_backup_path: Option<String>,
    pub last_restore_at: Option<String>,
    pub last_restore_status: Option<String>,
    pub last_restore_message: Option<String>,
    pub pending_restore_path: Option<String>,
}

impl CloudSettings {
    /// The provider, when it is a known one.
    #[must_use]
    pub fn provider(&self) -> Option<Provider> {
        Provider::parse(&self.provider)
    }

    /// Defaults for a settings value built in memory (tests, signing).
    #[must_use]
    pub fn blank() -> Self {
        Self {
            id: SINGLETON_ID,
            enabled: false,
            provider: "none".to_owned(),
            cron: "0 3 * * *".to_owned(),
            retention_count: None,
            s3_endpoint: None,
            s3_bucket: None,
            s3_region: None,
            s3_prefix: None,
            s3_access_key_id: None,
            s3_secret_access_key: None,
            google_client_id: None,
            google_client_secret: None,
            google_refresh_token: None,
            google_folder_id: None,
            last_backup_at: None,
            last_backup_status: None,
            last_backup_message: None,
            last_backup_path: None,
            last_restore_at: None,
            last_restore_status: None,
            last_restore_message: None,
            pending_restore_path: None,
        }
    }
}

/// `CloudSettings.secret_present?/2`.
#[must_use]
pub fn present(value: Option<&str>) -> bool {
    value.is_some_and(|value| !value.trim().is_empty())
}

/// Loads the row, inserting the defaults when missing (`Settings.get!/0`).
pub async fn get(state: &AppState) -> Result<CloudSettings, sqlx::Error> {
    let now = timefmt::now();
    sqlx::query!(
        "INSERT INTO backup_settings (id, enabled, provider, cron, inserted_at, updated_at)
         VALUES (?1, 0, 'none', '0 3 * * *', ?2, ?2) ON CONFLICT(id) DO NOTHING",
        SINGLETON_ID,
        now
    )
    .execute(&state.db)
    .await?;
    let row = sqlx::query!(
        r#"SELECT id AS "id!", enabled AS "enabled: bool", provider, cron, retention_count,
             s3_endpoint, s3_bucket, s3_region, s3_prefix, s3_access_key_id, s3_secret_access_key,
             google_client_id, google_client_secret, google_refresh_token, google_folder_id,
             last_backup_at, last_backup_status, last_backup_message, last_backup_path,
             last_restore_at, last_restore_status, last_restore_message, pending_restore_path
           FROM backup_settings WHERE id = ?1"#,
        SINGLETON_ID
    )
    .fetch_one(&state.db)
    .await?;
    let decrypt = |value: Option<String>| value.and_then(|stored| state.decrypt_secret(&stored));
    Ok(CloudSettings {
        id: row.id,
        enabled: row.enabled,
        provider: row.provider,
        cron: row.cron,
        retention_count: row.retention_count,
        s3_endpoint: row.s3_endpoint,
        s3_bucket: row.s3_bucket,
        s3_region: row.s3_region,
        s3_prefix: row.s3_prefix,
        s3_access_key_id: row.s3_access_key_id,
        s3_secret_access_key: decrypt(row.s3_secret_access_key),
        google_client_id: row.google_client_id,
        google_client_secret: decrypt(row.google_client_secret),
        google_refresh_token: decrypt(row.google_refresh_token),
        google_folder_id: row.google_folder_id,
        last_backup_at: row.last_backup_at,
        last_backup_status: row.last_backup_status,
        last_backup_message: row.last_backup_message,
        last_backup_path: row.last_backup_path,
        last_restore_at: row.last_restore_at,
        last_restore_status: row.last_restore_status,
        last_restore_message: row.last_restore_message,
        pending_restore_path: row.pending_restore_path,
    })
}

/// `BackupSettingsInput`: omitted fields keep their saved values.
#[derive(Debug, Clone, Default, InputObject)]
#[graphql(name = "BackupSettingsInput")]
pub struct BackupSettingsInput {
    pub enabled: MaybeUndefined<bool>,
    pub provider: MaybeUndefined<String>,
    pub cron: MaybeUndefined<String>,
    pub retention_count: MaybeUndefined<i64>,
    pub s3_endpoint: MaybeUndefined<String>,
    pub s3_bucket: MaybeUndefined<String>,
    pub s3_region: MaybeUndefined<String>,
    pub s3_prefix: MaybeUndefined<String>,
    pub s3_access_key_id: MaybeUndefined<String>,
    pub s3_secret_access_key: MaybeUndefined<String>,
    pub google_client_id: MaybeUndefined<String>,
    pub google_client_secret: MaybeUndefined<String>,
    pub google_refresh_token: MaybeUndefined<String>,
    pub google_folder_id: MaybeUndefined<String>,
}

/// Casts a string field: trimmed, blanks become `None`. Returns whether the
/// value changed.
fn cast_text(target: &mut Option<String>, value: MaybeUndefined<String>) -> bool {
    let value = match value {
        MaybeUndefined::Undefined => return false,
        MaybeUndefined::Null => None,
        MaybeUndefined::Value(text) => Some(text.trim().to_owned()).filter(|t| !t.is_empty()),
    };
    let changed = *target != value;
    *target = value;
    changed
}

/// A secret: missing, `null`, or blank keeps the saved value.
fn cast_secret(target: &mut Option<String>, value: MaybeUndefined<String>) {
    if let MaybeUndefined::Value(text) = value
        && !text.trim().is_empty()
    {
        *target = Some(text.trim().to_owned());
    }
}

/// Why saving failed.
#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("{}", .0.message())]
    Invalid(Errors),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Validates and saves the settings (`Settings.update/1`).
pub async fn update(
    state: &AppState,
    input: BackupSettingsInput,
) -> Result<CloudSettings, UpdateError> {
    let mut settings = get(state).await?;
    let mut errors = Errors::new();

    // `enabled` is NOT NULL; an explicit null keeps the saved value instead
    // of failing the write as Ecto does.
    if let MaybeUndefined::Value(enabled) = input.enabled {
        settings.enabled = enabled;
    }
    let mut provider = Some(settings.provider.clone());
    let provider_changed = cast_text(&mut provider, input.provider);
    let mut cron = Some(settings.cron.clone());
    let cron_changed = cast_text(&mut cron, input.cron);
    let retention_changed = match input.retention_count {
        MaybeUndefined::Undefined => false,
        MaybeUndefined::Null => {
            let changed = settings.retention_count.is_some();
            settings.retention_count = None;
            changed
        }
        MaybeUndefined::Value(count) => {
            let changed = settings.retention_count != Some(count);
            settings.retention_count = Some(count);
            changed
        }
    };
    cast_text(&mut settings.s3_endpoint, input.s3_endpoint);
    cast_text(&mut settings.s3_bucket, input.s3_bucket);
    cast_text(&mut settings.s3_region, input.s3_region);
    cast_text(&mut settings.s3_prefix, input.s3_prefix);
    cast_text(&mut settings.s3_access_key_id, input.s3_access_key_id);
    cast_secret(
        &mut settings.s3_secret_access_key,
        input.s3_secret_access_key,
    );
    cast_text(&mut settings.google_client_id, input.google_client_id);
    cast_secret(
        &mut settings.google_client_secret,
        input.google_client_secret,
    );
    cast_secret(
        &mut settings.google_refresh_token,
        input.google_refresh_token,
    );
    cast_text(&mut settings.google_folder_id, input.google_folder_id);

    if provider.is_none() {
        errors.add("provider", BLANK);
    }
    if cron.is_none() {
        errors.add("cron", BLANK);
    }
    if provider_changed
        && let Some(value) = provider.as_deref()
        && Provider::parse(value).is_none()
    {
        errors.add("provider", INVALID);
    }
    if cron_changed
        && let Some(value) = cron.as_deref()
        && let Err(reason) = Schedule::parse(value)
    {
        errors.add("cron", reason);
    }
    if retention_changed && let Some(count) = settings.retention_count {
        if count < 1 {
            errors.add("retention_count", "must be greater than or equal to 1");
        } else if count > 1000 {
            errors.add("retention_count", "must be less than or equal to 1000");
        }
    }
    let required: &[(&'static str, &Option<String>)] =
        match provider.as_deref().and_then(Provider::parse) {
            Some(Provider::S3) => &[
                ("s3_endpoint", &settings.s3_endpoint),
                ("s3_bucket", &settings.s3_bucket),
                ("s3_region", &settings.s3_region),
                ("s3_access_key_id", &settings.s3_access_key_id),
                ("s3_secret_access_key", &settings.s3_secret_access_key),
            ],
            Some(Provider::GoogleDrive) => &[
                ("google_client_id", &settings.google_client_id),
                ("google_client_secret", &settings.google_client_secret),
                ("google_refresh_token", &settings.google_refresh_token),
            ],
            // An unknown provider already failed inclusion; Elixir raises a
            // CaseClauseError here.
            Some(Provider::None) | None => &[],
        };
    for (field, value) in required {
        if !present(value.as_deref()) {
            errors.add(field, BLANK);
        }
    }
    errors.into_result().map_err(UpdateError::Invalid)?;

    settings.provider = provider.unwrap_or_default();
    settings.cron = cron.unwrap_or_default();
    let encrypt = |value: &Option<String>| value.as_deref().and_then(|v| state.encrypt_secret(v));
    let (s3_secret, google_secret, google_token) = (
        encrypt(&settings.s3_secret_access_key),
        encrypt(&settings.google_client_secret),
        encrypt(&settings.google_refresh_token),
    );
    let now = timefmt::now();
    sqlx::query!(
        "UPDATE backup_settings SET enabled = ?1, provider = ?2, cron = ?3, retention_count = ?4,
           s3_endpoint = ?5, s3_bucket = ?6, s3_region = ?7, s3_prefix = ?8, s3_access_key_id = ?9,
           s3_secret_access_key = ?10, google_client_id = ?11, google_client_secret = ?12,
           google_refresh_token = ?13, google_folder_id = ?14, updated_at = ?15
         WHERE id = ?16",
        settings.enabled,
        settings.provider,
        settings.cron,
        settings.retention_count,
        settings.s3_endpoint,
        settings.s3_bucket,
        settings.s3_region,
        settings.s3_prefix,
        settings.s3_access_key_id,
        s3_secret,
        settings.google_client_id,
        google_secret,
        google_token,
        settings.google_folder_id,
        now,
        SINGLETON_ID
    )
    .execute(&state.db)
    .await?;
    Ok(settings)
}

/// A status change (`Settings.update_status/1`); `None` fields are left alone.
#[derive(Debug, Clone, Default)]
pub struct Status {
    pub last_backup_at: Option<String>,
    pub last_backup_status: Option<String>,
    pub last_backup_message: Option<String>,
    pub last_backup_path: Option<String>,
    pub last_restore_at: Option<String>,
    pub last_restore_status: Option<String>,
    pub last_restore_message: Option<String>,
    pub pending_restore_path: Option<String>,
}

/// Records a backup or restore outcome.
pub async fn update_status(state: &AppState, status: Status) -> Result<(), sqlx::Error> {
    get(state).await?;
    let now = timefmt::now();
    sqlx::query!(
        "UPDATE backup_settings SET
           last_backup_at = coalesce(?1, last_backup_at),
           last_backup_status = coalesce(?2, last_backup_status),
           last_backup_message = coalesce(?3, last_backup_message),
           last_backup_path = coalesce(?4, last_backup_path),
           last_restore_at = coalesce(?5, last_restore_at),
           last_restore_status = coalesce(?6, last_restore_status),
           last_restore_message = coalesce(?7, last_restore_message),
           pending_restore_path = coalesce(?8, pending_restore_path),
           updated_at = ?9
         WHERE id = ?10",
        status.last_backup_at,
        status.last_backup_status,
        status.last_backup_message,
        status.last_backup_path,
        status.last_restore_at,
        status.last_restore_status,
        status.last_restore_message,
        status.pending_restore_path,
        now,
        SINGLETON_ID
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestApp;

    fn s3_input() -> BackupSettingsInput {
        let value = |text: &str| MaybeUndefined::Value(text.to_owned());
        BackupSettingsInput {
            provider: value("s3"),
            cron: value("0 3 * * *"),
            s3_endpoint: value("https://s3.example.com"),
            s3_bucket: value("backups"),
            s3_region: value("us-east-1"),
            s3_access_key_id: value("AKIA-not-secret"),
            s3_secret_access_key: value("the-s3-secret"),
            google_client_secret: value("the-google-secret"),
            google_refresh_token: value("the-refresh-token"),
            ..BackupSettingsInput::default()
        }
    }

    #[tokio::test]
    async fn secrets_are_stored_encrypted_and_read_back_as_plaintext() {
        let app = TestApp::new().await;
        update(&app.state, s3_input()).await.unwrap();
        let reloaded = get(&app.state).await.unwrap();
        assert_eq!(
            reloaded.s3_secret_access_key.as_deref(),
            Some("the-s3-secret")
        );
        assert_eq!(
            reloaded.google_client_secret.as_deref(),
            Some("the-google-secret")
        );
        assert_eq!(
            reloaded.google_refresh_token.as_deref(),
            Some("the-refresh-token")
        );
        let (raw_s3, raw_client, raw_token, raw_access_key): (String, String, String, String) =
            sqlx::query_as(
                "SELECT s3_secret_access_key, google_client_secret, google_refresh_token, s3_access_key_id FROM backup_settings WHERE id = 1",
            )
            .fetch_one(app.db())
            .await
            .unwrap();
        for raw in [&raw_s3, &raw_client, &raw_token] {
            assert!(raw.starts_with("enc.v1."));
        }
        assert!(!raw_s3.contains("the-s3-secret"));
        assert!(!raw_client.contains("the-google-secret"));
        assert!(!raw_token.contains("the-refresh-token"));
        assert_eq!(raw_access_key, "AKIA-not-secret");
    }

    #[tokio::test]
    async fn blank_secrets_keep_the_saved_ones_and_validation_messages_match() {
        let app = TestApp::new().await;
        update(&app.state, s3_input()).await.unwrap();
        let kept = update(
            &app.state,
            BackupSettingsInput {
                s3_secret_access_key: MaybeUndefined::Value("  ".into()),
                s3_prefix: MaybeUndefined::Value("  manavault ".into()),
                ..BackupSettingsInput::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(kept.s3_secret_access_key.as_deref(), Some("the-s3-secret"));
        assert_eq!(kept.s3_prefix.as_deref(), Some("manavault"));

        let message = |result: Result<CloudSettings, UpdateError>| match result {
            Err(UpdateError::Invalid(errors)) => errors.message(),
            other => unreachable!("expected a validation error, got {other:?}"),
        };
        let fresh = TestApp::new().await;
        assert_eq!(
            message(
                update(
                    &fresh.state,
                    BackupSettingsInput {
                        provider: MaybeUndefined::Value("s3".into()),
                        ..BackupSettingsInput::default()
                    },
                )
                .await
            ),
            "s3_access_key_id can't be blank, s3_bucket can't be blank, s3_endpoint can't be blank, s3_region can't be blank, s3_secret_access_key can't be blank"
        );
        assert_eq!(
            message(
                update(
                    &fresh.state,
                    BackupSettingsInput {
                        cron: MaybeUndefined::Value("99 3 * * *".into()),
                        retention_count: MaybeUndefined::Value(0),
                        provider: MaybeUndefined::Value("dropbox".into()),
                        ..BackupSettingsInput::default()
                    },
                )
                .await
            ),
            "cron invalid minute: 99 is outside 0-59, provider is invalid, retention_count must be greater than or equal to 1"
        );
        assert_eq!(
            message(
                update(
                    &fresh.state,
                    BackupSettingsInput {
                        provider: MaybeUndefined::Value("google_drive".into()),
                        cron: MaybeUndefined::Value(" ".into()),
                        ..BackupSettingsInput::default()
                    },
                )
                .await
            ),
            "cron can't be blank, google_client_id can't be blank, google_client_secret can't be blank, google_refresh_token can't be blank"
        );
    }
}
