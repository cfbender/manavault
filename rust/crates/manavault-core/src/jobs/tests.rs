//! The job runner's semantics, driven by a worker whose outcome is chosen by
//! its args: `{"outcome": "retry" | "cancel"}` or anything else for success.

use std::sync::Arc;
use std::time::Duration;

use serde_json::{Value, json};
use time::OffsetDateTime;

use super::{Drained, Job, Jobs, Outcome, Unique, Worker};
use crate::state::AppState;
use crate::testing::TestState;
use crate::timefmt;

struct Scripted {
    name: &'static str,
    unique: Option<Unique>,
}

impl Worker for Scripted {
    fn name(&self) -> &'static str {
        self.name
    }
    fn queue(&self) -> &'static str {
        "catalog"
    }
    fn max_attempts(&self) -> i64 {
        2
    }
    fn unique(&self) -> Option<Unique> {
        self.unique
    }
    fn backoff(&self, _attempt: i64) -> Duration {
        Duration::from_secs(60)
    }
    async fn perform(&self, _state: &AppState, job: &Job) -> Outcome {
        match job.args.get("outcome").and_then(Value::as_str) {
            Some("retry") => Outcome::Retry(format!("attempt {} broke", job.attempt)),
            Some("cancel") => Outcome::Cancel("not applicable".to_owned()),
            _ => Outcome::Done,
        }
    }
}

const PLAIN: &str = "plain";
const PER_WORKER: &str = "per_worker";
const PER_ARGS: &str = "per_args";

fn jobs(state: &TestState) -> Jobs {
    Jobs::new(
        state.db().clone(),
        vec![
            Arc::new(Scripted {
                name: PLAIN,
                unique: None,
            }),
            Arc::new(Scripted {
                name: PER_WORKER,
                unique: Some(Unique::Worker),
            }),
            Arc::new(Scripted {
                name: PER_ARGS,
                unique: Some(Unique::WorkerArgs),
            }),
        ],
    )
}

#[derive(Debug, PartialEq, Eq)]
struct Row {
    state: String,
    attempt: i64,
    run_at: String,
    finished: bool,
    last_error: Option<String>,
}

async fn row(state: &TestState, id: i64) -> Row {
    let (state, attempt, run_at, finished_at, last_error): (
        String,
        i64,
        String,
        Option<String>,
        Option<String>,
    ) = sqlx::query_as(
        "SELECT state, attempt, run_at, finished_at, last_error FROM jobs WHERE id = ?1",
    )
    .bind(id)
    .fetch_one(state.db())
    .await
    .expect("job row");
    Row {
        state,
        attempt,
        run_at,
        finished: finished_at.is_some(),
        last_error,
    }
}

async fn drain(state: &TestState, jobs: &Jobs, with_scheduled: bool) -> Drained {
    jobs.drain_queue(&state.state, "catalog", with_scheduled)
        .await
}

#[tokio::test]
async fn unique_workers_share_a_pending_job_but_not_a_finished_one() {
    let state = TestState::new().await;
    let jobs = jobs(&state);
    let first = jobs.enqueue(PER_WORKER, json!({"n": 1})).await.unwrap();
    // Per worker: different args still collapse onto the pending job.
    assert_eq!(
        jobs.enqueue(PER_WORKER, json!({"n": 2})).await.unwrap(),
        first
    );
    // Per args: equal JSON collapses, different JSON does not.
    let by_args = jobs.enqueue(PER_ARGS, json!({"n": 1})).await.unwrap();
    assert_eq!(
        jobs.enqueue(PER_ARGS, json!({"n": 1})).await.unwrap(),
        by_args
    );
    assert_ne!(
        jobs.enqueue(PER_ARGS, json!({"n": 2})).await.unwrap(),
        by_args
    );
    // Without uniqueness every enqueue is a new job.
    assert_ne!(
        jobs.enqueue(PLAIN, json!({})).await.unwrap(),
        jobs.enqueue(PLAIN, json!({})).await.unwrap()
    );
    assert_eq!(drain(&state, &jobs, false).await.success, 5);
    assert_eq!(row(&state, first).await.state, "succeeded");
    assert_ne!(
        jobs.enqueue(PER_WORKER, json!({"n": 1})).await.unwrap(),
        first
    );
}

#[tokio::test]
async fn jobs_wait_for_their_run_at() {
    let state = TestState::new().await;
    let jobs = jobs(&state);
    let later = OffsetDateTime::now_utc() + Duration::from_secs(3600);
    let id = jobs
        .enqueue_at(PLAIN, json!({}), Some(later))
        .await
        .unwrap();
    assert_eq!(row(&state, id).await.run_at, timefmt::utc_micros(later));
    assert_eq!(drain(&state, &jobs, false).await, Drained::default());
    assert_eq!(row(&state, id).await.state, "queued");
    assert_eq!(drain(&state, &jobs, true).await.success, 1);
    // A time in the past runs now.
    let past = OffsetDateTime::now_utc() - Duration::from_secs(3600);
    let id = jobs.enqueue_at(PLAIN, json!({}), Some(past)).await.unwrap();
    assert!(row(&state, id).await.run_at > timefmt::utc_micros(past));
    assert_eq!(drain(&state, &jobs, false).await.success, 1);
}

