import { graphql } from "../../gql"

export const AnalyzeDeckDocument = graphql(`
  mutation AnalyzeDeck($id: ID!) {
    analyzeDeck(id: $id) {
      deck {
        id
        aiAnalysis
        aiAnalysisModel
        aiAnalyzedAt
        commanderBracket
        commanderBracketEstimate
      }
    }
  }
`)

export const DeckAnalysisRequestsDocument = graphql(`
  query DeckAnalysisRequests {
    deckAnalysisRequests {
      id
      sourceType
      source
      sourceName
      format
      analysis
      model
      commanderBracket
      commanderBracketEstimate
      insertedAt
    }
  }
`)

export const AnalyzeDeckListDocument = graphql(`
  mutation AnalyzeDeckList($url: String, $text: String, $format: String!) {
    analyzeDeckList(url: $url, text: $text, format: $format) {
      deckAnalysisRequest {
        id
        sourceType
        source
        sourceName
        format
        analysis
        model
        commanderBracket
        commanderBracketEstimate
        insertedAt
      }
    }
  }
`)

export const DeckQuestionAnswersDocument = graphql(`
  query DeckQuestionAnswers($deckId: ID!) {
    deckQuestionAnswers(deckId: $deckId) {
      id
      question
      answer
      status
      error
      model
      recommendedCuts
      recommendedAdditions
      insertedAt
    }
  }
`)

export const AskDeckQuestionDocument = graphql(`
  mutation AskDeckQuestion($id: ID!, $question: String!) {
    askDeckQuestion(id: $id, question: $question) {
      questionAnswer {
        id
        question
        answer
        status
        error
        model
        recommendedCuts
        recommendedAdditions
        insertedAt
      }
    }
  }
`)

export const DeleteDeckQuestionAnswerDocument = graphql(`
  mutation DeleteDeckQuestionAnswer($id: ID!) {
    deleteDeckQuestionAnswer(id: $id) {
      questionAnswerId
    }
  }
`)
