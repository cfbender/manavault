//! The `OpenRouter` provider (`AI.Providers.OpenRouter`): deck analysis and
//! deck questions as structured chat completions, with catalog and
//! collection tools.
//!
//! The base URL is `config.platform_urls.openrouter_api`. Each completion
//! logs one diagnostics line (status, finish reasons, token counts including
//! prompt-cache reads and writes, content sizes) without the prompt, the
//! answer, reasoning text, or the API key.
//!
//! Requests are shaped for prompt caching: the system prompt and the deck
//! data come first, every request in one conversation shares a
//! `session_id` so `OpenRouter` keeps routing it to the provider holding the
//! cache, and [`mark_cache_breakpoints`] marks the stable prefix for
//! providers that need explicit breakpoints (Anthropic). Providers that
//! cache automatically ignore the marks.
//!
//! Tools and `response_format` never travel in the same request. Some
//! endpoints enforce a JSON schema by constraining every output token, which
//! leaves the model no way to emit a tool call; it then invents the lookup
//! inside the answer instead. So rounds that offer tools describe the
//! schema in the system prompt and leave `response_format` out, and the
//! schema is enforced only in a repair round, without tools, when the
//! model's final message is not the JSON object asked for.

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
/// The tool result for calls past [`MAX_TOOL_ROUNDS`].
const TOOL_LIMIT_REACHED: &str =
    "No more tool calls are allowed. Answer now from the results you already have.";
const TOOL_LOOP: &str = "OpenRouter kept calling tools instead of answering.";
/// Asks the model to restate a final message that was not the JSON object.
const REPAIR_PROMPT: &str = "Return that answer as exactly one JSON object matching the required schema, with no other text.";
/// High reasoning efforts can think for several minutes before answering.
const COMPLETION_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// One question turn (`Provider.question_turn`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Turn {
    pub question: String,
    /// Earlier `(question, answer)` turns of the same chat, oldest first.
    pub history: Vec<(String, String)>,
    pub swap_context: Option<SwapContext>,
    /// Whether this is a Swap cards chat thread.
    pub thread: bool,
    /// Identifies the chat this turn belongs to, so its follow-ups share an
    /// `OpenRouter` session (and the provider's prompt cache).
    pub conversation: String,
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

    fn decode_error(self, error: DecodeError) -> &'static str {
        match (self, error) {
            (Self::DeckAnalysis, DecodeError::TokenLimit) => {
                "OpenRouter ran out of output tokens before finishing the deck analysis."
            }
            (Self::DeckAnalysis, DecodeError::Incomplete) => {
                "OpenRouter returned an incomplete deck analysis."
            }
            (Self::DeckAnalysis, DecodeError::Invalid) => {
                "OpenRouter returned an invalid deck analysis."
            }
            (Self::DeckQuestion, DecodeError::TokenLimit) => {
                "OpenRouter ran out of output tokens before finishing the answer."
            }
            (Self::DeckQuestion, DecodeError::Incomplete) => {
                "OpenRouter returned an incomplete answer."
            }
            (Self::DeckQuestion, DecodeError::Invalid) => "OpenRouter returned an invalid answer.",
        }
    }
}

/// Why a final message did not decode as the structured result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DecodeError {
    /// The output token limit cut the message short.
    TokenLimit,
    /// The message has no content.
    Incomplete,
    /// The content is not a JSON object.
    Invalid,
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
        "session_id": session_id("deck-analysis", &payload.to_string()),
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
        "session_id": session_id("deck-question", &turn.conversation),
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
    // The deck comes before the conversation so the stable system and deck
    // prefix stays cacheable across questions.
    let mut messages = vec![
        json!({"role": "system", "content": system}),
        json!({"role": "user", "content": deck_question::deck_prompt(payload)}),
    ];
    for (question, answer) in &turn.history {
        messages.push(json!({"role": "user", "content": question}));
        messages.push(json!({"role": "assistant", "content": answer}));
    }
    messages.push(json!({
        "role": "user",
        "content": deck_question::user_prompt(&turn.question, turn.swap_context.as_ref())
    }));
    messages
}

