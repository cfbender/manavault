//! Background jobs stored in the `jobs` table and run in this process.
//!
//! A job is a row naming a [`Worker`] and carrying JSON args. It is `queued`
//! until its `run_at`, `running` while a worker performs it, and ends
//! `succeeded`, `failed` (every attempt returned [`Outcome::Retry`]) or
//! `cancelled` (the worker returned [`Outcome::Cancel`]). Each queue runs a
//! bounded number of jobs at once ([`QUEUES`]); the crontab enqueues
//! periodic jobs. Workers are registered in `app::workers`.

pub mod cron;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use sqlx::SqlitePool;
use time::OffsetDateTime;
use tokio::sync::{Notify, Semaphore};

use crate::state::AppState;
use crate::timefmt;

/// Which fields make two jobs duplicates. Uniqueness only considers jobs
/// that are queued or running.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unique {
    /// One pending job per worker.
    Worker,
    /// One pending job per worker and args.
    WorkerArgs,
}

/// What a worker run returned.
#[derive(Debug)]
pub enum Outcome {
    Done,
    /// Retry with backoff until `max_attempts`, then fail.
    Retry(String),
    /// Stop without retrying.
    Cancel(String),
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

/// A background worker. Implement this; the registry stores it as a
/// [`DynWorker`].
pub trait Worker: Send + Sync + 'static {
    /// The name stored in `jobs.worker`.
    fn name(&self) -> &'static str;
    /// The queue the worker runs on (one of [`QUEUES`]).
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
    /// How long to wait before retrying after failed attempt `attempt`.
    fn backoff(&self, attempt: i64) -> Duration {
        Duration::from_secs(2_u64.saturating_pow(u32::try_from(attempt).unwrap_or(10)) + 15)
    }
    fn perform(&self, state: &AppState, job: &Job) -> impl Future<Output = Outcome> + Send;
}

/// The object-safe form of [`Worker`], implemented for every worker.
pub trait DynWorker: Send + Sync {
    fn name(&self) -> &'static str;
    fn queue(&self) -> &'static str;
    fn max_attempts(&self) -> i64;
    fn unique(&self) -> Option<Unique>;
    fn timeout(&self) -> Duration;
    fn backoff(&self, attempt: i64) -> Duration;
    fn perform<'a>(
        &'a self,
        state: &'a AppState,
        job: &'a Job,
    ) -> Pin<Box<dyn Future<Output = Outcome> + Send + 'a>>;
}

impl<W: Worker> DynWorker for W {
    fn name(&self) -> &'static str {
        Worker::name(self)
    }
    fn queue(&self) -> &'static str {
        Worker::queue(self)
    }
    fn max_attempts(&self) -> i64 {
        Worker::max_attempts(self)
    }
    fn unique(&self) -> Option<Unique> {
        Worker::unique(self)
    }
    fn timeout(&self) -> Duration {
        Worker::timeout(self)
    }
    fn backoff(&self, attempt: i64) -> Duration {
        Worker::backoff(self, attempt)
    }
    fn perform<'a>(
        &'a self,
        state: &'a AppState,
        job: &'a Job,
    ) -> Pin<Box<dyn Future<Output = Outcome> + Send + 'a>> {
        Box::pin(Worker::perform(self, state, job))
    }
}

/// Queue concurrency.
pub const QUEUES: [(&str, usize); 5] = [
    ("ai", 2),
    ("backup", 1),
    ("catalog", 2),
    ("preview", 2),
    ("pricing", 1),
];

/// A crontab entry: a five-field cron expression (or `@reboot`) and the
/// worker to enqueue with empty args when it matches.
#[derive(Debug, Clone)]
pub struct CronEntry {
    pub expression: &'static str,
    pub worker: &'static str,
}

/// Jobs stuck `running` for this long are returned to the queue; every
/// worker's timeout must be shorter.
pub const STUCK_AFTER: Duration = Duration::from_secs(3600);

/// Finished jobs are deleted after this long.
const KEEP_FINISHED_FOR: Duration = Duration::from_secs(86_400);

#[derive(Debug, thiserror::Error)]
pub enum JobError {
    #[error("no worker named {0}")]
    UnknownWorker(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Attempt counts from [`Jobs::drain_queue`].
#[doc(hidden)]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Drained {
    pub success: usize,
    pub failure: usize,
    pub discard: usize,
    pub cancelled: usize,
}

/// Inserts and runs jobs.
#[derive(Clone)]
pub struct Jobs {
    pool: SqlitePool,
    workers: Arc<HashMap<&'static str, Arc<dyn DynWorker>>>,
    notify: Arc<Notify>,
}

impl Jobs {
    #[must_use]
    pub fn new(pool: SqlitePool, workers: Vec<Arc<dyn DynWorker>>) -> Self {
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

    fn worker(&self, name: &str) -> Result<&Arc<dyn DynWorker>, JobError> {
        self.workers
            .get(name)
            .ok_or_else(|| JobError::UnknownWorker(name.to_owned()))
    }

    /// Inserts a job to run now. Returns the new job id, or the id of the
    /// pending job it duplicates when the worker is unique.
    pub async fn enqueue(&self, worker: &str, args: Value) -> Result<i64, JobError> {
        self.enqueue_at(worker, args, None).await
    }

    /// Inserts a job to run at `at` (or now).
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

    /// Inserts a job to run now inside the caller's write transaction, so
    /// the job and the caller's rows commit together. Call [`Self::wake`]
    /// after committing.
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
                    "SELECT id FROM jobs WHERE worker = ?1 AND state IN ('queued', 'running') ORDER BY id LIMIT 1",
                )
                .bind(worker)
                .fetch_optional(&mut *tx)
                .await?
            }
            Some(Unique::WorkerArgs) => {
                sqlx::query_scalar(
                    "SELECT id FROM jobs WHERE worker = ?1 AND json(args) = json(?2) AND state IN ('queued', 'running') ORDER BY id LIMIT 1",
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
        let now = OffsetDateTime::now_utc();
        let run_at = at.filter(|at| *at > now).unwrap_or(now);
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO jobs (worker, queue, args, max_attempts, run_at, inserted_at)
             VALUES (?1, ?2, json(?3), ?4, ?5, ?6) RETURNING id",
        )
        .bind(worker)
        .bind(definition.queue())
        .bind(&args_text)
        .bind(definition.max_attempts())
        .bind(timefmt::utc_micros(run_at))
        .bind(timefmt::utc_micros(now))
        .fetch_one(&mut *tx)
        .await?;
        Ok(id)
    }

