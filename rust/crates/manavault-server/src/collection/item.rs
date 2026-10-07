//! Collection items (`Manavault.Catalog.CollectionItem`): owned copies of an
//! exact printing, with condition, language, finish, location, purchase
//! price, and how many copies are offered for trade.

use std::collections::HashMap;
use std::sync::Arc;

use lotus::{Condition, Finish, OracleId, Quantity, ScryfallId};
use serde::{Deserialize, Serialize};
use sqlx::{SqliteConnection, SqlitePool};

use crate::catalog::card::CardRecord;
use crate::catalog::printing::{Printing, PrintingRecord};
use crate::catalog::sql::json_list;
use crate::collection::location::{Location, LocationRecord, json_ids};
use crate::pricing::PriceStore;
use crate::{card_query, printing_query};

/// A `collection_items` row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CollectionItemRecord {
    pub id: i64,
    pub scryfall_id: ScryfallId,
    pub quantity: Quantity,
    pub condition: Condition,
    pub language: String,
    pub finish: Finish,
    pub location_id: Option<i64>,
    pub notes: Option<String>,
    pub purchase_price_cents: Option<i64>,
    pub for_trade: bool,
    /// Copies offered for trade, at most [`Self::quantity`].
    pub for_trade_quantity: i64,
    pub location_changed_at: Option<String>,
    pub inserted_at: String,
    pub updated_at: String,
}

/// Selects `collection_items` rows aliased `i` into [`CollectionItemRecord`];
/// the argument is the rest of the query after `FROM collection_items AS i`.
#[macro_export]
macro_rules! collection_item_query {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            $crate::collection::item::CollectionItemRecord,
            r#"SELECT i.id AS "id!", i.scryfall_id AS "scryfall_id!: lotus::ScryfallId",
                 i.quantity AS "quantity!: lotus::Quantity",
                 i.condition AS "condition!: lotus::Condition", i.language AS "language!",
                 i.finish AS "finish!: lotus::Finish", i.location_id AS "location_id?",
                 i.notes AS "notes?", i.purchase_price_cents AS "purchase_price_cents?",
                 i.for_trade AS "for_trade!: bool", i.for_trade_quantity AS "for_trade_quantity!",
                 i.location_changed_at AS "location_changed_at?",
                 i.inserted_at AS "inserted_at!", i.updated_at AS "updated_at!"
               FROM collection_items AS i "# + $tail
            $(, $arg)*
        )
    };
}

/// A collection item with its printing (and card) and location loaded, as
/// every collection listing returns it. This is the GraphQL `CollectionItem`.
#[derive(Debug, Clone)]
pub struct CollectionItem {
    pub record: CollectionItemRecord,
    pub printing: Printing,
    pub location: Option<Arc<LocationRecord>>,
}

impl std::ops::Deref for CollectionItem {
    type Target = CollectionItemRecord;

    fn deref(&self) -> &CollectionItemRecord {
        &self.record
    }
}

impl CollectionItem {
    /// One item with its printing, card, and location
    /// (`Collection.get_collection_item!/1` without the raise).
    pub async fn load(pool: &SqlitePool, id: i64) -> Result<Option<CollectionItem>, sqlx::Error> {
        let mut conn = pool.acquire().await?;
        Ok(load_items(&mut conn, &[id]).await?.into_iter().next())
    }

    /// Items by id with their printings, cards, and locations, keyed by id.
    pub async fn load_many(
        pool: &SqlitePool,
        ids: &[i64],
    ) -> Result<HashMap<i64, CollectionItem>, sqlx::Error> {
        let mut conn = pool.acquire().await?;
        Ok(load_items(&mut conn, ids)
            .await?
            .into_iter()
            .map(|item| (item.record.id, item))
            .collect())
    }

    /// The card this item is a copy of.
    #[must_use]
    pub fn card(&self) -> Option<&CardRecord> {
        self.printing.card.as_deref()
    }

    /// The oracle id of the item's card.
    #[must_use]
    pub fn oracle_id(&self) -> &OracleId {
        &self.printing.record.oracle_id
    }

    /// The item's location as a GraphQL `Location`.
    #[must_use]
    pub fn location_object(&self) -> Option<Location> {
        self.location.clone().map(Location::stored)
    }

