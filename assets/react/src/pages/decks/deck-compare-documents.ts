import { graphql } from "../../gql"

export const DeckDiffDocument = graphql(`
  query DeckDiff($deckId: ID!, $url: String, $text: String) {
    deckDiff(deckId: $deckId, url: $url, text: $text) {
      sourceName
      unrecognized
      adds {
        cardName
        quantity
        oracleId
        imageUrl
      }
      cuts {
        cardName
        quantity
        oracleId
        imageUrl
        deckCardIds
      }
      changes {
        cardName
        fromQuantity
        toQuantity
        oracleId
        deckCardIds
      }
    }
  }
`)
