//! Shared application state handed to every request, resolver, and job.

use std::ops::Deref;
use std::sync::Arc;
use std::time::Duration;

use sqlx::SqlitePool;

use crate::config::Config;
use crate::crypto::SessionCodec;
use crate::jobs::Jobs;
use crate::logs::LogHub;

/// The `User-Agent` sent to third-party APIs.
pub const USER_AGENT: &str = concat!(
    "ManaVault/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/cfbender/manavault)"
);

/// A general-purpose in-memory cache (`Manavault.Cache`): JSON values keyed
/// by string, with per-entry expiry.
pub type Cache = moka::future::Cache<String, CacheEntry>;

#[derive(Clone)]
pub struct CacheEntry {
    pub value: Arc<serde_json::Value>,
    pub ttl: Duration,
}

struct Expiry;

impl moka::Expiry<String, CacheEntry> for Expiry {
    fn expire_after_create(
        &self,
        _key: &String,
        value: &CacheEntry,
        _created_at: std::time::Instant,
    ) -> Option<Duration> {
        Some(value.ttl)
    }
}

pub struct Inner {
    pub config: Config,
    pub db: SqlitePool,
    /// HTTP client for trusted third-party APIs (Scryfall, EDHREC, ...).
    pub http: reqwest::Client,
    pub sessions: SessionCodec,
    pub logs: LogHub,
    pub jobs: Jobs,
    pub cache: Cache,
}

/// Cheaply cloneable handle to [`Inner`].
#[derive(Clone)]
pub struct AppState(Arc<Inner>);

impl Deref for AppState {
    type Target = Inner;

    fn deref(&self) -> &Inner {
        &self.0
    }
}

/// The Plug session signing salt (`ManavaultWeb.SessionOptions`).
pub const SESSION_SIGNING_SALT: &str = "HGc1xdq0";

impl AppState {
    pub fn new(
        config: Config,
        db: SqlitePool,
        logs: LogHub,
        jobs: Jobs,
    ) -> Result<Self, reqwest::Error> {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(60))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()?;
        let sessions = SessionCodec::new(&config.secret_key_base, SESSION_SIGNING_SALT);
        let cache = moka::future::Cache::builder()
            .max_capacity(100_000)
            .expire_after(Expiry)
            .build();
        Ok(Self(Arc::new(Inner {
            config,
            db,
            http,
            sessions,
            logs,
            jobs,
            cache,
        })))
    }

    /// Reads a cached JSON value.
    pub async fn cache_get<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        let entry = self.cache.get(key).await?;
        serde_json::from_value((*entry.value).clone()).ok()
    }

    /// Stores a JSON value for `ttl`.
    pub async fn cache_put<T: serde::Serialize>(&self, key: &str, value: &T, ttl: Duration) {
        if let Ok(value) = serde_json::to_value(value) {
            self.cache
                .insert(
                    key.to_owned(),
                    CacheEntry {
                        value: Arc::new(value),
                        ttl,
                    },
                )
                .await;
        }
    }

    pub async fn cache_delete(&self, key: &str) {
        self.cache.invalidate(key).await;
    }

    /// Encrypts a credential for storage (`Manavault.Encrypted.Binary`).
    #[must_use]
    pub fn encrypt_secret(&self, plaintext: &str) -> Option<String> {
        crate::crypto::encrypt_secret(&self.config.secret_key_base, plaintext)
    }

    /// Decrypts a stored credential; undecryptable values read as `None`.
    #[must_use]
    pub fn decrypt_secret(&self, stored: &str) -> Option<String> {
        crate::crypto::decrypt_secret(&self.config.secret_key_base, stored)
    }
}
