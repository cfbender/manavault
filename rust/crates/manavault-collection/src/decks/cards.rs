//! Adding, editing, and removing deck cards (`Decks.AddCardToDeck`,
//! `UpdateDeckCard`, `UpdateDeckCards`, `DeleteDeckCard`,
//! `SetDeckCommander`, `AddDeckPartner`, `Decks.Printings`).

use std::collections::HashSet;

use lotus::{Finish, OracleId, Quantity, ScryfallId, Zone};
use sqlx::{SqliteConnection, SqlitePool};

use crate::decks::model::{
    DeckCardId, DeckCardRow, DeckCardTag, DeckId, DeckRow, load_deck_card_on, load_deck_cards,
    load_deck_on, parse_zone,
};
use crate::decks::validation::{
    self, BLANK, Change, INVALID, TAKEN, ValidationError, apply, at_least, greater_than, less_than,
};
use crate::decks::{DeckError, commander, ensure_deck_editable, ensure_decklist_editable};
use manavault_catalog::catalog::card::{CardRecord, load_record};
use manavault_catalog::catalog::printing::Printing;
use manavault_core::db;
use manavault_core::timestamp::Timestamp;

/// `DeckCard.changeset/2` attributes.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeckCardChanges {
    pub quantity: Change<i64>,
    pub proxy_quantity: Change<i64>,
    pub zone: Change<String>,
    pub finish: Change<String>,
    pub preferred_printing_id: Change<ScryfallId>,
    pub tag: Change<String>,
}

impl DeckCardChanges {
    /// Blank printing ids and tags mean "none"
    /// (`normalize_blank_preferred_printing/1`, `normalize_blank_deck_card_tag/1`).
    #[must_use]
    pub fn normalized(mut self) -> Self {
        if let Some(Some(id)) = &self.preferred_printing_id
            && id.as_str().is_empty()
        {
            self.preferred_printing_id = Some(None);
        }
        if let Some(Some(tag)) = &self.tag
            && tag.is_empty()
        {
            self.tag = Some(None);
        }
        self
    }
}

/// A deck card's columns after a valid changeset.
#[derive(Debug, Clone, PartialEq, Eq)]
struct CardValues {
    quantity: Quantity,
    proxy_quantity: u32,
    zone: Zone,
    finish: Finish,
    tag: Option<DeckCardTag>,
    preferred_printing_id: Option<ScryfallId>,
}

