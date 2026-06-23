import { graphql } from "../../gql"
import type { CardQuery } from "../../gql/graphql"

export const CardsDocument = graphql(`
  query Cards($q: String!, $limit: Int!) {
    cards(q: $q, limit: $limit) {
      oracleId
      name
      typeLine
      manaCost
      printings {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
        priceText
      }
    }
  }
`)

export const CardDeckOptionsDocument = graphql(`
  query CardDeckOptions {
    decks {
      id
      name
      format
      status
    }
  }
`)

export const AddCardToDeckDocument = graphql(`
  mutation AddCardToDeck($deckId: ID!, $input: DeckCardInput!) {
    addDeckCard(deckId: $deckId, input: $input) {
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

export const CardDocument = graphql(`
  query Card($id: ID!) {
    card(id: $id) {
      oracleId
      name
      typeLine
      manaCost
      oracleText
      colorIdentity
      deckCategory
      deckThemes
      oracleTags {
        id
        slug
        label
        weight
        annotation
      }
      legalities {
        format
        status
      }
      rulings {
        source
        publishedAt
        comment
      }
      printings {
        scryfallId
        setCode
        setName
        collectorNumber
        lang
        rarity
        ownedCount
        finishes
        imageUrl
        artCropUrl
        releasedAt
        prices
        priceText
      }
    }
  }
`)

export type CardDetail = NonNullable<CardQuery["card"]>
export type CardRuling = NonNullable<CardDetail["rulings"]>[number]
export type CardLegality = CardDetail["legalities"][number]

export const CARD_LEGALITY_FORMATS = [
  { key: "standard", label: "Standard" },
  { key: "alchemy", label: "Alchemy" },
  { key: "pioneer", label: "Pioneer" },
  { key: "historic", label: "Historic" },
  { key: "modern", label: "Modern" },
  { key: "brawl", label: "Brawl" },
  { key: "legacy", label: "Legacy" },
  { key: "timeless", label: "Timeless" },
  { key: "vintage", label: "Vintage" },
  { key: "pauper", label: "Pauper" },
  { key: "commander", label: "Commander" },
  { key: "penny", label: "Penny" },
  { key: "oathbreaker", label: "Oathbreaker" },
] as const
