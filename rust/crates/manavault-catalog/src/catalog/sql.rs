//! SQL fragments with bound values, for search predicates composed at
//! runtime.
//!
//! A [`Fragment`] keeps SQL text and bound values in order, so composed
//! predicates are pushed into a `QueryBuilder` without string-formatting
//! user input into SQL.

use sqlx::{QueryBuilder, Sqlite};

/// A value bound into a fragment.
#[derive(Debug, Clone, PartialEq)]
pub enum Bind {
    Text(String),
    Int(i64),
    Real(f64),
}

#[derive(Debug, Clone, PartialEq)]
enum Part {
    Sql(String),
    Bind(Bind),
}

/// SQL text interleaved with bound values.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Fragment {
    parts: Vec<Part>,
}

impl Fragment {
    /// A fragment of literal SQL.
    #[must_use]
    pub fn sql(text: impl Into<String>) -> Self {
        Self {
            parts: vec![Part::Sql(text.into())],
        }
    }

    /// `TRUE`: matches every row.
    #[must_use]
    pub fn truth() -> Self {
        Self::sql("TRUE")
    }

    /// `FALSE`: matches no row.
    #[must_use]
    pub fn falsity() -> Self {
        Self::sql("FALSE")
    }

    /// Appends literal SQL.
    #[must_use]
    pub fn push(mut self, text: impl Into<String>) -> Self {
        self.parts.push(Part::Sql(text.into()));
        self
    }

    /// Appends a bound value.
    #[must_use]
    pub fn bind(mut self, value: Bind) -> Self {
        self.parts.push(Part::Bind(value));
        self
    }

    /// Appends a bound text value.
    #[must_use]
    pub fn text(self, value: impl Into<String>) -> Self {
        self.bind(Bind::Text(value.into()))
    }

    /// Appends a bound integer.
    #[must_use]
    pub fn int(self, value: i64) -> Self {
        self.bind(Bind::Int(value))
    }

    /// Appends a bound real.
    #[must_use]
    pub fn real(self, value: f64) -> Self {
        self.bind(Bind::Real(value))
    }

    /// Appends another fragment.
    #[must_use]
    pub fn append(mut self, other: Fragment) -> Self {
        self.parts.extend(other.parts);
        self
    }

    /// `(self AND other)`.
    #[must_use]
    pub fn and(self, other: Fragment) -> Self {
        Self::sql("(")
            .append(self)
            .push(" AND ")
            .append(other)
            .push(")")
    }

    /// `(self OR other)`.
    #[must_use]
    pub fn or(self, other: Fragment) -> Self {
        Self::sql("(")
            .append(self)
            .push(" OR ")
            .append(other)
            .push(")")
    }

    /// `NOT (self)`.
    #[must_use]
    pub fn negate(self) -> Self {
        Self::sql("NOT (").append(self).push(")")
    }

    /// Pushes the fragment into a query builder.
    pub fn push_to(&self, builder: &mut QueryBuilder<Sqlite>) {
        for part in &self.parts {
            match part {
                Part::Sql(text) => {
                    builder.push(text.as_str());
                }
                Part::Bind(Bind::Text(value)) => {
                    builder.push_bind(value.clone());
                }
                Part::Bind(Bind::Int(value)) => {
                    builder.push_bind(*value);
                }
                Part::Bind(Bind::Real(value)) => {
                    builder.push_bind(*value);
                }
            }
        }
    }
}

/// A JSON array of strings, for `IN (SELECT value FROM json_each(?))` in
/// static queries.
#[must_use]
pub fn json_list<S: AsRef<str>>(values: &[S]) -> String {
    serde_json::to_string(&values.iter().map(AsRef::as_ref).collect::<Vec<&str>>())
        .unwrap_or_else(|_| "[]".to_owned())
}
