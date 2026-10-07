//! Taking a deck apart: every reserved copy goes back to the location it
//! came from and the deck is archived (`Decks.Disassembly`).

use lotus::{Finish, OracleId};
use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};

use crate::allocate::{begin_write, delete_allocation};
use crate::domain::{AllocationId, CollectionItemId, DeckCardId, DeckId, LocationId, Quantity};
use crate::error::AllocationError;
use crate::items;
use crate::model::{Deck, DeckAllocation, load_collection_item, require_deck};

/// Copies of one allocation returning to their source location.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DisassemblyMove {
    pub collection_item_id: CollectionItemId,
    pub card_name: String,
    pub card_id: OracleId,
    pub set_code: String,
    pub collector_number: String,
    pub image_url: Option<String>,
    pub quantity: Quantity,
    pub finish: Finish,
    /// The deck the copies leave.
    pub from_deck_id: DeckId,
    pub from_location_name: String,
    /// `None` when the copies were unfiled.
    pub to_location_id: Option<LocationId>,
    pub to_location_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DisassemblyResult {
    /// Copies the deck lists.
    pub checked_count: u32,
    /// Physical copies that move back.
    pub moved_count: u32,
    /// Listed copies without a physical copy to move.
    pub skipped_count: u32,
    pub dry_run: bool,
    /// Ordered by card name, oracle id, deck card, then allocation.
    pub moves: Vec<DisassemblyMove>,
}

/// What [`disassemble_deck`] would move, without writing.
pub async fn preview_deck_disassembly(
    pool: &SqlitePool,
    deck_id: DeckId,
) -> Result<DisassemblyResult, AllocationError> {
    let mut conn = pool.acquire().await?;
    let deck = require_deck(&mut conn, deck_id).await?;
    let (result, _) = plan(&mut conn, &deck, true).await?;
    Ok(result)
}

/// Returns every reserved copy to its source location, deletes the
/// allocations, and archives the deck. Deck cards stay, so the list can be
/// rebuilt later. Like the Elixir code, an already archived deck can be
/// disassembled too.
pub async fn disassemble_deck(
    pool: &SqlitePool,
    deck_id: DeckId,
) -> Result<DisassemblyResult, AllocationError> {
    let mut tx = begin_write(pool).await?;
    let deck = require_deck(&mut tx, deck_id).await?;
    let (result, allocations) = plan(&mut tx, &deck, false).await?;
    for allocation in &allocations {
        let item = load_collection_item(&mut tx, allocation.collection_item_id)
            .await?
            .ok_or(AllocationError::CollectionItemNotFound)?;
        items::restore_from_deck(
            &mut tx,
            &item,
            allocation.quantity,
            allocation.source_location_id,
        )
        .await?;
        delete_allocation(&mut tx, allocation.id).await?;
    }
    sqlx::query!(
        r#"
        UPDATE decks
        SET status = 'archived', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?1 AND status != 'archived'
        "#,
        deck.id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(result)
}

struct MoveRow {
    id: AllocationId,
    deck_card_id: DeckCardId,
    collection_item_id: CollectionItemId,
    quantity: Quantity,
    source_location_id: Option<LocationId>,
    source_location_name: Option<String>,
    finish: Finish,
    set_code: String,
    collector_number: String,
    image_uris: String,
    card_name: String,
    oracle_id: OracleId,
}

async fn plan(
    conn: &mut SqliteConnection,
    deck: &Deck,
    dry_run: bool,
) -> Result<(DisassemblyResult, Vec<DeckAllocation>), AllocationError> {
    let checked_count = sqlx::query_scalar!(
        r#"SELECT COALESCE(SUM(quantity), 0) AS "total!: u32" FROM deck_cards WHERE deck_id = ?1"#,
        deck.id
    )
    .fetch_one(&mut *conn)
    .await?;

    let rows = sqlx::query_as!(
        MoveRow,
        r#"
        SELECT
          a.id AS "id!: AllocationId",
          a.deck_card_id AS "deck_card_id: DeckCardId",
          a.collection_item_id AS "collection_item_id: CollectionItemId",
          a.quantity AS "quantity: Quantity",
          a.source_location_id AS "source_location_id: LocationId",
          l.name AS "source_location_name?",
          ci.finish AS "finish: Finish",
          p.set_code,
          p.collector_number,
          p.image_uris,
          c.name AS card_name,
          c.oracle_id AS "oracle_id!: OracleId"
        FROM deck_allocations a
        JOIN deck_cards dc ON dc.id = a.deck_card_id
        JOIN scryfall_cards c ON c.oracle_id = dc.oracle_id
        JOIN collection_items ci ON ci.id = a.collection_item_id
        JOIN scryfall_printings p ON p.scryfall_id = ci.scryfall_id
        LEFT JOIN locations l ON l.id = a.source_location_id
        WHERE dc.deck_id = ?1
        ORDER BY c.name, c.oracle_id, dc.id, a.id
        "#,
        deck.id
    )
    .fetch_all(&mut *conn)
    .await?;

    let mut moves = Vec::with_capacity(rows.len());
    let mut allocations = Vec::with_capacity(rows.len());
    for row in rows {
        allocations.push(DeckAllocation {
            id: row.id,
            deck_card_id: row.deck_card_id,
            collection_item_id: row.collection_item_id,
            source_location_id: row.source_location_id,
            quantity: row.quantity,
        });
        moves.push(DisassemblyMove {
            collection_item_id: row.collection_item_id,
            card_name: row.card_name,
            card_id: row.oracle_id,
            set_code: row.set_code,
            collector_number: row.collector_number,
            image_url: image_url(&row.image_uris),
            quantity: row.quantity,
            finish: row.finish,
            from_deck_id: deck.id,
            from_location_name: deck.name.clone(),
            to_location_id: row.source_location_id,
            to_location_name: row
                .source_location_name
                .unwrap_or_else(|| "Unfiled".to_owned()),
        });
    }
    let moved_count = moves
        .iter()
        .fold(0u32, |sum, m| sum.saturating_add(m.quantity.get()));
    Ok((
        DisassemblyResult {
            checked_count,
            moved_count,
            skipped_count: checked_count.saturating_sub(moved_count),
            dry_run,
            moves,
        },
        allocations,
    ))
}

/// The `normal`, `large`, `small`, or `png` image of a printing's
/// `image_uris` (the first face's for a list of faces).
fn image_url(image_uris: &str) -> Option<String> {
    fn pick(value: &Value) -> Option<String> {
        match value {
            Value::Object(map) => {
                ["normal", "large", "small", "png"]
                    .iter()
                    .find_map(|key| match map.get(*key) {
                        Some(Value::Null | Value::Bool(false)) | None => None,
                        Some(Value::String(url)) => Some(url.clone()),
                        Some(other) => Some(other.to_string()),
                    })
            }
            Value::Array(faces) => faces.first().and_then(pick),
            _ => None,
        }
    }
    serde_json::from_str::<Value>(image_uris)
        .ok()
        .as_ref()
        .and_then(pick)
}

#[cfg(test)]
mod tests {
    use super::image_url;

    #[test]
    fn image_url_prefers_normal_and_reads_face_lists() {
        assert_eq!(
            image_url(r#"{"small":"s","normal":"n"}"#),
            Some("n".to_owned())
        );
        assert_eq!(image_url(r#"{"png":"p"}"#), Some("p".to_owned()));
        assert_eq!(
            image_url(r#"[{"large":"l"},{"normal":"x"}]"#),
            Some("l".to_owned())
        );
        assert_eq!(image_url("{}"), None);
        assert_eq!(image_url("not json"), None);
    }
}
