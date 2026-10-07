//! `/socket/websocket`: the Phoenix Channels transport that `@absinthe/socket`
//! uses for GraphQL subscriptions (`ManavaultWeb.UserSocket` with
//! `Absinthe.Phoenix.Socket`).
//!
//! Protocol (serializer `vsn=2.0.0`; `1.0.0` object frames also work):
//! frames are `[join_ref, ref, topic, event, payload]` JSON arrays.
//!
//! - `phoenix`/`heartbeat` → `phx_reply` `{status: "ok", response: {}}`.
//! - `__absinthe__:control`/`phx_join` → ok; any other topic is
//!   `unmatched topic`.
//! - `doc` `{query, variables}` → a subscription replies
//!   `{subscriptionId}` and pushes `subscription:data`
//!   `{result, subscriptionId}` on the topic `subscriptionId`; a query or
//!   mutation replies with its result.
//! - `unsubscribe` `{subscriptionId}` stops a subscription.
//!
//! Connecting needs an allowed `Origin` (`AllowedOrigins`) and, unless auth
//! is disabled, the owner's session cookie with the page's masked CSRF token
//! as the `_csrf_token` parameter (Phoenix only exposes the session to
//! `connect/3` when that token matches).

use std::collections::HashMap;
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::header::ORIGIN;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt as _, StreamExt as _};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::WebState;
use super::allowed_origins::OriginPolicy;
use super::session::Session;
use crate::graphql::AppSchema;

/// The Absinthe control topic.
pub const CONTROL_TOPIC: &str = "__absinthe__:control";
/// Phoenix closes a socket that sends nothing (not even heartbeats) for this long.
const IDLE_TIMEOUT: Duration = Duration::from_secs(60);

/// Whether a socket may connect (`UserSocket.connect/3`).
#[must_use]
pub fn authorized(
    state: &crate::state::AppState,
    session: &Session,
    csrf_token: Option<&str>,
) -> bool {
    if state.config.auth_disabled {
        return true;
    }
    csrf_token.is_some_and(|token| session.csrf_valid(token)) && session.owner_signed_in(state)
}

/// The connection parameters the Phoenix JS client sends.
#[derive(Debug, Default, serde::Deserialize)]
pub struct SocketParams {
    vsn: Option<String>,
    #[serde(rename = "_csrf_token")]
    csrf_token: Option<String>,
}