    /// Current price of one copy in this finish (`Price.collection_item_price_cents/1`).
    #[must_use]
    pub fn price_cents(&self, prices: &PriceStore) -> Option<i64> {
        self.printing
            .price_cents_for(prices, Some(self.record.finish.as_str()))
    }

    /// The purchase price of one copy, or its current price when none was
    /// recorded (`Price.collection_item_purchase_price_cents/1`).
    #[must_use]
    pub fn purchase_basis_cents(&self, prices: &PriceStore) -> Option<i64> {
        self.record
            .purchase_price_cents
            .or_else(|| self.price_cents(prices))
    }

    /// Current minus purchase price of one copy (`collection_item_value_gain_cents/1`).
    #[must_use]
    pub fn gain_cents(&self, prices: &PriceStore) -> Option<i64> {
        Some(self.price_cents(prices)? - self.purchase_basis_cents(prices)?)
    }

    /// The front-face image URL of the printing.
    #[must_use]
    pub fn image_url(&self) -> Option<String> {
        self.printing.record.image_url()
    }
}

/// Loads items by id through a connection (so writes in an open transaction
/// are visible), in the order of `ids`; missing ids are skipped.
pub async fn load_items(
    conn: &mut SqliteConnection,
    ids: &[i64],
) -> Result<Vec<CollectionItem>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let json = json_ids(ids);
    let records = collection_item_query!("WHERE i.id IN (SELECT value FROM json_each(?1))", json)
        .fetch_all(&mut *conn)
        .await?;
    let mut by_id: HashMap<i64, CollectionItemRecord> = records
        .into_iter()
        .map(|record| (record.id, record))
        .collect();
    let mut ordered = Vec::with_capacity(by_id.len());
    for id in ids {
        if let Some(record) = by_id.remove(id) {
            ordered.push(record);
        }
    }
    with_relations(conn, ordered).await
}

/// Attaches printings (with cards) and locations to item rows, keeping
/// their order. Rows whose printing is missing are dropped.
pub async fn with_relations(
    conn: &mut SqliteConnection,
    records: Vec<CollectionItemRecord>,
) -> Result<Vec<CollectionItem>, sqlx::Error> {
    let mut scryfall_ids: Vec<ScryfallId> = records.iter().map(|r| r.scryfall_id.clone()).collect();
    scryfall_ids.sort();
    scryfall_ids.dedup();
    let printings = load_printings(conn, &scryfall_ids).await?;
    let mut location_ids: Vec<i64> = records.iter().filter_map(|r| r.location_id).collect();
    location_ids.sort_unstable();
    location_ids.dedup();
    let locations: HashMap<i64, Arc<LocationRecord>> = Location::load_many(conn, &location_ids)
        .await?
        .into_iter()
        .map(|(id, record)| (id, Arc::new(record)))
        .collect();
    Ok(records
        .into_iter()
        .filter_map(|record| {
            let printing = printings.get(&record.scryfall_id)?.clone();
            let location = record
                .location_id
                .and_then(|id| locations.get(&id).cloned());
            Some(CollectionItem {
                record,
                printing,
                location,
            })
        })
        .collect())
}

/// Printings with their cards through a connection, keyed by id.
pub async fn load_printings(
    conn: &mut SqliteConnection,
    scryfall_ids: &[ScryfallId],
) -> Result<HashMap<ScryfallId, Printing>, sqlx::Error> {
    if scryfall_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = json_list(scryfall_ids);
    let records: Vec<PrintingRecord> = printing_query!(
        "WHERE p.scryfall_id IN (SELECT value FROM json_each(?1))",
        ids
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut oracle_ids: Vec<OracleId> = records.iter().map(|r| r.oracle_id.clone()).collect();
    oracle_ids.sort();
    oracle_ids.dedup();
    let oracle_json = json_list(&oracle_ids);
    let cards: HashMap<OracleId, Arc<CardRecord>> = card_query!(
        "WHERE c.oracle_id IN (SELECT value FROM json_each(?1))",
        oracle_json
    )
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|card| (card.oracle_id.clone(), Arc::new(card)))
    .collect();
    Ok(records
        .into_iter()
        .map(|record| {
            let card = cards.get(&record.oracle_id).cloned();
            let printing = Printing::from(record);
            let printing = match card {
                Some(card) => printing.with_card(card),
                None => printing,
            };
            (printing.record.scryfall_id.clone(), printing)
        })
        .collect())
}
