import { graphql } from "../../../gql"

export const CollectionItemFieldsFragment = graphql(`
  fragment CollectionItemFields on CollectionItem {
    id
    quantity
    condition
    language
    finish
    notes
    priceText
    purchasePriceCents
    purchasePriceText
    valueGainText
    valueGainPercentText
    allocatedQuantity
    allocationDecks {
      quantity
      deck {
        id
        name
      }
    }
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
      imageUrl
      rarity
      card {
        id
        oracleId
        name
        typeLine
      }
    }
  }
`)

export const CollectionItemFormOptionsDocument = graphql(`
  query CollectionItemFormOptions {
    locations(first: 100) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          name
          kind
        }
      }
    }
    collectionAutoSortRules {
      id
      name
      enabled
      priority
      targetLocation {
        id
        name
        kind
      }
    }
  }
`)

export const CollectionItemPrintingsDocument = graphql(`
  query CollectionItemPrintings($cardId: ID!) {
    card(id: $cardId) {
      printings(first: 300) {
        edges {
          node {
            id
            setCode
            setName
            collectorNumber
            rarity
            finishes
          }
        }
      }
    }
  }
`)

export const CollectionItemDeckOptionsDocument = graphql(`
  query CollectionItemDeckOptions {
    decks(first: 100) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          name
          format
          status
        }
      }
    }
  }
`)

export const CreateCollectionItemDocument = graphql(`
  mutation CreateCollectionItem($input: CollectionItemInput!) {
    createCollectionItem(input: $input) {
      collectionItem {
        ...CollectionItemFields
      }
    }
  }
`)

export const UpdateCollectionItemDocument = graphql(`
  mutation UpdateCollectionItem($id: ID!, $input: CollectionItemUpdateInput!) {
    updateCollectionItem(id: $id, input: $input) {
      collectionItem {
        ...CollectionItemFields
      }
    }
  }
`)

export const BulkUpdateCollectionItemsDocument = graphql(`
  mutation BulkUpdateCollectionItems(
    $selector: CollectionItemSelector!
    $input: CollectionItemUpdateInput!
  ) {
    bulkUpdateCollectionItems(selector: $selector, input: $input) {
      updatedCount
    }
  }
`)

export const BulkDeleteCollectionItemsDocument = graphql(`
  mutation BulkDeleteCollectionItems($selector: CollectionItemSelector!) {
    bulkDeleteCollectionItems(selector: $selector) {
      deletedCount
    }
  }
`)

export const DeleteCollectionItemDocument = graphql(`
  mutation DeleteCollectionItem($id: ID!) {
    deleteCollectionItem(id: $id) {
      collectionItem {
        id
      }
    }
  }
`)

export const AddCollectionItemToDeckDocument = graphql(`
  mutation AddCollectionItemToDeck($id: ID!, $deckId: ID!, $zone: String) {
    addCollectionItemToDeck(id: $id, deckId: $deckId, zone: $zone) {
      deckCard {
        id
        quantity
        zone
        finish
        card {
          id
          oracleId
          name
        }
        preferredPrinting {
          id
          scryfallId
          setCode
          collectorNumber
          imageUrl
        }
      }
    }
  }
`)

export const BulkAddCollectionItemsToDeckDocument = graphql(`
  mutation BulkAddCollectionItemsToDeck(
    $selector: CollectionItemSelector!
    $deckId: ID!
    $zone: String
  ) {
    bulkAddCollectionItemsToDeck(selector: $selector, deckId: $deckId, zone: $zone) {
      deckCards {
        id
        quantity
        zone
        finish
        card {
          id
          oracleId
          name
        }
        preferredPrinting {
          id
          scryfallId
          setCode
          collectorNumber
          imageUrl
        }
      }
    }
  }
`)

export const CollectionItemGroupsPageDocument = graphql(`
  query CollectionItemGroupsPage(
    $filters: CollectionItemFilters
    $sort: CollectionItemSort
    $first: Int!
    $after: String
  ) {
    collectionItemGroups(first: $first, after: $after, filters: $filters, sort: $sort) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          quantity
          printingId
          items {
            ...CollectionItemFields
            forTrade
            forTradeQuantity
          }
        }
      }
    }
  }
`)
