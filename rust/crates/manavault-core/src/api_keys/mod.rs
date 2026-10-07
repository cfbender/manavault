//! Personal, read-only API keys (`Manavault.Auth.ApiKeys`).
//!
//! The instance has one owner, so every key is the owner's. The plaintext
//! token (`mvk_` + 43 URL-safe base64 characters) is returned only when the
//! key is created; the database keeps its SHA-256 digest.

use async_graphql::{Context, ID, Object, SimpleObject};
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use time::macros::format_description;

use crate::graphql::{state, user_error};

type GqlResult<T> = async_graphql::Result<T>;
use crate::settings::changeset::{BLANK, Errors, too_long};
use crate::timefmt;

const TOKEN_PREFIX: &str = "mvk_";
const TOKEN_LENGTH: usize = 47;
const DISPLAY_PREFIX_LENGTH: usize = 12;

/// A stored key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiKey {
    pub id: i64,
    pub name: String,
    pub prefix: String,
    pub last_used_at: Option<String>,
    pub inserted_at: String,
}

/// `ApiKeys.hash/1`.
#[must_use]
pub fn hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Keys, newest first.
pub async fn list(db: &SqlitePool) -> Result<Vec<ApiKey>, sqlx::Error> {
    sqlx::query_as!(
        ApiKey,
        "SELECT id, name, prefix, last_used_at, inserted_at FROM api_keys ORDER BY inserted_at DESC, id DESC"
    )
    .fetch_all(db)
    .await
}

/// Why creating a key failed.
#[derive(Debug, thiserror::Error)]
pub enum CreateError {
    #[error("{}", .0.messages_only())]
    Invalid(Errors),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Creates a key and returns it with its plaintext token.
pub async fn create(db: &SqlitePool, name: &str) -> Result<(ApiKey, String), CreateError> {
    let name = name.trim();
    let mut errors = Errors::new();
    if name.is_empty() {
        errors.add("name", BLANK);
    } else if name.chars().count() > 80 {
        errors.add("name", too_long(80));
    }
    errors.into_result().map_err(CreateError::Invalid)?;

    let token = format!(
        "{TOKEN_PREFIX}{}",
        URL_SAFE_NO_PAD.encode(crate::crypto::random_bytes::<32>())
    );
    let prefix: String = token.chars().take(DISPLAY_PREFIX_LENGTH).collect();
    let token_hash = hash(&token);
    let now = timefmt::now();
    let key = sqlx::query_as!(
        ApiKey,
        "INSERT INTO api_keys (name, prefix, token_hash, inserted_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         RETURNING id, name, prefix, last_used_at, inserted_at",
        name,
        prefix,
        token_hash,
        now
    )
    .fetch_one(db)
    .await?;
    Ok((key, token))
}

/// The key for a bearer token, recording its use.
pub async fn authenticate(db: &SqlitePool, token: &str) -> Result<Option<ApiKey>, sqlx::Error> {
    if !token.starts_with(TOKEN_PREFIX) || token.len() != TOKEN_LENGTH {
        return Ok(None);
    }
    let token_hash = hash(token);
    let now = timefmt::now();
    sqlx::query_as!(
        ApiKey,
        "UPDATE api_keys SET last_used_at = ?1, updated_at = ?1 WHERE token_hash = ?2
         RETURNING id, name, prefix, last_used_at, inserted_at",
        now,
        token_hash
    )
    .fetch_optional(db)
    .await
}

/// Deletes a key, returning it.
pub async fn revoke(db: &SqlitePool, id: i64) -> Result<Option<ApiKey>, sqlx::Error> {
    sqlx::query_as!(
        ApiKey,
        "DELETE FROM api_keys WHERE id = ?1 RETURNING id, name, prefix, last_used_at, inserted_at",
        id
    )
    .fetch_optional(db)
    .await
}

/// A `:utc_datetime` as Absinthe's `:string` scalar renders it
/// (`String.Chars` for `DateTime`: `2026-10-07 07:30:43Z`).
#[must_use]
pub fn datetime_to_string(stored: &str) -> String {
    timefmt::parse(stored)
        .and_then(|at| {
            at.format(format_description!(
                "[year]-[month]-[day] [hour]:[minute]:[second]Z"
            ))
            .ok()
        })
        .unwrap_or_else(|| stored.to_owned())
}

#[derive(SimpleObject)]
#[graphql(name = "ApiKey")]
pub struct ApiKeyObject {
    pub id: ID,
    pub name: String,
    pub prefix: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

impl From<ApiKey> for ApiKeyObject {
    fn from(key: ApiKey) -> Self {
        Self {
            id: ID(key.id.to_string()),
            name: key.name,
            prefix: key.prefix,
            created_at: datetime_to_string(&key.inserted_at),
            last_used_at: key.last_used_at.as_deref().map(datetime_to_string),
        }
    }
}

#[derive(SimpleObject)]
pub struct CreatedApiKey {
    pub api_key: ApiKeyObject,
    pub token: String,
}

#[derive(Default)]
pub struct ApiKeyQueries;

#[Object]
impl ApiKeyQueries {
    async fn api_keys(&self, ctx: &Context<'_>) -> GqlResult<Vec<ApiKeyObject>> {
        Ok(list(&state(ctx).db)
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }
}

#[derive(Default)]
pub struct ApiKeyMutations;

#[Object]
impl ApiKeyMutations {
    async fn create_api_key(&self, ctx: &Context<'_>, name: String) -> GqlResult<CreatedApiKey> {
        match create(&state(ctx).db, &name).await {
            Ok((key, token)) => Ok(CreatedApiKey {
                api_key: key.into(),
                token,
            }),
            Err(CreateError::Invalid(errors)) => Err(user_error(errors.messages_only())),
            Err(CreateError::Db(error)) => {
                tracing::error!(%error, "could not create API key");
                Err(user_error("Could not create API key"))
            }
        }
    }

