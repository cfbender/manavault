//! Rows the allocation rules read, and the proof type that guards writes.

use lotus::{Condition, Finish, OracleId, ScryfallId};
use sqlx::SqliteConnection;

use crate::domain::{
    AllocationId, CollectionItemId, DeckCardId, DeckCardTag, DeckId, DeckStatus, LocationId,
    LocationKind, Quantity, Zone,
};
use crate::error::AllocationError;

/// A deck card with the deck and card facts the allocation rules need.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckCard {
    pub id: DeckCardId,
    pub deck_id: DeckId,
    pub deck_status: DeckStatus,
    pub oracle_id: OracleId,
    pub preferred_printing_id: Option<ScryfallId>,
    pub quantity: Quantity,
    pub proxy_quantity: u32,
    pub zone: Zone,
    pub finish: Finish,
    pub tag: Option<DeckCardTag>,
    pub type_line: Option<String>,
}

impl DeckCard {
    #[must_use]
    pub fn is_basic_land(&self) -> bool {
        self.type_line.as_deref().is_some_and(lotus::is_basic_land)
    }

    /// Archived decks are frozen; every allocation change checks this first.
    pub fn ensure_editable(&self) -> Result<(), AllocationError> {
        match self.deck_status {
            DeckStatus::Archived => Err(AllocationError::DeckArchived),
            DeckStatus::Brewing | DeckStatus::Active => Ok(()),
        }
    }

    /// Checks that this card may hold physical copies and returns the proof
    /// that the allocation write path requires.
    pub fn allocatable(self) -> Result<AllocatableDeckCard, AllocationError> {
        self.ensure_editable()?;
        match self.zone {
            Zone::Considering => Err(AllocationError::ConsideringNotAllocatable),
            Zone::Mainboard | Zone::Commander => Ok(AllocatableDeckCard(self)),
        }
    }
}

/// A deck card that is known to be in an editable deck and outside the
/// considering zone.
///
/// The field is private to this module, so [`DeckCard::allocatable`] is the
/// only way to obtain one. Functions that insert allocations take this type,
/// which means a new allocation path cannot skip the zone or archive check
/// and still compile:
///
/// ```compile_fail
/// # fn bypass(card: manavault_allocation::DeckCard) {
/// // error[E0423]: cannot initialize a tuple struct which contains private fields
/// let _ = manavault_allocation::AllocatableDeckCard(card);
/// # }
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AllocatableDeckCard(DeckCard);

impl AllocatableDeckCard {
    #[must_use]
    pub fn deck_card(&self) -> &DeckCard {
        &self.0
    }
}

/// A collection item with its printing's card and its location's kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollectionItem {
    pub id: CollectionItemId,
    pub scryfall_id: ScryfallId,
    pub oracle_id: OracleId,
    pub quantity: Quantity,
    pub condition: Condition,
    pub language: String,
    pub finish: Finish,
    pub location_id: Option<LocationId>,
    pub location_kind: Option<LocationKind>,
    pub notes: Option<String>,
    pub purchase_price_cents: Option<i64>,
    pub acquisition_market_price_cents: Option<i64>,
}

/// Physical copies of one collection item reserved for one deck card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckAllocation {
    pub id: AllocationId,
    pub deck_card_id: DeckCardId,
    pub collection_item_id: CollectionItemId,
    pub source_location_id: Option<LocationId>,
    pub quantity: Quantity,
}

/// The outcome of releasing copies from a deck card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Deallocation {
    /// Every reserved copy was returned and the allocation was deleted.
    Released(DeckAllocation),
    /// Some copies were returned; the allocation keeps the rest.
    Reduced(DeckAllocation),
}

pub(crate) async fn load_deck_card(
    conn: &mut SqliteConnection,
    id: DeckCardId,
) -> Result<Option<DeckCard>, sqlx::Error> {
    sqlx::query_as!(
        DeckCard,
        r#"
        SELECT
          dc.id AS "id!: DeckCardId",
          dc.deck_id AS "deck_id: DeckId",
          d.status AS "deck_status: DeckStatus",
          dc.oracle_id AS "oracle_id: OracleId",
          dc.preferred_printing_id AS "preferred_printing_id: ScryfallId",
          dc.quantity AS "quantity: Quantity",
          dc.proxy_quantity AS "proxy_quantity: u32",
          dc.zone AS "zone: Zone",
          dc.finish AS "finish: Finish",
          dc.tag AS "tag: DeckCardTag",
          c.type_line
        FROM deck_cards dc
        JOIN decks d ON d.id = dc.deck_id
        JOIN scryfall_cards c ON c.oracle_id = dc.oracle_id
        WHERE dc.id = ?1
        "#,
        id
    )
    .fetch_optional(conn)
    .await
}

