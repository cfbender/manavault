//! AI provider settings (`Manavault.AI.Settings` and `AI.UpdateSettings`):
//! the `ai_settings` singleton row. The API key is stored encrypted
//! (`Manavault.Encrypted.Binary`) and never leaves the server; GraphQL only
//! reports whether one is saved.
//!
//! Saving validates the key and model against `OpenRouter`, the only provider.
//! Deck analysis and questions belong to the AI module proper.

use async_graphql::{Context, ErrorExtensions, InputObject, MaybeUndefined, Object, SimpleObject};
use serde_json::Value;

use crate::graphql::state;
use crate::validation::{BLANK, INVALID, ValidationError, too_long};

type GqlResult<T> = async_graphql::Result<T>;
use crate::state::AppState;
use crate::timestamp::Timestamp;

const SINGLETON_ID: i64 = 1;
const PROVIDERS: [&str; 1] = ["openrouter"];
/// The decision model used when none is saved.
pub const DEFAULT_DECISION_MODEL: &str = "typesafe/jev-1.13";
/// `OpenRouter`'s `reasoning.effort` values, highest first.
pub const REASONING_EFFORTS: [&str; 7] =
    ["max", "xhigh", "high", "medium", "low", "minimal", "none"];

/// The saved settings, with the API key decrypted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AiSettings {
    pub provider: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub deck_analysis_instructions: Option<String>,
    /// The saved decision model; `None` uses [`DEFAULT_DECISION_MODEL`].
    pub decision_model: Option<String>,
    /// One of [`REASONING_EFFORTS`]; `None` leaves the model's default.
    pub reasoning_effort: Option<String>,
}

impl AiSettings {
    /// The decision model that assigns AI tags to deck cards.
    #[must_use]
    pub fn decision_model(&self) -> &str {
        self.decision_model
            .as_deref()
            .unwrap_or(DEFAULT_DECISION_MODEL)
    }

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
    let now = Timestamp::now();
    sqlx::query!(
        "INSERT INTO ai_settings (id, provider, inserted_at, updated_at) VALUES (?1, 'openrouter', ?2, ?2)
         ON CONFLICT(id) DO NOTHING",
        SINGLETON_ID,
        now
    )
    .execute(&state.db)
    .await?;
    let row = sqlx::query!(
        "SELECT provider, api_key, model, deck_analysis_instructions, decision_model,
           reasoning_effort
         FROM ai_settings WHERE id = ?1",
        SINGLETON_ID
    )
    .fetch_one(&state.db)
    .await?;
    Ok(AiSettings {
        provider: row.provider,
        api_key: row.api_key.and_then(|stored| state.decrypt_secret(&stored)),
        model: row.model,
        deck_analysis_instructions: row.deck_analysis_instructions,
        decision_model: row.decision_model,
        reasoning_effort: row.reasoning_effort,
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
    /// Omit to keep the saved model; null or blank uses the default.
    pub decision_model: MaybeUndefined<String>,
    /// Omit to keep the saved effort; null or blank uses the model's default.
    pub reasoning_effort: MaybeUndefined<String>,
}

/// Why saving failed.
#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error(transparent)]
    Invalid(ValidationError),
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
        decision_model: match input.decision_model {
            MaybeUndefined::Undefined => current.decision_model.clone(),
            MaybeUndefined::Null => None,
            MaybeUndefined::Value(text) => {
                normalize(&text).filter(|model| model != DEFAULT_DECISION_MODEL)
            }
        },
        reasoning_effort: match input.reasoning_effort {
            MaybeUndefined::Undefined => current.reasoning_effort.clone(),
            MaybeUndefined::Null => None,
            MaybeUndefined::Value(text) => normalize(&text),
        },
    };

    let mut errors = ValidationError::new();
    if candidate.provider.is_empty() {
        errors.add("provider", BLANK);
    } else if !PROVIDERS.contains(&candidate.provider.as_str()) {
        errors.add("provider", INVALID);
    }
    if candidate.api_key.is_none() {
        errors.add("api_key", BLANK);
    }
    if candidate.model.is_none() {
        errors.add("model", BLANK);
    }
    if candidate
        .model
        .as_deref()
        .is_some_and(|model| model.chars().count() > 200)
    {
        errors.add("model", too_long(200));
    }
    if candidate
        .decision_model
        .as_deref()
        .is_some_and(|model| model.chars().count() > 200)
    {
        errors.add("decision_model", too_long(200));
    }
    if candidate
        .deck_analysis_instructions
        .as_deref()
        .is_some_and(|text| text.chars().count() > 4000)
    {
        errors.add("deck_analysis_instructions", too_long(4000));
    }
    if candidate
        .reasoning_effort
        .as_deref()
        .is_some_and(|effort| !REASONING_EFFORTS.contains(&effort))
    {
        errors.add("reasoning_effort", INVALID);
    }
    errors.into_result().map_err(UpdateError::Invalid)?;

