//! The trade binder (`Manavault.Trade.ForTradeQuery` and the entries of
//! `Manavault.Trade.BinderShare`): every collection item with a positive
//! for-trade quantity, except items stored in list-kind locations (a list
//! location tracks cards wanted from someone else, not cards on hand).

use lotus::OracleId;
use sqlx::SqlitePool;

use crate::trade::collection_item_stub::BinderItem;
use crate::trade::want::image_url;
use manavault_catalog::catalog::sql::json_list;

/// One public trade-binder entry (`BinderListEntry`): the for-trade copies
/// of one printing in one finish and condition.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BinderEntry {
    pub card_name: String,
    pub quantity: i64,
    pub type_line: Option<String>,
    pub set_code: Option<String>,
    pub collector_number: Option<String>,
    pub image_url: Option<String>,
    pub finish: String,
    pub condition: String,
}

/// The binder aggregated by (printing, finish, condition), sorted by card
/// name, set code, collector number, finish, and condition.
pub async fn entries(pool: &SqlitePool) -> Result<Vec<BinderEntry>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT c.name AS "card_name!", c.type_line AS "type_line?",
             p.set_code AS "set_code!", p.collector_number AS "collector_number!",
             MIN(p.image_uris) AS "image_uris!: String", i.finish AS "finish!",
             i.condition AS "condition!", SUM(i.for_trade_quantity) AS "quantity!: i64"
           FROM collection_items AS i
           JOIN scryfall_printings AS p ON p.scryfall_id = i.scryfall_id
           JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           LEFT JOIN locations AS l ON l.id = i.location_id
           WHERE i.for_trade_quantity > 0 AND (l.id IS NULL OR l.kind != 'list')
           GROUP BY i.scryfall_id, i.finish, i.condition
           ORDER BY c.name, p.set_code, p.collector_number, i.finish, i.condition"#
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| BinderEntry {
            card_name: row.card_name,
            quantity: row.quantity,
            type_line: row.type_line,
            set_code: Some(row.set_code),
            collector_number: Some(row.collector_number),
            image_url: image_url(&row.image_uris),
            finish: row.finish,
            condition: row.condition,
        })
        .collect())
}

/// For-trade items of the given cards, ordered by card name, set code, and
/// collector number, each with its quantity replaced by its for-trade
/// quantity (`Matcher.for_trade_items_by_oracle/1`).
pub async fn items_for_oracle_ids(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<Vec<(OracleId, BinderItem)>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ids = json_list(oracle_ids);
    let rows = sqlx::query!(
        r#"SELECT i.id AS "id!", c.oracle_id AS "oracle_id!: OracleId",
             i.scryfall_id AS "scryfall_id!: lotus::ScryfallId",
             i.for_trade_quantity AS "for_trade_quantity!", i.condition AS "condition!",
             i.language AS "language!", i.finish AS "finish!",
             i.for_trade AS "for_trade!: bool", i.notes AS "notes?"
           FROM collection_items AS i
           JOIN scryfall_printings AS p ON p.scryfall_id = i.scryfall_id
           JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           LEFT JOIN locations AS l ON l.id = i.location_id
           WHERE i.for_trade_quantity > 0 AND (l.id IS NULL OR l.kind != 'list')
             AND c.oracle_id IN (SELECT value FROM json_each(?1))
           ORDER BY c.name ASC, p.set_code ASC, p.collector_number ASC"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.oracle_id,
                BinderItem {
                    id: row.id,
                    quantity: row.for_trade_quantity,
                    condition: row.condition,
                    language: row.language,
                    finish: row.finish,
                    for_trade: row.for_trade,
                    for_trade_quantity: row.for_trade_quantity,
                    notes: row.notes,
                    scryfall_id: row.scryfall_id,
                },
            )
        })
        .collect())
}
