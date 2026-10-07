//! Background jobs stored in the `oban_jobs` table.
//!
//! The table, states, uniqueness rules, retry backoff, and worker names are
//! Oban's, so jobs queued by the Elixir app run here and the `deckAnalysisJob`
//! query can read either backend's rows. Each worker implements [`Worker`]
//! and is registered in [`crate::app::workers`].

pub mod cron;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;
use sqlx::SqlitePool;
use time::OffsetDateTime;
use tokio::sync::{Notify, Semaphore};

use crate::state::AppState;
use crate::timefmt;

/// Oban's "incomplete" states, used for uniqueness.
pub const INCOMPLETE_STATES: [&str; 4] = ["available", "scheduled", "executing", "retryable"];

/// Which fields make two jobs duplicates (`unique: [fields: ...]`). The period
/// is always infinite and the states always incomplete in this app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unique {
    /// One incomplete job per worker.
    Worker,
    /// One incomplete job per worker and args.
    WorkerArgs,
}

/// What a worker run returned.
#[derive(Debug)]
pub enum Outcome {
    /// `:ok`.
    Done,
    /// `{:error, reason}`: retry with backoff until `max_attempts`.
    Retry(String),
    /// `{:cancel, reason}`: stop without retrying.
    Cancel(String),
    /// `{:snooze, seconds}`: run again later without counting an attempt.
    Snooze(u64),
}

/// A claimed job.
#[derive(Debug, Clone)]
pub struct Job {
    pub id: i64,
    pub worker: String,
    pub args: Value,
    pub attempt: i64,
    pub max_attempts: i64,
}

/// A background worker.
#[async_trait]
pub trait Worker: Send + Sync {
    /// The Elixir module name, stored in `oban_jobs.worker`.
    fn name(&self) -> &'static str;
    /// The queue the worker runs on.
    fn queue(&self) -> &'static str;
    fn max_attempts(&self) -> i64 {
        20
    }
    fn unique(&self) -> Option<Unique> {
        None
    }
    /// How long a run may take before it is treated as an error.
    fn timeout(&self) -> Duration {
        Duration::from_secs(30 * 60)
    }
    /// Seconds to wait before retrying after failed attempt `attempt`
    /// (`backoff/1`); Oban's default is `2^attempt + 15`.
    fn backoff(&self, attempt: i64) -> u64 {
        2_u64.saturating_pow(u32::try_from(attempt).unwrap_or(10)) + 15
    }
    async fn perform(&self, state: &AppState, job: &Job) -> Outcome;
}

/// Queue concurrency (`queues:` in the Oban config).
pub const QUEUES: [(&str, usize); 5] = [
    ("ai", 2),
    ("backup", 1),
    ("catalog", 2),
    ("preview", 2),
    ("pricing", 1),
];

/// A cron entry (`Oban.Plugins.Cron` crontab).
#[derive(Debug, Clone)]
pub struct CronEntry {
    pub expression: &'static str,
    pub worker: &'static str,
}

#[derive(Debug, thiserror::Error)]
pub enum JobError {
    #[error("no worker named {0}")]
    UnknownWorker(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// The `ObanLogger` line for a failed attempt.
#[must_use]
pub fn failure_message(job: &Job, queue: &str, exhausted: bool, reason: &str) -> String {
    format!(
        "Oban job failed worker={} queue={queue} attempt={}/{} state={}\n** (Oban.PerformError) {} failed with {{:error, {reason:?}}}",
        job.worker,
        job.attempt,
        job.max_attempts,
        if exhausted { "discard" } else { "failure" },
        job.worker,
    )
}

/// Attempt counts from [`Jobs::drain_queue`].
#[cfg(test)]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Drained {
    pub success: usize,
    pub failure: usize,
    pub discard: usize,
    pub cancelled: usize,
    pub snoozed: usize,
}

/// Inserts and runs jobs.
#[derive(Clone)]
pub struct Jobs {
    pool: SqlitePool,
    workers: Arc<HashMap<&'static str, Arc<dyn Worker>>>,
    notify: Arc<Notify>,
}

impl Jobs {
    #[must_use]
    pub fn new(pool: SqlitePool, workers: Vec<Arc<dyn Worker>>) -> Self {
        let workers = workers
            .into_iter()
            .map(|worker| (worker.name(), worker))
            .collect();
        Self {
            pool,
            workers: Arc::new(workers),
            notify: Arc::new(Notify::new()),
        }
    }

    fn worker(&self, name: &str) -> Result<&Arc<dyn Worker>, JobError> {
        self.workers
            .get(name)
            .ok_or_else(|| JobError::UnknownWorker(name.to_owned()))
    }

