//! Field validation errors, rendered as a readable message and reported to
//! GraphQL clients as error extensions.
//!
//! A [`ValidationError`] collects one [`FieldError`] per failed check in the
//! order the checks ran. Its message reads `"palette can't be blank, theme
//! style is invalid"`; [`ErrorExtensions::extend`] turns it into an
//! [`async_graphql::Error`] that also carries `extensions: {code: "VALIDATION", fields: [{field: "themeStyle",
//! message: "is invalid"}]}` with the field named as the GraphQL argument.

use std::fmt;

use async_graphql::ErrorExtensions;

/// The standard validation messages.
pub const BLANK: &str = "can't be blank";
pub const INVALID: &str = "is invalid";

/// The `code` extension of a validation error.
pub const CODE: &str = "VALIDATION";

/// One failed check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldError {
    /// The field, in the `snake_case` name the validators use.
    pub field: &'static str,
    /// What is wrong with it, without the field name.
    pub message: String,
}

impl FieldError {
    /// The field as a GraphQL argument or input field name (`theme_style`
    /// becomes `themeStyle`).
    #[must_use]
    pub fn graphql_field(&self) -> String {
        camel_case(self.field)
    }
}

/// Errors collected while validating, in the order they were added.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ValidationError(Vec<FieldError>);

impl ValidationError {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// A single-field error.
    #[must_use]
    pub fn single(field: &'static str, message: impl Into<String>) -> Self {
        let mut errors = Self::new();
        errors.add(field, message);
        errors
    }

    pub fn add(&mut self, field: &'static str, message: impl Into<String>) {
        self.0.push(FieldError {
            field,
            message: message.into(),
        });
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Whether a field has an error.
    #[must_use]
    pub fn has(&self, field: &str) -> bool {
        self.0.iter().any(|error| error.field == field)
    }

    /// The errors in the order they were added.
    #[must_use]
    pub fn fields(&self) -> &[FieldError] {
        &self.0
    }

    /// `Ok(())` when empty.
    pub fn into_result(self) -> Result<(), Self> {
        if self.is_empty() { Ok(()) } else { Err(self) }
    }
}

impl fmt::Display for ValidationError {
    /// `"palette can't be blank, theme style is invalid"`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, error) in self.0.iter().enumerate() {
            if index > 0 {
                f.write_str(", ")?;
            }
            write!(f, "{} {}", humanize(error.field), error.message)?;
        }
        Ok(())
    }
}

impl std::error::Error for ValidationError {}

impl ErrorExtensions for ValidationError {
    fn extend(&self) -> async_graphql::Error {
        let fields: Vec<async_graphql::Value> = self
            .fields()
            .iter()
            .map(|error| {
                let mut object = async_graphql::indexmap::IndexMap::new();
                object.insert(
                    async_graphql::Name::new("field"),
                    async_graphql::Value::from(error.graphql_field()),
                );
                object.insert(
                    async_graphql::Name::new("message"),
                    async_graphql::Value::from(error.message.clone()),
                );
                async_graphql::Value::Object(object)
            })
            .collect();
        async_graphql::Error::new(self.to_string()).extend_with(|_, extensions| {
            extensions.set("code", CODE);
            extensions.set("fields", async_graphql::Value::List(fields));
        })
    }
}

/// `theme_style` as `theme style`.
fn humanize(field: &str) -> String {
    field.replace('_', " ")
}

/// `theme_style` as `themeStyle`.
fn camel_case(field: &str) -> String {
    let mut out = String::with_capacity(field.len());
    let mut upper_next = false;
    for c in field.chars() {
        if c == '_' {
            upper_next = true;
        } else if upper_next {
            out.extend(c.to_uppercase());
            upper_next = false;
        } else {
            out.push(c);
        }
    }
    out
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

/// Trims and maps blank strings to `None`.
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
    fn renders_fields_in_the_order_they_failed() {
        let mut errors = ValidationError::new();
        errors.add("theme_style", INVALID);
        errors.add("palette", BLANK);
        errors.add("palette", "is weird");
        assert_eq!(
            errors.to_string(),
            "theme style is invalid, palette can't be blank, palette is weird"
        );
        assert!(errors.has("palette"));
        assert!(!errors.has("theme"));
        assert_eq!(ValidationError::new().to_string(), "");
    }

    #[test]
    fn converts_into_a_graphql_error_with_field_extensions() {
        let mut errors = ValidationError::new();
        errors.add("s3_access_key_id", BLANK);
        errors.add("cron", "invalid minute: 99 is outside 0-59");
        let error = errors.extend();
        assert_eq!(
            error.message,
            "s3 access key id can't be blank, cron invalid minute: 99 is outside 0-59"
        );
        let extensions = error.extensions.expect("extensions");
        assert_eq!(
            extensions.get("code"),
            Some(&async_graphql::Value::from("VALIDATION"))
        );
        assert_eq!(
            extensions
                .get("fields")
                .cloned()
                .map(|fields| fields.into_json().expect("fields json")),
            Some(serde_json::json!([
                {"field": "s3AccessKeyId", "message": "can't be blank"},
                {"field": "cron", "message": "invalid minute: 99 is outside 0-59"}
            ]))
        );
    }
}