/// A stable `OpenRouter` session id for one conversation: the same `key`
/// gives the same id, without sending the key itself.
fn session_id(kind: &str, key: &str) -> String {
    let mut digest = manavault_core::crypto::sha256_hex(key.as_bytes());
    digest.truncate(32);
    format!("manavault-{kind}-{digest}")
}

/// Marks prompt-cache breakpoints on the system message, the first user
/// message (the deck data), and the newest message, whose prefix the next
/// tool round resends. Their string content becomes a single text part with
/// `cache_control`; every other message keeps a plain string, which keeps
/// the request within Anthropic's limit of four breakpoints.
fn mark_cache_breakpoints(request: &mut Map<String, Value>) {
    let Some(Value::Array(messages)) = request.get_mut("messages") else {
        return;
    };
    let deck = messages
        .iter()
        .position(|message| message["role"] == "user");
    for index in [Some(0), deck, messages.len().checked_sub(1)]
        .into_iter()
        .flatten()
    {
        if let Some(content) = messages
            .get_mut(index)
            .and_then(|message| message.get_mut("content"))
            && let Value::String(text) = content
        {
            let text = std::mem::take(text);
            *content = json!([{
                "type": "text",
                "text": text,
                "cache_control": {"type": "ephemeral"}
            }]);
        }
    }
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
/// feeding the results back until it returns a final message. Requests leave
/// `tool_choice` at its default, the only value some providers accept, so
/// the prompts ask for lookups and calls past [`MAX_TOOL_ROUNDS`] get a
/// result telling the model to answer; a model that keeps calling tools
/// after that fails. A model without tool-capable endpoints is retried once
/// without tools.
///
/// While tools are offered, `response_format` stays out of the request (see
/// the module docs) and the system prompt carries the schema instead. A
/// final message that is not a JSON object gets one repair round: the
/// message is echoed back with [`REPAIR_PROMPT`], tools are withdrawn, and
/// the response format is enforced.
async fn complete(
    state: &AppState,
    settings: &Configured,
    request: Value,
    operation: Operation,
) -> Result<Value, String> {
    let Value::Object(mut request) = request else {
        return Err(operation.http_error().to_owned());
    };
    if let Some(effort) = &settings.reasoning_effort {
        request.insert("reasoning".into(), json!({"effort": effort}));
    }
    describe_response_format(&mut request);
    let mut round = 0;
    let mut repaired = false;
    loop {
        let mut sent = request.clone();
        let tools_offered = sent.contains_key("tools");
        if tools_offered {
            sent.remove("response_format");
        }
        mark_cache_breakpoints(&mut sent);
        let started = Instant::now();
        match post_completion(state, &settings.api_key, &Value::Object(sent)).await {
            Response::Http { status, body, .. } if (200..300).contains(&status) => {
                let calls = tool_calls(&body);
                if calls.is_empty() {
                    let result = decode(&body);
                    if matches!(result, Err(DecodeError::Invalid)) && tools_offered && !repaired {
                        log_completion(
                            &LogResult::Unstructured,
                            operation,
                            &settings.model,
                            started,
                            status,
                            &body,
                        );
                        if let Some(Value::Array(messages)) = request.get_mut("messages") {
                            messages.push(assistant_message(&body));
                            messages.push(json!({"role": "user", "content": REPAIR_PROMPT}));
                        }
                        request.remove("tools");
                        repaired = true;
                        continue;
                    }
                    let outcome = match result {
                        Ok(_) => LogResult::Ok,
                        Err(error) => LogResult::Decode(error),
                    };
                    log_completion(&outcome, operation, &settings.model, started, status, &body);
                    return result.map_err(|error| operation.decode_error(error).to_owned());
                }
                log_completion(
                    &LogResult::ToolCalls,
                    operation,
                    &settings.model,
                    started,
                    status,
                    &body,
                );
                if round > MAX_TOOL_ROUNDS {
                    return Err(TOOL_LOOP.to_owned());
                }
                let mut follow_up = vec![assistant_message(&body)];
                for call in &calls {
                    follow_up.push(tool_message(state, call, round >= MAX_TOOL_ROUNDS).await?);
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

/// The tool result for one call; past the round limit the call is not run.
async fn tool_message(
    state: &AppState,
    call: &Value,
    limit_reached: bool,
) -> Result<Value, String> {
    let function = call.get("function");
    let name = function.and_then(|function| function.get("name"));
    let result = if limit_reached {
        json!({"error": TOOL_LIMIT_REACHED})
    } else {
        let arguments = decode_arguments(function.and_then(|function| function.get("arguments")));
        tools::call(&state.db, name.and_then(Value::as_str), &arguments)
            .await
            .map_err(|error| {
                tracing::error!(%error, "AI tool call failed");
                "Something went wrong.".to_owned()
            })?
    };
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

/// Appends the response schema to the system message, so the model knows
/// the shape to answer in on rounds that cannot enforce it.
fn describe_response_format(request: &mut Map<String, Value>) {
    let Some(schema) = request
        .get("response_format")
        .and_then(|format| format.pointer("/json_schema/schema"))
    else {
        return;
    };
    let instruction = format!(
        "\nOnce you are done calling tools, respond with exactly one JSON object that conforms to this JSON Schema, with no other text or Markdown fences:\n{schema}\n"
    );
    if let Some(Value::String(system)) = request
        .get_mut("messages")
        .and_then(Value::as_array_mut)
        .and_then(|messages| {
            messages
                .iter_mut()
                .find(|message| message["role"] == "system")
        })
        .and_then(|message| message.get_mut("content"))
    {
        system.push_str(&instruction);
    }
}

/// The final message's content as the structured result object.
fn decode(body: &Value) -> Result<Value, DecodeError> {
    let Some(choice) = first_choice(body) else {
        return Err(DecodeError::Incomplete);
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
        None if limited => Err(DecodeError::TokenLimit),
        None => Err(DecodeError::Incomplete),
        Some(content) => match json_object(content) {
            Some(map) => Ok(Value::Object(map)),
            None if limited => Err(DecodeError::TokenLimit),
            None => Err(DecodeError::Invalid),
        },
    }
}

/// The JSON object in `content`, bare or inside a Markdown code fence.
fn json_object(content: &str) -> Option<Map<String, Value>> {
    let object = |text: &str| match serde_json::from_str(text) {
        Ok(Value::Object(map)) => Some(map),
        _ => None,
    };
    let content = content.trim();
    object(content).or_else(|| {
        let fenced = content.strip_prefix("```")?.strip_suffix("```")?;
        // The first fence line is a language tag unless the JSON starts there.
        let body = match fenced.split_once('\n') {
            Some((tag, rest)) if !tag.trim_start().starts_with('{') => rest,
            _ => fenced,
        };
        object(body.trim())
    })
}

enum LogResult<'a> {
    Ok,
    ToolCalls,
    /// The final message was not the JSON object; a repair round follows.
    Unstructured,
    Decode(DecodeError),
    /// The raw response text, for the error message.
    HttpError(&'a str),
}

impl LogResult<'_> {
    fn label(&self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::ToolCalls => "tool_calls",
            Self::Unstructured => "unstructured_answer",
            Self::Decode(DecodeError::TokenLimit) => "output_token_limit",
            Self::Decode(DecodeError::Incomplete) => "incomplete_response",
            Self::Decode(DecodeError::Invalid) => "invalid_response",
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
    let prompt_details = value(usage, "prompt_tokens_details");
    let content_bytes = value(message, "content")
        .and_then(Value::as_str)
        .map(str::len);
    let reasoning = value(message, "reasoning")
        .filter(|reasoning| !reasoning.is_null())
        .or_else(|| value(message, "reasoning_content"));
    let reasoning_bytes = reasoning.and_then(Value::as_str).map(str::len);
    let bytes = |count: Option<usize>| count.map_or_else(|| "nil".to_owned(), |n| n.to_string());
    let mut line = format!(
        "OpenRouter completion operation={} model={} status={status} duration_ms={} provider={} finish_reason={} native_finish_reason={} prompt_tokens={} cached_tokens={} cache_write_tokens={} completion_tokens={} reasoning_tokens={} content_bytes={} reasoning_bytes={} result={}",
        operation.name(),
        inspect_str(model),
        started.elapsed().as_millis(),
        inspect(value(Some(body), "provider")),
        inspect(value(choice, "finish_reason")),
        inspect(value(choice, "native_finish_reason")),
        inspect(value(usage, "prompt_tokens")),
        inspect(value(prompt_details, "cached_tokens")),
        inspect(value(prompt_details, "cache_write_tokens")),
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
            decode(&body(
                json!({"finish_reason": "length", "message": {"content": "{\"answer\":\"unf"}})
            )),
            Err(DecodeError::TokenLimit)
        );
        assert_eq!(
            decode(&body(
                json!({"native_finish_reason": "max_tokens", "message": {}})
            )),
            Err(DecodeError::TokenLimit)
        );
        assert_eq!(
            decode(&body(json!({"message": {"content": null}}))),
            Err(DecodeError::Incomplete)
        );
        assert_eq!(
            decode(&body(json!({"message": {"content": "[1]"}}))),
            Err(DecodeError::Invalid)
        );
        assert_eq!(
            decode(&json!({"choices": []})),
            Err(DecodeError::Incomplete)
        );
        assert_eq!(
            decode(&json!({"choices": [{"message": {"content": "nope"}}]})),
            Err(DecodeError::Invalid)
        );
        assert_eq!(decode(&json!("text")), Err(DecodeError::Incomplete));
        assert_eq!(
            Operation::DeckAnalysis.decode_error(DecodeError::Invalid),
            "OpenRouter returned an invalid deck analysis."
        );
        assert_eq!(
            Operation::DeckQuestion.decode_error(DecodeError::TokenLimit),
            "OpenRouter ran out of output tokens before finishing the answer."
        );
    }

    #[test]
    fn decodes_json_objects_with_or_without_code_fences() {
        let object = json!({"answer": "ok"});
        let map = object.as_object().cloned();
        assert_eq!(json_object(" {\"answer\":\"ok\"} \n"), map);
        assert_eq!(json_object("```json\n{\"answer\":\"ok\"}\n```"), map);
        assert_eq!(json_object("```\n{\"answer\":\"ok\"}\n```"), map);
        assert_eq!(json_object("```{\"answer\":\"ok\"}```"), map);
        assert_eq!(json_object("Here you go:\n```json\n{}\n```"), None);
        assert_eq!(json_object("```json\n[1]\n```"), None);
        assert_eq!(json_object("## Markdown answer"), None);
    }

    #[test]
    fn describes_the_response_schema_in_the_system_message() {
        let mut request = json!({
            "messages": [
                {"role": "system", "content": "Be helpful."},
                {"role": "user", "content": "Deck data"}
            ],
            "response_format": {"type": "json_schema", "json_schema": {"schema": {"type": "object"}}}
        });
        describe_response_format(request.as_object_mut().unwrap());
        assert_eq!(
            request["messages"][0]["content"],
            "Be helpful.\nOnce you are done calling tools, respond with exactly one JSON object that conforms to this JSON Schema, with no other text or Markdown fences:\n{\"type\":\"object\"}\n"
        );
        assert_eq!(request["messages"][1]["content"], "Deck data");

        let mut plain = json!({"messages": [{"role": "system", "content": "Be helpful."}]});
        describe_response_format(plain.as_object_mut().unwrap());
        assert_eq!(plain["messages"][0]["content"], "Be helpful.");
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
