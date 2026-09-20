import { graphql } from "../../../gql"

export const CollectionCheckDocument = graphql(`
  mutation CollectionCheck($url: String, $text: String, $includeConsidering: Boolean!) {
    collectionCheck(url: $url, text: $text, includeConsidering: $includeConsidering) {
      sourceName
      entryCount
      requestedQuantity
      excludedQuantity
      availableQuantity
      unavailableQuantity
      missingQuantity
      estimatedCostCents
      estimatedCostText
      unpricedQuantity
      unrecognized
      cards {
        cardName
        oracleId
        required
        owned
        available
        unavailable
        missing
        toSource
        status
        setCode
        collectorNumber
        unitPriceCents
        unitPriceText
        totalPriceCents
        totalPriceText
        printing {
          id
          scryfallId
          imageUrl
          setCode
          collectorNumber
        }
      }
    }
  }
`)
