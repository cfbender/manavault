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
          ci.purchase_price_cents
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