fn validate(
    current: Option<&DeckCardRow>,
    changes: &DeckCardChanges,
) -> Result<CardValues, ValidationError> {
    let mut errors = ValidationError::new();
    let zone_change = validation::cast_string(changes.zone.clone());
    let finish_change = validation::cast_string(changes.finish.clone());
    let tag_change = validation::cast_string(changes.tag.clone());
    let quantity = apply(
        Some(current.map_or(1, |row| row.quantity.as_i64())),
        &changes.quantity,
    );
    let proxy = apply(
        Some(current.map_or(0, |row| i64::from(row.proxy_quantity))),
        &changes.proxy_quantity,
    );
    let zone = apply(
        Some(
            current
                .map_or(Zone::Mainboard, |row| row.zone)
                .as_str()
                .to_owned(),
        ),
        &zone_change,
    );
    let finish = apply(
        Some(
            current
                .map_or(Finish::Nonfoil, |row| row.finish)
                .as_str()
                .to_owned(),
        ),
        &finish_change,
    );
    let tag = apply(
        current
            .and_then(|row| row.tag)
            .map(|tag| tag.as_str().to_owned()),
        &tag_change,
    );
    let preferred = apply(
        current.and_then(|row| row.preferred_printing_id.clone()),
        &changes.preferred_printing_id,
    );

    for (field, missing) in [
        ("quantity", quantity.is_none()),
        ("proxy_quantity", proxy.is_none()),
        ("zone", zone.is_none()),
        ("finish", finish.is_none()),
    ] {
        if missing {
            errors.add(field, BLANK);
        }
    }
    if let Some(Some(value)) = changes.quantity {
        let before = errors.clone();
        greater_than(&mut errors, "quantity", Some(value), 0);
        if errors == before {
            less_than(&mut errors, "quantity", Some(value), 10_000);
        }
    }
    if let Some(Some(value)) = changes.proxy_quantity {
        let before = errors.clone();
        at_least(&mut errors, "proxy_quantity", Some(value), 0);
        if errors == before {
            less_than(&mut errors, "proxy_quantity", Some(value), 10_000);
        }
    }
    let zone_value = zone.as_deref().and_then(parse_zone);
    if zone.is_some() && zone_value.is_none() {
        errors.add("zone", INVALID);
    }
    let finish_value = finish.as_deref().and_then(Finish::parse);
    if finish.is_some() && finish_value.is_none() {
        errors.add("finish", INVALID);
    }
    let tag_value = tag.as_deref().map(DeckCardTag::parse);
    if matches!(tag_value, Some(None)) {
        errors.add("tag", INVALID);
    }

    let quantity = quantity
        .and_then(|value| u32::try_from(value).ok())
        .and_then(Quantity::new);
    let proxy = proxy.and_then(|value| u32::try_from(value).ok());
    match (quantity, proxy, zone_value, finish_value) {
        (Some(quantity), Some(proxy_quantity), Some(zone), Some(finish)) if errors.is_empty() => {
            Ok(CardValues {
                quantity,
                proxy_quantity,
                zone,
                finish,
                tag: tag_value.flatten(),
                preferred_printing_id: preferred,
            })
        }
        _ => Err(errors),
    }
}

fn unique_error(error: sqlx::Error) -> DeckError {
    if validation::is_unique_violation(&error) {
        DeckError::Invalid(validation::error("deck_id", TAKEN))
    } else {
        DeckError::Db(error)
    }
}

async fn insert_card(
    conn: &mut SqliteConnection,
    deck_id: DeckId,
    oracle_id: &OracleId,
    values: &CardValues,
) -> Result<DeckCardRow, DeckError> {
    let quantity = values.quantity.as_i64();
    let now = Timestamp::now();
    let id = sqlx::query_scalar!(
        r#"INSERT INTO deck_cards (deck_id, oracle_id, preferred_printing_id, quantity, proxy_quantity,
                                   zone, finish, tag, inserted_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) RETURNING id AS "id!: DeckCardId""#,
        deck_id,
        oracle_id,
        values.preferred_printing_id,
        quantity,
        values.proxy_quantity,
        values.zone,
        values.finish,
        values.tag,
        now
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(unique_error)?;
    load_deck_card_on(conn, id)
        .await?
        .ok_or(DeckError::NotFound)
}

async fn write_card(
    conn: &mut SqliteConnection,
    id: DeckCardId,
    values: &CardValues,
) -> Result<DeckCardRow, DeckError> {
    let quantity = values.quantity.as_i64();
    let now = Timestamp::now();
    sqlx::query!(
        r#"UPDATE deck_cards SET preferred_printing_id = ?2, quantity = ?3, proxy_quantity = ?4,
                 zone = ?5, finish = ?6, tag = ?7, updated_at = ?8
           WHERE id = ?1"#,
        id,
        values.preferred_printing_id,
        quantity,
        values.proxy_quantity,
        values.zone,
        values.finish,
        values.tag,
        now
    )
    .execute(&mut *conn)
    .await
    .map_err(unique_error)?;
    load_deck_card_on(conn, id)
        .await?
        .ok_or(DeckError::NotFound)
}

