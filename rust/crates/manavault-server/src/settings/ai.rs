//! AI provider settings (`Manavault.AI.Settings` and `AI.UpdateSettings`):
//! the `ai_settings` singleton row. The API key is stored encrypted
//! (`Manavault.Encrypted.Binary`) and never leaves the server; GraphQL only
//! reports whether one is saved.
//!
//! Saving validates the key and model against `OpenRouter`, the only provider.
//! Deck analysis and questions belong to the AI module proper.

use async_graphql::{Context, InputObject, MaybeUndefined, Object, SimpleObject};
use serde_json::Value;

use super::changeset::{BLANK, Errors, INVALID, too_long};
use crate::graphql::{state, user_error};

type GqlResult<T> = async_graphql::Result<T>;
use crate::state::AppState;
use crate::timefmt;

const SINGLETON_ID: i64 = 1;
const PROVIDERS: [&str; 1] = ["openrouter"];

/// The saved settings, with the API key decrypted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AiSettings {
    pub provider: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub deck_analysis_instructions: Option<String>,
}

impl AiSettings {
    /// `Settings.secret_present?/1`.
    #[must_use]
    pub fn has_api_key(&self) -> bool {
        self.api_key
            .as_deref()
            .is_some_and(|key| !key.trim().is_empty())
    }
}

/// Loads the singleton row, creating the default row when missing
/// (`UpdateSettings.settings/0`).
pub async fn settings(state: &AppState) -> Result<AiSettings, sqlx::Error> {
    let now = timefmt::now();
    sqlx::query!(
        "INSERT INTO ai_settings (id, provider, inserted_at, updated_at) VALUES (?1, 'openrouter', ?2, ?2)
         ON CONFLICT(id) DO NOTHING",
        SINGLETON_ID,
        now
    )
    .execute(&state.db)
    .await?;
    let row = sqlx::query!(
        "SELECT provider, api_key, model, deck_analysis_instructions FROM ai_settings WHERE id = ?1",
        SINGLETON_ID
    )
    .fetch_one(&state.db)
    .await?;
    Ok(AiSettings {
        provider: row.provider,
        api_key: row.api_key.and_then(|stored| state.decrypt_secret(&stored)),
        model: row.model,
        deck_analysis_instructions: row.deck_analysis_instructions,
    })
}

/// `AiSettingsInput`.
#[derive(Debug, Clone, InputObject)]
#[graphql(name = "AiSettingsInput")]
pub struct AiSettingsInput {
    pub provider: String,
    pub api_key: Option<String>,
    pub model: String,
    pub deck_analysis_instructions: MaybeUndefined<String>,
}

/// Why saving failed.
#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("{}", .0.message())]
    Invalid(Errors),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

