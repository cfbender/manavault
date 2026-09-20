import { graphql } from "../../gql"

export const DeckCardAllocationFragment = graphql(`
  fragment DeckCardAllocation on DeckCardAllocationStatus {
    state
    required
    owned
    allocated
    proxyAllocated
    available
    allocatedElsewhere
    missing
    candidates {
      allocated
      allocatedElsewhere
      available
      item {
        id
        quantity
        finish
        condition
        language
        priceText
        location {
          id
          name
        }
        printing {
          id
          scryfallId
          setCode
          setName
          collectorNumber
          rarity
          imageUrl
          backImageUrl
          artCropUrl
          card {
            name
          }
        }
      }
    }
  }
`)

export const AllocateDeckCardItemDocument = graphql(`
  mutation AllocateDeckCardItem($deckCardId: ID!, $collectionItemId: ID!) {
    allocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
      deckCard {
        id
        allocationStatus {
          ...DeckCardAllocation @_unmask
        }
      }
    }
  }
`)

export const DeallocateDeckCardItemDocument = graphql(`
  mutation DeallocateDeckCardItem($deckCardId: ID!, $collectionItemId: ID!) {
    deallocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
      deckCard {
        id
        allocationStatus {
          ...DeckCardAllocation @_unmask
        }
      }
    }
  }
`)

export const AllocateDeckPullListDocument = graphql(`
  mutation AllocateDeckPullList($deckId: ID!, $entries: [DeckPullListEntryInput!]!) {
    allocateDeckPullList(deckId: $deckId, entries: $entries) {
      allocationResult {
        allocated
        cards
        skipped
      }
    }
  }
`)

export const AllocateDeckCardProxyDocument = graphql(`
  mutation AllocateDeckCardProxy($deckCardId: ID!, $quantity: Int!) {
    allocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {
      deckCard {
        id
        allocationStatus {
          ...DeckCardAllocation @_unmask
        }
      }
    }
  }
`)

export const DeallocateDeckCardProxyDocument = graphql(`
  mutation DeallocateDeckCardProxy($deckCardId: ID!, $quantity: Int!) {
    deallocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {
      deckCard {
        id
        allocationStatus {
          ...DeckCardAllocation @_unmask
        }
      }
    }
  }
`)