async fn validate_preferred_printing(
    pool: &SqlitePool,
    oracle_id: &OracleId,
    printing: Option<&ScryfallId>,
) -> Result<(), DeckError> {
    let Some(printing) = printing else {
        return Ok(());
    };
    let owner: Option<OracleId> = sqlx::query_scalar!(
        r#"SELECT oracle_id AS "oracle_id!: OracleId" FROM scryfall_printings WHERE scryfall_id = ?1"#,
        printing
    )
    .fetch_optional(pool)
    .await?;
    match owner {
        Some(owner) if &owner == oracle_id => Ok(()),
        Some(_) => Err(DeckError::Code("preferred_printing_mismatch")),
        None => Err(DeckError::Code("preferred_printing_not_found")),
    }
}

/// Inserts or rewrites a deck card from decklist import or sync attributes,
/// without the edit guard (the caller checked it).
pub(crate) async fn write_import_row(
    conn: &mut SqliteConnection,
    deck_id: DeckId,
    oracle_id: &OracleId,
    existing: Option<&DeckCardRow>,
    changes: &DeckCardChanges,
) -> Result<DeckCardRow, DeckError> {
    let values = validate(existing, changes)?;
    match existing {
        Some(row) => write_card(conn, row.id, &values).await,
        None => insert_card(conn, deck_id, oracle_id, &values).await,
    }
}

/// How `add_card_to_deck` identifies the card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CardRef {
    Oracle(OracleId),
    Name(String),
}

/// `Decks.add_card_to_deck/2` attributes: a card plus [`DeckCardChanges`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewDeckCard {
    pub card: CardRef,
    pub changes: DeckCardChanges,
}

/// Resolves the card an add refers to.
async fn resolve_card(pool: &SqlitePool, card: &CardRef) -> Result<OracleId, DeckError> {
    match card {
        CardRef::Oracle(oracle_id) if !oracle_id.as_str().is_empty() => {
            load_record(pool, oracle_id)
                .await?
                .map(|card| card.oracle_id)
                .ok_or(DeckError::CardNotFound)
        }
        CardRef::Oracle(_) => Err(DeckError::CardNotFound),
        CardRef::Name(name) => manavault_catalog::catalog::search::cards_by_name::find(pool, name)
            .await?
            .map(|card| card.oracle_id)
            .ok_or(DeckError::CardNotFound),
    }
}

/// `Decks.add_card_to_deck/2`: adds copies to the deck's row for the card
/// and zone, or inserts one.
pub async fn add_card_to_deck(
    pool: &SqlitePool,
    deck_id: DeckId,
    new: &NewDeckCard,
) -> Result<DeckCardRow, DeckError> {
    let mut tx = db::begin_write(pool).await?;
    let deck = load_deck_on(&mut tx, deck_id)
        .await?
        .ok_or(DeckError::DeckNotFound)?;
    let row = add_card_in(&mut tx, pool, &deck, new).await?;
    tx.commit().await?;
    Ok(row)
}

/// [`add_card_to_deck`] inside a caller's transaction.
pub async fn add_card_in(
    conn: &mut SqliteConnection,
    pool: &SqlitePool,
    deck: &DeckRow,
    new: &NewDeckCard,
) -> Result<DeckCardRow, DeckError> {
    ensure_decklist_editable(deck)?;
    let changes = new.changes.clone().normalized();
    let oracle_id = resolve_card(pool, &new.card).await?;
    validate_preferred_printing(
        pool,
        &oracle_id,
        changes.preferred_printing_id.clone().flatten().as_ref(),
    )
    .await?;
    // `Util.parse_quantity/1`: a missing quantity is one copy.
    let quantity = changes.quantity.flatten().unwrap_or(1);
    let zone_text = changes
        .zone
        .clone()
        .flatten()
        .unwrap_or_else(|| Zone::Mainboard.as_str().to_owned());
    let existing = match parse_zone(&zone_text) {
        Some(zone) => {
            crate::deck_card_row_query!(
                "WHERE dc.deck_id = ?1 AND dc.oracle_id = ?2 AND dc.zone = ?3 LIMIT 1",
                deck.id,
                oracle_id,
                zone
            )
            .fetch_optional(&mut *conn)
            .await?
        }
        None => None,
    };
    match existing {
        None => {
            let changes = DeckCardChanges {
                quantity: Some(Some(quantity)),
                zone: Some(Some(zone_text)),
                ..changes
            };
            let values = validate(None, &changes)?;
            insert_card(conn, deck.id, &oracle_id, &values).await
        }
        Some(row) => {
            let changes = DeckCardChanges {
                quantity: Some(Some(row.quantity.as_i64().saturating_add(quantity))),
                proxy_quantity: None,
                preferred_printing_id: match changes.preferred_printing_id {
                    Some(None) => None,
                    other => other,
                },
                ..changes
            };
            let values = validate(Some(&row), &changes)?;
            let updated = write_card(conn, row.id, &values).await?;
            if updated.quantity < row.quantity {
                manavault_allocation::trim_deck_card_allocations(conn, row.id).await?;
            }
            Ok(updated)
        }
    }
}

