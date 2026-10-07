//! Staged mainboard cuts and adds applied as one swap
//! (`Decks.SwapDeckCards`).
//!
//! [`preview`] applies the swap to the decklist in memory and evaluates
//! legality, so the Swap cards workbench shows the deck page's rules;
//! [`apply`] commits every cut and add in one transaction.

use std::collections::{HashMap, HashSet};

use lotus::{OracleId, Zone};
use sqlx::{SqliteConnection, SqlitePool};

use crate::catalog::card::CardRecord;
use crate::catalog::search::cards_by_name;
use crate::db;
use crate::decks::cards::{self, CardRef, DeckCardChanges, NewDeckCard};
use crate::decks::contents::load_deck_contents;
use crate::decks::legality::{self, DeckLegality, LegalityCard};
use crate::decks::model::{
    DeckCardId, DeckCardRow, DeckCardTag, DeckId, DeckRow, load_deck_card_on,
};
use crate::decks::records::get_deck;
use crate::decks::{DeckError, ensure_decklist_editable};

/// Where cut copies go.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CutDestination {
    /// Delete the copies.
    #[default]
    Remove,
    /// Move the copies to the Considering board.
    Considering,
}

/// `DeckSwapCutInput`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SwapCut {
    pub deck_card_id: DeckCardId,
    pub quantity: i64,
    pub destination: CutDestination,
}

/// `DeckSwapAddInput`: a Considering card to move into the mainboard, or a
/// card name to add.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SwapAdd {
    pub deck_card_id: Option<DeckCardId>,
    pub name: Option<String>,
    pub quantity: i64,
}

/// `DeckSwapInput`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Swap {
    pub cuts: Vec<SwapCut>,
    pub adds: Vec<SwapAdd>,
}

#[derive(Debug, Clone)]
struct Cut {
    id: DeckCardId,
    quantity: u32,
    destination: CutDestination,
}

#[derive(Debug, Clone)]
enum Add {
    Existing { id: DeckCardId, quantity: u32 },
    Named { name: String, quantity: u32 },
}

impl Add {
    fn quantity(&self) -> u32 {
        match self {
            Self::Existing { quantity, .. } | Self::Named { quantity, .. } => *quantity,
        }
    }
}

fn positive(quantity: i64) -> Option<u32> {
    u32::try_from(quantity)
        .ok()
        .filter(|quantity| *quantity > 0)
}