    /// Runs the queues and the cron schedule until the process exits.
    pub fn start(&self, state: AppState, crontab: Vec<CronEntry>) {
        let runner = self.clone();
        tokio::spawn(async move {
            if let Err(error) = runner.requeue_running().await {
                tracing::error!(%error, "could not requeue interrupted jobs");
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

    /// Requeues jobs stuck running for over [`STUCK_AFTER`] (a worker that
    /// never returned) and prunes finished jobs older than a day.
    async fn maintain(&self) -> Result<(), sqlx::Error> {
        let now = OffsetDateTime::now_utc();
        let stuck_before = timefmt::utc_micros(now - STUCK_AFTER);
        sqlx::query("UPDATE jobs SET state = 'queued', run_at = ?1 WHERE state = 'running' AND started_at < ?2")
            .bind(timefmt::utc_micros(now))
            .bind(&stuck_before)
            .execute(&self.pool)
            .await?;
        let prune_before = timefmt::utc_micros(now - KEEP_FINISHED_FOR);
        sqlx::query(
            "DELETE FROM jobs WHERE state IN ('succeeded', 'failed', 'cancelled') AND finished_at < ?1",
        )
        .bind(&prune_before)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// At boot nothing can still be running a job from the previous
    /// process, so those jobs go straight back to the queue.
    async fn requeue_running(&self) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE jobs SET state = 'queued', run_at = ?1 WHERE state = 'running'")
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

    /// Marks up to `limit` due jobs of `queue` running and returns them.
    async fn claim(&self, queue: &str, limit: usize) -> Result<Vec<Job>, sqlx::Error> {
        let now = timefmt::now_micros();
        // The statement reads before it writes, so take the write lock up
        // front rather than fail upgrading it.
        let mut tx = crate::db::begin_write(&self.pool).await?;
        let rows: Vec<(i64, String, String, i64, i64)> = sqlx::query_as(
            "UPDATE jobs SET state = 'running', attempt = attempt + 1, started_at = ?1
             WHERE id IN (
               SELECT id FROM jobs WHERE queue = ?2 AND state = 'queued' AND run_at <= ?1
               ORDER BY run_at, id LIMIT ?3)
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

    /// Runs every due job in `queue` once; with `with_scheduled`, jobs
    /// waiting for a later `run_at` run too. Returns how the attempts ended.
    #[doc(hidden)]
    pub async fn drain_queue(
        &self,
        state: &AppState,
        queue: &str,
        with_scheduled: bool,
    ) -> Drained {
        if with_scheduled {
            let _ = sqlx::query(
                "UPDATE jobs SET run_at = ?1 WHERE state = 'queued' AND queue = ?2 AND run_at > ?1",
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
            }
        }
        drained
    }

    async fn record(&self, job: &Job, outcome: &Outcome) -> Result<(), sqlx::Error> {
        let now = timefmt::now_micros();
        match outcome {
            Outcome::Done => {
                sqlx::query("UPDATE jobs SET state = 'succeeded', finished_at = ?1 WHERE id = ?2")
                    .bind(&now)
                    .bind(job.id)
                    .execute(&self.pool)
                    .await?;
            }
            Outcome::Cancel(reason) => {
                tracing::info!(job.id, worker = job.worker, reason, "job cancelled");
                sqlx::query(
                    "UPDATE jobs SET state = 'cancelled', finished_at = ?1, last_error = ?2 WHERE id = ?3",
                )
                .bind(&now)
                .bind(reason)
                .bind(job.id)
                .execute(&self.pool)
                .await?;
            }
            Outcome::Retry(reason) => {
                // Retries only come from registered workers (unknown ones
                // are cancelled), so the lookup only fails for the log line.
                let worker = self.workers.get(job.worker.as_str());
                let exhausted = job.attempt >= job.max_attempts;
                // Failures reach the application log (and the server log
                // page), not just the job row.
                tracing::error!(
                    worker = job.worker,
                    queue = worker.map_or("", |worker| worker.queue()),
                    attempt = job.attempt,
                    max_attempts = job.max_attempts,
                    retrying = !exhausted,
                    error = reason,
                    "job failed"
                );
                if exhausted {
                    sqlx::query(
                        "UPDATE jobs SET state = 'failed', finished_at = ?1, last_error = ?2 WHERE id = ?3",
                    )
                    .bind(&now)
                    .bind(reason)
                    .bind(job.id)
                    .execute(&self.pool)
                    .await?;
                } else {
                    let delay = worker.map_or(Duration::from_secs(15), |worker| {
                        worker.backoff(job.attempt)
                    });
                    sqlx::query(
                        "UPDATE jobs SET state = 'queued', run_at = ?1, last_error = ?2 WHERE id = ?3",
                    )
                    .bind(timefmt::utc_micros(OffsetDateTime::now_utc() + delay))
                    .bind(reason)
                    .bind(job.id)
                    .execute(&self.pool)
                    .await?;
                }
            }
        }
        Ok(())
    }
}