fn normalize(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

/// Validates and saves the settings (`UpdateSettings.run/1`). A blank or
/// missing API key keeps the saved one.
pub async fn update(state: &AppState, input: AiSettingsInput) -> Result<AiSettings, UpdateError> {
    let current = settings(state).await?;
    let api_key = match input.api_key.as_deref().and_then(normalize) {
        Some(key) => Some(key),
        None => current.api_key.as_deref().and_then(normalize),
    };
    let candidate = AiSettings {
        provider: normalize(&input.provider).unwrap_or_default(),
        api_key,
        model: normalize(&input.model),
        deck_analysis_instructions: match input.deck_analysis_instructions {
            MaybeUndefined::Undefined => current.deck_analysis_instructions.clone(),
            MaybeUndefined::Null => None,
            MaybeUndefined::Value(text) => normalize(&text),
        },
    };

    let mut errors = Errors::new();
    if candidate.provider.is_empty() {
        errors.add("provider", BLANK);
    }
    if candidate.api_key.is_none() {
        errors.add("api_key", BLANK);
    }
    if candidate.model.is_none() {
        errors.add("model", BLANK);
    }
    if !candidate.provider.is_empty() && !PROVIDERS.contains(&candidate.provider.as_str()) {
        errors.add("provider", INVALID);
    }
    if candidate
        .model
        .as_deref()
        .is_some_and(|model| model.chars().count() > 200)
    {
        errors.add("model", too_long(200));
    }
    if candidate
        .deck_analysis_instructions
        .as_deref()
        .is_some_and(|text| text.chars().count() > 4000)
    {
        errors.add("deck_analysis_instructions", too_long(4000));
    }
    errors.into_result().map_err(UpdateError::Invalid)?;

    if let Err((field, message)) = openrouter::validate_settings(state, &candidate).await {
        let mut errors = Errors::new();
        errors.add(field, message);
        return Err(UpdateError::Invalid(errors));
    }

    let stored_key = candidate
        .api_key
        .as_deref()
        .and_then(|key| state.encrypt_secret(key));
    let now = timefmt::now();
    sqlx::query!(
        "UPDATE ai_settings SET provider = ?1, api_key = ?2, model = ?3,
           deck_analysis_instructions = ?4, updated_at = ?5 WHERE id = ?6",
        candidate.provider,
        stored_key,
        candidate.model,
        candidate.deck_analysis_instructions,
        now,
        SINGLETON_ID
    )
    .execute(&state.db)
    .await?;
    Ok(candidate)
}

/// `OpenRouter`'s settings check (`Providers.OpenRouter.validate_settings/1`).
pub mod openrouter {
    use super::{AiSettings, Value};
    use crate::state::AppState;

    const REJECTED_KEY: &str = "OpenRouter rejected the API key.";
    const UNREACHABLE: &str = "Could not reach OpenRouter to validate settings.";

    fn request(state: &AppState, path: &str, api_key: &str) -> reqwest::RequestBuilder {
        state
            .http
            .get(format!(
                "{}{path}",
                state.config.platform_urls.openrouter_api
            ))
            .bearer_auth(api_key)
            .header("accept", "application/json")
            .header("content-type", "application/json")
            .header("http-referer", "https://github.com/cfbender/manavault")
            .header("x-openrouter-title", "ManaVault")
            .timeout(std::time::Duration::from_secs(30))
    }

    fn request_error(error: &reqwest::Error) -> String {
        if error.is_timeout() {
            format!("{UNREACHABLE} The request timed out.")
        } else {
            UNREACHABLE.to_owned()
        }
    }

    fn field<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a Value> {
        value
            .and_then(|value| value.as_object())
            .and_then(|map| map.get(key))
    }

    fn provider_error_message(raw: Option<&Value>) -> Option<String> {
        let decoded;
        let raw = match raw {
            Some(Value::String(text)) => {
                decoded = serde_json::from_str::<Value>(text).ok()?;
                Some(&decoded)
            }
            other => other,
        };
        field(field(raw, "error"), "message")
            .and_then(Value::as_str)
            .map(str::to_owned)
    }

    /// `response_error/3`: the provider's message, or the fallback with the
    /// HTTP status.
    #[must_use]
    pub fn response_error(status: u16, body: &str, fallback: &str) -> String {
        let body: Option<Value> = serde_json::from_str(body).ok();
        let error = field(body.as_ref(), "error");
        let raw = field(field(error, "metadata"), "raw");
        let mut parts: Vec<String> = Vec::new();
        for part in [
            field(error, "message")
                .and_then(Value::as_str)
                .map(str::to_owned),
            provider_error_message(raw),
        ]
        .into_iter()
        .flatten()
        {
            if !part.trim().is_empty() && !parts.contains(&part) {
                parts.push(part);
            }
        }
        if parts.is_empty() {
            format!("{fallback} (HTTP {status})")
        } else {
            format!("OpenRouter: {}", parts.join(": "))
        }
    }

    /// Checks the key, then that the model exists. Errors name the field.
    pub async fn validate_settings(
        state: &AppState,
        settings: &AiSettings,
    ) -> Result<(), (&'static str, String)> {
        let api_key = settings.api_key.as_deref().unwrap_or_default();
        let response = request(state, "/key", api_key)
            .send()
            .await
            .map_err(|error| ("base", request_error(&error)))?;
        let status = response.status();
        if status.as_u16() == 401 {
            return Err(("api_key", REJECTED_KEY.to_owned()));
        }
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err((
                "api_key",
                response_error(
                    status.as_u16(),
                    &body,
                    "OpenRouter could not validate the API key.",
                ),
            ));
        }

        let response = request(state, "/models", api_key)
            .send()
            .await
            .map_err(|error| ("base", request_error(&error)))?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let models = serde_json::from_str::<Value>(&body)
            .ok()
            .filter(|_| status.is_success())
            .and_then(|value| value.get("data").and_then(Value::as_array).cloned());
        let Some(models) = models else {
            return Err((
                "model",
                response_error(
                    status.as_u16(),
                    &body,
                    "OpenRouter could not validate the model.",
                ),
            ));
        };
        let model = settings.model.as_deref().unwrap_or_default();
        if models
            .iter()
            .any(|entry| entry.get("id").and_then(Value::as_str) == Some(model))
        {
            Ok(())
        } else {
            Err((
                "model",
                format!("OpenRouter model \"{model}\" was not found."),
            ))
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "AiSettings")]
pub struct AiSettingsObject {
    pub provider: String,
    pub model: Option<String>,
    pub deck_analysis_instructions: Option<String>,
    pub has_api_key: bool,
}

impl From<&AiSettings> for AiSettingsObject {
    fn from(settings: &AiSettings) -> Self {
        Self {
            provider: settings.provider.clone(),
            model: settings.model.clone(),
            deck_analysis_instructions: settings.deck_analysis_instructions.clone(),
            has_api_key: settings.has_api_key(),
        }
    }
}

#[derive(SimpleObject)]
pub struct UpdateAiSettingsPayload {
    pub ai_settings: Option<AiSettingsObject>,
}

#[derive(Default)]
pub struct AiSettingsQueries;

#[Object]
impl AiSettingsQueries {
    async fn ai_settings(&self, ctx: &Context<'_>) -> GqlResult<AiSettingsObject> {
        Ok((&settings(state(ctx)).await?).into())
    }
}

#[derive(Default)]
pub struct AiSettingsMutations;

#[Object]
impl AiSettingsMutations {
    async fn update_ai_settings(
        &self,
        ctx: &Context<'_>,
        input: AiSettingsInput,
    ) -> GqlResult<Option<UpdateAiSettingsPayload>> {
        let state = state(ctx);
        match update(state, input).await {
            Ok(_) => Ok(Some(UpdateAiSettingsPayload {
                ai_settings: Some((&settings(state).await?).into()),
            })),
            Err(UpdateError::Invalid(errors)) => Err(user_error(errors.message())),
            Err(UpdateError::Db(error)) => Err(error.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestApp;
    use serde_json::json;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn openrouter(models: &[&str]) -> MockServer {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/key"))
            .and(header("x-openrouter-title", "ManaVault"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(json!({"data": {"label": "ManaVault"}})),
            )
            .mount(&server)
            .await;
        let data: Vec<Value> = models.iter().map(|id| json!({"id": id})).collect();
        Mock::given(method("GET"))
            .and(path("/api/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": data})))
            .mount(&server)
            .await;
        server
    }

    async fn app_with(server: &MockServer) -> TestApp {
        let base = format!("{}/api/v1", server.uri());
        TestApp::with_config(|config| config.platform_urls.openrouter_api = base).await
    }

    fn input(
        api_key: Option<&str>,
        model: &str,
        instructions: MaybeUndefined<String>,
    ) -> AiSettingsInput {
        AiSettingsInput {
            provider: "openrouter".into(),
            api_key: api_key.map(str::to_owned),
            model: model.into(),
            deck_analysis_instructions: instructions,
        }
    }

    #[tokio::test]
    async fn validates_encrypts_and_preserves_a_blank_api_key() {
        let server = openrouter(&["anthropic/claude-sonnet-4", "openai/gpt-5-mini"]).await;
        let app = app_with(&server).await;
        let saved = update(
            &app.state,
            input(
                Some("test-openrouter-key"),
                "anthropic/claude-sonnet-4",
                MaybeUndefined::Value("  Never suggest infinite combos.  ".into()),
            ),
        )
        .await
        .unwrap();
        assert_eq!(saved.api_key.as_deref(), Some("test-openrouter-key"));
        assert_eq!(
            saved.deck_analysis_instructions.as_deref(),
            Some("Never suggest infinite combos.")
        );
        let raw: String = sqlx::query_scalar("SELECT api_key FROM ai_settings WHERE id = 1")
            .fetch_one(app.db())
            .await
            .unwrap();
        assert!(raw.starts_with("enc.v1."));
        assert!(!raw.contains("test-openrouter-key"));

        let updated = update(
            &app.state,
            input(Some("  "), "openai/gpt-5-mini", MaybeUndefined::Undefined),
        )
        .await
        .unwrap();
        assert_eq!(updated.api_key.as_deref(), Some("test-openrouter-key"));
        assert_eq!(updated.model.as_deref(), Some("openai/gpt-5-mini"));
        assert_eq!(
            updated.deck_analysis_instructions.as_deref(),
            Some("Never suggest infinite combos.")
        );
        let cleared = update(
            &app.state,
            input(
                None,
                "openai/gpt-5-mini",
                MaybeUndefined::Value("  ".into()),
            ),
        )
        .await
        .unwrap();
        assert_eq!(cleared.deck_analysis_instructions, None);
        assert_eq!(settings(&app.state).await.unwrap(), cleared);
    }

    #[tokio::test]
    async fn rejects_an_unknown_model_without_saving() {
        let server = openrouter(&["anthropic/claude-sonnet-4"]).await;
        let app = app_with(&server).await;
        let errors = match update(
            &app.state,
            input(
                Some("test-openrouter-key"),
                "unknown/model",
                MaybeUndefined::Undefined,
            ),
        )
        .await
        {
            Err(UpdateError::Invalid(errors)) => errors,
            other => unreachable!("expected a validation error, got {other:?}"),
        };
        assert_eq!(
            errors.by_field().get("model"),
            Some(&vec![
                "OpenRouter model \"unknown/model\" was not found.".to_owned()
            ])
        );
        assert!(!settings(&app.state).await.unwrap().has_api_key());
    }

    #[tokio::test]
    async fn reports_a_rejected_key_and_requires_a_key() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/key"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;
        let app = app_with(&server).await;
        let response = app
            .gql(
                r"mutation($input: AiSettingsInput!) { updateAiSettings(input: $input) { aiSettings { hasApiKey } } }",
                json!({"input": {"provider": "openrouter", "apiKey": "bad", "model": "m"}}),
            )
            .await;
        assert_eq!(
            response["errors"][0]["message"],
            "api_key OpenRouter rejected the API key."
        );
        let response = app
            .gql(
                r"mutation($input: AiSettingsInput!) { updateAiSettings(input: $input) { aiSettings { hasApiKey } } }",
                json!({"input": {"provider": "other", "model": " "}}),
            )
            .await;
        assert_eq!(
            response["errors"][0]["message"],
            "api_key can't be blank, model can't be blank, provider is invalid"
        );
    }

    #[test]
    fn response_errors_prefer_provider_messages() {
        let body = json!({"error": {"message": "Bad", "metadata": {"raw": "{\"error\":{\"message\":\"Upstream\"}}"}}});
        assert_eq!(
            openrouter::response_error(400, &body.to_string(), "fallback"),
            "OpenRouter: Bad: Upstream"
        );
        assert_eq!(
            openrouter::response_error(502, "<html>", "OpenRouter could not validate the model."),
            "OpenRouter could not validate the model. (HTTP 502)"
        );
    }

    #[tokio::test]
    async fn graphql_settings_never_expose_the_key() {
        let server = openrouter(&["anthropic/claude-sonnet-4"]).await;
        let app = app_with(&server).await;
        assert_eq!(
            app.gql_data(
                "{ aiSettings { provider model deckAnalysisInstructions hasApiKey } }",
                json!({})
            )
            .await,
            json!({"aiSettings": {"provider": "openrouter", "model": null, "deckAnalysisInstructions": null, "hasApiKey": false}})
        );
        let data = app
            .gql_data(
                r"mutation UpdateAISettings($input: AiSettingsInput!) {
                     updateAiSettings(input: $input) {
                       aiSettings { provider model deckAnalysisInstructions hasApiKey }
                     }
                   }",
                json!({"input": {
                    "provider": "openrouter",
                    "apiKey": "graphql-openrouter-key",
                    "model": "anthropic/claude-sonnet-4",
                    "deckAnalysisInstructions": "Never suggest infinite combos. Add a Budget upgrades section."
                }}),
            )
            .await;
        assert_eq!(
            data["updateAiSettings"]["aiSettings"],
            json!({
                "provider": "openrouter",
                "model": "anthropic/claude-sonnet-4",
                "deckAnalysisInstructions": "Never suggest infinite combos. Add a Budget upgrades section.",
                "hasApiKey": true
            })
        );
    }
}
