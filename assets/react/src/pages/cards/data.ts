import { graphql } from "../../gql"
import type { CardCollectionItemsQuery, CardQuery } from "../../gql/graphql"

export const CardsDocument = graphql(`
  query Cards($q: String!, $limit: Int!) {
    cards(q: $q, first: $limit) {
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
          manaCost
          printings(first: 20) {
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
                imageUrl
                rarity
                priceText
                ownedCount
                finishes
              }
            }
          }
        }
      }
    }
  }
`)

export const CardDeckOptionsDocument = graphql(`
  query CardDeckOptions {
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

export const AddCardToDeckDocument = graphql(`
  mutation AddCardToDeck($deckId: ID!, $input: DeckCardInput!) {
    addDeckCard(deckId: $deckId, input: $input) {
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

export const CardDocument = graphql(`
  query Card($id: ID!) {
    card(id: $id) {
      id
      oracleId
      name
      typeLine
      manaCost
      oracleText
      colorIdentity
      gameChanger
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
      printings(first: 300) {
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
            lang
            rarity
            ownedCount
            finishes
            imageUrl
            backImageUrl
            artCropUrl
            releasedAt
            prices
            priceText
          }
        }
      }
    }
  }
`)

export const CardCollectionItemsDocument = graphql(`
  query CardCollectionItems($cardId: ID!) {
    collectionItemCount(filters: { cardId: $cardId })
    collectionItems(first: 100, filters: { cardId: $cardId }) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
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
  }
`)

export type CardDetail = NonNullable<CardQuery["card"]>
export type CardRuling = NonNullable<CardDetail["rulings"]>[number]
type CardCollectionItemsEdge = NonNullable<
  NonNullable<CardCollectionItemsQuery["collectionItems"]["edges"]>[number]
>
export type CardCollectionItem = NonNullable<CardCollectionItemsEdge["node"]>
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