/// Loads a deck card or fails with `:not_found`.
pub async fn get_deck_card(pool: &SqlitePool, id: DeckCardId) -> Result<DeckCardRow, DeckError> {
    crate::decks::model::load_deck_card(pool, id)
        .await?
        .ok_or(DeckError::NotFound)
}

async fn deck_of(conn: &mut SqliteConnection, row: &DeckCardRow) -> Result<DeckRow, DeckError> {
    load_deck_on(conn, row.deck_id)
        .await?
        .ok_or(DeckError::DeckNotFound)
}

/// `Decks.update_deck_card/2`.
pub async fn update_deck_card(
    pool: &SqlitePool,
    id: DeckCardId,
    changes: &DeckCardChanges,
) -> Result<DeckCardRow, DeckError> {
    let mut tx = db::begin_write(pool).await?;
    let row = load_deck_card_on(&mut tx, id)
        .await?
        .ok_or(DeckError::NotFound)?;
    let updated = update_in(&mut tx, pool, &row, changes).await?;
    tx.commit().await?;
    Ok(updated)
}

/// [`update_deck_card`] inside a caller's transaction.
///
/// Moving a card to Considering releases its copies and proxies. A printing
/// or finish change releases the copies and reserves the same number of the
/// new printing where available. A lower quantity releases the copies that
/// no longer fit; earlier releases skipped this (only swaps and
/// syncs trimmed), leaving more copies reserved than the card needs.
pub async fn update_in(
    conn: &mut SqliteConnection,
    pool: &SqlitePool,
    row: &DeckCardRow,
    changes: &DeckCardChanges,
) -> Result<DeckCardRow, DeckError> {
    let deck = deck_of(conn, row).await?;
    ensure_decklist_editable(&deck)?;
    let changes = changes.clone().normalized();
    validate_preferred_printing(
        pool,
        &row.oracle_id,
        changes.preferred_printing_id.clone().flatten().as_ref(),
    )
    .await?;

    let moving_to_considering = matches!(&changes.zone, Some(Some(zone)) if zone == "considering")
        && row.zone != Zone::Considering;
    let switching = matches!(&changes.preferred_printing_id, Some(printing) if printing.as_ref() != row.preferred_printing_id.as_ref())
        || matches!(&changes.finish, Some(finish) if finish.as_deref() != Some(row.finish.as_str()));

    if moving_to_considering {
        let changes = DeckCardChanges {
            proxy_quantity: Some(Some(0)),
            ..changes
        };
        let values = validate(Some(row), &changes)?;
        let updated = write_card(conn, row.id, &values).await?;
        manavault_allocation::clear_deck_card_allocations(conn, row.id).await?;
        return Ok(updated);
    }
    let values = validate(Some(row), &changes)?;
    let updated = write_card(conn, row.id, &values).await?;
    // Trim before switching: a lower quantity drops proxies first, and the
    // switch then re-reserves only the physical copies that still fit.
    // Switching alone used to skip the trim, leaving more proxies than copies.
    if updated.quantity < row.quantity {
        manavault_allocation::trim_deck_card_allocations(conn, row.id).await?;
    }
    if switching {
        manavault_allocation::switch_allocation_to_preferred_printing(conn, row.id).await?;
    }
    Ok(load_deck_card_on(conn, row.id).await?.unwrap_or(updated))
}

