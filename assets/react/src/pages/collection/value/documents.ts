import { graphql } from "../../../gql"

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
        items {
          id
        }
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
        items {
          id
        }
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