    /// A non-numeric id reads as not found (earlier releases raised a cast
    /// error there).
    async fn revoke_api_key(&self, ctx: &Context<'_>, id: ID) -> GqlResult<ApiKeyObject> {
        let Ok(id) = id.parse::<i64>() else {
            return Err(user_error("API key not found"));
        };
        match revoke(&state(ctx).db, id).await {
            Ok(Some(key)) => Ok(key.into()),
            Ok(None) => Err(user_error("API key not found")),
            Err(error) => {
                tracing::error!(%error, "could not revoke API key");
                Err(user_error("Could not revoke API key"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestApp;
    use serde_json::json;

    #[tokio::test]
    async fn creates_a_named_key_storing_only_its_hash() {
        let app = TestApp::new().await;
        let (key, token) = create(app.db(), "The Gathering").await.unwrap();
        assert!(token.starts_with("mvk_"));
        assert_eq!(token.len(), 47);
        let (name, prefix, stored_hash): (String, String, Vec<u8>) =
            sqlx::query_as("SELECT name, prefix, token_hash FROM api_keys WHERE id = ?1")
                .bind(key.id)
                .fetch_one(app.db())
                .await
                .unwrap();
        assert_eq!(name, "The Gathering");
        assert_eq!(prefix, &token[..12]);
        assert_eq!(stored_hash, hash(&token));
        assert_ne!(stored_hash, token.as_bytes());
        let authenticated = authenticate(app.db(), &token).await.unwrap().unwrap();
        assert_eq!(authenticated.id, key.id);
        assert!(authenticated.last_used_at.is_some());
    }

    #[tokio::test]
    async fn rejects_unknown_and_revoked_keys() {
        let app = TestApp::new().await;
        let unknown = format!("mvk_{}", "x".repeat(43));
        assert_eq!(authenticate(app.db(), &unknown).await.unwrap(), None);
        let (key, token) = create(app.db(), "Temporary").await.unwrap();
        assert!(revoke(app.db(), key.id).await.unwrap().is_some());
        assert_eq!(authenticate(app.db(), &token).await.unwrap(), None);
        assert_eq!(authenticate(app.db(), "mvk_short").await.unwrap(), None);
    }

    #[tokio::test]
    async fn graphql_create_list_and_revoke() {
        let app = TestApp::new().await;
        let data = app
            .gql_data(
                r#"mutation { createApiKey(name: "  Laptop ") { token apiKey { id name prefix createdAt lastUsedAt } } }"#,
                json!({}),
            )
            .await;
        let created = &data["createApiKey"];
        let token = created["token"].as_str().unwrap();
        assert_eq!(created["apiKey"]["name"], "Laptop");
        assert_eq!(created["apiKey"]["prefix"], &token[..12]);
        assert_eq!(created["apiKey"]["lastUsedAt"], json!(null));
        let created_at = created["apiKey"]["createdAt"].as_str().unwrap();
        assert!(
            regex::Regex::new(r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\dZ$")
                .unwrap()
                .is_match(created_at)
        );
        let id = created["apiKey"]["id"].as_str().unwrap().to_owned();
        let list = app.gql_data("{ apiKeys { id name } }", json!({})).await;
        assert_eq!(list["apiKeys"], json!([{"id": id, "name": "Laptop"}]));

        let blank = app
            .gql(
                r#"mutation { createApiKey(name: "  ") { token } }"#,
                json!({}),
            )
            .await;
        assert_eq!(blank["errors"][0]["message"], "can't be blank");
        let long = app
            .gql(
                "mutation($name: String!) { createApiKey(name: $name) { token } }",
                json!({"name": "x".repeat(81)}),
            )
            .await;
        assert_eq!(
            long["errors"][0]["message"],
            "should be at most 80 character(s)"
        );

        let revoked = app
            .gql_data(
                "mutation($id: ID!) { revokeApiKey(id: $id) { id name } }",
                json!({"id": id}),
            )
            .await;
        assert_eq!(revoked["revokeApiKey"]["name"], "Laptop");
        let missing = app
            .gql(
                "mutation($id: ID!) { revokeApiKey(id: $id) { id } }",
                json!({"id": id}),
            )
            .await;
        assert_eq!(missing["errors"][0]["message"], "API key not found");
    }
}
