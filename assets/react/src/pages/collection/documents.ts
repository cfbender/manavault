import { graphql } from "../../gql"

export const CollectionDocument = graphql(`
  query Collection($filters: CollectionItemFilters) {
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
          description
          itemCount
          totalPriceText
          valueSummary {
            totalPriceText
            purchasePriceText
            valueGainText
            valueGainPercentText
          }
          coverPrinting {
            id
            scryfallId
            artCropUrl
          }
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
    collectionItemCount(filters: $filters)
    collectionItemEntryCount(filters: $filters)
    allCollectionItemCount: collectionItemCount
    unfiledCollectionItemCount: collectionItemCount(filters: { locationId: "unfiled" })
    availableCollectionItemCount: collectionItemCount(filters: { unallocatedOnly: true })
    recentCollectionItemCount: collectionItemCount(filters: { addedWithinDays: 7 })
  }
`)

export const CollectionValueDashboardDocument = graphql(`
  query CollectionValueDashboard {
    pricingSettings {
      source
    }
    collectionValueDashboard {
      summary {
        totalPriceCents
        totalPriceText
        purchasePriceCents
        purchasePriceText
        valueGainCents
        valueGainText
        valueGainPercent
        valueGainPercentText
      }
      itemCount
      positionCount
      gainPositionCount
      lossPositionCount
      unchangedPositionCount
      biggestGains {
        quantity
        totalPriceCents
        totalPriceText
        purchasePriceCents
        purchasePriceText
        valueGainCents
        valueGainText
        valueGainPercent
        valueGainPercentText
        printing {
          id
          scryfallId
          setCode
          setName
          collectorNumber
          imageUrl
          card {
            id
            name
          }
        }
      }
      biggestLosses {
        quantity
        totalPriceCents
        totalPriceText
        purchasePriceCents
        purchasePriceText
        valueGainCents
        valueGainText
        valueGainPercent
        valueGainPercentText
        printing {
          id
          scryfallId
          setCode
          setName
          collectorNumber
          imageUrl
          card {
            id
            name
          }
        }
      }
    }
  }
`)

export const LocationDocument = graphql(`
  query Location($id: ID!) {
    location(id: $id) {
      id
      name
      kind
      description
      itemCount
      totalPriceText
      valueSummary {
        totalPriceText
        purchasePriceText
        valueGainText
        valueGainPercentText
      }
      coverPrinting {
        id
        scryfallId
        artCropUrl
      }
    }
  }
`)

export const LocationCollectionCountDocument = graphql(`
  query LocationCollectionCount($filters: CollectionItemFilters) {
    collectionItemCount(filters: $filters)
    collectionItemEntryCount(filters: $filters)
  }
`)

export const LocationCoverCardSearchDocument = graphql(`
  query LocationCoverCardSearch($q: String!, $first: Int!) {
    cards(q: $q, first: $first) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          oracleId
          name
          typeLine
          printings(first: 16) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                id
                scryfallId
                setCode
                setName
                collectorNumber
                finishes
                imageUrl
                artCropUrl
                rarity
              }
            }
          }
        }
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
    }
  }
`)

export const UpdateCollectionItemDocument = graphql(`
  mutation UpdateCollectionItem($id: ID!, $input: CollectionItemUpdateInput!) {
    updateCollectionItem(id: $id, input: $input) {
      collectionItem {
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

export const CreateLocationDocument = graphql(`
  mutation CreateLocation($input: LocationInput!) {
    createLocation(input: $input) {
      location {
        id
        name
        kind
        description
        itemCount
        totalPriceText
        valueSummary {
          totalPriceText
          purchasePriceText
          valueGainText
          valueGainPercentText
        }
        coverPrinting {
          id
          scryfallId
          artCropUrl
        }
      }
    }
  }
`)

export const UpdateLocationDocument = graphql(`
  mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
    updateLocation(id: $id, input: $input) {
      location {
        id
        name
        kind
        description
        itemCount
        totalPriceText
        valueSummary {
          totalPriceText
          purchasePriceText
          valueGainText
          valueGainPercentText
        }
        coverPrinting {
          id
          scryfallId
          artCropUrl
        }
      }
    }
  }
`)

export const DeleteLocationDocument = graphql(`
  mutation DeleteLocation($id: ID!) {
    deleteLocation(id: $id) {
      location {
        id
        name
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
            forTrade
            forTradeQuantity
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
        }
      }
    }
  }
`)

export const CollectionExportCsvDocument = graphql(`
  query CollectionExportCsv($filters: CollectionItemFilters) {
    collectionExportCsv(filters: $filters)
  }
`)

export const CollectionExportTextDocument = graphql(`
  query CollectionExportText($filters: CollectionItemFilters) {
    collectionExportText(filters: $filters)
  }
`)

export const PreviewCollectionImportDocument = graphql(`
  mutation PreviewCollectionImport($input: CollectionImportPreviewInput!) {
    previewCollectionImport(input: $input) {
      importPreview {
        locationId
        total
        exact
        ambiguous
        unresolved
        rows {
          rowNumber
          status
          attrs {
            name
            setCode
            collectorNumber
            quantity
            finish
            condition
            language
            scryfallId
            locationId
            purchasePriceCents
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
          candidates {
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
      }
    }
  }
`)

export const CommitCollectionImportDocument = graphql(`
  mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
    commitCollectionImport(input: $input) {
      importResult {
        imported
        skipped
        autoSorted
      }
    }
  }
`)

export const PreviewCollectionImportAutoSortDocument = graphql(`
  mutation PreviewCollectionImportAutoSort($input: CollectionImportCommitInput!) {
    previewCollectionImportAutoSort(input: $input) {
      autoSortResult {
        checkedCount
        movedCount
        skippedCount
        dryRun
        moves {
          collectionItemId
          cardName
          cardId
          setCode
          collectorNumber
          imageUrl
          quantity
          finish
          fromLocationId
          fromLocationName
          toLocationId
          toLocationName
        }
      }
    }
  }
`)

export const AutoSortCollectionDocument = graphql(`
  mutation AutoSortCollection($input: AutoSortCollectionInput) {
    autoSortCollection(input: $input) {
      autoSortResult {
        checkedCount
        movedCount
        skippedCount
        dryRun
        moves {
          collectionItemId
          cardName
          cardId
          setCode
          collectorNumber
          imageUrl
          quantity
          finish
          fromLocationId
          fromLocationName
          toLocationId
          toLocationName
        }
      }
    }
  }
`)
