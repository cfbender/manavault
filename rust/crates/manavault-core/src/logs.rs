//! Live server logs for the `serverLog` subscription (`Manavault.LogStream`).

use std::fmt::Write as _;
use std::sync::atomic::{AtomicU64, Ordering};

use tokio::sync::broadcast;
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;

const MAX_MESSAGE_BYTES: usize = 8_000;

/// One log line as the subscription delivers it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogEvent {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

/// Fans log events out to subscribers.
#[derive(Clone)]
pub struct LogHub {
    sender: broadcast::Sender<LogEvent>,
}

impl Default for LogHub {
    fn default() -> Self {
        Self::new()
    }
}

impl LogHub {
    #[must_use]
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1024);
        Self { sender }
    }

    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<LogEvent> {
        self.sender.subscribe()
    }

    /// A `tracing` layer that publishes every event to this hub.
    #[must_use]
    pub fn layer(&self) -> LogLayer {
        LogLayer {
            sender: self.sender.clone(),
            next_id: AtomicU64::new(1),
        }
    }
}

pub struct LogLayer {
    sender: broadcast::Sender<LogEvent>,
    next_id: AtomicU64,
}

#[derive(Default)]
struct MessageVisitor {
    message: String,
    fields: String,
}

impl Visit for MessageVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            let _ = write!(self.message, "{value:?}");
        } else {
            let _ = write!(self.fields, " {}={value:?}", field.name());
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.message.push_str(value);
        } else {
            let _ = write!(self.fields, " {}={value}", field.name());
        }
    }
}

fn level_name(level: Level) -> &'static str {
    match level {
        Level::ERROR => "error",
        Level::WARN => "warning",
        Level::INFO => "info",
        Level::DEBUG | Level::TRACE => "debug",
    }
}

/// Removes `ESC [ ... m` color sequences.
fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            let mut lookahead = chars.clone();
            lookahead.next();
            let mut terminated = false;
            for next in lookahead.by_ref() {
                if next == 'm' {
                    terminated = true;
                    break;
                }
                if !(next.is_ascii_digit() || next == ';') {
                    break;
                }
            }
            if terminated {
                chars = lookahead;
                continue;
            }
        }
        out.push(c);
    }
    out
}

fn truncate(mut text: String) -> String {
    if text.len() > MAX_MESSAGE_BYTES {
        let mut end = MAX_MESSAGE_BYTES;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
    }
    text
}

impl<S: Subscriber> Layer<S> for LogLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        if self.sender.receiver_count() == 0 {
            return;
        }
        let mut visitor = MessageVisitor::default();
        event.record(&mut visitor);
        let level = *event.metadata().level();
        // `Logger.Formatter.format_event/2`: the message alone (the level is
        // its own field), with ANSI color codes removed.
        let message = strip_ansi(&format!("{}{}", visitor.message, visitor.fields));
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let _ = self.sender.send(LogEvent {
            id: id.to_string(),
            timestamp: crate::timefmt::now_micros(),
            level: level_name(level).to_owned(),
            message: truncate(message.trim_end().to_owned()),
        });
    }
}
