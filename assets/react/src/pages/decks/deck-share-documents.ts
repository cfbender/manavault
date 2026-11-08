import { graphql } from "../../gql"

export const ImportDecklistDocument = graphql(`
  mutation ImportDecklist($id: ID!, $text: String!, $replaceExisting: Boolean!, $zone: String) {
    importDecklist(id: $id, text: $text, replaceExisting: $replaceExisting, zone: $zone) {
      importResult {
        imported
        unresolved
        skippedPrintings
      }
    }
  }
`)

export const LinkDeckExternalSourceDocument = graphql(`
  mutation LinkDeckExternalSource($id: ID!, $url: String!) {
    linkDeckExternalSource(id: $id, url: $url) {
      deck {
        id
        externalSource
        externalUrl
        externalSyncedAt
        externalSyncError
      }
      unresolved
    }
  }
`)

export const SyncDeckExternalSourceDocument = graphql(`
  mutation SyncDeckExternalSource($id: ID!) {
    syncDeckExternalSource(id: $id) {
      deck {
        id
        externalSource
        externalUrl
        externalSyncedAt
        externalSyncError
      }
      unresolved
    }
  }
`)

export const UnlinkDeckExternalSourceDocument = graphql(`
  mutation UnlinkDeckExternalSource($id: ID!) {
    unlinkDeckExternalSource(id: $id) {
      deck {
        id
        externalSource
        externalUrl
        externalSyncedAt
        externalSyncError
      }
    }
  }
`)

export const DeckBuylistDocument = graphql(`
  query DeckBuylist(
    $id: ID!
    $printingMode: String!
    $exportFormat: String!
    $includeBasicLands: Boolean!
    $assumeNoOwned: Boolean!
    $includeConsidering: Boolean!
  ) {
    deckBuylist(
      id: $id
      printingMode: $printingMode
      includeBasicLands: $includeBasicLands
      assumeNoOwned: $assumeNoOwned
      includeConsidering: $includeConsidering
    ) {
      cardName
      quantity
      missing
      unavailable
      reason
      finish
      setCode
      collectorNumber
      language
      unitPriceText
      totalPriceCents
      totalPriceText
    }
    deckBuylistExport(
      id: $id
      format: $exportFormat
      printingMode: $printingMode
      includeBasicLands: $includeBasicLands
      assumeNoOwned: $assumeNoOwned
      includeConsidering: $includeConsidering
    )
  }
`)

export const CreateLinkedDeckDocument = graphql(`
  mutation CreateLinkedDeck($input: CreateLinkedDeckInput!) {
    createLinkedDeck(input: $input) {
      deck {
        id
        name
        externalSource
        externalUrl
        externalSyncedAt
        externalSyncError
      }
      unresolved
    }
  }
`)
