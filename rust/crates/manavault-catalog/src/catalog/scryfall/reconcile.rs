//! Drops printings a full import no longer contains, moving everything that
//! referenced them onto a current printing of the same card
//! (`Manavault.Catalog.Scryfall.ReconcilePrintings`).

use std::collections::{HashMap, HashSet};

use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};

use crate::catalog::scryfall::push_in_list;

const BATCH_SIZE: usize = 200;

#[derive(Debug, Clone)]
struct PrintingRef {
    scryfall_id: String,
    oracle_id: String,
    lang: String,
    finishes: HashSet<String>,
}

fn decode_finishes(finishes: &str) -> HashSet<String> {
    serde_json::from_str::<Vec<serde_json::Value>>(finishes)
        .map(|values| {
            values
                .into_iter()
                .filter_map(|value| value.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

/// Removes every stored printing the import did not see, moving collection
/// items, deck preferences, location covers, token items, and trade wants
/// that referenced it onto a current printing of the same card, then drops
/// cards left without any printing (and their deck cards).
/// `seen_scryfall_ids` is every printing id the import processed.
pub async fn run<S: std::hash::BuildHasher>(
    pool: &SqlitePool,
    seen_scryfall_ids: &HashSet<String, S>,
) -> Result<(), sqlx::Error> {
    let stale: Vec<String> = sqlx::query_scalar!(
        r#"SELECT scryfall_id AS "scryfall_id!" FROM scryfall_printings ORDER BY scryfall_id"#
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .filter(|id| !seen_scryfall_ids.contains(id))
    .collect();

    for chunk in stale.chunks(BATCH_SIZE) {
        let printings = select_printings(pool, "scryfall_id", chunk).await?;
        reconcile_batch(pool, printings, seen_scryfall_ids).await?;
    }
    delete_orphaned_cards(pool).await
}

async fn select_printings(
    pool: &SqlitePool,
    column: &str,
    ids: &[String],
) -> Result<Vec<PrintingRef>, sqlx::Error> {
    let mut builder = QueryBuilder::new(
        "SELECT scryfall_id, oracle_id, lang, finishes FROM scryfall_printings WHERE ",
    );
    builder.push(column);
    builder.push(" IN");
    push_in_list(&mut builder, ids);
    if column == "oracle_id" {
        builder.push(" ORDER BY released_at DESC, set_code ASC, collector_number ASC");
    }
    builder
        .build()
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| {
            let finishes: String = row.try_get("finishes")?;
            Ok(PrintingRef {
                scryfall_id: row.try_get("scryfall_id")?,
                oracle_id: row.try_get("oracle_id")?,
                lang: row.try_get("lang")?,
                finishes: decode_finishes(&finishes),
            })
        })
        .collect()
}

/// Same language sharing a finish, else same language, else the newest.
fn replacement_for<'a>(
    stale: &PrintingRef,
    candidates: &'a [PrintingRef],
) -> Option<&'a PrintingRef> {
    candidates
        .iter()
        .find(|candidate| {
            candidate.lang == stale.lang && !candidate.finishes.is_disjoint(&stale.finishes)
        })
        .or_else(|| {
            candidates
                .iter()
                .find(|candidate| candidate.lang == stale.lang)
        })
        .or_else(|| candidates.first())
}

async fn reconcile_batch<S: std::hash::BuildHasher>(
    pool: &SqlitePool,
    stale: Vec<PrintingRef>,
    seen: &HashSet<String, S>,
) -> Result<(), sqlx::Error> {
    if stale.is_empty() {
        return Ok(());
    }
    let mut oracle_ids: Vec<String> = Vec::new();
    for printing in &stale {
        if !oracle_ids.contains(&printing.oracle_id) {
            oracle_ids.push(printing.oracle_id.clone());
        }
    }
    let mut candidates: HashMap<String, Vec<PrintingRef>> = HashMap::new();
    for chunk in oracle_ids.chunks(BATCH_SIZE) {
        for printing in select_printings(pool, "oracle_id", chunk).await? {
            if seen.contains(&printing.scryfall_id) {
                candidates
                    .entry(printing.oracle_id.clone())
                    .or_default()
                    .push(printing);
            }
        }
    }

    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    let mut without_replacement: Vec<String> = Vec::new();
    for printing in &stale {
        let options = candidates
            .get(&printing.oracle_id)
            .map_or(&[][..], Vec::as_slice);
        match replacement_for(printing, options) {
            Some(replacement) => {
                match groups
                    .iter_mut()
                    .find(|(id, _)| *id == replacement.scryfall_id)
                {
                    Some((_, ids)) => ids.push(printing.scryfall_id.clone()),
                    None => groups.push((
                        replacement.scryfall_id.clone(),
                        vec![printing.scryfall_id.clone()],
                    )),
                }
            }
            None => without_replacement.push(printing.scryfall_id.clone()),
        }
    }

    let stale_ids: Vec<String> = stale.into_iter().map(|p| p.scryfall_id).collect();
    let mut tx = crate::db::begin_write(pool).await?;
    for (replacement, ids) in &groups {
        reassign_references(&mut tx, ids, replacement).await?;
    }
    if !without_replacement.is_empty() {
        clear_trade_wants(&mut tx, &without_replacement).await?;
    }
    for table in ["scryfall_card_tokens", "scryfall_printings"] {
        let mut builder = QueryBuilder::new("DELETE FROM ");
        builder.push(table);
        builder.push(" WHERE scryfall_id IN");
        push_in_list(&mut builder, &stale_ids);
        builder.build().execute(&mut *tx).await?;
    }
    tx.commit().await
}

async fn update_column(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    table: &str,
    column: &str,
    ids: &[String],
    replacement: &str,
) -> Result<(), sqlx::Error> {
    let mut builder = QueryBuilder::new("UPDATE ");
    builder.push(table);
    builder.push(" SET ");
    builder.push(column);
    builder.push(" = ");
    builder.push_bind(replacement.to_owned());
    builder.push(" WHERE ");
    builder.push(column);
    builder.push(" IN");
    push_in_list(&mut builder, ids);
    builder.build().execute(&mut **tx).await?;
    Ok(())
}

async fn reassign_references(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    stale_ids: &[String],
    replacement: &str,
) -> Result<(), sqlx::Error> {
    merge_trade_wants(tx, stale_ids, Some(replacement)).await?;
    for (table, column) in [
        ("collection_items", "scryfall_id"),
        ("deck_cards", "preferred_printing_id"),
        ("locations", "cover_scryfall_id"),
        ("token_items", "scryfall_id"),
        ("token_items", "back_scryfall_id"),
    ] {
        update_column(tx, table, column, stale_ids, replacement).await?;
    }
    Ok(())
}

async fn clear_trade_wants(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    stale_ids: &[String],
) -> Result<(), sqlx::Error> {
    merge_trade_wants(tx, stale_ids, None).await
}

/// Folds wants for stale printings into the replacement printing's want, or
/// into the card's generic want when there is no replacement.
async fn merge_trade_wants(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    stale_ids: &[String],
    replacement: Option<&str>,
) -> Result<(), sqlx::Error> {
    let mut builder = QueryBuilder::new(
        "INSERT INTO trade_wants (oracle_id, preferred_printing_id, quantity, inserted_at, updated_at) SELECT oracle_id, ",
    );
    builder.push_bind(replacement.map(str::to_owned));
    builder.push(
        ", SUM(quantity), MIN(inserted_at), MAX(updated_at) FROM trade_wants WHERE preferred_printing_id IN",
    );
    push_in_list(&mut builder, stale_ids);
    builder.push(" GROUP BY oracle_id");
    match replacement {
        Some(_) => builder.push(
            " ON CONFLICT (oracle_id, preferred_printing_id) WHERE preferred_printing_id IS NOT NULL DO UPDATE SET quantity = trade_wants.quantity + excluded.quantity, updated_at = excluded.updated_at",
        ),
        None => builder.push(
            " ON CONFLICT (oracle_id) WHERE preferred_printing_id IS NULL DO UPDATE SET quantity = trade_wants.quantity + excluded.quantity, updated_at = excluded.updated_at",
        ),
    };
    builder.build().execute(&mut **tx).await?;

    let mut builder = QueryBuilder::new("DELETE FROM trade_wants WHERE preferred_printing_id IN");
    push_in_list(&mut builder, stale_ids);
    builder.build().execute(&mut **tx).await?;
    Ok(())
}

async fn delete_orphaned_cards(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    loop {
        let limit = i64::try_from(BATCH_SIZE).unwrap_or(200);
        let oracle_ids: Vec<String> = sqlx::query_scalar!(
            r#"SELECT card.oracle_id AS "oracle_id!" FROM scryfall_cards AS card
               LEFT JOIN scryfall_printings AS printing ON printing.oracle_id = card.oracle_id
               WHERE printing.scryfall_id IS NULL
               ORDER BY card.oracle_id LIMIT ?1"#,
            limit
        )
        .fetch_all(pool)
        .await?;
        if oracle_ids.is_empty() {
            return Ok(());
        }
        let mut tx = crate::db::begin_write(pool).await?;
        for table in ["deck_cards", "scryfall_cards"] {
            let mut builder = QueryBuilder::new("DELETE FROM ");
            builder.push(table);
            builder.push(" WHERE oracle_id IN");
            push_in_list(&mut builder, &oracle_ids);
            builder.build().execute(&mut *tx).await?;
        }
        tx.commit().await?;
    }
}
