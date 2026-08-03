import { graphql } from "../../gql"

// Narrow trade-specific mutation on the shared CollectionItem type: the
// existing collection UpdateCollectionItemDocument selects a much larger set
// of fields than the binder tile needs, so this trims the round trip (and the
// optimisticResponse shape) to exactly what the trade toggle reads back.
export const UpdateCollectionItemForTradeDocument = graphql(`
  mutation UpdateCollectionItemForTrade($id: ID!, $input: CollectionItemUpdateInput!) {
    updateCollectionItem(id: $id, input: $input) {
      collectionItem {
        id
        forTrade
      }
    }
  }
`)

// Independent of the binder's active search/filter state, so the header
// stat always reflects the true total of for-trade items.
export const TradeBinderCountDocument = graphql(`
  query TradeBinderCount {
    collectionItemCount(filters: { forTrade: true })
  }
`)

export const TradeWantsDocument = graphql(`
  query TradeWants {
    tradeWants {
      id
      quantity
      imageUrl
      card {
        id
        oracleId
        name
        typeLine
        manaCost
      }
      printing {
        setCode
        collectorNumber
        imageUrl
      }
    }
  }
`)

export const CreateTradeWantDocument = graphql(`
  mutation CreateTradeWant($name: String, $scryfallId: ID, $quantity: Int) {
    createTradeWant(name: $name, scryfallId: $scryfallId, quantity: $quantity) {
      tradeWant {
        id
        quantity
        imageUrl
        card {
          id
          oracleId
          name
          typeLine
          manaCost
        }
        printing {
          setCode
          collectorNumber
          imageUrl
        }
      }
    }
  }
`)

// Lightest existing pattern for "printings for a card by name": reuses the
// catalog search query (like pages/cards' CardsDocument). The backend search
// is fuzzy (e.g. "Lightning Bolt" can rank a card whose name merely contains
// it above the exact match), so this over-fetches a handful of candidates
// and the caller picks the exact (case-insensitive) name match client-side —
// same approach as pages/card-add-dialog.tsx's cardOptions.find(...).
export const TradeWantPrintingsDocument = graphql(`
  query TradeWantPrintings($name: String!) {
    cards(q: $name, first: 10) {
      edges {
        node {
          id
          name
          printings(first: 30) {
            edges {
              node {
                id
                scryfallId
                setCode
                setName
                collectorNumber
                imageUrl
                rarity
              }
            }
          }
        }
      }
    }
  }
`)

export const UpdateTradeWantDocument = graphql(`
  mutation UpdateTradeWant($id: ID!, $quantity: Int!) {
    updateTradeWant(id: $id, quantity: $quantity) {
      tradeWant {
        id
        quantity
      }
    }
  }
`)

export const DeleteTradeWantDocument = graphql(`
  mutation DeleteTradeWant($id: ID!) {
    deleteTradeWant(id: $id) {
      deletedId
    }
  }
`)

export const TradeWantsShareTokenDocument = graphql(`
  query TradeWantsShareToken {
    tradeWantsShareToken
  }
`)

export const EnsureTradeWantsShareTokenDocument = graphql(`
  mutation EnsureTradeWantsShareToken {
    ensureTradeWantsShareToken {
      token
    }
  }
`)

// Selected on both the private schema (for codegen) and the public
// /share/graphql endpoint, so the share page can query it unauthenticated.
export const WantsListDocument = graphql(`
  query WantsList($id: ID!) {
    wantsList(id: $id) {
      entries {
        cardName
        quantity
        typeLine
        setCode
        collectorNumber
        imageUrl
      }
    }
  }
`)
