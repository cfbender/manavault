//! The `OpenRouter` provider (`AI.Providers.OpenRouter`): deck analysis and
//! deck questions as structured chat completions, with catalog and
//! collection tools.
//!
//! The base URL is `config.platform_urls.openrouter_api`. Each completion
//! logs one diagnostics line (status, finish reasons, token counts, content
//! sizes) without the prompt, the answer, reasoning text, or the API key.

use std::fmt::Write as _;
use std::time::{Duration, Instant};

use serde_json::{Map, Value, json};

use super::Configured;
use super::deck_analysis::prompt as analysis_prompt;
use super::deck_question::{self, SwapContext};
use super::tools;
use manavault_core::settings::ai::openrouter::response_error;
use manavault_core::state::AppState;

/// Rounds in which the model may call tools before it must answer.
const MAX_TOOL_ROUNDS: usize = 4;
const COMPLETION_TIMEOUT: Duration = Duration::from_secs(120);
const ANSWER_TOKEN_LIMIT: &str = "OpenRouter ran out of output tokens before finishing the answer.";
const ANSWER_INCOMPLETE: &str = "OpenRouter returned an incomplete answer.";
const ANSWER_INVALID: &str = "OpenRouter returned an invalid answer.";

/// One question turn (`Provider.question_turn`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Turn {
    pub question: String,
    /// Earlier `(question, answer)` turns of the same chat, oldest first.
    pub history: Vec<(String, String)>,
    pub swap_context: Option<SwapContext>,
    /// Whether this is a Swap cards chat thread.
    pub thread: bool,
}

#[derive(Clone, Copy)]
enum Operation {
    DeckAnalysis,
    DeckQuestion,
}

impl Operation {
    fn name(self) -> &'static str {
        match self {
            Self::DeckAnalysis => "deck_analysis",
            Self::DeckQuestion => "deck_question",
        }
    }

    fn http_error(self) -> &'static str {
        match self {
            Self::DeckAnalysis => "OpenRouter could not analyze this deck.",
            Self::DeckQuestion => "OpenRouter could not answer this question.",
        }
    }

    fn request_error(self) -> &'static str {
        match self {
            Self::DeckAnalysis => "Could not reach OpenRouter to analyze this deck.",
            Self::DeckQuestion => "Could not reach OpenRouter to answer this question.",
        }
    }

    fn decode(self, body: &Value) -> Result<Value, String> {
        match self {
            Self::DeckAnalysis => decode_analysis(body),
            Self::DeckQuestion => decode_answer(body),
        }
    }
}

/// `analyze_deck/2`: the raw structured analysis object.
pub async fn analyze_deck(
    state: &AppState,
    settings: &Configured,
    payload: &Value,
) -> Result<Value, String> {
    let instructions = settings.deck_analysis_instructions.as_deref();
    let request = json!({
        "model": settings.model,
        "messages": [
            {"role": "system", "content": analysis_prompt::system(instructions)},
            {"role": "user", "content": analysis_prompt::user(payload)}
        ],
        "max_tokens": 20_000,
        "tools": tools::definitions(),
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "manavault_deck_analysis",
                "strict": true,
                "schema": analysis_prompt::schema(instructions)
            }
        }
    });
    complete(state, settings, request, Operation::DeckAnalysis).await
}

/// `ask_deck_question/3`: the raw structured answer object.
pub async fn ask_deck_question(
    state: &AppState,
    settings: &Configured,
    payload: &Value,
    turn: &Turn,
) -> Result<Value, String> {
    let request = json!({
        "model": settings.model,
        "messages": question_messages(payload, turn),
        "max_tokens": 20_000,
        "tools": tools::definitions(),
        "plugins": [{"id": "response-healing"}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "manavault_deck_question_answer",
                "strict": true,
                "schema": deck_question::response_schema()
            }
        }
    });
    complete(state, settings, request, Operation::DeckQuestion).await
}

fn question_messages(payload: &Value, turn: &Turn) -> Vec<Value> {
    let system = if turn.thread {
        format!(
            "{}\n{}",
            deck_question::system_prompt(),
            deck_question::swap_chat_instructions()
        )
    } else {
        deck_question::system_prompt().to_owned()
    };
    let mut messages = vec![json!({"role": "system", "content": system})];
    for (question, answer) in &turn.history {
        messages.push(json!({"role": "user", "content": question}));
        messages.push(json!({"role": "assistant", "content": answer}));
    }
    messages.push(json!({
        "role": "user",
        "content": deck_question::user_prompt(&turn.question, payload, turn.swap_context.as_ref())
    }));
    messages
}