pub(crate) async fn load_collection_item(
    conn: &mut SqliteConnection,
    id: CollectionItemId,
) -> Result<Option<CollectionItem>, sqlx::Error> {
    sqlx::query_as!(
        CollectionItem,
        r#"
        SELECT
          ci.id AS "id!: CollectionItemId",
          ci.scryfall_id AS "scryfall_id: ScryfallId",
          p.oracle_id AS "oracle_id: OracleId",
          ci.quantity AS "quantity: Quantity",
          ci.condition AS "condition: Condition",
          ci.language,
          ci.finish AS "finish: Finish",
          ci.location_id AS "location_id: LocationId",
          l.kind AS "location_kind?: LocationKind",
          ci.notes,
          ci.purchase_price_cents,
          ci.acquisition_market_price_cents
        FROM collection_items ci
        JOIN scryfall_printings p ON p.scryfall_id = ci.scryfall_id
        LEFT JOIN locations l ON l.id = ci.location_id
        WHERE ci.id = ?1
        "#,
        id
    )
    .fetch_optional(conn)
    .await
}

/// A deck with the facts the allocation rules check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Deck {
    pub id: DeckId,
    pub name: String,
    pub status: DeckStatus,
    /// `moxfield`/`archidekt` when the card list is synced from a remote deck.
    pub external_source: Option<String>,
}

impl Deck {
    /// Archived decks are frozen (`EditGuard.ensure_deck_editable/1`).
    pub fn ensure_editable(&self) -> Result<(), AllocationError> {
        match self.status {
            DeckStatus::Archived => Err(AllocationError::DeckArchived),
            DeckStatus::Brewing | DeckStatus::Active => Ok(()),
        }
    }

    /// Additionally refuses decks whose card list belongs to a linked remote
    /// deck (`EditGuard.ensure_decklist_editable/1`). Allocation-only changes
    /// use [`Deck::ensure_editable`], so linked decks can still reserve copies.
    pub fn ensure_decklist_editable(&self) -> Result<(), AllocationError> {
        self.ensure_editable()?;
        if self.external_source.is_some() {
            Err(AllocationError::DeckLinked)
        } else {
            Ok(())
        }
    }
}

/// A deck card with its card's name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NamedDeckCard {
    pub card: DeckCard,
    pub name: String,
}

pub(crate) async fn load_deck(
    conn: &mut SqliteConnection,
    id: DeckId,
) -> Result<Option<Deck>, sqlx::Error> {
    sqlx::query_as!(
        Deck,
        r#"
        SELECT
          id AS "id!: DeckId",
          name,
          status AS "status: DeckStatus",
          external_source
        FROM decks
        WHERE id = ?1
        "#,
        id
    )
    .fetch_optional(conn)
    .await
}

pub(crate) async fn require_deck(
    conn: &mut SqliteConnection,
    id: DeckId,
) -> Result<Deck, AllocationError> {
    load_deck(conn, id)
        .await?
        .ok_or(AllocationError::DeckNotFound)
}

pub(crate) async fn require_deck_card(
    conn: &mut SqliteConnection,
    id: DeckCardId,
) -> Result<DeckCard, AllocationError> {
    load_deck_card(conn, id)
        .await?
        .ok_or(AllocationError::DeckCardNotFound)
}

struct NamedDeckCardRow {
    id: DeckCardId,
    deck_id: DeckId,
    deck_status: DeckStatus,
    oracle_id: OracleId,
    preferred_printing_id: Option<ScryfallId>,
    quantity: Quantity,
    proxy_quantity: u32,
    zone: Zone,
    finish: Finish,
    tag: Option<DeckCardTag>,
    type_line: Option<String>,
    name: String,
}

impl From<NamedDeckCardRow> for NamedDeckCard {
    fn from(row: NamedDeckCardRow) -> Self {
        Self {
            card: DeckCard {
                id: row.id,
                deck_id: row.deck_id,
                deck_status: row.deck_status,
                oracle_id: row.oracle_id,
                preferred_printing_id: row.preferred_printing_id,
                quantity: row.quantity,
                proxy_quantity: row.proxy_quantity,
                zone: row.zone,
                finish: row.finish,
                tag: row.tag,
                type_line: row.type_line,
            },
            name: row.name,
        }
    }
}

