import { graphql } from "../../../gql"

export const CollectionValuePositionFragment = graphql(`
  fragment CollectionValuePositionFields on CollectionValuePosition {
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
    acquisitionMarketPriceCents
    acquisitionMarketPriceText
    marketGainCents
    marketGainText
    marketGainPercent
    marketGainPercentText
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
`)

export const CollectionValueDashboardDocument = graphql(`
  query CollectionValueDashboard($basis: CollectionValueBasis) {
    pricingSettings {
      source
    }
    collectionValueDashboard(basis: $basis) {
      basis
      summary {
        totalPriceCents
        totalPriceText
        purchasePriceCents
        purchasePriceText
        valueGainCents
        valueGainText
        valueGainPercent
        valueGainPercentText
        acquisitionMarketPriceCents
        acquisitionMarketPriceText
        marketGainCents
        marketGainText
        marketGainPercent
        marketGainPercentText
      }
      itemCount
      positionCount
      gainPositionCount
      lossPositionCount
      unchangedPositionCount
      biggestGains {
        ...CollectionValuePositionFields
      }
      biggestLosses {
        ...CollectionValuePositionFields
      }
      biggestPercentGains {
        ...CollectionValuePositionFields
      }
      biggestPercentLosses {
        ...CollectionValuePositionFields
      }
    }
  }
`)
