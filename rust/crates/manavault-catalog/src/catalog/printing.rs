//! Card printings (`Manavault.Catalog.Printing`, `scryfall_printings`) and
//! the GraphQL `Printing` type.

use std::collections::HashMap;
use std::sync::Arc;

use async_graphql::{Context, ID, Object};
use lotus::{OracleId, ScryfallId};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;

use crate::catalog::card::{Card, CardRecord};
use crate::catalog::{json, price};
use crate::graphql::{Json, NodeKind, global_id};

/// Selects `scryfall_printings` rows aliased `p` into [`PrintingRecord`];
/// the argument is the rest of the query after `FROM scryfall_printings AS p`.
#[macro_export]
macro_rules! printing_query {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            $crate::catalog::PrintingRecord,
            r#"SELECT p.scryfall_id AS "scryfall_id!: lotus::ScryfallId",
                 p.oracle_id AS "oracle_id!: lotus::OracleId", p.set_code AS "set_code!",
                 p.set_name AS "set_name?", p.collector_number AS "collector_number!",
                 p.illustration_id AS "illustration_id?", p.lang AS "lang!",
                 p.flavor_name AS "flavor_name?", p.flavor_text AS "flavor_text?",
                 p.rarity AS "rarity?", p.finishes AS "finishes!", p.promo_types AS "promo_types!",
                 p.promo AS "promo!: bool", p.image_uris AS "image_uris!", p.prices AS "prices!",
                 p.released_at AS "released_at?", p.tcgplayer_id AS "tcgplayer_id?",
                 p.tcgplayer_etched_id AS "tcgplayer_etched_id?"
               FROM scryfall_printings AS p "# + $tail
            $(, $arg)*
        )
    };
}

/// A `scryfall_printings` row. JSON columns hold their stored text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PrintingRecord {
    pub scryfall_id: ScryfallId,
    pub oracle_id: OracleId,
    pub set_code: String,
    pub set_name: Option<String>,
    pub collector_number: String,
    pub illustration_id: Option<String>,
    pub lang: String,
    pub flavor_name: Option<String>,
    pub flavor_text: Option<String>,
    pub rarity: Option<String>,
    pub finishes: String,
    pub promo_types: String,
    pub promo: bool,
    pub image_uris: String,
    pub prices: String,
    /// `YYYY-MM-DD`.
    pub released_at: Option<String>,
    pub tcgplayer_id: Option<i64>,
    pub tcgplayer_etched_id: Option<i64>,
}

impl PrintingRecord {
    /// Decoded `finishes` (`Finishes.list/1`).
    #[must_use]
    pub fn finish_list(&self) -> Vec<String> {
        json::strings(&self.finishes)
    }

    /// The front-face image URL (`CardFields.printing_image_url/3`).
    #[must_use]
    pub fn image_url(&self) -> Option<String> {
        image_url(&json::value_or(
            &self.image_uris,
            Value::Object(serde_json::Map::new()),
        ))
    }

    /// The back-face image URL of a double-faced printing.
    #[must_use]
    pub fn back_image_url(&self) -> Option<String> {
        back_image_url(&json::value_or(&self.image_uris, Value::Null))
    }

    /// The art crop URL, falling back to the full image.
    #[must_use]
    pub fn art_crop_url(&self) -> Option<String> {
        art_crop_url(&json::value_or(&self.image_uris, Value::Null))
    }

    /// Whether the printing has any usable image.
    #[must_use]
    pub fn has_image(&self) -> bool {
        let uris = json::value_or(&self.image_uris, Value::Null);
        image_url(&uris).is_some() || art_crop_url(&uris).is_some()
    }
}

fn first_truthy_text(map: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| match json::truthy(map.get(*key)) {
            Some(Value::String(text)) => Some(text.clone()),
            Some(other) => Some(other.to_string()),
            None => None,
        })
}

/// `normal || large || small || png` of an image-URI map, or of the first
/// face for a list of faces.
#[must_use]
pub fn image_url(image_uris: &Value) -> Option<String> {
    match image_uris {
        Value::Object(map) => first_truthy_text(map, &["normal", "large", "small", "png"]),
        Value::Array(faces) => faces.first().and_then(image_url),
        _ => None,
    }
}

/// The second face's image of a list of faces.
#[must_use]
pub fn back_image_url(image_uris: &Value) -> Option<String> {
    match image_uris {
        Value::Array(faces) => faces.get(1).and_then(image_url),
        _ => None,
    }
}