/// Every card of a deck, ordered like the deck page (`Decks.Preloads`):
/// zone, card name, id.
pub(crate) async fn load_deck_cards(
    conn: &mut SqliteConnection,
    deck_id: DeckId,
) -> Result<Vec<NamedDeckCard>, sqlx::Error> {
    let rows = sqlx::query_as!(
        NamedDeckCardRow,
        r#"
        SELECT
          dc.id AS "id!: DeckCardId",
          dc.deck_id AS "deck_id: DeckId",
          d.status AS "deck_status: DeckStatus",
          dc.oracle_id AS "oracle_id: OracleId",
          dc.preferred_printing_id AS "preferred_printing_id: ScryfallId",
          dc.quantity AS "quantity: Quantity",
          dc.proxy_quantity AS "proxy_quantity: u32",
          dc.zone AS "zone: Zone",
          dc.finish AS "finish: Finish",
          dc.tag AS "tag: DeckCardTag",
          c.type_line,
          c.name
        FROM deck_cards dc
        JOIN decks d ON d.id = dc.deck_id
        JOIN scryfall_cards c ON c.oracle_id = dc.oracle_id
        WHERE dc.deck_id = ?1
        ORDER BY dc.zone, c.name, dc.id
        "#,
        deck_id
    )
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().map(NamedDeckCard::from).collect())
}

/// Deck cards by id, in no particular order.
pub(crate) async fn load_deck_cards_by_ids(
    conn: &mut SqliteConnection,
    ids: &[DeckCardId],
) -> Result<Vec<DeckCard>, sqlx::Error> {
    let ids = crate::json::id_list(ids.iter().map(|id| id.0));
    sqlx::query_as!(
        DeckCard,
        r#"
        SELECT
          dc.id AS "id!: DeckCardId",
          dc.deck_id AS "deck_id: DeckId",
          d.status AS "deck_status: DeckStatus",
          dc.oracle_id AS "oracle_id: OracleId",
          dc.preferred_printing_id AS "preferred_printing_id: ScryfallId",
          dc.quantity AS "quantity: Quantity",
          dc.proxy_quantity AS "proxy_quantity: u32",
          dc.zone AS "zone: Zone",
          dc.finish AS "finish: Finish",
          dc.tag AS "tag: DeckCardTag",
          c.type_line
        FROM deck_cards dc
        JOIN decks d ON d.id = dc.deck_id
        JOIN scryfall_cards c ON c.oracle_id = dc.oracle_id
        WHERE dc.id IN (SELECT value FROM json_each(?1))
        "#,
        ids
    )
    .fetch_all(conn)
    .await
}

/// Collection items by id, in no particular order.
pub(crate) async fn load_collection_items(
    conn: &mut SqliteConnection,
    ids: &[CollectionItemId],
) -> Result<Vec<CollectionItem>, sqlx::Error> {
    let ids = crate::json::id_list(ids.iter().map(|id| id.0));
    sqlx::query_as!(
        CollectionItem,
        r#"
        SELECT
          ci.id AS "id!: CollectionItemId",
          ci.scryfall_id AS "scryfall_id: ScryfallId",
          p.oracle_id AS "oracle_id: OracleId",
          ci.quantity AS "quantity: Quantity",
          ci.condition AS "condition: Condition",
          ci.language,
          ci.finish AS "finish: Finish",
          ci.location_id AS "location_id: LocationId",
          l.kind AS "location_kind?: LocationKind",
          ci.notes,
          ci.purchase_price_cents,
          ci.acquisition_market_price_cents
        FROM collection_items ci
        JOIN scryfall_printings p ON p.scryfall_id = ci.scryfall_id
        LEFT JOIN locations l ON l.id = ci.location_id
        WHERE ci.id IN (SELECT value FROM json_each(?1))
        "#,
        ids
    )
    .fetch_all(conn)
    .await
}

/// The allocations held by a deck card, oldest first.
pub(crate) async fn load_allocations(
    conn: &mut SqliteConnection,
    deck_card_id: DeckCardId,
) -> Result<Vec<DeckAllocation>, sqlx::Error> {
    sqlx::query_as!(
        DeckAllocation,
        r#"
        SELECT
          id AS "id!: AllocationId",
          deck_card_id AS "deck_card_id: DeckCardId",
          collection_item_id AS "collection_item_id: CollectionItemId",
          source_location_id AS "source_location_id: LocationId",
          quantity AS "quantity: Quantity"
        FROM deck_allocations
        WHERE deck_card_id = ?1
        ORDER BY id
        "#,
        deck_card_id
    )
    .fetch_all(conn)
    .await
}
