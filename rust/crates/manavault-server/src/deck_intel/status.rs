//! `DeckCardAllocationStatus`.

use manavault_allocation::{AllocationState, AllocationStatus, Zone};

/// A deck card's allocation status, or a suggested card's collection status.
///
/// `candidates` (a list of `DeckCardAllocationCandidate`, which embeds
/// `CollectionItem`) is added at integration from [`Self::status`]'s
/// `candidates`, each holding the collection item row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckCardAllocationStatus {
    pub status: AllocationStatus,
    state: &'static str,
    deck_zone: Option<Zone>,
}

/// The `state` strings of the Elixir status maps.
#[must_use]
pub fn state_name(state: AllocationState) -> &'static str {
    match state {
        AllocationState::BasicLand => "basic_land",
        AllocationState::Allocated => "allocated",
        AllocationState::Available => "available",
        AllocationState::Partial => "partial",
        AllocationState::Missing => "missing",
    }
}

impl DeckCardAllocationStatus {
    #[must_use]
    pub fn new(status: AllocationStatus) -> Self {
        Self {
            state: state_name(status.state),
            status,
            deck_zone: None,
        }
    }

    /// A suggested card that is already in the deck: its deck card's status,
    /// presented as `allocated` with the zone it sits in
    /// (`EDHRec.Response.CollectionStatus.status/2`).
    #[must_use]
    pub fn in_deck(status: AllocationStatus, zone: Zone) -> Self {
        Self {
            status,
            state: "allocated",
            deck_zone: Some(zone),
        }
    }

    /// A suggested card that is not in the local catalog.
    #[must_use]
    pub fn unknown_card() -> Self {
        Self::new(AllocationStatus {
            state: AllocationState::Missing,
            required: 1,
            owned: 0,
            allocated: 0,
            proxy_allocated: 0,
            available: 0,
            allocated_elsewhere: 0,
            missing: 1,
            candidates: Vec::new(),
        })
    }

    #[must_use]
    pub fn state_str(&self) -> &'static str {
        self.state
    }
}

impl From<DeckCardAllocationStatus> for crate::decks::DeckCardAllocationStatus {
    /// Presents a crate status through the deck module's
    /// `DeckCardAllocationStatus` GraphQL type, so both share one type name.
    fn from(value: DeckCardAllocationStatus) -> Self {
        use crate::decks::allocations::{AllocationState as State, AllocationStatus as Status};
        let state = match value.state {
            "basic_land" => State::BasicLand,
            "allocated" => State::Allocated,
            "available" => State::Available,
            "partial" => State::Partial,
            _ => State::Missing,
        };
        Self(Status {
            state,
            required: value.status.required,
            owned: value.status.owned,
            allocated: value.status.allocated,
            proxy_allocated: value.status.proxy_allocated,
            available: value.status.available,
            allocated_elsewhere: value.status.allocated_elsewhere,
            missing: value.status.missing,
            deck_zone: value.deck_zone,
            candidates: Vec::new(),
        })
    }
}
