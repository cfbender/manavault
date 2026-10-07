//! Which deck cards still need copies bought (`Decks.Buylist`, without the
//! printing and price choice, which needs the catalog's price sources).

use sqlx::SqlitePool;

use crate::domain::{DeckCardTag, DeckId, Quantity, Zone};
use crate::error::AllocationError;
use crate::model::{DeckCard, load_deck_cards, require_deck};
use crate::status;

/// `deckBuylist` options.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BuylistOptions {
    /// Ask for basic lands too (only matters with `assume_no_owned`: owned
    /// or not, basic lands always count as allocated).
    pub include_basic_lands: bool,
    /// Ignore the collection: every copy is needed.
    pub assume_no_owned: bool,
    /// Include the considering zone (mainboard and commander always count).
    pub include_considering: bool,
}

/// Why copies are on the buylist.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuylistReason {
    /// No copies owned for some, all owned copies reserved for the rest.
    MissingAndUnavailable,
    Missing,
    /// Owned, but reserved by other decks.
    Unavailable,
    Available,
}

impl BuylistReason {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::MissingAndUnavailable => "missing and unavailable",
            Self::Missing => "missing",
            Self::Unavailable => "unavailable",
            Self::Available => "available",
        }
    }

    fn of(missing: u32, unavailable: u32) -> Self {
        match (missing > 0, unavailable > 0) {
            (true, true) => Self::MissingAndUnavailable,
            (true, false) => Self::Missing,
            (false, true) => Self::Unavailable,
            (false, false) => Self::Available,
        }
    }
}

/// A deck card that still needs `quantity` copies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuylistNeed {
    pub deck_card: DeckCard,
    pub card_name: String,
    /// Copies to buy: required minus allocated minus available.
    pub quantity: Quantity,
    /// Copies not owned at all.
    pub missing: u32,
    /// Copies owned but reserved elsewhere.
    pub unavailable: u32,
    pub reason: BuylistReason,
}

/// The deck cards that need copies, in deck order (zone, name, id). Cards
/// tagged "getting" are already on their way and are left out.
pub async fn deck_buylist_needs(
    pool: &SqlitePool,
    deck_id: DeckId,
    options: BuylistOptions,
) -> Result<Vec<BuylistNeed>, AllocationError> {
    let mut conn = pool.acquire().await?;
    require_deck(&mut conn, deck_id).await?;
    let cards: Vec<_> = load_deck_cards(&mut conn, deck_id)
        .await?
        .into_iter()
        .filter(|named| match named.card.zone {
            Zone::Mainboard | Zone::Commander => true,
            Zone::Considering => options.include_considering,
        })
        .filter(|named| named.card.tag != Some(DeckCardTag::Getting))
        .collect();

    let statuses = if options.assume_no_owned {
        None
    } else {
        let deck_cards: Vec<DeckCard> = cards.iter().map(|named| named.card.clone()).collect();
        Some(status::load_statuses(&mut conn, &deck_cards).await?)
    };

    let mut needs = Vec::new();
    for named in cards {
        let card = &named.card;
        let (needed, elsewhere) = match &statuses {
            None => (card.quantity.get(), 0),
            Some(statuses) => match statuses.get(&card.id) {
                Some(status) => (
                    status
                        .required
                        .saturating_sub(status.allocated)
                        .saturating_sub(status.available),
                    status.allocated_elsewhere,
                ),
                None => continue,
            },
        };
        let Some(quantity) = Quantity::new(needed) else {
            continue;
        };
        if card.is_basic_land() && !options.include_basic_lands {
            continue;
        }
        let unavailable = needed.min(elsewhere);
        let missing = needed.saturating_sub(unavailable);
        needs.push(BuylistNeed {
            deck_card: named.card,
            card_name: named.name,
            quantity,
            missing,
            unavailable,
            reason: BuylistReason::of(missing, unavailable),
        });
    }
    Ok(needs)
}
