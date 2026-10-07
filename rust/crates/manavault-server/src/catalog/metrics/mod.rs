//! Card popularity metrics refreshed by the catalog sync: EDHREC commander
//! ranks (`Manavault.Catalog.EDHRec.CommanderRanks`) and EDHREC saltiness
//! from MTGJSON (`Manavault.Catalog.Mtgjson.Saltiness`).
//!
//! Both refreshes write one autocommit statement per batch of at most
//! [`UPDATE_BATCH_SIZE`] cards, so other SQLite writers get the write lock
//! between batches. Stale values are cleared only after every incoming batch
//! succeeded, so a failed refresh keeps its committed progress and a retry
//! converges.

pub mod commander_ranks;
pub mod saltiness;

use std::collections::HashSet;

use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use crate::catalog::scryfall::push_in_list;

pub const UPDATE_BATCH_SIZE: usize = 200;

/// A metric column on `scryfall_cards`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Metric {
    Saltiness,
    CommanderRank,
}

impl Metric {
    fn column(self) -> &'static str {
        match self {
            Self::Saltiness => "edhrec_saltiness",
            Self::CommanderRank => "edhrec_commander_rank",
        }
    }
}

/// A metric value to bind.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MetricValue {
    Real(f64),
    Integer(i64),
}

/// `UPDATE scryfall_cards SET metric = CASE oracle_id WHEN ? THEN ? ... END
/// WHERE oracle_id IN (...)` for one batch.
async fn update_batch(
    pool: &SqlitePool,
    metric: Metric,
    values: &[(String, MetricValue)],
) -> Result<(), sqlx::Error> {
    if values.is_empty() {
        return Ok(());
    }
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new("UPDATE scryfall_cards SET ");
    builder.push(metric.column());
    builder.push(" = CASE oracle_id");
    for (oracle_id, value) in values {
        builder.push(" WHEN ");
        builder.push_bind(oracle_id.clone());
        builder.push(" THEN ");
        match value {
            MetricValue::Real(value) => builder.push_bind(*value),
            MetricValue::Integer(value) => builder.push_bind(*value),
        };
    }
    builder.push(" END WHERE oracle_id IN");
    let ids: Vec<String> = values.iter().map(|(id, _)| id.clone()).collect();
    push_in_list(&mut builder, &ids);
    builder.build().execute(pool).await?;
    Ok(())
}

