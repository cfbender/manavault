//! Cached catalog reads (`Manavault.Catalog.Cache`).
//!
//! Entries live in the shared JSON cache under keys that include a catalog
//! generation. Bumping the generation (after a Scryfall import) orphans
//! every cached catalog read at once; orphaned entries expire on their TTL.

use std::time::Duration;

use serde::Serialize;
use serde::de::DeserializeOwned;

use manavault_core::state::AppState;

const GENERATION_KEY: &str = "catalog:generation";

/// `@external_ttl`: results of third-party lookups.
pub const EXTERNAL_TTL: Duration = Duration::from_secs(6 * 60 * 60);

/// The generation outlives every entry that embeds it.
const GENERATION_TTL: Duration = Duration::from_secs(365 * 24 * 60 * 60);

async fn generation(state: &AppState) -> String {
    if let Some(generation) = state.cache_get::<String>(GENERATION_KEY).await {
        return generation;
    }
    let generation = hex::encode(manavault_core::crypto::random_bytes::<8>());
    state
        .cache_put(GENERATION_KEY, &generation, GENERATION_TTL)
        .await;
    generation
}

/// Orphans every cached catalog read.
pub async fn invalidate(state: &AppState) {
    state.cache_delete(GENERATION_KEY).await;
}

/// The cache key for `key` in the current generation.
pub async fn key(state: &AppState, key: &str) -> String {
    format!("catalog:{}:{key}", generation(state).await)
}

/// Reads a cached value.
pub async fn get<T: DeserializeOwned>(state: &AppState, key: &str) -> Option<T> {
    let key = self::key(state, key).await;
    state.cache_get(&key).await
}

/// Stores a value for `ttl`.
pub async fn put<T: Serialize>(state: &AppState, key: &str, value: &T, ttl: Duration) {
    let key = self::key(state, key).await;
    state.cache_put(&key, value, ttl).await;
}