    /// Inserts a job now. Returns the new job id, or the id of the existing
    /// incomplete job when the worker is unique and one is already queued
    /// (Oban returns the conflicting job with `conflict?: true`).
    pub async fn enqueue(&self, worker: &str, args: Value) -> Result<i64, JobError> {
        self.enqueue_at(worker, args, None).await
    }

    /// Inserts a job scheduled for `at` (or now).
    pub async fn enqueue_at(
        &self,
        worker: &str,
        args: Value,
        at: Option<OffsetDateTime>,
    ) -> Result<i64, JobError> {
        let mut tx = crate::db::begin_write(&self.pool).await?;
        let id = self.insert_job(&mut tx, worker, args, at).await?;
        tx.commit().await?;
        self.wake();
        Ok(id)
    }

    /// Inserts a job now inside the caller's write transaction (`Oban.insert`
    /// in an `Ecto.Multi`), so the job and the caller's rows commit together.
    /// Call [`Self::wake`] after committing.
    pub async fn enqueue_in(
        &self,
        conn: &mut sqlx::SqliteConnection,
        worker: &str,
        args: Value,
    ) -> Result<i64, JobError> {
        self.insert_job(conn, worker, args, None).await
    }

    /// Wakes the queue runners after jobs were committed.
    pub fn wake(&self) {
        self.notify.notify_waiters();
    }

    async fn insert_job(
        &self,
        tx: &mut sqlx::SqliteConnection,
        worker: &str,
        args: Value,
        at: Option<OffsetDateTime>,
    ) -> Result<i64, JobError> {
        let definition = self.worker(worker)?;
        let args_text = args.to_string();
        let existing: Option<i64> = match definition.unique() {
            None => None,
            Some(Unique::Worker) => {
                sqlx::query_scalar(
                    "SELECT id FROM oban_jobs WHERE worker = ?1 AND state IN ('available','scheduled','executing','retryable') ORDER BY id LIMIT 1",
                )
                .bind(worker)
                .fetch_optional(&mut *tx)
                .await?
            }
            Some(Unique::WorkerArgs) => {
                sqlx::query_scalar(
                    "SELECT id FROM oban_jobs WHERE worker = ?1 AND json(args) = json(?2) AND state IN ('available','scheduled','executing','retryable') ORDER BY id LIMIT 1",
                )
                .bind(worker)
                .bind(&args_text)
                .fetch_optional(&mut *tx)
                .await?
            }
        };
        if let Some(id) = existing {
            return Ok(id);
        }
        let now = timefmt::now_micros();
        let (state, scheduled_at) = match at {
            Some(at) if at > OffsetDateTime::now_utc() => ("scheduled", timefmt::utc_micros(at)),
            _ => ("available", now.clone()),
        };
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO oban_jobs (state, queue, worker, args, meta, tags, errors, attempt, max_attempts, priority, inserted_at, scheduled_at, attempted_by)
             VALUES (?1, ?2, ?3, json(?4), '{}', '[]', '[]', 0, ?5, 0, ?6, ?7, '[]') RETURNING id",
        )
        .bind(state)
        .bind(definition.queue())
        .bind(worker)
        .bind(&args_text)
        .bind(definition.max_attempts())
        .bind(&now)
        .bind(&scheduled_at)
        .fetch_one(&mut *tx)
        .await?;
        Ok(id)
    }

    /// Runs the queues and the cron schedule until the process exits.
    pub fn start(&self, state: AppState, crontab: Vec<CronEntry>) {
        let runner = self.clone();
        tokio::spawn(async move {
            if let Err(error) = runner.rescue_orphans().await {
                tracing::error!(%error, "could not rescue orphaned jobs");
            }
            for entry in crontab.iter().filter(|entry| entry.expression == "@reboot") {
                runner.enqueue_logged(entry.worker).await;
            }
            for (queue, limit) in QUEUES {
                runner.spawn_queue(state.clone(), queue, limit);
            }
            runner.run_cron(crontab).await;
        });
    }

    async fn enqueue_logged(&self, worker: &str) {
        if let Err(error) = self
            .enqueue(worker, Value::Object(serde_json::Map::new()))
            .await
        {
            tracing::error!(%error, worker, "could not insert scheduled job");
        }
    }