enum Response {
    Http {
        status: u16,
        body: Value,
        text: String,
    },
    Failed(reqwest::Error),
}

async fn post_completion(state: &AppState, api_key: &str, request: &Value) -> Response {
    let sent = state
        .http
        .post(format!(
            "{}/chat/completions",
            state.config.platform_urls.openrouter_api
        ))
        .bearer_auth(api_key)
        .header("accept", "application/json")
        .header("http-referer", "https://github.com/cfbender/manavault")
        .header("x-openrouter-title", "ManaVault")
        .timeout(COMPLETION_TIMEOUT)
        .json(request)
        .send()
        .await;
    let response = match sent {
        Ok(response) => response,
        Err(error) => return Response::Failed(error),
    };
    let status = response.status().as_u16();
    match response.text().await {
        Ok(text) => Response::Http {
            status,
            body: serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text.clone())),
            text,
        },
        Err(error) => Response::Failed(error),
    }
}

/// Runs the completion, executing any tool calls the model requests and
/// feeding the results back until it returns a final message. After
/// [`MAX_TOOL_ROUNDS`] the model may no longer call tools. A model without
/// tool-capable endpoints is retried once without tools.
async fn complete(
    state: &AppState,
    settings: &Configured,
    request: Value,
    operation: Operation,
) -> Result<Value, String> {
    let Value::Object(mut request) = request else {
        return Err(operation.http_error().to_owned());
    };
    let mut round = 0;
    loop {
        if round >= MAX_TOOL_ROUNDS {
            request.insert("tool_choice".into(), json!("none"));
        }
        let started = Instant::now();
        let request_value = Value::Object(request.clone());
        match post_completion(state, &settings.api_key, &request_value).await {
            Response::Http { status, body, .. } if (200..300).contains(&status) => {
                let calls = tool_calls(&body);
                if calls.is_empty() {
                    let result = operation.decode(&body);
                    let outcome = match &result {
                        Ok(_) => LogResult::Ok,
                        Err(message) => LogResult::Error(message),
                    };
                    log_completion(&outcome, operation, &settings.model, started, status, &body);
                    return result;
                }
                log_completion(
                    &LogResult::ToolCalls,
                    operation,
                    &settings.model,
                    started,
                    status,
                    &body,
                );
                let mut follow_up = vec![assistant_message(&body)];
                for call in &calls {
                    follow_up.push(tool_message(state, call).await?);
                }
                if let Some(Value::Array(messages)) = request.get_mut("messages") {
                    messages.extend(follow_up);
                }
                round += 1;
            }
            Response::Http {
                status: 404,
                body,
                text,
            } if round == 0 && request.contains_key("tools") => {
                if tool_use_unsupported(&body) {
                    tracing::warn!(
                        "OpenRouter model {} does not support tool use; retrying operation={} without tools",
                        inspect_str(&settings.model),
                        operation.name()
                    );
                    request.remove("tools");
                } else {
                    log_completion(
                        &LogResult::HttpError(&text),
                        operation,
                        &settings.model,
                        started,
                        404,
                        &body,
                    );
                    return Err(response_error(404, &text, operation.http_error()));
                }
            }
            Response::Http { status, body, text } => {
                log_completion(
                    &LogResult::HttpError(&text),
                    operation,
                    &settings.model,
                    started,
                    status,
                    &body,
                );
                return Err(response_error(status, &text, operation.http_error()));
            }
            Response::Failed(error) => {
                tracing::warn!(
                    "OpenRouter completion operation={} model={} duration_ms={} result=request_error reason={}",
                    operation.name(),
                    inspect_str(&settings.model),
                    started.elapsed().as_millis(),
                    request_error_reason(&error)
                );
                return Err(if error.is_timeout() {
                    format!("{} The request timed out.", operation.request_error())
                } else {
                    operation.request_error().to_owned()
                });
            }
        }
    }
}

fn first_choice(body: &Value) -> Option<&Map<String, Value>> {
    body.get("choices")?.as_array()?.first()?.as_object()
}