/// `art_crop`, falling back to [`image_url`].
#[must_use]
pub fn art_crop_url(image_uris: &Value) -> Option<String> {
    match image_uris {
        Value::Object(map) => {
            first_truthy_text(map, &["art_crop"]).or_else(|| image_url(image_uris))
        }
        Value::Array(faces) => faces.first().and_then(art_crop_url),
        _ => None,
    }
}

/// A printing as a GraphQL object: the row, how many collection copies of
/// it are owned (0 unless loaded through an owned-count query, as with the
/// owned-count field), and its card when already loaded.
#[derive(Debug, Clone)]
pub struct Printing {
    pub record: Arc<PrintingRecord>,
    pub owned_count: i64,
    pub card: Option<Arc<CardRecord>>,
}

impl std::ops::Deref for Printing {
    type Target = PrintingRecord;

    fn deref(&self) -> &PrintingRecord {
        &self.record
    }
}

impl From<PrintingRecord> for Printing {
    fn from(record: PrintingRecord) -> Self {
        Self {
            record: Arc::new(record),
            owned_count: 0,
            card: None,
        }
    }
}

impl Printing {
    /// Attaches the printing's card.
    #[must_use]
    pub fn with_card(mut self, card: Arc<CardRecord>) -> Self {
        self.card = Some(card);
        self
    }

    /// Sets the owned count.
    #[must_use]
    pub fn with_owned_count(mut self, owned_count: i64) -> Self {
        self.owned_count = owned_count;
        self
    }

    /// One printing with its card (`Catalog.get_printing_by_scryfall_id/1`).
    pub async fn load(
        pool: &SqlitePool,
        scryfall_id: &ScryfallId,
    ) -> Result<Option<Printing>, sqlx::Error> {
        let Some(record) = printing_query!("WHERE p.scryfall_id = ?1", scryfall_id)
            .fetch_optional(pool)
            .await?
        else {
            return Ok(None);
        };
        let card = crate::catalog::card::load_record(pool, &record.oracle_id).await?;
        let printing = Printing::from(record);
        Ok(Some(match card {
            Some(card) => printing.with_card(Arc::new(card)),
            None => printing,
        }))
    }

    /// Printings by Scryfall id with their cards, keyed by id.
    pub async fn load_many(
        pool: &SqlitePool,
        scryfall_ids: &[ScryfallId],
    ) -> Result<HashMap<ScryfallId, Printing>, sqlx::Error> {
        if scryfall_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let ids = crate::catalog::sql::json_list(scryfall_ids);
        let records = printing_query!(
            "WHERE p.scryfall_id IN (SELECT value FROM json_each(?1))",
            ids
        )
        .fetch_all(pool)
        .await?;
        with_cards(pool, records).await.map(|printings| {
            printings
                .into_iter()
                .map(|printing| (printing.record.scryfall_id.clone(), printing))
                .collect()
        })
    }

    /// The current price in cents for a finish, from the active price source
    /// with finish fallback (`Price.price_cents_for_printing/2`).
    #[must_use]
    pub fn price_cents_for(
        &self,
        prices: &crate::pricing::PriceStore,
        finish: Option<&str>,
    ) -> Option<i64> {
        price::price_cents_for_printing(prices, &self.record, finish)
    }
}

/// Attaches each printing's card in one query.
pub async fn with_cards(
    pool: &SqlitePool,
    records: Vec<PrintingRecord>,
) -> Result<Vec<Printing>, sqlx::Error> {
    let mut oracle_ids: Vec<OracleId> = records
        .iter()
        .map(|record| record.oracle_id.clone())
        .collect();
    oracle_ids.sort();
    oracle_ids.dedup();
    let cards: HashMap<OracleId, Arc<CardRecord>> =
        crate::catalog::card::load_records(pool, &oracle_ids)
            .await?
            .into_iter()
            .map(|card| (card.oracle_id.clone(), Arc::new(card)))
            .collect();
    Ok(records
        .into_iter()
        .map(|record| {
            let card = cards.get(&record.oracle_id).cloned();
            let printing = Printing::from(record);
            match card {
                Some(card) => printing.with_card(card),
                None => printing,
            }
        })
        .collect())
}