    async fn run_cron(&self, crontab: Vec<CronEntry>) {
        let scheduled: Vec<(cron::Cron, &'static str)> = crontab
            .iter()
            .filter(|entry| entry.expression != "@reboot")
            .filter_map(|entry| {
                cron::Cron::parse(entry.expression).map(|cron| (cron, entry.worker))
            })
            .collect();
        let mut last_minute = None;
        loop {
            let now = OffsetDateTime::now_utc();
            let minute = (now.date(), now.hour(), now.minute());
            if last_minute != Some(minute) {
                last_minute = Some(minute);
                for (cron, worker) in &scheduled {
                    if cron.matches(now) {
                        self.enqueue_logged(worker).await;
                    }
                }
                if let Err(error) = self.maintain().await {
                    tracing::warn!(%error, "job maintenance failed");
                }
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    /// Stages due jobs, rescues jobs stuck executing for over an hour
    /// (`Oban.Plugins.Lifeline`), and prunes finished jobs older than a day.
    async fn maintain(&self) -> Result<(), sqlx::Error> {
        let now = timefmt::now_micros();
        let hour_ago = timefmt::utc_micros(OffsetDateTime::now_utc() - Duration::from_secs(3600));
        let day_ago = timefmt::utc_micros(OffsetDateTime::now_utc() - Duration::from_secs(86_400));
        sqlx::query(
            "UPDATE oban_jobs SET state = CASE WHEN attempt >= max_attempts THEN 'discarded' ELSE 'available' END,
                 discarded_at = CASE WHEN attempt >= max_attempts THEN ?1 ELSE discarded_at END
             WHERE state = 'executing' AND attempted_at < ?2",
        )
        .bind(&now)
        .bind(&hour_ago)
        .execute(&self.pool)
        .await?;
        sqlx::query(
            "DELETE FROM oban_jobs WHERE state IN ('completed','cancelled','discarded')
             AND coalesce(completed_at, cancelled_at, discarded_at) < ?1",
        )
        .bind(&day_ago)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Single-node rescue at boot: nothing can still be executing a job from
    /// a previous process, so return those jobs to the queue immediately.
    async fn rescue_orphans(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE oban_jobs SET state = CASE WHEN attempt >= max_attempts THEN 'discarded' ELSE 'available' END,
                 discarded_at = CASE WHEN attempt >= max_attempts THEN ?1 ELSE discarded_at END
             WHERE state = 'executing'",
        )
        .bind(timefmt::now_micros())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    fn spawn_queue(&self, state: AppState, queue: &'static str, limit: usize) {
        let runner = self.clone();
        let slots = Arc::new(Semaphore::new(limit));
        tokio::spawn(async move {
            loop {
                let notified = runner.notify.notified();
                let available = slots.available_permits();
                if available > 0 {
                    match runner.claim(queue, available).await {
                        Ok(jobs) => {
                            for job in jobs {
                                let Ok(permit) = Arc::clone(&slots).acquire_owned().await else {
                                    return;
                                };
                                let runner = runner.clone();
                                let state = state.clone();
                                tokio::spawn(async move {
                                    runner.execute(&state, job).await;
                                    drop(permit);
                                    runner.notify.notify_waiters();
                                });
                            }
                        }
                        Err(error) => tracing::warn!(%error, queue, "could not fetch jobs"),
                    }
                }
                tokio::select! {
                    () = notified => {}
                    () = tokio::time::sleep(Duration::from_secs(1)) => {}
                }
            }
        });
    }

    async fn claim(&self, queue: &str, limit: usize) -> Result<Vec<Job>, sqlx::Error> {
        let now = timefmt::now_micros();
        let mut tx = crate::db::begin_write(&self.pool).await?;
        sqlx::query(
            "UPDATE oban_jobs SET state = 'available'
             WHERE state IN ('scheduled','retryable') AND queue = ?1 AND scheduled_at <= ?2",
        )
        .bind(queue)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
        let rows: Vec<(i64, String, String, i64, i64)> = sqlx::query_as(
            "UPDATE oban_jobs SET state = 'executing', attempt = attempt + 1, attempted_at = ?1,
                 attempted_by = json_array('manavault-rust')
             WHERE id IN (
               SELECT id FROM oban_jobs WHERE state = 'available' AND queue = ?2 AND scheduled_at <= ?1
               ORDER BY priority, scheduled_at, id LIMIT ?3)
             RETURNING id, worker, args, attempt, max_attempts",
        )
        .bind(&now)
        .bind(queue)
        .bind(i64::try_from(limit).unwrap_or(1))
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(rows
            .into_iter()
            .map(|(id, worker, args, attempt, max_attempts)| Job {
                id,
                worker,
                args: serde_json::from_str(&args).unwrap_or(Value::Null),
                attempt,
                max_attempts,
            })
            .collect())
    }

    async fn execute(&self, state: &AppState, job: Job) -> Outcome {
        let outcome = match self.workers.get(job.worker.as_str()) {
            None => Outcome::Cancel(format!("unknown worker {}", job.worker)),
            Some(worker) => {
                match tokio::time::timeout(worker.timeout(), worker.perform(state, &job)).await {
                    Ok(outcome) => outcome,
                    Err(_) => Outcome::Retry("timeout".to_owned()),
                }
            }
        };
        if let Err(error) = self.record(&job, &outcome).await {
            tracing::error!(%error, job.id, "could not record job outcome");
        }
        outcome
    }

    /// Runs every job in `queue` that is due once, like
    /// `Oban.drain_queue(queue: queue)` (without recursion); with
    /// `with_scheduled`, scheduled and retryable jobs run too. Returns how
    /// the attempts ended.
    #[cfg(test)]
    pub async fn drain_queue(
        &self,
        state: &AppState,
        queue: &str,
        with_scheduled: bool,
    ) -> Drained {
        if with_scheduled {
            let _ = sqlx::query(
                "UPDATE oban_jobs SET state = 'available', scheduled_at = ?1
                 WHERE state IN ('scheduled','retryable') AND queue = ?2",
            )
            .bind(timefmt::now_micros())
            .bind(queue)
            .execute(&self.pool)
            .await;
        }
        let mut drained = Drained::default();
        let jobs = self.claim(queue, 1_000).await.unwrap_or_default();
        for job in jobs {
            let exhausted = job.attempt >= job.max_attempts;
            match self.execute(state, job).await {
                Outcome::Done => drained.success += 1,
                Outcome::Retry(_) if exhausted => drained.discard += 1,
                Outcome::Retry(_) => drained.failure += 1,
                Outcome::Cancel(_) => drained.cancelled += 1,
                Outcome::Snooze(_) => drained.snoozed += 1,
            }
        }
        drained
    }

    async fn record(&self, job: &Job, outcome: &Outcome) -> Result<(), sqlx::Error> {
        let now = timefmt::now_micros();
        match outcome {
            Outcome::Done => {
                sqlx::query(
                    "UPDATE oban_jobs SET state = 'completed', completed_at = ?1 WHERE id = ?2",
                )
                .bind(&now)
                .bind(job.id)
                .execute(&self.pool)
                .await?;
            }
            Outcome::Snooze(seconds) => {
                let at = OffsetDateTime::now_utc() + Duration::from_secs(*seconds);
                sqlx::query(
                    "UPDATE oban_jobs SET state = 'scheduled', scheduled_at = ?1, max_attempts = max_attempts + 1 WHERE id = ?2",
                )
                .bind(timefmt::utc_micros(at))
                .bind(job.id)
                .execute(&self.pool)
                .await?;
            }
            Outcome::Cancel(reason) => {
                tracing::info!(job.id, worker = job.worker, reason, "job cancelled");
                sqlx::query(
                    "UPDATE oban_jobs SET state = 'cancelled', cancelled_at = ?1,
                       errors = json_insert(errors, '$[#]', json_object('at', ?1, 'attempt', attempt, 'error', ?2))
                     WHERE id = ?3",
                )
                .bind(&now)
                .bind(reason)
                .bind(job.id)
                .execute(&self.pool)
                .await?;
            }
            Outcome::Retry(reason) => {
                let exhausted = job.attempt >= job.max_attempts;
                // `Manavault.ObanLogger`: failures reach the application log
                // (and the server log page), not just the job row.
                tracing::error!(
                    "{}",
                    failure_message(
                        job,
                        self.workers
                            .get(job.worker.as_str())
                            .map_or("", |w| w.queue()),
                        exhausted,
                        reason
                    )
                );
                // The worker's backoff (Oban's default: 2^attempt + 15 seconds).
                let delay = self.workers.get(job.worker.as_str()).map_or_else(
                    || 2_u64.saturating_pow(u32::try_from(job.attempt).unwrap_or(10)) + 15,
                    |worker| worker.backoff(job.attempt),
                );
                let at = OffsetDateTime::now_utc() + Duration::from_secs(delay);
                sqlx::query(
                    "UPDATE oban_jobs SET state = ?1, scheduled_at = ?2,
                       discarded_at = CASE WHEN ?1 = 'discarded' THEN ?3 ELSE discarded_at END,
                       errors = json_insert(errors, '$[#]', json_object('at', ?3, 'attempt', attempt, 'error', ?4))
                     WHERE id = ?5",
                )
                .bind(if exhausted { "discarded" } else { "retryable" })
                .bind(timefmt::utc_micros(at))
                .bind(&now)
                .bind(reason)
                .bind(job.id)
                .execute(&self.pool)
                .await?;
            }
        }
        Ok(())
    }
}
