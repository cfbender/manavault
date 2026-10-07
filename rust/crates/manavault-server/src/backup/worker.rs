//! The scheduled cloud backup (`Manavault.Backup.CloudBackupWorker`): the
//! crontab enqueues a tick every minute, and the tick backs up when the
//! owner's schedule matches the minute it was scheduled for.

use std::time::Duration;

use async_trait::async_trait;

use super::{cloud, cron, settings};
use crate::jobs::{Job, Outcome, Unique, Worker};
use crate::state::AppState;

/// The worker name stored in `oban_jobs`.
pub const WORKER: &str = "Manavault.Backup.CloudBackupWorker";

pub struct CloudBackupWorker;

async fn scheduled_at(state: &AppState, job: &Job) -> Option<time::OffsetDateTime> {
    let stored = sqlx::query_scalar!("SELECT scheduled_at FROM oban_jobs WHERE id = ?1", job.id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()?;
    crate::timefmt::parse(&stored)
}

#[async_trait]
impl Worker for CloudBackupWorker {
    fn name(&self) -> &'static str {
        WORKER
    }

    fn queue(&self) -> &'static str {
        "backup"
    }

    fn max_attempts(&self) -> i64 {
        3
    }

    fn unique(&self) -> Option<Unique> {
        Some(Unique::Worker)
    }

    fn timeout(&self) -> Duration {
        Duration::from_secs(30 * 60)
    }

    async fn perform(&self, state: &AppState, job: &Job) -> Outcome {
        let settings = match settings::get(state).await {
            Ok(settings) => settings,
            Err(error) => return Outcome::Retry(error.to_string()),
        };
        let at = scheduled_at(state, job)
            .await
            .unwrap_or_else(time::OffsetDateTime::now_utc);
        if !(settings.enabled && settings.provider != "none" && cron::matches(&settings.cron, at)) {
            return Outcome::Done;
        }
        match cloud::run_backup(state).await {
            Ok(remote) => {
                tracing::info!("scheduled cloud backup uploaded {}", remote.name);
                Outcome::Done
            }
            Err(reason) => {
                tracing::error!("scheduled cloud backup failed: {reason:?}");
                Outcome::Retry(reason)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::settings::BackupSettingsInput;
    use crate::test_support::TestApp;
    use async_graphql::MaybeUndefined;
    use serde_json::json;

    #[tokio::test]
    async fn disabled_scheduled_backups_finish_without_running() {
        let app = TestApp::new().await;
        settings::update(
            &app.state,
            BackupSettingsInput {
                enabled: MaybeUndefined::Value(false),
                provider: MaybeUndefined::Value("none".into()),
                cron: MaybeUndefined::Value("* * * * *".into()),
                ..BackupSettingsInput::default()
            },
        )
        .await
        .unwrap();
        let job = Job {
            id: 1,
            worker: WORKER.into(),
            args: json!({}),
            attempt: 1,
            max_attempts: 3,
        };
        assert!(matches!(
            CloudBackupWorker.perform(&app.state, &job).await,
            Outcome::Done
        ));
        assert_eq!(
            settings::get(&app.state).await.unwrap().last_backup_status,
            None
        );
    }

    #[tokio::test]
    async fn only_one_backup_tick_may_be_pending() {
        let app = TestApp::new().await;
        let first = app.state.jobs.enqueue(WORKER, json!({})).await.unwrap();
        let duplicate = app.state.jobs.enqueue(WORKER, json!({})).await.unwrap();
        assert_eq!(first, duplicate);
        let queue: String = sqlx::query_scalar("SELECT queue FROM oban_jobs WHERE id = ?1")
            .bind(first)
            .fetch_one(app.db())
            .await
            .unwrap();
        assert_eq!(queue, "backup");
    }

    #[tokio::test]
    async fn an_enabled_schedule_runs_when_it_matches_the_scheduled_minute() {
        let app = TestApp::new().await;
        settings::get(&app.state).await.unwrap();
        sqlx::query("UPDATE backup_settings SET enabled = 1, provider = 's3', cron = '0 3 * * *'")
            .execute(app.db())
            .await
            .unwrap();
        let id = app.state.jobs.enqueue(WORKER, json!({})).await.unwrap();
        let job = Job {
            id,
            worker: WORKER.into(),
            args: json!({}),
            attempt: 1,
            max_attempts: 3,
        };
        for (scheduled, ran) in [
            ("2026-10-07T04:00:00.000000Z", false),
            ("2026-10-07T03:00:00.000000Z", true),
        ] {
            sqlx::query("UPDATE oban_jobs SET scheduled_at = ?1 WHERE id = ?2")
                .bind(scheduled)
                .bind(id)
                .execute(app.db())
                .await
                .unwrap();
            let outcome = CloudBackupWorker.perform(&app.state, &job).await;
            // Running fails here (no S3 credentials), which proves it ran.
            assert_eq!(matches!(outcome, Outcome::Retry(_)), ran, "{scheduled}");
        }
    }

    /// The crontab entries and timeouts of this area's workers.
    #[test]
    fn oban_crontab_and_timeouts() {
        let crontab: Vec<(&str, &str)> = crate::app::crontab()
            .iter()
            .map(|entry| (entry.expression, entry.worker))
            .collect();
        for expected in [
            ("@reboot", crate::scanner::update_worker::WORKER),
            ("0 */6 * * *", crate::scanner::update_worker::WORKER),
            ("* * * * *", WORKER),
        ] {
            assert!(crontab.contains(&expected), "{expected:?}");
        }
        assert_eq!(
            crate::jobs::QUEUES,
            [
                ("ai", 2),
                ("backup", 1),
                ("catalog", 2),
                ("preview", 2),
                ("pricing", 1)
            ]
        );
        // Orphan rescue waits an hour, so every worker must time out sooner.
        for worker in crate::app::workers() {
            assert!(
                worker.timeout() < Duration::from_secs(3600),
                "{}",
                worker.name()
            );
        }
    }

    /// Job failures are logged with the worker, queue, attempt, and error.
    #[test]
    fn oban_logger_formats_failures() {
        let job = Job {
            id: 1,
            worker: "Manavault.Pricing.VendorSyncWorker".into(),
            args: json!({}),
            attempt: 1,
            max_attempts: 3,
        };
        let message = crate::jobs::failure_message(&job, "pricing", false, "feed exploded");
        assert!(message.starts_with(
            "Oban job failed worker=Manavault.Pricing.VendorSyncWorker queue=pricing attempt=1/3 state=failure"
        ));
        assert!(message.contains("feed exploded"));
    }
}
