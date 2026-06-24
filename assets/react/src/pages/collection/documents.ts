import { graphql } from "../../gql"
import { CollectionItemsPageDocument as GeneratedCollectionItemsPageDocument } from "../../gql/graphql"

export const CollectionDocument = graphql(`
  query Collection($filters: CollectionItemFilters) {
    locations {
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
        scryfallId
        artCropUrl
      }
    }
    collectionValueSummary {
      totalPriceText
      purchasePriceText
      valueGainText
      valueGainPercentText
    }
    collectionItemCount(filters: $filters)
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
        scryfallId
        artCropUrl
      }
    }
  }
`)

export const LocationCollectionCountDocument = graphql(`
  query LocationCollectionCount($filters: CollectionItemFilters) {
    collectionItemCount(filters: $filters)
  }
`)

export const LocationCoverCardSearchDocument = graphql(`
  query LocationCoverCardSearch($q: String!, $limit: Int!) {
    cards(q: $q, limit: $limit) {
      oracleId
      name
      typeLine
      printings {
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
`)

export const CollectionItemFormOptionsDocument = graphql(`
  query CollectionItemFormOptions {
    locations {
      id
      name
      kind
    }
  }
`)

export const CollectionItemDeckOptionsDocument = graphql(`
  query CollectionItemDeckOptions {
    decks {
      id
      name
      format
      status
    }
  }
`)

export const CreateCollectionItemDocument = graphql(`
  mutation CreateCollectionItem($input: CollectionItemInput!) {
    createCollectionItem(input: $input) {
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
      location {
        id
        name
      }
      printing {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
        card {
          oracleId
          name
          typeLine
        }
      }
    }
  }
`)

export const UpdateCollectionItemDocument = graphql(`
  mutation UpdateCollectionItem($id: ID!, $input: CollectionItemUpdateInput!) {
    updateCollectionItem(id: $id, input: $input) {
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
      location {
        id
        name
      }
      printing {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
        card {
          oracleId
          name
          typeLine
        }
      }
    }
  }
`)

export const DeleteCollectionItemDocument = graphql(`
  mutation DeleteCollectionItem($id: ID!) {
    deleteCollectionItem(id: $id) {
      id
    }
  }
`)

export const AddCollectionItemToDeckDocument = graphql(`
  mutation AddCollectionItemToDeck($id: ID!, $deckId: ID!, $zone: String) {
    addCollectionItemToDeck(id: $id, deckId: $deckId, zone: $zone) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
      }
      preferredPrinting {
        scryfallId
        setCode
        collectorNumber
        imageUrl
      }
    }
  }
`)

export const BulkAddCollectionItemsToDeckDocument = graphql(`
  mutation BulkAddCollectionItemsToDeck($ids: [ID!]!, $deckId: ID!, $zone: String) {
    bulkAddCollectionItemsToDeck(ids: $ids, deckId: $deckId, zone: $zone) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
      }
      preferredPrinting {
        scryfallId
        setCode
        collectorNumber
        imageUrl
      }
    }
  }
`)

export const CreateLocationDocument = graphql(`
  mutation CreateLocation($input: LocationInput!) {
    createLocation(input: $input) {
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
        scryfallId
        artCropUrl
      }
    }
  }
`)

export const UpdateLocationDocument = graphql(`
  mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
    updateLocation(id: $id, input: $input) {
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
        scryfallId
        artCropUrl
      }
    }
  }
`)

export const DeleteLocationDocument = graphql(`
  mutation DeleteLocation($id: ID!) {
    deleteLocation(id: $id) {
      id
      name
    }
  }
`)

export const CollectionItemsPageDocument = graphql(`
  query CollectionItemsPage(
    $filters: CollectionItemFilters
    $sort: CollectionItemSort
    $limit: Int!
    $offset: Int!
  ) {
    collectionItems(filters: $filters, sort: $sort, limit: $limit, offset: $offset) {
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
      location {
        id
        name
      }
      printing {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
        card {
          oracleId
          name
          typeLine
        }
      }
    }
  }
`) as typeof GeneratedCollectionItemsPageDocument

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
          scryfallId
          setCode
          setName
          collectorNumber
          imageUrl
          rarity
          card {
            oracleId
            name
            typeLine
          }
        }
        candidates {
          scryfallId
          setCode
          setName
          collectorNumber
          imageUrl
          rarity
          card {
            oracleId
            name
            typeLine
          }
        }
      }
    }
  }
`)

export const CommitCollectionImportDocument = graphql(`
  mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
    commitCollectionImport(input: $input) {
      imported
      skipped
    }
  }
`)