fn tool_calls(body: &Value) -> Vec<Value> {
    first_choice(body)
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("tool_calls"))
        .and_then(Value::as_array)
        .map(|calls| {
            calls
                .iter()
                .filter(|call| call.is_object())
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

/// The assistant turn echoed back verbatim so the model sees its own tool
/// calls (and any reasoning) ahead of the tool results.
fn assistant_message(body: &Value) -> Value {
    let message = first_choice(body)
        .and_then(|choice| choice.get("message"))
        .and_then(Value::as_object);
    let mut echoed = Map::new();
    if let Some(message) = message {
        for key in [
            "role",
            "content",
            "tool_calls",
            "reasoning",
            "reasoning_details",
        ] {
            if let Some(value) = message.get(key) {
                echoed.insert(key.to_owned(), value.clone());
            }
        }
    }
    echoed.entry("role").or_insert_with(|| json!("assistant"));
    echoed.entry("content").or_insert(Value::Null);
    Value::Object(echoed)
}

fn decode_arguments(arguments: Option<&Value>) -> Value {
    match arguments {
        Some(Value::String(text)) => match serde_json::from_str(text) {
            Ok(Value::Object(map)) => Value::Object(map),
            _ => json!({}),
        },
        Some(Value::Object(map)) => Value::Object(map.clone()),
        _ => json!({}),
    }
}

async fn tool_message(state: &AppState, call: &Value) -> Result<Value, String> {
    let function = call.get("function");
    let name = function.and_then(|function| function.get("name"));
    let arguments = decode_arguments(function.and_then(|function| function.get("arguments")));
    let result = tools::call(&state.db, name.and_then(Value::as_str), &arguments)
        .await
        .map_err(|error| {
            tracing::error!(%error, "AI tool call failed");
            "Something went wrong.".to_owned()
        })?;
    Ok(json!({
        "role": "tool",
        "tool_call_id": call.get("id").cloned().unwrap_or(Value::Null),
        "name": name.cloned().unwrap_or(Value::Null),
        "content": result.to_string()
    }))
}

fn tool_use_unsupported(body: &Value) -> bool {
    body.get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .is_some_and(|message| message.to_lowercase().contains("tool use"))
}

fn decode_analysis(body: &Value) -> Result<Value, String> {
    let content = first_choice(body)
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .ok_or_else(|| "OpenRouter returned an incomplete deck analysis.".to_owned())?;
    match serde_json::from_str(content) {
        Ok(Value::Object(map)) => Ok(Value::Object(map)),
        _ => Err("OpenRouter returned an invalid deck analysis.".to_owned()),
    }
}

fn decode_answer(body: &Value) -> Result<Value, String> {
    let Some(choice) = first_choice(body) else {
        return Err(ANSWER_INCOMPLETE.to_owned());
    };
    let content = choice
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str);
    let limited = choice.get("finish_reason").and_then(Value::as_str) == Some("length")
        || matches!(
            choice.get("native_finish_reason").and_then(Value::as_str),
            Some("MAX_TOKENS" | "max_tokens")
        );
    match content {
        None if limited => Err(ANSWER_TOKEN_LIMIT.to_owned()),
        None => Err(ANSWER_INCOMPLETE.to_owned()),
        Some(content) => match serde_json::from_str(content) {
            Ok(Value::Object(map)) => Ok(Value::Object(map)),
            _ if limited => Err(ANSWER_TOKEN_LIMIT.to_owned()),
            _ => Err(ANSWER_INVALID.to_owned()),
        },
    }
}

enum LogResult<'a> {
    Ok,
    ToolCalls,
    Error(&'a str),
    /// The raw response text, for the error message.
    HttpError(&'a str),
}

impl LogResult<'_> {
    fn label(&self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::ToolCalls => "tool_calls",
            Self::Error(message) if *message == ANSWER_TOKEN_LIMIT => "output_token_limit",
            Self::Error(message) if *message == ANSWER_INCOMPLETE => "incomplete_response",
            Self::Error(_) => "invalid_response",
            Self::HttpError(_) => "http_error",
        }
    }
}

/// A string as error messages quote it: in double quotes, with escapes.
#[must_use]
pub fn inspect_str(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '#' if chars.peek() == Some(&'{') => out.push_str("\\#"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// `inspect(value, printable_limit: limit)` for a string.
fn inspect_limited(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        inspect_str(text)
    } else {
        let kept: String = text.chars().take(limit).collect();
        format!("{} <> ...", inspect_str(&kept))
    }
}

/// A decoded JSON value for error messages: strings quoted by
/// [`inspect_str`], anything else as JSON (`nil` when absent).
fn inspect(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => "nil".to_owned(),
        Some(Value::String(text)) => inspect_str(text),
        Some(other) => other.to_string(),
    }
}

fn value<'a>(map: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    map?.as_object()?.get(key)
}