    let mut validated = openrouter::validate_settings(state, &candidate).await;
    // Decision models are not in OpenRouter's model list, so a changed one
    // is checked with a one-question Decisions request instead.
    if validated.is_ok() && candidate.decision_model() != current.decision_model() {
        validated = openrouter::validate_decision_model(state, &candidate).await;
    }
    if let Err((field, message)) = validated {
        return Err(UpdateError::Invalid(ValidationError::single(
            field, message,
        )));
    }

    let stored_key = candidate
        .api_key
        .as_deref()
        .and_then(|key| state.encrypt_secret(key));
    let now = Timestamp::now();
    sqlx::query!(
        "UPDATE ai_settings SET provider = ?1, api_key = ?2, model = ?3,
           deck_analysis_instructions = ?4, decision_model = ?5, reasoning_effort = ?6,
           updated_at = ?7 WHERE id = ?8",
        candidate.provider,
        stored_key,
        candidate.model,
        candidate.deck_analysis_instructions,
        candidate.decision_model,
        candidate.reasoning_effort,
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

    /// Sends the decision model one small Decisions request; an error names
    /// the `decision_model` field.
    pub async fn validate_decision_model(
        state: &AppState,
        settings: &AiSettings,
    ) -> Result<(), (&'static str, String)> {
        let model = settings.decision_model();
        let probe = serde_json::json!({
            "model": model,
            "state": "Hello there!",
            "questions": {"greeting": {
                "type": "choice",
                "instructions": "Is this text a greeting?",
                "criteria": {"yes": null, "no": null}
            }}
        });
        let response = state
            .http
            .post(&state.config.platform_urls.openrouter_decisions)
            .bearer_auth(settings.api_key.as_deref().unwrap_or_default())
            .header("accept", "application/json")
            .header("http-referer", "https://github.com/cfbender/manavault")
            .header("x-openrouter-title", "ManaVault")
            .timeout(std::time::Duration::from_secs(30))
            .json(&probe)
            .send()
            .await
            .map_err(|error| ("base", request_error(&error)))?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let answered = serde_json::from_str::<Value>(&body)
            .is_ok_and(|value| value.get("answers").is_some_and(Value::is_object));
        if status.is_success() && answered {
            return Ok(());
        }
        Err((
            "decision_model",
            format!(
                "\"{model}\" could not be used. {}",
                response_error(status.as_u16(), &body, "The Decisions request failed.")
            ),
        ))
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

        let model = settings.model.as_deref().unwrap_or_default();
        let entry = find_model(state, api_key, model).await?.ok_or_else(|| {
            (
                "model",
                format!("OpenRouter model \"{model}\" was not found."),
            )
        })?;
        match settings.reasoning_effort.as_deref() {
            Some(effort)
                if !supported_efforts(&entry)
                    .is_some_and(|efforts| efforts.iter().any(|supported| supported == effort)) =>
            {
                Err((
                    "reasoning_effort",
                    format!(
                        "OpenRouter model \"{model}\" does not support the \"{effort}\" reasoning effort."
                    ),
                ))
            }
            _ => Ok(()),
        }
    }

    /// The model's entry in `OpenRouter`'s model list, if it has one. Errors
    /// name the field, like [`validate_settings`].
    pub async fn find_model(
        state: &AppState,
        api_key: &str,
        model: &str,
    ) -> Result<Option<Value>, (&'static str, String)> {
        let response = request(state, "/models", api_key)
            .send()
            .await
            .map_err(|error| ("base", request_error(&error)))?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let models = serde_json::from_str::<Value>(&body)
            .ok()
            .filter(|_| status.is_success())
            .and_then(|mut value| match value.get_mut("data").map(Value::take) {
                Some(Value::Array(models)) => Some(models),
                _ => None,
            })
            .ok_or_else(|| {
                (
                    "model",
                    response_error(
                        status.as_u16(),
                        &body,
                        "OpenRouter could not validate the model.",
                    ),
                )
            })?;
        Ok(models
            .into_iter()
            .find(|entry| entry.get("id").and_then(Value::as_str) == Some(model)))
    }

    /// The `reasoning.effort` values a model entry accepts, highest first, or
    /// `None` when the model offers no effort setting. A null
    /// `supported_efforts` accepts every value; a mandatory model rejects
    /// `none`.
    #[must_use]
    pub fn supported_efforts(entry: &Value) -> Option<Vec<String>> {
        let reasoning = entry.get("reasoning")?.as_object()?;
        let efforts = match reasoning.get("supported_efforts")? {
            Value::Array(efforts) => efforts
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect(),
            Value::Null => super::REASONING_EFFORTS.map(str::to_owned).to_vec(),
            _ => return None,
        };
        let mandatory = reasoning.get("mandatory") == Some(&Value::Bool(true));
        Some(
            efforts
                .into_iter()
                .filter(|effort| !(mandatory && effort == "none"))
                .collect(),
        )
    }
}

#[derive(SimpleObject)]
#[graphql(name = "AiSettings")]
pub struct AiSettingsObject {
    pub provider: String,
    pub model: Option<String>,
    pub deck_analysis_instructions: Option<String>,
    /// The decision model in use, the default when none is saved.
    pub decision_model: String,
    /// The reasoning effort; null leaves the model's default.
    pub reasoning_effort: Option<String>,
    pub has_api_key: bool,
}

impl From<&AiSettings> for AiSettingsObject {
    fn from(settings: &AiSettings) -> Self {
        Self {
            provider: settings.provider.clone(),
            model: settings.model.clone(),
            deck_analysis_instructions: settings.deck_analysis_instructions.clone(),
            decision_model: settings.decision_model().to_owned(),
            reasoning_effort: settings.reasoning_effort.clone(),
            has_api_key: settings.has_api_key(),
        }
    }
}

/// The reasoning efforts an `OpenRouter` model accepts.
#[derive(SimpleObject)]
pub struct AiModelReasoning {
    /// Accepted `reasoning.effort` values, highest first.
    pub supported_efforts: Vec<String>,
    /// The effort the model uses when none is sent.
    pub default_effort: Option<String>,
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