/// The upgrade handler.
pub async fn websocket(
    State(web): State<WebState>,
    session: Session,
    headers: HeaderMap,
    Query(params): Query<SocketParams>,
    upgrade: WebSocketUpgrade,
) -> Response {
    let origin = headers.get(ORIGIN).and_then(|value| value.to_str().ok());
    let allowed = match OriginPolicy::from_config(&web.app.config) {
        Ok(policy) => policy.allows(origin),
        Err(error) => {
            tracing::error!(%error, "invalid socket origin configuration");
            false
        }
    };
    if !allowed {
        tracing::error!(
            origin = origin.unwrap_or_default(),
            "Could not check origin for Phoenix.Socket transport."
        );
        return StatusCode::FORBIDDEN.into_response();
    }
    if !authorized(&web.app, &session, params.csrf_token.as_deref()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    // Phoenix defaults to the 1.0.0 serializer when `vsn` is missing.
    let v2 = params
        .vsn
        .as_deref()
        .is_some_and(|vsn| vsn.starts_with('2'));
    let schema = web.schema.clone();
    upgrade.on_upgrade(move |socket| run(socket, schema, v2))
}

/// One protocol frame.
#[derive(Debug, Clone, PartialEq)]
pub struct Frame {
    pub join_ref: Option<String>,
    pub reference: Option<String>,
    pub topic: String,
    pub event: String,
    pub payload: Value,
}

fn text_field(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

impl Frame {
    fn decode(text: &str, v2: bool) -> Option<Self> {
        let value: Value = serde_json::from_str(text).ok()?;
        if v2 {
            let items = value.as_array()?;
            let [join_ref, reference, topic, event, payload] = items.as_slice() else {
                return None;
            };
            Some(Self {
                join_ref: text_field(Some(join_ref)),
                reference: text_field(Some(reference)),
                topic: topic.as_str()?.to_owned(),
                event: event.as_str()?.to_owned(),
                payload: payload.clone(),
            })
        } else {
            Some(Self {
                join_ref: text_field(value.get("join_ref")),
                reference: text_field(value.get("ref")),
                topic: value.get("topic")?.as_str()?.to_owned(),
                event: value.get("event")?.as_str()?.to_owned(),
                payload: value.get("payload").cloned().unwrap_or(Value::Null),
            })
        }
    }

    fn encode(&self, v2: bool) -> String {
        if v2 {
            json!([
                self.join_ref,
                self.reference,
                self.topic,
                self.event,
                self.payload
            ])
            .to_string()
        } else {
            json!({
                "join_ref": self.join_ref,
                "ref": self.reference,
                "topic": self.topic,
                "event": self.event,
                "payload": self.payload,
            })
            .to_string()
        }
    }

    fn reply(&self, status: &str, response: Value) -> Self {
        let mut payload = serde_json::Map::new();
        payload.insert("status".to_owned(), Value::String(status.to_owned()));
        payload.insert("response".to_owned(), response);
        Self {
            join_ref: self.join_ref.clone(),
            reference: self.reference.clone(),
            topic: self.topic.clone(),
            event: "phx_reply".to_owned(),
            payload: Value::Object(payload),
        }
    }
}

/// Whether the control channel is joined, and with which join ref.
enum Control {
    Left,
    Joined(Option<String>),
}

struct Connection {
    schema: AppSchema,
    outgoing: mpsc::UnboundedSender<Frame>,
    control: Control,
    subscriptions: HashMap<String, JoinHandle<()>>,
}

impl Connection {
    fn send(&self, frame: Frame) {
        let _ = self.outgoing.send(frame);
    }

    fn stop_subscriptions(&mut self) {
        for (_, task) in self.subscriptions.drain() {
            task.abort();
        }
    }

    fn close_control(&mut self) {
        if let Control::Joined(join_ref) = std::mem::replace(&mut self.control, Control::Left) {
            self.stop_subscriptions();
            self.send(Frame {
                join_ref: join_ref.clone(),
                reference: join_ref,
                topic: CONTROL_TOPIC.to_owned(),
                event: "phx_close".to_owned(),
                payload: json!({}),
            });
        }
    }

    async fn handle(&mut self, frame: Frame) {
        match (frame.topic.as_str(), frame.event.as_str()) {
            ("phoenix", "heartbeat") => self.send(frame.reply("ok", json!({}))),
            (CONTROL_TOPIC, "phx_join") => {
                self.close_control();
                self.control = Control::Joined(frame.join_ref.clone());
                self.send(frame.reply("ok", json!({})));
            }
            (_, "phx_join") => {
                self.send(frame.reply("error", json!({"reason": "unmatched topic"})));
            }
            (CONTROL_TOPIC, _) if matches!(self.control, Control::Joined(_)) => {
                self.handle_control(frame).await;
            }
            _ => self.send(frame.reply("error", json!({"reason": "unmatched topic"}))),
        }
    }

    async fn handle_control(&mut self, frame: Frame) {
        match frame.event.as_str() {
            "phx_leave" => {
                self.send(frame.reply("ok", json!({})));
                self.close_control();
            }
            "doc" => self.run_doc(frame).await,
            "unsubscribe" => {
                let id = frame
                    .payload
                    .get("subscriptionId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                if let Some(task) = self.subscriptions.remove(&id) {
                    task.abort();
                }
                self.send(frame.reply("ok", json!({"subscriptionId": id})));
            }
            _ => {
                // The Absinthe channel has no clause for other events and crashes.
                let join_ref = match std::mem::replace(&mut self.control, Control::Left) {
                    Control::Joined(join_ref) => join_ref,
                    Control::Left => None,
                };
                self.stop_subscriptions();
                self.send(Frame {
                    join_ref: join_ref.clone(),
                    reference: join_ref,
                    topic: CONTROL_TOPIC.to_owned(),
                    event: "phx_error".to_owned(),
                    payload: json!({}),
                });
            }
        }
    }

    async fn run_doc(&mut self, frame: Frame) {
        let variables = match frame.payload.get("variables") {
            None | Some(Value::Null) => Value::Object(serde_json::Map::new()),
            Some(Value::Object(object)) => Value::Object(object.clone()),
            Some(_) => {
                self.send(frame.reply(
                    "error",
                    json!({"error": "Could not parse variables as map"}),
                ));
                return;
            }
        };
        let query = frame
            .payload
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let subscription = async_graphql::parser::parse_query(&query).is_ok_and(|document| {
            document.operations.iter().any(|(_, operation)| {
                operation.node.ty == async_graphql::parser::types::OperationType::Subscription
            })
        });
        let request = async_graphql::Request::new(query)
            .variables(async_graphql::Variables::from_json(variables));

        if !subscription {
            let response = self.schema.execute(request).await;
            let ok =
                response.errors.is_empty() || !matches!(response.data, async_graphql::Value::Null);
            let result = serde_json::to_value(&response).unwrap_or(Value::Null);
            self.send(frame.reply(if ok { "ok" } else { "error" }, result));
            return;
        }

        let mut stream = self.schema.execute_stream(request);
        // Validation errors are ready at once; a valid subscription waits for events.
        let first = futures_util::FutureExt::now_or_never(stream.next());
        let first = match first {
            Some(None) => return self.send(frame.reply("ok", json!({}))),
            Some(Some(response))
                if !response.errors.is_empty()
                    && matches!(response.data, async_graphql::Value::Null) =>
            {
                let result = serde_json::to_value(&response).unwrap_or(Value::Null);
                return self.send(frame.reply("error", result));
            }
            Some(Some(response)) => Some(response),
            None => None,
        };
        let id = format!(
            "__absinthe__:doc:{}",
            u64::from_be_bytes(crate::crypto::random_bytes::<8>())
        );
        self.send(frame.reply("ok", json!({"subscriptionId": id})));
        let outgoing = self.outgoing.clone();
        let topic = id.clone();
        let task = tokio::spawn(async move {
            let push = |response: async_graphql::Response| {
                outgoing
                    .send(Frame {
                        join_ref: None,
                        reference: None,
                        topic: topic.clone(),
                        event: "subscription:data".to_owned(),
                        payload: json!({
                            "result": serde_json::to_value(&response).unwrap_or(Value::Null),
                            "subscriptionId": topic,
                        }),
                    })
                    .is_ok()
            };
            if let Some(response) = first
                && !push(response)
            {
                return;
            }
            while let Some(response) = stream.next().await {
                if !push(response) {
                    return;
                }
            }
        });
        self.subscriptions.insert(id, task);
    }
}

async fn run(socket: WebSocket, schema: AppSchema, v2: bool) {
    let (mut sink, mut stream) = socket.split();
    let (outgoing, mut pending) = mpsc::unbounded_channel::<Frame>();
    let mut connection = Connection {
        schema,
        outgoing,
        control: Control::Left,
        subscriptions: HashMap::new(),
    };
    loop {
        tokio::select! {
            incoming = tokio::time::timeout(IDLE_TIMEOUT, stream.next()) => {
                let Ok(Some(Ok(message))) = incoming else { break };
                match message {
                    Message::Text(text) => {
                        if let Some(frame) = Frame::decode(text.as_str(), v2) {
                            connection.handle(frame).await;
                        }
                    }
                    Message::Close(_) => break,
                    Message::Binary(_) | Message::Ping(_) | Message::Pong(_) => {}
                }
            }
            Some(frame) = pending.recv() => {
                if sink.send(Message::Text(frame.encode(v2).into())).await.is_err() {
                    break;
                }
            }
        }
    }
    connection.stop_subscriptions();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_round_trip_in_both_serializers() {
        let frame = Frame::decode(r#"["1","2","phoenix","heartbeat",{}]"#, true).unwrap();
        assert_eq!(frame.topic, "phoenix");
        assert_eq!(frame.join_ref.as_deref(), Some("1"));
        assert_eq!(
            frame.reply("ok", json!({})).encode(true),
            r#"["1","2","phoenix","phx_reply",{"response":{},"status":"ok"}]"#
        );
        let v1 = Frame::decode(
            r#"{"topic":"t","event":"e","payload":{"a":1},"ref":"3"}"#,
            false,
        )
        .unwrap();
        assert_eq!(v1.reference.as_deref(), Some("3"));
        assert!(Frame::decode("[1,2]", true).is_none());
    }
}