fn normalize(swap: &Swap) -> Result<(Vec<Cut>, Vec<Add>), DeckError> {
    if swap.cuts.is_empty() && swap.adds.is_empty() {
        return Err(DeckError::Code("empty_swap"));
    }
    let invalid = || DeckError::Code("invalid_swap");
    let cuts = swap
        .cuts
        .iter()
        .map(|cut| {
            positive(cut.quantity)
                .map(|quantity| Cut {
                    id: cut.deck_card_id,
                    quantity,
                    destination: cut.destination,
                })
                .ok_or_else(invalid)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let adds = swap
        .adds
        .iter()
        .map(|add| {
            let quantity = positive(add.quantity).ok_or_else(invalid)?;
            match (&add.deck_card_id, &add.name) {
                (Some(id), _) => Ok(Add::Existing { id: *id, quantity }),
                (None, Some(name)) if !name.trim().is_empty() => Ok(Add::Named {
                    name: name.trim().to_owned(),
                    quantity,
                }),
                _ => Err(invalid()),
            }
        })
        .collect::<Result<Vec<_>, _>>()?;

    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    let duplicate = cuts.iter().any(|cut| !ids.insert(cut.id))
        || adds.iter().any(|add| match add {
            Add::Existing { id, .. } => !ids.insert(*id),
            Add::Named { name, .. } => !names.insert(cards_by_name::key(name)),
        });
    if duplicate {
        return Err(DeckError::Code("duplicate_swap_entry"));
    }
    Ok((cuts, adds))
}

fn validate_references(
    rows: &HashMap<DeckCardId, &DeckCardRow>,
    cuts: &[Cut],
    adds: &[Add],
) -> Result<(), DeckError> {
    let references =
        cuts.iter()
            .map(|cut| (cut.id, cut.quantity, true))
            .chain(adds.iter().filter_map(|add| match add {
                Add::Existing { id, quantity } => Some((*id, *quantity, false)),
                Add::Named { .. } => None,
            }));
    for (id, quantity, is_cut) in references {
        let row = rows.get(&id).ok_or(DeckError::NotFound)?;
        if is_cut && row.zone == Zone::Considering {
            return Err(DeckError::Code("swap_cut_not_in_deck"));
        }
        if !is_cut && row.zone != Zone::Considering {
            return Err(DeckError::Code("swap_add_not_considering"));
        }
        if quantity > row.quantity.get() {
            return Err(DeckError::Code("swap_quantity_exceeds_deck_card"));
        }
    }
    Ok(())
}

/// `DeckSwapPreview`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SwapPreview {
    pub legality: DeckLegality,
    pub card_count: u32,
    pub unresolved_names: Vec<String>,
}

/// `Decks.preview_deck_swap/2`: the swapped list's legality and count,
/// without writing. Cut copies leave the counted deck whether they are
/// removed or moved to Considering.
pub async fn preview(
    pool: &SqlitePool,
    deck_id: DeckId,
    swap: &Swap,
) -> Result<SwapPreview, DeckError> {
    let deck = get_deck(pool, deck_id).await?;
    let contents = load_deck_contents(pool, deck_id).await?;
    let (cuts, adds) = normalize(swap)?;
    let rows: HashMap<DeckCardId, &DeckCardRow> = contents
        .cards
        .iter()
        .map(|card| (card.row.id, &card.row))
        .collect();
    validate_references(&rows, &cuts, &adds)?;

    let cut_quantities: HashMap<DeckCardId, u32> =
        cuts.iter().map(|cut| (cut.id, cut.quantity)).collect();
    let cards_by_id: HashMap<DeckCardId, &CardRecord> = contents
        .cards
        .iter()
        .map(|card| (card.row.id, card.card.as_ref()))
        .collect();

    let mut named: Vec<(u32, Option<CardRecord>, String)> = Vec::new();
    for add in &adds {
        if let Add::Named { name, quantity } = add {
            named.push((
                *quantity,
                cards_by_name::find(pool, name).await?,
                name.clone(),
            ));
        }
    }

    let mut cards: Vec<LegalityCard<'_>> = contents
        .cards
        .iter()
        .filter_map(|card| {
            let remaining = card
                .row
                .quantity
                .get()
                .saturating_sub(cut_quantities.get(&card.row.id).copied().unwrap_or(0));
            (remaining > 0).then_some(LegalityCard {
                oracle_id: &card.row.oracle_id,
                zone: card.row.zone,
                quantity: remaining,
                card: Some(card.card.as_ref()),
            })
        })
        .collect();
    let mut unresolved_names = Vec::new();
    let mut named_iter = named.iter();
    for add in &adds {
        match add {
            Add::Existing { id, .. } => {
                if let (Some(card), Some(row)) = (cards_by_id.get(id), rows.get(id)) {
                    cards.push(added(&row.oracle_id, add.quantity(), card));
                }
            }
            Add::Named { .. } => {
                if let Some((quantity, card, name)) = named_iter.next() {
                    match card {
                        Some(card) => cards.push(added(&card.oracle_id, *quantity, card)),
                        None => unresolved_names.push(name.clone()),
                    }
                }
            }
        }
    }
    let card_count = cards
        .iter()
        .filter(|card| card.zone.in_deck())
        .fold(0u32, |sum, card| sum.saturating_add(card.quantity));
    Ok(SwapPreview {
        legality: legality::evaluate(deck.format, &cards),
        card_count,
        unresolved_names,
    })
}

fn added<'a>(oracle_id: &'a OracleId, quantity: u32, card: &'a CardRecord) -> LegalityCard<'a> {
    LegalityCard {
        oracle_id,
        zone: Zone::Mainboard,
        quantity,
        card: Some(card),
    }
}

/// `Decks.apply_deck_swap/2`: every cut and add, or none.
pub async fn apply(pool: &SqlitePool, deck_id: DeckId, swap: &Swap) -> Result<DeckRow, DeckError> {
    let deck = get_deck(pool, deck_id).await?;
    ensure_decklist_editable(&deck)?;
    let (cuts, adds) = normalize(swap)?;
    let mut tx = db::begin_write(pool).await?;
    let rows = crate::decks::model::deck_card_rows(&mut tx, deck_id).await?;
    let by_id: HashMap<DeckCardId, &DeckCardRow> = rows.iter().map(|row| (row.id, row)).collect();
    validate_references(&by_id, &cuts, &adds)?;
    for cut in &cuts {
        apply_cut(&mut tx, pool, &deck, cut).await?;
    }
    for add in &adds {
        apply_add(&mut tx, pool, &deck, add).await?;
    }
    let deck = crate::decks::model::load_deck_on(&mut tx, deck_id)
        .await?
        .ok_or(DeckError::DeckNotFound)?;
    tx.commit().await?;
    Ok(deck)
}

async fn zone_row_exists(
    conn: &mut SqliteConnection,
    row: &DeckCardRow,
    zone: Zone,
) -> Result<bool, sqlx::Error> {
    Ok(crate::deck_card_row_query!(
        "WHERE dc.deck_id = ?1 AND dc.oracle_id = ?2 AND dc.zone = ?3 LIMIT 1",
        row.deck_id,
        row.oracle_id,
        zone
    )
    .fetch_optional(conn)
    .await?
    .is_some())
}

async fn load(conn: &mut SqliteConnection, id: DeckCardId) -> Result<DeckCardRow, DeckError> {
    load_deck_card_on(conn, id)
        .await?
        .ok_or(DeckError::NotFound)
}

fn move_to(zone: Zone) -> DeckCardChanges {
    DeckCardChanges {
        zone: Some(Some(zone.as_str().to_owned())),
        ..DeckCardChanges::default()
    }
}

async fn apply_cut(
    conn: &mut SqliteConnection,
    pool: &SqlitePool,
    deck: &DeckRow,
    cut: &Cut,
) -> Result<(), DeckError> {
    let row = load(conn, cut.id).await?;
    let considering = cut.destination == CutDestination::Considering;
    if considering
        && cut.quantity == row.quantity.get()
        && !zone_row_exists(conn, &row, Zone::Considering).await?
    {
        let tag = match row.tag {
            Some(DeckCardTag::ConsiderCutting) | None => None,
            Some(tag) => Some(tag.as_str().to_owned()),
        };
        let changes = DeckCardChanges {
            tag: Some(tag),
            ..move_to(Zone::Considering)
        };
        cards::update_in(conn, pool, &row, &changes).await?;
        return Ok(());
    }
    reduce_or_delete(conn, pool, &row, cut.quantity).await?;
    if considering {
        add_copies(conn, pool, deck, &row, cut.quantity, Zone::Considering).await?;
    }
    Ok(())
}

async fn apply_add(
    conn: &mut SqliteConnection,
    pool: &SqlitePool,
    deck: &DeckRow,
    add: &Add,
) -> Result<(), DeckError> {
    match add {
        Add::Named { name, quantity } => {
            let new = NewDeckCard {
                card: CardRef::Name(name.clone()),
                changes: DeckCardChanges {
                    quantity: Some(Some(i64::from(*quantity))),
                    ..move_to(Zone::Mainboard)
                },
            };
            cards::add_card_in(conn, pool, deck, &new).await?;
        }
        Add::Existing { id, quantity } => {
            let row = load(conn, *id).await?;
            if *quantity == row.quantity.get()
                && !zone_row_exists(conn, &row, Zone::Mainboard).await?
            {
                cards::update_in(conn, pool, &row, &move_to(Zone::Mainboard)).await?;
            } else {
                reduce_or_delete(conn, pool, &row, *quantity).await?;
                add_copies(conn, pool, deck, &row, *quantity, Zone::Mainboard).await?;
            }
        }
    }
    Ok(())
}

/// Deletes the card when every copy goes, else lowers its quantity and
/// releases the copies that no longer fit.
async fn reduce_or_delete(
    conn: &mut SqliteConnection,
    pool: &SqlitePool,
    row: &DeckCardRow,
    cut: u32,
) -> Result<(), DeckError> {
    if cut >= row.quantity.get() {
        return cards::delete_checked_in(conn, row).await;
    }
    let changes = DeckCardChanges {
        quantity: Some(Some(row.quantity.as_i64() - i64::from(cut))),
        ..DeckCardChanges::default()
    };
    cards::update_in(conn, pool, row, &changes).await?;
    crate::decks::allocations::trim(conn, row.id).await
}

async fn add_copies(
    conn: &mut SqliteConnection,
    pool: &SqlitePool,
    deck: &DeckRow,
    source: &DeckCardRow,
    quantity: u32,
    zone: Zone,
) -> Result<(), DeckError> {
    let new = NewDeckCard {
        card: CardRef::Oracle(source.oracle_id.clone()),
        changes: DeckCardChanges {
            quantity: Some(Some(i64::from(quantity))),
            finish: Some(Some(source.finish.as_str().to_owned())),
            preferred_printing_id: source.preferred_printing_id.clone().map(Some),
            ..move_to(zone)
        },
    };
    cards::add_card_in(conn, pool, deck, &new).await?;
    Ok(())
}
