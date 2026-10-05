import { graphql } from "../../../gql"

export const CollectionBulkCleanDocument = graphql(`
  query CollectionBulkClean(
    $maxPriceCents: Int
    $minCopies: Int
    $keepCopies: Int
    $preferKeepFoils: Boolean
    $kept: [BulkCleanPullInput!]
  ) {
    collectionBulkClean(
      maxPriceCents: $maxPriceCents
      minCopies: $minCopies
      keepCopies: $keepCopies
      preferKeepFoils: $preferKeepFoils
      kept: $kept
    ) {
      cardCount
      pullQuantity
      pullValueCents
      cards {
        cardId
        cardName
        typeLine
        colors
        totalCopies
        pullQuantity
        swappableCopies
        pulls {
          collectionItemId
          cardId
          cardName
          setCode
          collectorNumber
          imageUrl
          finish
          priceCents
          ownedQuantity
          quantity
          fromLocationId
          fromLocationName
        }
      }
    }
  }
`)

export const RemoveBulkCleanPullsDocument = graphql(`
  mutation RemoveBulkCleanPulls($pulls: [BulkCleanPullInput!]!) {
    removeBulkCleanPulls(pulls: $pulls) {
      removedCount
    }
  }
`)
