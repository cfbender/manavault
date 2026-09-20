import { graphql } from "../../gql"

export const DecksDocument = graphql(`
  query Decks($after: String) {
    decks(first: 100, after: $after) {
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
          includedForPlay
          playCount
          skipCount
          lastPlayedAt
          primer
          aiAnalysis
          aiAnalysisModel
          aiAnalyzedAt
          commanderBracket
          commanderBracketEstimate
          shareToken
          coverDeckCardId
          coverImageUrl
          commanderColorIdentity
          cardCount
          legality {
            status
            issues {
              code
              message
              severity
              cardName
            }
          }
        }
      }
    }
  }
`)

export const RandomDeckDocument = graphql(`
  query RandomDeck($excludeId: ID) {
    randomDeck(excludeId: $excludeId) {
      id
      name
      format
      status
      coverImageUrl
      commanderColorIdentity
      cardCount
      playCount
      skipCount
      lastPlayedAt
    }
  }
`)

export const RecordDeckPlayDocument = graphql(`
  mutation RecordDeckPlay($id: ID!, $outcome: DeckPlayOutcome!) {
    recordDeckPlay(id: $id, outcome: $outcome) {
      deck {
        id
        playCount
        skipCount
        lastPlayedAt
      }
    }
  }
`)

export const CreateDeckDocument = graphql(`
  mutation CreateDeck($input: DeckInput!) {
    createDeck(input: $input) {
      deck {
        id
        name
        format
        status
        primer
        aiAnalysis
        aiAnalysisModel
        aiAnalyzedAt
        commanderBracket
        commanderBracketEstimate
        shareToken
        coverDeckCardId
        coverImageUrl
        commanderColorIdentity
        cardCount
        legality {
          status
          issues {
            code
            message
            severity
            cardName
          }
        }
      }
    }
  }
`)

export const UpdateDeckDocument = graphql(`
  mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {
    updateDeck(id: $id, input: $input) {
      deck {
        id
        name
        format
        status
        includedForPlay
        playCount
        skipCount
        lastPlayedAt
        primer
        aiAnalysis
        aiAnalysisModel
        aiAnalyzedAt
        commanderBracket
        commanderBracketEstimate
        shareToken
        coverDeckCardId
        coverImageUrl
        commanderColorIdentity
        cardCount
        legality {
          status
          issues {
            code
            message
            severity
            cardName
          }
        }
      }
    }
  }
`)

export const DeleteDeckDocument = graphql(`
  mutation DeleteDeck($id: ID!) {
    deleteDeck(id: $id) {
      deck {
        id
        name
      }
    }
  }
`)

