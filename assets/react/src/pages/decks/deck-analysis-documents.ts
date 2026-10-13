import { graphql } from "../../gql"

export const AnalyzeDeckDocument = graphql(`
  mutation AnalyzeDeck($id: ID!) {
    analyzeDeck(id: $id) {
      job {
        id
        status
        deck {
          id
          aiAnalysis
          aiAnalysisModel
          aiAnalyzedAt
          hasAiCardCategories
          commanderBracket
          commanderBracketEstimate
          commanderBracketRating
        }
      }
    }
  }
`)

export const DeckAnalysisJobDocument = graphql(`
  query DeckAnalysisJob($deckId: ID!) {
    deckAnalysisJob(deckId: $deckId) {
      id
      status
      deck {
        id
        aiAnalysis
        aiAnalysisModel
        aiAnalyzedAt
        hasAiCardCategories
        commanderBracket
        commanderBracketEstimate
        commanderBracketRating
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
      commanderBracketRating
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
        commanderBracketRating
        insertedAt
      }
    }
  }
`)

export const DeckQuestionAnswersDocument = graphql(`
  query DeckQuestionAnswers($deckId: ID!) {
    deckQuestionAnswers(deckId: $deckId) {
      id
      conversationId
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
  mutation AskDeckQuestion($id: ID!, $question: String!, $conversationId: String) {
    askDeckQuestion(id: $id, question: $question, conversationId: $conversationId) {
      questionAnswer {
        id
        conversationId
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

export const CardByNameDocument = graphql(`
  query CardByName($name: String!) {
    cardByName(name: $name) {
      id
      name
    }
  }
`)