    /// The reasoning efforts `model` accepts; null when `OpenRouter` does not
    /// list the model or the model has no effort setting.
    async fn ai_model_reasoning(
        &self,
        ctx: &Context<'_>,
        model: String,
    ) -> GqlResult<Option<AiModelReasoning>> {
        let state = state(ctx);
        let saved = settings(state).await?;
        let entry = openrouter::find_model(
            state,
            saved.api_key.as_deref().unwrap_or_default(),
            model.trim(),
        )
        .await
        .map_err(|(_, message)| crate::graphql::user_error(message))?;
        Ok(entry.and_then(|entry| {
            Some(AiModelReasoning {
                supported_efforts: openrouter::supported_efforts(&entry)?,
                default_effort: entry
                    .pointer("/reasoning/default_effort")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
            })
        }))
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
            Err(UpdateError::Invalid(errors)) => Err(errors.extend()),
            Err(UpdateError::Db(error)) => Err(error.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_app::TestApp;
    use crate::testing::TestState;
    use serde_json::json;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn openrouter(models: &[&str]) -> MockServer {
        openrouter_with(models.iter().map(|id| json!({"id": id})).collect()).await
    }

    async fn openrouter_with(data: Vec<Value>) -> MockServer {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/key"))
            .and(header("x-openrouter-title", "ManaVault"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(json!({"data": {"label": "ManaVault"}})),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/api/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": data})))
            .mount(&server)
            .await;
        server
    }

    async fn app_with(server: &MockServer) -> TestState {
        let base = format!("{}/api/v1", server.uri());
        TestState::with_config(|config| config.platform_urls.openrouter_api = base).await
    }

    async fn gql_app_with(server: &MockServer) -> TestApp {
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
            decision_model: MaybeUndefined::Undefined,
            reasoning_effort: MaybeUndefined::Undefined,
        }
    }

    #[tokio::test]
    async fn reasoning_efforts_follow_what_each_model_supports() {
        let server = openrouter_with(vec![
            json!({"id": "openai/gpt-6.1-sol", "reasoning": {
                "mandatory": true,
                "supported_efforts": ["max", "xhigh", "high", "medium", "low"],
                "default_effort": "medium"
            }}),
            json!({"id": "any/effort", "reasoning": {"mandatory": true, "supported_efforts": null}}),
            json!({"id": "no/effort-setting", "reasoning": {"mandatory": false}}),
            json!({"id": "plain/model"}),
        ])
        .await;
        let app = gql_app_with(&server).await;
        // `None` omits the effort.
        let save = |model: &str, effort: Option<Value>| {
            let mut input = json!({"provider": "openrouter", "apiKey": "key", "model": model});
            if let Some(effort) = effort {
                input["reasoningEffort"] = effort;
            }
            json!({"input": input})
        };
        let mutation = r"mutation($input: AiSettingsInput!) { updateAiSettings(input: $input) { aiSettings { model reasoningEffort } } }";
        let error = |response: Value| {
            response["errors"][0]["message"]
                .as_str()
                .unwrap()
                .to_owned()
        };

        let data = app
            .gql_data(mutation, save("openai/gpt-6.1-sol", Some(json!("xhigh"))))
            .await;
        assert_eq!(
            data["updateAiSettings"]["aiSettings"],
            json!({"model": "openai/gpt-6.1-sol", "reasoningEffort": "xhigh"})
        );
        assert_eq!(
            error(
                app.gql(mutation, save("openai/gpt-6.1-sol", Some(json!("none"))))
                    .await
            ),
            "reasoning effort OpenRouter model \"openai/gpt-6.1-sol\" does not support the \"none\" reasoning effort."
        );
        assert_eq!(
            error(
                app.gql(mutation, save("openai/gpt-6.1-sol", Some(json!("turbo"))))
                    .await
            ),
            "reasoning effort is invalid"
        );
        // A null supported_efforts accepts every effort a mandatory model can use.
        assert!(
            app.gql(mutation, save("any/effort", Some(json!("minimal"))))
                .await
                .get("errors")
                .is_none()
        );
        assert_eq!(
            error(
                app.gql(mutation, save("any/effort", Some(json!("none"))))
                    .await
            ),
            "reasoning effort OpenRouter model \"any/effort\" does not support the \"none\" reasoning effort."
        );
        // An omitted effort keeps the saved one, which the next model must accept.
        assert_eq!(
            error(app.gql(mutation, save("no/effort-setting", None)).await),
            "reasoning effort OpenRouter model \"no/effort-setting\" does not support the \"minimal\" reasoning effort."
        );
        let data = app
            .gql_data(mutation, save("plain/model", Some(Value::Null)))
            .await;
        assert_eq!(
            data["updateAiSettings"]["aiSettings"],
            json!({"model": "plain/model", "reasoningEffort": null})
        );

        let query = r"query($model: String!) { aiModelReasoning(model: $model) { supportedEfforts defaultEffort } }";
        let reasoning = |model: &'static str| app.gql_data(query, json!({"model": model}));
        assert_eq!(
            reasoning("openai/gpt-6.1-sol").await["aiModelReasoning"],
            json!({"supportedEfforts": ["max", "xhigh", "high", "medium", "low"], "defaultEffort": "medium"})
        );
        assert_eq!(
            reasoning("any/effort").await["aiModelReasoning"]["supportedEfforts"],
            json!(["max", "xhigh", "high", "medium", "low", "minimal"])
        );
        for model in ["no/effort-setting", "plain/model", "missing/model"] {
            assert_eq!(
                reasoning(model).await["aiModelReasoning"],
                Value::Null,
                "{model}"
            );
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
    async fn decision_model_defaults_and_is_checked_with_a_decisions_request_when_changed() {
        let server = openrouter(&["anthropic/claude-sonnet-4"]).await;
        Mock::given(method("POST"))
            .and(path("/api/alpha/decisions"))
            .respond_with(|request: &wiremock::Request| {
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                if body["model"] == "custom/decider" || body["model"] == DEFAULT_DECISION_MODEL {
                    ResponseTemplate::new(200).set_body_json(json!({
                        "answers": {"greeting": {"type": "choice", "choice": "yes"}}
                    }))
                } else {
                    ResponseTemplate::new(400)
                        .set_body_json(json!({"error": {"message": "Model not found"}}))
                }
            })
            .mount(&server)
            .await;
        let uri = server.uri();
        let app = TestState::with_config(|config| {
            config.platform_urls.openrouter_api = format!("{uri}/api/v1");
            config.platform_urls.openrouter_decisions = format!("{uri}/api/alpha/decisions");
        })
        .await;
        let decision_requests = || async {
            server
                .received_requests()
                .await
                .unwrap()
                .iter()
                .filter(|request| request.url.path() == "/api/alpha/decisions")
                .count()
        };
        let with_decision = |model: MaybeUndefined<String>| AiSettingsInput {
            decision_model: model,
            ..input(
                Some("test-openrouter-key"),
                "anthropic/claude-sonnet-4",
                MaybeUndefined::Undefined,
            )
        };

        // Unchanged (default) decision models are not probed.
        let saved = update(&app.state, with_decision(MaybeUndefined::Undefined))
            .await
            .unwrap();
        assert_eq!(saved.decision_model(), DEFAULT_DECISION_MODEL);
        assert_eq!(decision_requests().await, 0);

        let custom = update(
            &app.state,
            with_decision(MaybeUndefined::Value(" custom/decider ".into())),
        )
        .await
        .unwrap();
        assert_eq!(custom.decision_model(), "custom/decider");
        assert_eq!(decision_requests().await, 1);

        let errors = match update(
            &app.state,
            with_decision(MaybeUndefined::Value("missing/decider".into())),
        )
        .await
        {
            Err(UpdateError::Invalid(errors)) => errors,
            other => unreachable!("expected a validation error, got {other:?}"),
        };
        assert_eq!(
            errors.to_string(),
            "decision model \"missing/decider\" could not be used. OpenRouter: Model not found"
        );
        assert_eq!(
            settings(&app.state).await.unwrap().decision_model(),
            "custom/decider"
        );

        // Blank restores the default, stored as NULL.
        let reset = update(
            &app.state,
            with_decision(MaybeUndefined::Value("  ".into())),
        )
        .await
        .unwrap();
        assert_eq!(reset.decision_model, None);
        assert_eq!(reset.decision_model(), DEFAULT_DECISION_MODEL);
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
            errors.to_string(),
            "model OpenRouter model \"unknown/model\" was not found."
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
        let app = gql_app_with(&server).await;
        let response = app
            .gql(
                r"mutation($input: AiSettingsInput!) { updateAiSettings(input: $input) { aiSettings { hasApiKey } } }",
                json!({"input": {"provider": "openrouter", "apiKey": "bad", "model": "m"}}),
            )
            .await;
        assert_eq!(
            response["errors"][0]["message"],
            "api key OpenRouter rejected the API key."
        );
        let response = app
            .gql(
                r"mutation($input: AiSettingsInput!) { updateAiSettings(input: $input) { aiSettings { hasApiKey } } }",
                json!({"input": {"provider": "other", "model": " "}}),
            )
            .await;
        assert_eq!(
            response["errors"][0]["message"],
            "provider is invalid, api key can't be blank, model can't be blank"
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
        let app = gql_app_with(&server).await;
        assert_eq!(
            app.gql_data(
                "{ aiSettings { provider model deckAnalysisInstructions hasApiKey } }",
                json!({})
            )
            .await,
            json!({"aiSettings": {"provider": "openrouter", "model": null, "deckAnalysisInstructions": null, "hasApiKey": false}})
        );
        let mutation = r"mutation UpdateAISettings($input: AiSettingsInput!) {
             updateAiSettings(input: $input) {
               aiSettings { provider model deckAnalysisInstructions hasApiKey }
             }
           }";
        let data = app
            .gql_data(
                mutation,
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
        // An omitted key and instructions keep the saved ones; a blank key does too.
        let data = app
            .gql_data(
                mutation,
                json!({"input": {"provider": "openrouter", "model": "anthropic/claude-sonnet-4"}}),
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
        let data = app
            .gql_data(
                mutation,
                json!({"input": {
                    "provider": "openrouter",
                    "apiKey": "",
                    "model": "anthropic/claude-sonnet-4",
                    "deckAnalysisInstructions": null
                }}),
            )
            .await;
        assert_eq!(
            data["updateAiSettings"]["aiSettings"],
            json!({
                "provider": "openrouter",
                "model": "anthropic/claude-sonnet-4",
                "deckAnalysisInstructions": null,
                "hasApiKey": true
            })
        );
    }
}
