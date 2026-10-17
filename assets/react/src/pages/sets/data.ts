import { graphql } from "../../gql"
import type { CardSetQuery, CardSetsQuery } from "../../gql/graphql"

export const CardSetsDocument = graphql(`
  query CardSets {
    cardSets {
      code
      name
      releasedAt
      setType
      iconUrl
      cardCount
      ownedCount
      previewImageUrls
    }
  }
`)

export const CardSetDocument = graphql(`
  query CardSet($code: String!, $q: String, $sort: CardSort) {
    cardSet(code: $code) {
      code
      name
      releasedAt
      setType
      iconUrl
      cardCount
      ownedCount
      printings(q: $q, sort: $sort) {
        id
        scryfallId
        setCode
        setName
        collectorNumber
        rarity
        finishes
        promo
        promoTypes
        frameEffects
        borderColor
        fullArt
        imageUrl
        backImageUrl
        artCropUrl
        imageUris
        priceText
        ownedCount
        card {
          id
          name
          typeLine
          manaCost
        }
      }
    }
  }
`)

export type CardSetSummary = CardSetsQuery["cardSets"][number]
export type CardSetDetail = NonNullable<CardSetQuery["cardSet"]>
export type SetPrinting = CardSetDetail["printings"][number]
