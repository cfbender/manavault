//! Scryfall catalog import and sync (`Manavault.Catalog.Scryfall.*`).

pub mod bulk;
pub mod diff;
pub mod graphql;
pub mod import;
pub mod reconcile;
pub mod rows;
pub mod rulings;
pub mod sync;
pub mod worker;

#[cfg(test)]
mod tests;

use sqlx::{QueryBuilder, Sqlite};

/// Appends ` (?, ?, ...)` binding each id.
pub(crate) fn push_in_list(builder: &mut QueryBuilder<Sqlite>, ids: &[String]) {
    builder.push(" (");
    let mut separated = builder.separated(", ");
    for id in ids {
        separated.push_bind(id.clone());
    }
    separated.push_unseparated(")");
}