fn unique_ids(ids: &[DeckCardId]) -> Vec<DeckCardId> {
    let mut seen = HashSet::new();
    ids.iter().copied().filter(|id| seen.insert(*id)).collect()
}

async fn load_all(
    conn: &mut SqliteConnection,
    ids: &[DeckCardId],
) -> Result<Vec<DeckCardRow>, DeckError> {
    let mut by_id = load_deck_cards(conn, ids).await?;
    ids.iter()
        .map(|id| by_id.remove(id).ok_or(DeckError::NotFound))
        .collect()
}

/// `Decks.bulk_update_deck_cards/2`: all or nothing, in the given order.
pub async fn bulk_update(
    pool: &SqlitePool,
    ids: &[DeckCardId],
    changes: &DeckCardChanges,
) -> Result<Vec<DeckCardRow>, DeckError> {
    let ids = unique_ids(ids);
    let mut tx = db::begin_write(pool).await?;
    let rows = load_all(&mut tx, &ids).await?;
    let mut updated = Vec::with_capacity(rows.len());
    for row in rows {
        updated.push(update_in(&mut tx, pool, &row, changes).await?);
    }
    tx.commit().await?;
    Ok(updated)
}

/// `Decks.update_deck_cards_tag/2`.
pub async fn update_tags(
    pool: &SqlitePool,
    ids: &[DeckCardId],
    tag: Option<String>,
) -> Result<Vec<DeckCardRow>, DeckError> {
    let changes = DeckCardChanges {
        tag: Some(tag.filter(|tag| !tag.is_empty())),
        ..DeckCardChanges::default()
    };
    bulk_update(pool, ids, &changes).await
}