/// Owned collection copies per printing of the given cards, ignoring list
/// locations (`Dataloader.printing_owned_counts/2`).
pub async fn owned_counts(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<HashMap<ScryfallId, i64>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = crate::catalog::sql::json_list(oracle_ids);
    let rows = sqlx::query!(
        r#"SELECT item.scryfall_id AS "scryfall_id!: ScryfallId",
                  COALESCE(SUM(item.quantity), 0) AS "owned!: i64"
           FROM collection_items AS item
           JOIN scryfall_printings AS p ON p.scryfall_id = item.scryfall_id
           LEFT JOIN locations AS location ON location.id = item.location_id
           WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
             AND (location.id IS NULL OR location.kind != 'list')
           GROUP BY item.scryfall_id"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.scryfall_id, row.owned))
        .collect())
}

/// Every printing of the given cards with owned counts, newest first, grouped
/// by oracle id (`Dataloader.run_batch(Card, _, :printings_with_owned_count, ...)`).
pub async fn printings_with_owned_counts(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<HashMap<OracleId, Vec<Printing>>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = crate::catalog::sql::json_list(oracle_ids);
    let records = printing_query!(
        "WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
         ORDER BY p.released_at DESC, p.set_code ASC",
        ids
    )
    .fetch_all(pool)
    .await?;
    let counts = owned_counts(pool, oracle_ids).await?;
    let mut grouped: HashMap<OracleId, Vec<Printing>> = HashMap::new();
    for record in records {
        let owned = counts.get(&record.scryfall_id).copied().unwrap_or(0);
        grouped
            .entry(record.oracle_id.clone())
            .or_default()
            .push(Printing::from(record).with_owned_count(owned));
    }
    Ok(grouped)
}

/// The first printing with a usable image, else the first printing.
#[must_use]
pub fn primary_printing(printings: &[Printing]) -> Option<&Printing> {
    printings
        .iter()
        .find(|printing| printing.has_image())
        .or_else(|| printings.first())
}

#[Object]
impl Printing {
    /// The ID of an object
    pub async fn id(&self) -> ID {
        global_id(NodeKind::Printing, &self.record.scryfall_id)
    }

    async fn scryfall_id(&self) -> ID {
        ID(self.record.scryfall_id.to_string())
    }

    async fn oracle_id(&self) -> ID {
        ID(self.record.oracle_id.to_string())
    }

    async fn set_code(&self) -> Option<&str> {
        Some(&self.record.set_code)
    }

    async fn set_name(&self) -> Option<&str> {
        self.record.set_name.as_deref()
    }

    async fn collector_number(&self) -> Option<&str> {
        Some(&self.record.collector_number)
    }

    async fn illustration_id(&self) -> Option<ID> {
        self.record.illustration_id.clone().map(ID)
    }

    async fn lang(&self) -> Option<&str> {
        Some(&self.record.lang)
    }

    async fn rarity(&self) -> Option<&str> {
        self.record.rarity.as_deref()
    }

    async fn owned_count(&self) -> i64 {
        self.owned_count
    }

    async fn finishes(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.record.finishes))
    }

    async fn promo_types(&self) -> Option<Vec<Option<String>>> {
        Some(json::string_list(&self.record.promo_types))
    }

    async fn promo(&self) -> bool {
        self.record.promo
    }

    /// Current price in cents for a finish, from the selected price source with finish fallback.
    async fn price_cents(&self, ctx: &Context<'_>, finish: Option<String>) -> Option<i64> {
        self.price_cents_for(&crate::graphql::state(ctx).prices, finish.as_deref())
    }

    async fn image_url(&self) -> Option<String> {
        self.record.image_url()
    }

    async fn back_image_url(&self) -> Option<String> {
        self.record.back_image_url()
    }

    async fn art_crop_url(&self) -> Option<String> {
        self.record.art_crop_url()
    }

    async fn image_uris(&self) -> Option<Json> {
        Some(Json(json::value_or(
            &self.record.image_uris,
            Value::Object(serde_json::Map::new()),
        )))
    }

    async fn prices(&self) -> Option<Json> {
        Some(Json(json::value_or(
            &self.record.prices,
            Value::Object(serde_json::Map::new()),
        )))
    }

    async fn price_text(&self, ctx: &Context<'_>) -> Option<String> {
        price::format_cents(self.price_cents_for(&crate::graphql::state(ctx).prices, None))
    }

    async fn released_at(&self) -> Option<&str> {
        self.record.released_at.as_deref()
    }

    async fn card(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<Card>> {
        if let Some(card) = &self.card {
            return Ok(Some(Card::from(card.clone())));
        }
        crate::catalog::loader::card(ctx, &self.record.oracle_id).await
    }
}

crate::connection_types!(PrintingConnection, PrintingEdge, Printing);