#[tokio::test]
async fn retries_back_off_and_fail_after_the_last_attempt() {
    let state = TestState::new().await;
    let jobs = jobs(&state);
    let id = jobs
        .enqueue(PLAIN, json!({"outcome": "retry"}))
        .await
        .unwrap();
    let before = OffsetDateTime::now_utc();
    let drained = drain(&state, &jobs, false).await;
    assert_eq!((drained.failure, drained.discard), (1, 0));
    let retrying = row(&state, id).await;
    assert_eq!(
        (retrying.state.as_str(), retrying.attempt, retrying.finished),
        ("queued", 1, false)
    );
    assert_eq!(retrying.last_error.as_deref(), Some("attempt 1 broke"));
    let run_at = timefmt::parse(&retrying.run_at).expect("run_at");
    assert!(run_at >= before + Duration::from_secs(60), "{run_at}");
    // Not due yet, so a plain drain leaves it alone.
    assert_eq!(drain(&state, &jobs, false).await, Drained::default());
    let drained = drain(&state, &jobs, true).await;
    assert_eq!((drained.failure, drained.discard), (0, 1));
    let failed = row(&state, id).await;
    assert_eq!(
        (failed.state.as_str(), failed.attempt, failed.finished),
        ("failed", 2, true)
    );
    assert_eq!(failed.last_error.as_deref(), Some("attempt 2 broke"));
    assert_eq!(drain(&state, &jobs, true).await, Drained::default());
}

#[tokio::test]
async fn cancelled_and_unknown_jobs_stop_without_retrying() {
    let state = TestState::new().await;
    let jobs = jobs(&state);
    let cancelled = jobs
        .enqueue(PLAIN, json!({"outcome": "cancel"}))
        .await
        .unwrap();
    // A row for a worker this build does not know (e.g. one removed in an
    // upgrade) is cancelled rather than retried forever.
    let unknown: i64 = sqlx::query_scalar(
        "INSERT INTO jobs (worker, queue, args, max_attempts, run_at, inserted_at)
         VALUES ('nobody', 'catalog', '{}', 5, ?1, ?1) RETURNING id",
    )
    .bind(timefmt::now_micros())
    .fetch_one(state.db())
    .await
    .unwrap();
    assert_eq!(drain(&state, &jobs, false).await.cancelled, 2);
    let row_cancelled = row(&state, cancelled).await;
    assert_eq!(
        (row_cancelled.state.as_str(), row_cancelled.finished),
        ("cancelled", true)
    );
    assert_eq!(row_cancelled.last_error.as_deref(), Some("not applicable"));
    assert_eq!(
        row(&state, unknown).await.last_error.as_deref(),
        Some("unknown worker nobody")
    );
    assert_eq!(drain(&state, &jobs, true).await, Drained::default());
}

#[tokio::test]
async fn interrupted_and_stuck_jobs_return_to_the_queue_and_old_ones_are_pruned() {
    let state = TestState::new().await;
    let jobs = jobs(&state);
    let now = OffsetDateTime::now_utc();
    let insert = |worker: &'static str,
                  job_state: &'static str,
                  started: Option<OffsetDateTime>,
                  finished: Option<OffsetDateTime>| {
        let db = state.db().clone();
        async move {
            let id: i64 = sqlx::query_scalar(
                "INSERT INTO jobs (worker, queue, args, state, attempt, max_attempts, run_at, started_at, finished_at, inserted_at)
                 VALUES (?1, 'catalog', '{}', ?2, 1, 2, ?3, ?4, ?5, ?3) RETURNING id",
            )
            .bind(worker)
            .bind(job_state)
            .bind(timefmt::utc_micros(now))
            .bind(started.map(timefmt::utc_micros))
            .bind(finished.map(timefmt::utc_micros))
            .fetch_one(&db)
            .await
            .unwrap();
            id
        }
    };
    let interrupted = insert(PLAIN, "running", Some(now - Duration::from_secs(5)), None).await;
    let stuck = insert(
        PLAIN,
        "running",
        Some(now - super::STUCK_AFTER - Duration::from_secs(1)),
        None,
    )
    .await;
    let old = insert(
        PLAIN,
        "succeeded",
        None,
        Some(now - Duration::from_secs(2 * 86_400)),
    )
    .await;
    let recent = insert(PLAIN, "failed", None, Some(now - Duration::from_secs(60))).await;

    // Maintenance (while running) only touches jobs stuck past the threshold.
    jobs.maintain().await.unwrap();
    assert_eq!(row(&state, interrupted).await.state, "running");
    assert_eq!(row(&state, stuck).await.state, "queued");
    assert_eq!(row(&state, recent).await.state, "failed");
    let pruned: Option<i64> = sqlx::query_scalar("SELECT id FROM jobs WHERE id = ?1")
        .bind(old)
        .fetch_optional(state.db())
        .await
        .unwrap();
    assert_eq!(pruned, None);

    // Boot requeues everything that was running, whatever its age.
    jobs.requeue_running().await.unwrap();
    assert_eq!(row(&state, interrupted).await.state, "queued");
    // The requeued attempt counts toward max_attempts: attempt 1 was used.
    assert_eq!(drain(&state, &jobs, false).await.success, 2);
    assert_eq!(row(&state, interrupted).await.attempt, 2);
}
