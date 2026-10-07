//! Pasted decklist text as list entries (`ListSource.from_text/1`): the
//! deck module's `Decklists.parse/2` port, with each `(SET) 123` printing's
//! set code and collector number filled in.

use lotus::{ScryfallId, Zone};
use sqlx::SqlitePool;

use crate::trade::list_source::ListEntry;
use manavault_catalog::catalog::printing::Printing;
use manavault_collection::decks::decklist;
use manavault_collection::decks::model::parse_zone;

/// Parses decklist text into entries: zone headings (`Commander`,
/// `Sideboard:`, ...), `SB:` prefixes, `4x Name (SET) 123 *F*` lines, and
/// `# comments`. Duplicate lines (same name, zone, printing, and finish)
/// merge, keeping the larger quantity. A `(SET) 123` annotation that names
/// a known printing fills in its set code and collector number.
pub async fn parse(pool: &SqlitePool, text: &str) -> Result<Vec<ListEntry>, sqlx::Error> {
    let entries = decklist::parse(pool, text, None).await?;
    let ids: Vec<ScryfallId> = entries
        .iter()
        .filter_map(|entry| entry.preferred_printing_id.clone())
        .collect();
    let printings = Printing::load_many(pool, &ids).await?;
    Ok(entries
        .into_iter()
        .map(|entry| {
            let printing = entry
                .preferred_printing_id
                .as_ref()
                .and_then(|id| printings.get(id));
            ListEntry {
                name: entry.name,
                quantity: entry.quantity,
                // Headings only produce known zones; anything else is the
                // mainboard.
                zone: parse_zone(&entry.zone).unwrap_or(Zone::Mainboard),
                set_code: printing.map(|printing| printing.set_code.clone()),
                collector_number: printing.map(|printing| printing.collector_number.clone()),
            }
        })
        .collect())
}
