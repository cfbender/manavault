import { graphql } from "../../gql"

export const DeckEdhrecDocument = graphql(`
  query DeckEdhrec(
    $id: ID!
    $excludeLands: Boolean!
    $commanderName: String
    $commanderTheme: String
  ) {
    deckEdhrec(
      id: $id
      excludeLands: $excludeLands
      commanderName: $commanderName
      commanderTheme: $commanderTheme
    ) {
      commanderNames
      more
      recommendations {
        name
        oracleId
        primaryType
        score
        salt
        edhrecUrl
        card {
          id
          oracleId
          name
          typeLine
          primaryPrinting {
            id
            scryfallId
            imageUrl
            artCropUrl
            priceText
          }
        }
        collectionStatus {
          state
          required
          owned
          allocated
          available
          allocatedElsewhere
          missing
          deckZone
          candidates {
            available
          }
        }
      }
      cuts {
        name
        oracleId
        primaryType
        score
        salt
        edhrecUrl
        card {
          id
          oracleId
          name
          typeLine
          primaryPrinting {
            id
            scryfallId
            imageUrl
            artCropUrl
            priceText
          }
        }
        collectionStatus {
          state
          required
          owned
          allocated
          available
          allocatedElsewhere
          missing
          deckZone
          candidates {
            available
          }
        }
      }
      commanderPages {
        name
        title
        description
        url
        rank
        deckCount
        salt
        avgPrice
        colorIdentity
        similar
        themes {
          name
          slug
          count
        }
        stats {
          label
          value
        }
        sections {
          header
          tag
          cards {
            name
            oracleId
            synergy
            inclusion
            numDecks
            potentialDecks
            url
            card {
              id
              oracleId
              name
              typeLine
              primaryPrinting {
                id
                scryfallId
                imageUrl
                artCropUrl
                priceText
              }
            }
            collectionStatus {
              state
              required
              owned
              allocated
              available
              allocatedElsewhere
              missing
              deckZone
              candidates {
                available
              }
            }
          }
        }
      }
    }
  }
`)

export const DeckRecommanderDocument = graphql(`
  query DeckRecommander($id: ID!) {
    deckRecommander(id: $id) {
      commanders {
        name
        oracleId
        url
      }
      recommendations {
        name
        oracleId
        rank
        score
        card {
          id
          oracleId
          name
          typeLine
          primaryPrinting {
            id
            scryfallId
            imageUrl
            artCropUrl
            priceText
          }
        }
        collectionStatus {
          state
          required
          owned
          allocated
          available
          allocatedElsewhere
          missing
          deckZone
          candidates {
            available
          }
        }
      }
    }
  }
`)

export const DeckCombosDocument = graphql(`
  query DeckCombos($id: ID!) {
    deckCombos(id: $id) {
      id
      url
      cards {
        name
        quantity
        imageUrl
      }
      produces
      description
      manaNeeded
      prerequisites
      notes
    }
  }
`)