/// Clears the metric on every card that has one and is not in `keep`.
async fn clear_stale(
    pool: &SqlitePool,
    metric: Metric,
    keep: &HashSet<String>,
) -> Result<(), sqlx::Error> {
    let mut select = QueryBuilder::new("SELECT oracle_id FROM scryfall_cards WHERE ");
    select.push(metric.column());
    select.push(" IS NOT NULL");
    let stale: Vec<String> = select
        .build_query_scalar::<String>()
        .fetch_all(pool)
        .await?
        .into_iter()
        .filter(|id| !keep.contains(id))
        .collect();
    for ids in stale.chunks(UPDATE_BATCH_SIZE) {
        let mut builder = QueryBuilder::new("UPDATE scryfall_cards SET ");
        builder.push(metric.column());
        builder.push(" = NULL WHERE oracle_id IN");
        push_in_list(&mut builder, ids);
        builder.build().execute(pool).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::test_support::TestApp;

    /// 410 cards with both metrics at 999 (printing ids reversed against
    /// card ids), plus one never-scored card.
    async fn seed(app: &TestApp) {
        let mut tx = app.db().begin().await.unwrap();
        for index in 1..=410 {
            sqlx::query(
                "INSERT INTO scryfall_cards (oracle_id, name, inserted_at, updated_at, edhrec_saltiness, edhrec_commander_rank) VALUES (?1, ?1, 'now', 'now', 999.0, 999)",
            )
            .bind(format!("card-{index}"))
            .execute(&mut *tx)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO scryfall_printings (scryfall_id, oracle_id, set_code, collector_number, lang, inserted_at, updated_at) VALUES (?1, ?2, 'set', '1', 'en', 'now', 'now')",
            )
            .bind(format!("printing-{}", 411 - index))
            .bind(format!("card-{index}"))
            .execute(&mut *tx)
            .await
            .unwrap();
        }
        sqlx::query(
            "INSERT INTO scryfall_cards (oracle_id, name, inserted_at, updated_at) VALUES ('never-scored', 'n', 'now', 'now')",
        )
        .execute(&mut *tx)
        .await
        .unwrap();
        tx.commit().await.unwrap();
    }

    fn saltiness_feed() -> HashMap<String, f64> {
        (1..=205)
            .map(|i| (format!("card-{i}"), f64::from(i) / 10.0))
            .collect()
    }

    fn rank_feed() -> HashMap<String, i64> {
        (1..=205)
            .map(|i| (format!("printing-{}", 411 - i), i64::from(i) * 2))
            .collect()
    }

    async fn assert_metrics(app: &TestApp, metric: Metric) {
        let rows: Vec<(String, Option<f64>, Option<i64>)> = sqlx::query_as(
            "SELECT oracle_id, CAST(edhrec_saltiness AS REAL), edhrec_commander_rank FROM scryfall_cards",
        )
        .fetch_all(app.db())
        .await
        .unwrap();
        assert_eq!(rows.len(), 411);
        for (id, saltiness, rank) in rows {
            if id == "never-scored" {
                assert_eq!((saltiness, rank), (None, None));
                continue;
            }
            let index: i32 = id.trim_start_matches("card-").parse().unwrap();
            match metric {
                Metric::Saltiness => {
                    let expected = (index <= 205).then(|| f64::from(index) / 10.0);
                    assert_eq!(saltiness, expected, "{id}");
                    assert_eq!(rank, Some(999));
                }
                Metric::CommanderRank => {
                    assert_eq!(rank, (index <= 205).then_some(i64::from(index) * 2), "{id}");
                    assert_eq!(saltiness, Some(999.0));
                }
            }
        }
    }

    async fn refresh_with(
        app: &TestApp,
        metric: Metric,
        missing: bool,
    ) -> Result<usize, sqlx::Error> {
        match metric {
            Metric::Saltiness => {
                let mut feed = saltiness_feed();
                if missing {
                    feed.insert("missing-from-catalog".to_owned(), 42.0);
                }
                saltiness::update_cards(app.db(), &feed).await
            }
            Metric::CommanderRank => {
                let mut feed = rank_feed();
                if missing {
                    feed.insert("missing-from-catalog".to_owned(), 42);
                }
                commander_ranks::update_cards(app.db(), &feed).await
            }
        }
    }

    async fn refresh(app: &TestApp, metric: Metric) -> Result<usize, sqlx::Error> {
        refresh_with(app, metric, false).await
    }

    async fn clear(app: &TestApp, metric: Metric) -> usize {
        match metric {
            Metric::Saltiness => saltiness::update_cards(app.db(), &HashMap::new())
                .await
                .unwrap(),
            Metric::CommanderRank => commander_ranks::update_cards(app.db(), &HashMap::new())
                .await
                .unwrap(),
        }
    }

    #[tokio::test]
    async fn refreshes_values_and_clears_stale_ones() {
        for metric in [Metric::Saltiness, Metric::CommanderRank] {
            let app = TestApp::new().await;
            seed(&app).await;
            let expected = if metric == Metric::Saltiness {
                206
            } else {
                205
            };
            assert_eq!(refresh_with(&app, metric, true).await.unwrap(), expected);
            assert_metrics(&app, metric).await;

            // Empty data clears remaining values, more than one batch of them.
            assert_eq!(clear(&app, metric).await, 0);
            let mut query = QueryBuilder::new("SELECT count(*) FROM scryfall_cards WHERE ");
            query.push(metric.column());
            query.push(" IS NOT NULL");
            let left: i64 = query
                .build_query_scalar()
                .fetch_one(app.db())
                .await
                .unwrap();
            assert_eq!(left, 0);
        }
    }

    #[tokio::test]
    async fn keeps_committed_batches_after_a_failure_and_converges_on_retry() {
        for metric in [Metric::Saltiness, Metric::CommanderRank] {
            let app = TestApp::new().await;
            seed(&app).await;
            let column = metric.column();
            sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                "CREATE TRIGGER fail_later_metric_batch BEFORE UPDATE OF {column} ON scryfall_cards
                 WHEN NEW.{column} IS NOT NULL AND (SELECT COUNT(*) FROM scryfall_cards WHERE {column} != 999) >= 200
                 BEGIN SELECT RAISE(ABORT, 'injected metric refresh failure'); END"
            )))
            .execute(app.db())
            .await
            .unwrap();
            let error = refresh(&app, metric).await.unwrap_err();
            assert!(
                error
                    .to_string()
                    .contains("injected metric refresh failure")
            );

            // Only the failed statement rolled back; stale cleanup never ran.
            let (changed, untouched): (i64, i64) = sqlx::query_as(sqlx::AssertSqlSafe(format!(
                "SELECT SUM({column} != 999), SUM({column} = 999) FROM scryfall_cards"
            )))
            .fetch_one(app.db())
            .await
            .unwrap();
            assert_eq!((changed, untouched), (200, 210));

            sqlx::raw_sql("DROP TRIGGER fail_later_metric_batch")
                .execute(app.db())
                .await
                .unwrap();
            refresh(&app, metric).await.unwrap();
            assert_metrics(&app, metric).await;
        }
    }

    #[tokio::test]
    async fn retries_an_interrupted_stale_value_cleanup() {
        for metric in [Metric::Saltiness, Metric::CommanderRank] {
            let app = TestApp::new().await;
            seed(&app).await;
            let column = metric.column();
            sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                "CREATE TRIGGER fail_later_cleanup_batch BEFORE UPDATE OF {column} ON scryfall_cards
                 WHEN NEW.{column} IS NULL AND (SELECT COUNT(*) FROM scryfall_cards WHERE {column} IS NULL AND oracle_id != 'never-scored') >= 200
                 BEGIN SELECT RAISE(ABORT, 'injected metric cleanup failure'); END"
            )))
            .execute(app.db())
            .await
            .unwrap();
            let error = refresh(&app, metric).await.unwrap_err();
            assert!(
                error
                    .to_string()
                    .contains("injected metric cleanup failure")
            );

            let counts: (i64, i64, i64) = sqlx::query_as(sqlx::AssertSqlSafe(format!(
                "SELECT SUM({column} != 999), SUM({column} = 999), SUM({column} IS NULL) FROM scryfall_cards"
            )))
            .fetch_one(app.db())
            .await
            .unwrap();
            assert_eq!(counts, (205, 5, 201));

            sqlx::raw_sql("DROP TRIGGER fail_later_cleanup_batch")
                .execute(app.db())
                .await
                .unwrap();
            refresh(&app, metric).await.unwrap();
            assert_metrics(&app, metric).await;
        }
    }
}