/// Deletes a card after returning its copies (`DeleteDeckCard.for_deck_deletion/1`).
async fn delete_in(conn: &mut SqliteConnection, row: &DeckCardRow) -> Result<(), DeckError> {
    manavault_allocation::clear_deck_card_allocations(conn, row.id).await?;
    sqlx::query!("DELETE FROM deck_cards WHERE id = ?1", row.id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// `DeleteDeckCard.run/1` inside a caller's transaction.
pub async fn delete_checked_in(
    conn: &mut SqliteConnection,
    row: &DeckCardRow,
) -> Result<(), DeckError> {
    let deck = deck_of(conn, row).await?;
    ensure_decklist_editable(&deck)?;
    delete_in(conn, row).await
}

/// Deletes a card without the edit guard, for syncs and replacements.
pub async fn delete_unchecked_in(
    conn: &mut SqliteConnection,
    row: &DeckCardRow,
) -> Result<(), DeckError> {
    delete_in(conn, row).await
}

/// `Decks.delete_deck_card/1`: returns the deleted row.
pub async fn delete_deck_card(pool: &SqlitePool, id: DeckCardId) -> Result<DeckCardRow, DeckError> {
    let mut tx = db::begin_write(pool).await?;
    let row = load_deck_card_on(&mut tx, id)
        .await?
        .ok_or(DeckError::NotFound)?;
    delete_checked_in(&mut tx, &row).await?;
    tx.commit().await?;
    Ok(row)
}

/// `Decks.bulk_delete_deck_cards/1`: all or nothing.
pub async fn bulk_delete(
    pool: &SqlitePool,
    ids: &[DeckCardId],
) -> Result<Vec<DeckCardRow>, DeckError> {
    let ids = unique_ids(ids);
    let mut tx = db::begin_write(pool).await?;
    let rows = load_all(&mut tx, &ids).await?;
    for row in &rows {
        delete_checked_in(&mut tx, row).await?;
    }
    tx.commit().await?;
    Ok(rows)
}

/// Printings that offer `finish`, keyed by price (unpriced last), release
/// date, set code, and collector number (`Decks.Printings`).
fn printings_by_price<'a>(
    printings: &'a [Printing],
    finish: Finish,
    prices: &manavault_catalog::pricing::PriceStore,
) -> impl Iterator<Item = (Option<i64>, &'a Printing)> {
    printings
        .iter()
        .filter(move |printing| printing.finish_list().iter().any(|f| f == finish.as_str()))
        .map(move |printing| {
            (
                printing.price_cents_for(prices, Some(finish.as_str())),
                printing,
            )
        })
}

/// Cheapest first, then oldest release, then set code and collector number
/// (`Decks.Printings.printing_sort_key/2`).
///
/// Bug in earlier releases (not kept): the sort key compared `released_at`
/// dates structurally, by day, then month, then year. Price ties therefore went
/// to the printing released on the lowest day of the month (Delver of
/// Secrets: MID 2021-09-24 before ISD 2011-09-30). Dates compare
/// chronologically here.
fn price_order(
    (price_a, a): &(Option<i64>, &Printing),
    (price_b, b): &(Option<i64>, &Printing),
) -> std::cmp::Ordering {
    price_a
        .unwrap_or(999_999_999)
        .cmp(&price_b.unwrap_or(999_999_999))
        .then_with(|| {
            a.released_at
                .as_deref()
                .unwrap_or("9999-12-31")
                .cmp(b.released_at.as_deref().unwrap_or("9999-12-31"))
        })
        .then_with(|| a.set_code.cmp(&b.set_code))
        .then_with(|| a.collector_number.cmp(&b.collector_number))
}

/// The cheapest printing in the deck card's finish, unpriced printings last
/// (`Decks.Printings.cheapest_printing/1`).
#[must_use]
pub fn cheapest_printing<'a>(
    printings: &'a [Printing],
    finish: Finish,
    prices: &manavault_catalog::pricing::PriceStore,
) -> Option<&'a Printing> {
    printings_by_price(printings, finish, prices)
        .min_by(price_order)
        .map(|(_, printing)| printing)
}

/// The cheapest priced printing of the card in the deck card's finish
/// (`Decks.Printings.cheapest_priced_printing/1`); ties go to the oldest
/// release, then set code and collector number.
#[must_use]
pub fn cheapest_priced_printing<'a>(
    printings: &'a [Printing],
    finish: Finish,
    prices: &manavault_catalog::pricing::PriceStore,
) -> Option<&'a Printing> {
    printings_by_price(printings, finish, prices)
        .filter(|(price, _)| price.is_some())
        .min_by(price_order)
        .map(|(_, printing)| printing)
}

/// `Decks.optimize_deck_card_printings/1`: switches each card to its
/// cheapest priced printing, releasing its copies. Returns the changed cards.
pub async fn optimize_printings(
    pool: &SqlitePool,
    prices: &manavault_catalog::pricing::PriceStore,
    ids: &[DeckCardId],
) -> Result<Vec<DeckCardRow>, DeckError> {
    let ids = unique_ids(ids);
    let mut tx = db::begin_write(pool).await?;
    let rows = load_all(&mut tx, &ids).await?;
    for row in &rows {
        let deck = deck_of(&mut tx, row).await?;
        ensure_decklist_editable(&deck)?;
    }
    let oracle_ids: Vec<OracleId> = rows.iter().map(|row| row.oracle_id.clone()).collect();
    let printings =
        manavault_catalog::catalog::printing::printings_with_owned_counts(pool, &oracle_ids)
            .await?;
    let mut changed = Vec::new();
    for row in rows {
        let Some(cheapest) = printings
            .get(&row.oracle_id)
            .and_then(|list| cheapest_priced_printing(list, row.finish, prices))
        else {
            continue;
        };
        if Some(&cheapest.scryfall_id) == row.preferred_printing_id.as_ref() {
            continue;
        }
        manavault_allocation::clear_deck_card_allocations(&mut tx, row.id).await?;
        let printing_change = DeckCardChanges {
            preferred_printing_id: Some(Some(cheapest.scryfall_id.clone())),
            ..DeckCardChanges::default()
        };
        changed.push(update_in(&mut tx, pool, &row, &printing_change).await?);
    }
    tx.commit().await?;
    Ok(changed)
}