fn log_completion(
    result: &LogResult<'_>,
    operation: Operation,
    model: &str,
    started: Instant,
    status: u16,
    body: &Value,
) {
    let choice = value(Some(body), "choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .filter(|choice| choice.is_object());
    let message = value(choice, "message");
    let usage = value(Some(body), "usage");
    let token_details = value(usage, "completion_tokens_details");
    let content_bytes = value(message, "content")
        .and_then(Value::as_str)
        .map(str::len);
    let reasoning = value(message, "reasoning")
        .filter(|reasoning| !reasoning.is_null())
        .or_else(|| value(message, "reasoning_content"));
    let reasoning_bytes = reasoning.and_then(Value::as_str).map(str::len);
    let bytes = |count: Option<usize>| count.map_or_else(|| "nil".to_owned(), |n| n.to_string());
    let mut line = format!(
        "OpenRouter completion operation={} model={} status={status} duration_ms={} provider={} finish_reason={} native_finish_reason={} prompt_tokens={} completion_tokens={} reasoning_tokens={} content_bytes={} reasoning_bytes={} result={}",
        operation.name(),
        inspect_str(model),
        started.elapsed().as_millis(),
        inspect(value(Some(body), "provider")),
        inspect(value(choice, "finish_reason")),
        inspect(value(choice, "native_finish_reason")),
        inspect(value(usage, "prompt_tokens")),
        inspect(value(usage, "completion_tokens")),
        inspect(value(token_details, "reasoning_tokens")),
        bytes(content_bytes),
        bytes(reasoning_bytes),
        result.label()
    );
    if let LogResult::HttpError(text) = result {
        let metadata = value(value(Some(body), "error"), "metadata");
        let _ = write!(
            line,
            " error={} error_type={} provider_error_code={} error_provider={}",
            inspect_limited(
                &response_error(status, text, "OpenRouter request failed."),
                2_000
            ),
            inspect(value(metadata, "error_type")),
            inspect(value(metadata, "provider_code")),
            inspect(value(metadata, "provider_name"))
        );
    }
    if matches!(result, LogResult::Ok | LogResult::ToolCalls) {
        tracing::info!("{line}");
    } else {
        tracing::warn!("{line}");
    }
}

fn request_error_reason(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        ":timeout"
    } else if error.is_connect() {
        ":econnrefused"
    } else {
        "unknown"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspects_strings_like_earlier_releases() {
        assert_eq!(inspect_str("a\"b\\c\n#{x}"), r#""a\"b\\c\n\#{x}""#);
        assert_eq!(inspect(None), "nil");
        assert_eq!(inspect(Some(&json!(12))), "12");
        assert_eq!(inspect_limited("abcdef", 3), r#""abc" <> ..."#);
    }

    #[test]
    fn answers_decode_with_token_limit_diagnostics() {
        let body = |choice: Value| json!({"choices": [choice]});
        assert_eq!(
            decode_answer(&body(
                json!({"finish_reason": "length", "message": {"content": "{\"answer\":\"unf"}})
            )),
            Err(ANSWER_TOKEN_LIMIT.to_owned())
        );
        assert_eq!(
            decode_answer(&body(
                json!({"native_finish_reason": "max_tokens", "message": {}})
            )),
            Err(ANSWER_TOKEN_LIMIT.to_owned())
        );
        assert_eq!(
            decode_answer(&body(json!({"message": {"content": null}}))),
            Err(ANSWER_INCOMPLETE.to_owned())
        );
        assert_eq!(
            decode_answer(&body(json!({"message": {"content": "[1]"}}))),
            Err(ANSWER_INVALID.to_owned())
        );
        assert_eq!(
            decode_answer(&json!({"choices": []})),
            Err(ANSWER_INCOMPLETE.to_owned())
        );
        assert_eq!(
            decode_analysis(&json!({"choices": [{"message": {"content": "nope"}}]})),
            Err("OpenRouter returned an invalid deck analysis.".to_owned())
        );
        assert_eq!(
            decode_analysis(&json!("text")),
            Err("OpenRouter returned an incomplete deck analysis.".to_owned())
        );
    }

    #[test]
    fn echoes_assistant_tool_turns() {
        let body = json!({"choices": [{"message": {"tool_calls": [{"id": "c"}], "refusal": "x"}}]});
        assert_eq!(
            assistant_message(&body),
            json!({"role": "assistant", "content": null, "tool_calls": [{"id": "c"}]})
        );
        assert_eq!(decode_arguments(Some(&json!("not json"))), json!({}));
        assert_eq!(
            decode_arguments(Some(&json!("{\"names\":[\"a\"]}"))),
            json!({"names": ["a"]})
        );
        assert_eq!(decode_arguments(Some(&json!(["a"]))), json!({}));
    }
}
