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