/// Moves a card to `zone`, merging into the deck's existing row for the card
/// there (`SetDeckCommander.move_to_zone!/2`). Merged rows keep the moved
/// card's reservations; earlier releases deleted the moved row and the database
/// cascade dropped its reservations, stranding the reserved copies outside
/// any location.
async fn move_to_zone(
    conn: &mut SqliteConnection,
    row: &DeckCardRow,
    zone: Zone,
) -> Result<DeckCardRow, DeckError> {
    let existing = crate::deck_card_row_query!(
        "WHERE dc.deck_id = ?1 AND dc.oracle_id = ?2 AND dc.zone = ?3 AND dc.id != ?4 LIMIT 1",
        row.deck_id,
        row.oracle_id,
        zone,
        row.id
    )
    .fetch_optional(&mut *conn)
    .await?;
    let now = Timestamp::now();
    if let Some(existing) = existing {
        let quantity = existing.quantity.saturating_add(row.quantity).as_i64();
        sqlx::query!(
            "UPDATE deck_cards SET quantity = ?2, updated_at = ?3 WHERE id = ?1",
            existing.id,
            quantity,
            now
        )
        .execute(&mut *conn)
        .await?;
        sqlx::query!(
            r#"UPDATE deck_allocations SET quantity = quantity + (
                     SELECT src.quantity FROM deck_allocations AS src
                     WHERE src.deck_card_id = ?2
                       AND src.collection_item_id = deck_allocations.collection_item_id)
                   WHERE deck_card_id = ?1 AND collection_item_id IN (
                     SELECT collection_item_id FROM deck_allocations WHERE deck_card_id = ?2)"#,
            existing.id,
            row.id
        )
        .execute(&mut *conn)
        .await?;
        sqlx::query!(
            r#"DELETE FROM deck_allocations WHERE deck_card_id = ?2 AND collection_item_id IN (
                     SELECT collection_item_id FROM deck_allocations WHERE deck_card_id = ?1)"#,
            existing.id,
            row.id
        )
        .execute(&mut *conn)
        .await?;
        sqlx::query!(
            "UPDATE deck_allocations SET deck_card_id = ?1 WHERE deck_card_id = ?2",
            existing.id,
            row.id
        )
        .execute(&mut *conn)
        .await?;
        sqlx::query!("DELETE FROM deck_cards WHERE id = ?1", row.id)
            .execute(&mut *conn)
            .await?;
        return load_deck_card_on(conn, existing.id)
            .await?
            .ok_or(DeckError::NotFound);
    }
    sqlx::query!(
        "UPDATE deck_cards SET zone = ?2, updated_at = ?3 WHERE id = ?1",
        row.id,
        zone,
        now
    )
    .execute(&mut *conn)
    .await?;
    load_deck_card_on(conn, row.id)
        .await?
        .ok_or(DeckError::NotFound)
}

async fn card_record(
    pool: &SqlitePool,
    oracle_id: &OracleId,
) -> Result<Option<CardRecord>, DeckError> {
    Ok(load_record(pool, oracle_id).await?)
}

