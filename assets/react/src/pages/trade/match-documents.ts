import { graphql } from "../../gql"

export const TradeMatchesDocument = graphql(`
  mutation TradeMatches($url: String, $text: String) {
    tradeMatches(url: $url, text: $text) {
      sourceName
      entryCount
      unrecognized
      binderMatches {
        cardName
        oracleId
        theirQuantity
        items {
          id
          quantity
          condition
          finish
          forTrade
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
        cardName
        oracleId
        theirQuantity
        want {
          id
          quantity
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
