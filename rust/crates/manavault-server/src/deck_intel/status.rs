//! `DeckCardAllocationStatus`.

use async_graphql::Object;
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

#[Object]
impl DeckCardAllocationStatus {
    async fn state(&self) -> &str {
        self.state
    }

    async fn required(&self) -> i64 {
        i64::from(self.status.required)
    }

    async fn owned(&self) -> i64 {
        i64::from(self.status.owned)
    }

    async fn allocated(&self) -> i64 {
        i64::from(self.status.allocated)
    }

    async fn proxy_allocated(&self) -> i64 {
        i64::from(self.status.proxy_allocated)
    }

    async fn available(&self) -> i64 {
        i64::from(self.status.available)
    }

    async fn allocated_elsewhere(&self) -> i64 {
        i64::from(self.status.allocated_elsewhere)
    }

    async fn missing(&self) -> i64 {
        i64::from(self.status.missing)
    }

    async fn deck_zone(&self) -> Option<&str> {
        self.deck_zone.map(Zone::as_str)
    }
}
