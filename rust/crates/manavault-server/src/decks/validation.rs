//! The Ecto changesets of `Deck`, `DeckCard`, `DeckTag`, and
//! `DefaultDeckTag`, rendered as `Errors.changeset_error_message/1` does.
//!
//! A [`Change`] is `None` when the attribute was not given and `Some(None)`
//! when it was given as `null`, as Ecto's `cast/3` distinguishes them.

use std::sync::LazyLock;

use regex::Regex;

pub use crate::settings::changeset::{BLANK, Errors, INVALID, too_long, too_short};

/// An attribute: absent (`None`), `null` (`Some(None)`), or a value.
pub type Change<T> = Option<Option<T>>;

/// `unique_constraint/3`'s message.
pub const TAKEN: &str = "has already been taken";
/// `validate_format/3`'s message.
pub const INVALID_FORMAT: &str = "has invalid format";

static HEX_COLOR: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"^#[0-9a-fA-F]{6}$").ok());

/// Ecto's empty-value handling: whitespace-only strings cast to `nil`.
#[must_use]
pub fn cast_string(change: Change<String>) -> Change<String> {
    change.map(|value| value.filter(|text| !text.trim().is_empty()))
}

/// The value after a change: the new value when given, else `current`.
#[must_use]
pub fn apply<T: Clone>(current: Option<T>, change: &Change<T>) -> Option<T> {
    match change {
        None => current,
        Some(value) => value.clone(),
    }
}

/// `validate_length(field, min:, max:)` for a changed value.
pub fn length(
    errors: &mut Errors,
    field: &'static str,
    value: Option<&str>,
    min: usize,
    max: usize,
) {
    if let Some(value) = value {
        let count = value.chars().count();
        if count < min {
            errors.add(field, too_short(min));
        } else if count > max {
            errors.add(field, too_long(max));
        }
    }
}

/// `validate_number(field, greater_than: n)`.
pub fn greater_than(errors: &mut Errors, field: &'static str, value: Option<i64>, bound: i64) {
    if value.is_some_and(|value| value <= bound) {
        errors.add(field, format!("must be greater than {bound}"));
    }
}

/// `validate_number(field, greater_than_or_equal_to: n)`.
pub fn at_least(errors: &mut Errors, field: &'static str, value: Option<i64>, bound: i64) {
    if value.is_some_and(|value| value < bound) {
        errors.add(field, format!("must be greater than or equal to {bound}"));
    }
}

/// `validate_number(field, less_than: n)`.
pub fn less_than(errors: &mut Errors, field: &'static str, value: Option<i64>, bound: i64) {
    if value.is_some_and(|value| value >= bound) {
        errors.add(field, format!("must be less than {bound}"));
    }
}

/// `validate_format(:color, ~r/^#[0-9a-fA-F]{6}$/)`.
pub fn hex_color(errors: &mut Errors, field: &'static str, value: Option<&str>) {
    if let Some(value) = value
        && !HEX_COLOR.as_ref().is_some_and(|re| re.is_match(value))
    {
        errors.add(field, INVALID_FORMAT);
    }
}

/// Whether a database error is a unique-index violation.
#[must_use]
pub fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::Database(db) if db.is_unique_violation())
}

/// A single-field changeset error.
#[must_use]
pub fn error(field: &'static str, message: impl Into<String>) -> Errors {
    let mut errors = Errors::new();
    errors.add(field, message);
    errors
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validators_render_ecto_messages() {
        let mut errors = Errors::new();
        length(&mut errors, "name", Some(""), 1, 60);
        greater_than(&mut errors, "quantity", Some(0), 0);
        less_than(&mut errors, "proxy_quantity", Some(10_000), 10_000);
        hex_color(&mut errors, "color", Some("red"));
        at_least(&mut errors, "play_count", Some(-1), 0);
        assert_eq!(
            errors.message(),
            "color has invalid format, name should be at least 1 character(s), play_count must be greater than or equal to 0, proxy_quantity must be less than 10000, quantity must be greater than 0"
        );
        assert_eq!(cast_string(Some(Some("  ".into()))), Some(None));
    }
}
