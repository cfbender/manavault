//! Login attempt limits (`Manavault.Auth.AttemptLimiter`).
//!
//! Failed attempts count against a per-client and a global sliding window
//! kept in memory; every failure is also recorded in `auth_client_failures`,
//! and a client that reaches `permanent_ban_after_failures` is banned until
//! the ban is cleared with `manavault unban`.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use sqlx::SqlitePool;

use crate::config::AuthRateLimit;
use crate::timefmt;

/// What a login attempt may do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Check {
    Ok,
    /// Seconds until the window that blocks the client expires.
    RateLimited(u64),
    PermanentlyBanned,
}

/// The result of recording a failed attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureOutcome {
    Ok,
    /// This failure reached the permanent ban threshold.
    Banned,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum Key {
    Client(String),
    Global,
}

#[derive(Debug, Clone, Copy)]
struct Window {
    count: u32,
    expires_at: Instant,
}

/// The in-memory windows. One per process, shared through `AppState`.
#[derive(Debug, Default)]
pub struct AttemptLimiter {
    windows: Mutex<HashMap<Key, Window>>,
}

fn ceil_seconds(duration: Duration) -> u64 {
    let millis = duration.as_millis();
    u64::try_from(millis.div_ceil(1000))
        .unwrap_or(u64::MAX)
        .max(1)
}

impl AttemptLimiter {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    fn with_windows<T>(&self, f: impl FnOnce(&mut HashMap<Key, Window>) -> T) -> T {
        let mut windows = self
            .windows
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let now = Instant::now();
        windows.retain(|_, window| window.expires_at > now);
        f(&mut windows)
    }

    /// Whether `client_id` may try a password now.
    pub async fn check(
        &self,
        db: &SqlitePool,
        limits: &AuthRateLimit,
        client_id: &str,
    ) -> Result<Check, sqlx::Error> {
        if permanently_banned(db, client_id).await? {
            return Ok(Check::PermanentlyBanned);
        }
        let now = Instant::now();
        let client_key = Key::Client(client_id.to_owned());
        let retry_after = self.with_windows(|windows| {
            let mut retry_after: Option<u64> = None;
            for (key, limit) in [
                (&client_key, limits.limit.max_per_ip),
                (&Key::Global, limits.limit.max_global),
            ] {
                if let Some(window) = windows.get(key)
                    && window.count >= limit
                {
                    let seconds = ceil_seconds(window.expires_at.saturating_duration_since(now));
                    retry_after = Some(retry_after.unwrap_or(0).max(seconds));
                }
            }
            retry_after
        });
        Ok(retry_after.map_or(Check::Ok, Check::RateLimited))
    }

    /// Counts a failed password for `client_id`, persisting it.
    pub async fn record_failure(
        &self,
        db: &SqlitePool,
        limits: &AuthRateLimit,
        client_id: &str,
    ) -> Result<FailureOutcome, sqlx::Error> {
        let expires_at = Instant::now() + limits.limit.window;
        self.with_windows(|windows| {
            for key in [Key::Client(client_id.to_owned()), Key::Global] {
                windows
                    .entry(key)
                    .and_modify(|window| window.count += 1)
                    .or_insert(Window {
                        count: 1,
                        expires_at,
                    });
            }
        });
        let threshold = i64::from(limits.permanent_ban_after_failures);
        let now = timefmt::now();
        let failed_attempts = sqlx::query_scalar!(
            r#"INSERT INTO auth_client_failures (client_id, failed_attempts, banned_at, inserted_at, updated_at)
               VALUES (?1, 1, CASE WHEN 1 >= ?2 THEN ?3 END, ?3, ?3)
               ON CONFLICT(client_id) DO UPDATE SET
                 failed_attempts = failed_attempts + 1,
                 banned_at = CASE WHEN failed_attempts + 1 >= ?2 THEN ?3 ELSE NULL END,
                 updated_at = ?3
               RETURNING failed_attempts"#,
            client_id,
            threshold,
            now
        )
        .fetch_one(db)
        .await?;
        Ok(if failed_attempts >= threshold {
            FailureOutcome::Banned
        } else {
            FailureOutcome::Ok
        })
    }

    /// Forgets a client's failures, including a permanent ban.
    pub async fn reset(&self, db: &SqlitePool, client_id: &str) -> Result<(), sqlx::Error> {
        reset_persistent(db, client_id).await?;
        self.with_windows(|windows| {
            windows.remove(&Key::Client(client_id.to_owned()));
        });
        Ok(())
    }

    /// Forgets every failure and ban.
    pub async fn reset_all(&self, db: &SqlitePool) -> Result<(), sqlx::Error> {
        reset_all_persistent(db).await?;
        self.with_windows(HashMap::clear);
        Ok(())
    }
}

async fn permanently_banned(db: &SqlitePool, client_id: &str) -> Result<bool, sqlx::Error> {
    let banned = sqlx::query_scalar!(
        "SELECT banned_at FROM auth_client_failures WHERE client_id = ?1",
        client_id
    )
    .fetch_optional(db)
    .await?;
    Ok(matches!(banned, Some(Some(_))))
}

/// Deletes a client's persisted failures (`AttemptLimiter.reset/1` without a
/// running server).
pub async fn reset_persistent(db: &SqlitePool, client_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM auth_client_failures WHERE client_id = ?1",
        client_id
    )
    .execute(db)
    .await?;
    Ok(())
}

/// Deletes every persisted failure (`AttemptLimiter.reset_all/0`).
pub async fn reset_all_persistent(db: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM auth_client_failures")
        .execute(db)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::RateLimit;
    use crate::test_support::TestApp;

    fn limits(per_ip: u32, global: u32, ban: u32) -> AuthRateLimit {
        AuthRateLimit {
            limit: RateLimit {
                window: Duration::from_secs(60),
                max_per_ip: per_ip,
                max_global: global,
            },
            permanent_ban_after_failures: ban,
        }
    }

    #[tokio::test]
    async fn per_client_and_global_windows_and_bans() {
        let app = TestApp::new().await;
        let db = app.db();
        let limiter = AttemptLimiter::new();
        let limits = limits(2, 3, 4);
        assert_eq!(limiter.check(db, &limits, "a").await.unwrap(), Check::Ok);
        limiter.record_failure(db, &limits, "a").await.unwrap();
        limiter.record_failure(db, &limits, "a").await.unwrap();
        assert_eq!(
            limiter.check(db, &limits, "a").await.unwrap(),
            Check::RateLimited(60)
        );
        assert_eq!(limiter.check(db, &limits, "b").await.unwrap(), Check::Ok);
        limiter.record_failure(db, &limits, "b").await.unwrap();
        // The global budget of three is spent.
        assert_eq!(
            limiter.check(db, &limits, "c").await.unwrap(),
            Check::RateLimited(60)
        );
        assert_eq!(
            limiter.record_failure(db, &limits, "a").await.unwrap(),
            FailureOutcome::Ok
        );
        assert_eq!(
            limiter.record_failure(db, &limits, "a").await.unwrap(),
            FailureOutcome::Banned
        );
        assert_eq!(
            limiter.check(db, &limits, "a").await.unwrap(),
            Check::PermanentlyBanned
        );
        limiter.reset(db, "a").await.unwrap();
        let remaining: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_client_failures")
            .fetch_one(db)
            .await
            .unwrap();
        assert_eq!(remaining, 1);
        limiter.reset_all(db).await.unwrap();
        assert_eq!(limiter.check(db, &limits, "c").await.unwrap(), Check::Ok);
    }
}
