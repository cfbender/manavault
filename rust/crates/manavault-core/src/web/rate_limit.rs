//! The request limiter shared by the public share GraphQL endpoint and the
//! personal API (`Manavault.PublicShareRequestLimiter`): one fixed window
//! with a per-client and a global budget.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::config::RateLimit;

#[derive(Debug)]
struct Window {
    expires_at: Instant,
    global_count: u32,
    clients: HashMap<String, u32>,
}

impl Window {
    fn fresh(now: Instant, window: Duration) -> Self {
        Self {
            expires_at: now + window,
            global_count: 0,
            clients: HashMap::new(),
        }
    }
}

/// Whether a request may proceed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Admission {
    Ok,
    /// Seconds until the window resets.
    RateLimited(u64),
}

/// The process-wide limiter, shared through `AppState`.
#[derive(Debug, Default)]
pub struct PublicShareRequestLimiter {
    window: Mutex<Option<Window>>,
}

impl PublicShareRequestLimiter {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Counts a request from `client_id` unless a budget is spent.
    pub fn check(&self, limits: &RateLimit, client_id: &str) -> Admission {
        let now = Instant::now();
        let mut guard = self
            .window
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let window = match guard.take() {
            Some(window) if now < window.expires_at => window,
            _ => Window::fresh(now, limits.window),
        };
        let window = guard.insert(window);
        let client_count = window.clients.get(client_id).copied().unwrap_or(0);
        if window.global_count >= limits.max_global || client_count >= limits.max_per_ip {
            let remaining = window.expires_at.saturating_duration_since(now).as_millis();
            let seconds = u64::try_from(remaining.div_ceil(1000))
                .unwrap_or(u64::MAX)
                .max(1);
            return Admission::RateLimited(seconds);
        }
        window.global_count += 1;
        window
            .clients
            .insert(client_id.to_owned(), client_count + 1);
        Admission::Ok
    }

    /// Starts a fresh window (`PublicShareRequestLimiter.reset/0`).
    pub fn reset(&self) {
        *self
            .window
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn per_client_and_global_budgets() {
        let limiter = PublicShareRequestLimiter::new();
        let limits = RateLimit {
            window: Duration::from_secs(60),
            max_per_ip: 2,
            max_global: 3,
        };
        assert_eq!(limiter.check(&limits, "a"), Admission::Ok);
        assert_eq!(limiter.check(&limits, "a"), Admission::Ok);
        assert_eq!(limiter.check(&limits, "a"), Admission::RateLimited(60));
        assert_eq!(limiter.check(&limits, "b"), Admission::Ok);
        assert_eq!(limiter.check(&limits, "c"), Admission::RateLimited(60));
        limiter.reset();
        assert_eq!(limiter.check(&limits, "c"), Admission::Ok);
    }
}
