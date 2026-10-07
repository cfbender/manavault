//! Decoding the JSON text columns of the catalog tables
//! (`ValueResolvers.decode_json/2` and `Catalog.Util.decode_json/2`).

use serde_json::Value;

/// Decodes stored JSON text, or `None` when it is not valid JSON.
#[must_use]
pub fn decode(text: &str) -> Option<Value> {
    serde_json::from_str(text).ok()
}

/// Decodes a JSON object, falling back to an empty object.
#[must_use]
pub fn object(text: &str) -> serde_json::Map<String, Value> {
    match decode(text) {
        Some(Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    }
}

/// Decodes a JSON value, falling back to `fallback` when undecodable.
#[must_use]
pub fn value_or(text: &str, fallback: Value) -> Value {
    decode(text).unwrap_or(fallback)
}

/// Decodes a JSON list of strings for `[String]` fields. Undecodable text
/// reads as an empty list; non-string items read as `null`.
#[must_use]
pub fn string_list(text: &str) -> Vec<Option<String>> {
    match decode(text) {
        Some(Value::Array(items)) => items
            .into_iter()
            .map(|item| match item {
                Value::String(value) => Some(value),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Like [`string_list`], keeping only the strings.
#[must_use]
pub fn strings(text: &str) -> Vec<String> {
    string_list(text).into_iter().flatten().collect()
}

/// Elixir truthiness for an optional JSON value: anything but `null`/`false`.
#[must_use]
pub fn truthy(value: Option<&Value>) -> Option<&Value> {
    match value {
        None | Some(Value::Null | Value::Bool(false)) => None,
        Some(value) => Some(value),
    }
}

/// Renders a JSON scalar the way Elixir's `to_string/1` does for strings and
/// numbers (`nil` for anything else).
#[must_use]
pub fn scalar_text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}
