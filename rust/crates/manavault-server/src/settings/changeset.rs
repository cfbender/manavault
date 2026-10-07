//! Validation errors rendered the way the Elixir resolvers render Ecto
//! changeset errors.

use std::collections::BTreeMap;

/// Ecto's default validation messages.
pub const BLANK: &str = "can't be blank";
pub const INVALID: &str = "is invalid";

/// Errors collected while validating, in the order they were added.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Errors(Vec<(&'static str, String)>);

impl Errors {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, field: &'static str, message: impl Into<String>) {
        self.0.push((field, message.into()));
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    #[must_use]
    pub fn has(&self, field: &str) -> bool {
        self.0.iter().any(|(name, _)| *name == field)
    }

    /// `traverse_errors/2`: messages per field, newest first, fields in
    /// alphabetical order (Elixir small-map key order).
    #[must_use]
    pub fn by_field(&self) -> BTreeMap<&'static str, Vec<String>> {
        let mut map: BTreeMap<&'static str, Vec<String>> = BTreeMap::new();
        for (field, message) in &self.0 {
            map.entry(field).or_default().insert(0, message.clone());
        }
        map
    }

    /// `Errors.changeset_error_message/1`: `"field message, other_field message"`.
    #[must_use]
    pub fn message(&self) -> String {
        self.by_field()
            .into_iter()
            .map(|(field, messages)| format!("{field} {}", messages.join(", ")))
            .collect::<Vec<_>>()
            .join(", ")
    }

    /// Only the messages, without field names (`ApiKeyOperations.changeset_errors/1`).
    #[must_use]
    pub fn messages_only(&self) -> String {
        self.by_field()
            .into_values()
            .flatten()
            .collect::<Vec<_>>()
            .join(", ")
    }

    /// `Ok(())` when empty.
    pub fn into_result(self) -> Result<(), Self> {
        if self.is_empty() { Ok(()) } else { Err(self) }
    }
}

/// `validate_length(field, max: n)` message.
#[must_use]
pub fn too_long(max: usize) -> String {
    format!("should be at most {max} character(s)")
}

/// `validate_length(field, min: n)` message.
#[must_use]
pub fn too_short(min: usize) -> String {
    format!("should be at least {min} character(s)")
}

/// Trims and maps blank strings to `None` (Ecto's empty-value handling).
#[must_use]
pub fn blank_to_none(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_like_ecto() {
        let mut errors = Errors::new();
        errors.add("theme_style", INVALID);
        errors.add("palette", BLANK);
        errors.add("palette", "is weird");
        assert_eq!(
            errors.message(),
            "palette is weird, can't be blank, theme_style is invalid"
        );
        assert_eq!(
            errors.messages_only(),
            "is weird, can't be blank, is invalid"
        );
    }
}
