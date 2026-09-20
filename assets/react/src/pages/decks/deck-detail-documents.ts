import { graphql } from "../../gql"

export const PreviewDeckDisassemblyDocument = graphql(`
  mutation PreviewDeckDisassembly($id: ID!) {
    previewDeckDisassembly(id: $id) {
      disassemblyResult {
        checkedCount
        movedCount
        skippedCount
        dryRun
        moves {
          collectionItemId
          cardName
          cardId
          imageUrl
          quantity
          finish
          fromLocationId
          fromLocationName
          toLocationId
          toLocationName
        }
      }
    }
  }
`)

export const DisassembleDeckDocument = graphql(`
  mutation DisassembleDeck($id: ID!) {
    disassembleDeck(id: $id) {
      disassemblyResult {
        checkedCount
        movedCount
        skippedCount
        dryRun
        moves {
          collectionItemId
          cardName
          cardId
          imageUrl
          quantity
          finish
          fromLocationId
          fromLocationName
          toLocationId
          toLocationName
        }
      }
    }
  }
`)

export const DeckPlayHistoryDocument = graphql(`
  query DeckPlayHistory($id: ID!) {
    deck(id: $id) {
      id
      includedForPlay
      playCount
      skipCount
      lastPlayedAt
    }
  }
`)

export const DeckDocument = graphql(`
  query Deck($id: ID!, $deckCardsAfter: String) {
    deck(id: $id) {
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
      cardCount
      commanderColorIdentity
      legality {
        status
        issues {
          code
          message
          severity
          cardName
        }
      }
      tags {
        id
        name
        color
        targetCount
        position
        cardCount
      }
      deckCards(first: 500, after: $deckCardsAfter) {
        pageInfo {
          endCursor
          hasNextPage
        }
        edges {
          node {
            id
            quantity
            zone
            finish
            tag
            tagIds
            priceCents
            card {
              id
              oracleId
              name
              typeLine
              cmc
              manaCost
              oracleText
              colors
              colorIdentity
              gameChanger
              edhrecSaltiness
              deckCategory
              deckThemes
            }
            preferredPrinting {
              id
              scryfallId
              imageUrl
              backImageUrl
              artCropUrl
              setCode
              setName
              collectorNumber
              rarity
              finishes
            }
            fallbackPrinting {
              id
              scryfallId
              imageUrl
              backImageUrl
              artCropUrl
              setCode
              setName
              collectorNumber
              rarity
              finishes
            }
            allocationStatus {
              state
              required
              owned
              allocated
              proxyAllocated
              available
              allocatedElsewhere
              missing
              candidates {
                allocated
                allocatedElsewhere
                available
                item {
                  id
                  quantity
                  finish
                  condition
                  language
                  priceText
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
                    rarity
                    imageUrl
                    backImageUrl
                    artCropUrl
                    card {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`)

