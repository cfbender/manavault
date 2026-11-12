import { graphql } from "../../gql"

export const TradeMatchesDocument = graphql(`
  mutation TradeMatches($url: String, $text: String) {
    tradeMatches(url: $url, text: $text) {
      sourceName
      entryCount
      unrecognized
      binderMatches {
        cardId
        cardName
        oracleId
        theirQuantity
        items {
          id
          quantity
          condition
          finish
          forTrade
          priceText
          printing {
            id
            setCode
            collectorNumber
            imageUrl
            card {
              id
              name
            }
          }
        }
      }
      wantMatches {
        cardId
        cardName
        oracleId
        theirQuantity
        want {
          id
          quantity
          imageUrl
          priceText
          printing {
            setCode
            collectorNumber
          }
          card {
            id
            name
          }
        }
      }
    }
  }
`)