/// `Decks.set_deck_commander/1`: the card becomes the only commander; the
/// previous commanders move to the mainboard.
pub async fn set_commander(pool: &SqlitePool, id: DeckCardId) -> Result<DeckCardRow, DeckError> {
    let mut tx = db::begin_write(pool).await?;
    let row = load_deck_card_on(&mut tx, id)
        .await?
        .ok_or(DeckError::NotFound)?;
    let deck = deck_of(&mut tx, &row).await?;
    ensure_decklist_editable(&deck)?;
    let eligible = card_record(pool, &row.oracle_id)
        .await?
        .is_some_and(|card| commander::can_be_commander(&card));
    if !eligible {
        return Err(DeckError::Code("not_commander_eligible"));
    }
    let others = crate::deck_card_row_query!(
        "WHERE dc.deck_id = ?1 AND dc.zone = 'commander' AND dc.id != ?2 ORDER BY dc.id",
        row.deck_id,
        row.id
    )
    .fetch_all(&mut *tx)
    .await?;
    for other in &others {
        move_to_zone(&mut tx, other, Zone::Mainboard).await?;
    }
    // A previous commander may have merged into this card's row.
    let row = load_deck_card_on(&mut tx, id).await?.unwrap_or(row);
    let moved = move_to_zone(&mut tx, &row, Zone::Commander).await?;
    tx.commit().await?;
    Ok(moved)
}

/// `Decks.add_deck_partner/1`: pairs the card with the deck's single
/// commander when their pairing abilities match.
pub async fn add_partner(pool: &SqlitePool, id: DeckCardId) -> Result<DeckCardRow, DeckError> {
    let mut tx = db::begin_write(pool).await?;
    let row = load_deck_card_on(&mut tx, id)
        .await?
        .ok_or(DeckError::NotFound)?;
    let deck = deck_of(&mut tx, &row).await?;
    ensure_decklist_editable(&deck)?;
    if row.zone == Zone::Commander {
        return Err(DeckError::Code("already_commander"));
    }
    let commanders = crate::deck_card_row_query!(
        "WHERE dc.deck_id = ?1 AND dc.zone = 'commander' AND dc.id != ?2 ORDER BY dc.id",
        row.deck_id,
        row.id
    )
    .fetch_all(&mut *tx)
    .await?;
    let commander_row = match commanders.as_slice() {
        [] => return Err(DeckError::Code("no_commander")),
        [one] => one,
        _ => return Err(DeckError::Code("command_zone_full")),
    };
    let candidate = card_record(pool, &row.oracle_id).await?;
    let current = card_record(pool, &commander_row.oracle_id).await?;
    let paired = match (&candidate, &current) {
        (Some(candidate), Some(current)) => commander::valid_pair(candidate, current),
        _ => false,
    };
    if !paired {
        return Err(DeckError::Code("invalid_commander_pair"));
    }
    let moved = move_to_zone(&mut tx, &row, Zone::Commander).await?;
    tx.commit().await?;
    Ok(moved)
}

/// The deck a card belongs to, failing on archived decks
/// (`EditGuard.ensure_deck_card_editable/1`), for allocation flows.
pub async fn ensure_card_editable(pool: &SqlitePool, row: &DeckCardRow) -> Result<(), DeckError> {
    let deck = crate::decks::records::get_deck(pool, row.deck_id).await?;
    ensure_deck_editable(&deck)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deck_card_changeset_messages() {
        let changes = DeckCardChanges {
            quantity: Some(Some(0)),
            zone: Some(Some("attic".into())),
            finish: Some(None),
            tag: Some(Some("maybe".into())),
            ..DeckCardChanges::default()
        };
        assert_eq!(
            validate(None, &changes).unwrap_err().to_string(),
            "finish can't be blank, quantity must be greater than 0, zone is invalid, tag is invalid"
        );
        let too_many = DeckCardChanges {
            quantity: Some(Some(10_000)),
            ..DeckCardChanges::default()
        };
        assert_eq!(
            validate(None, &too_many).unwrap_err().to_string(),
            "quantity must be less than 10000"
        );
    }
}
