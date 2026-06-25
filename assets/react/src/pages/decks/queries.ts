import { graphql } from "../../gql"

export const DecksDocument = graphql(`
  query Decks {
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
          shareToken
          coverImageUrl
          commanderColorIdentity
          cardCount
          uniqueCardCount
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

export const CreateDeckDocument = graphql(`
  mutation CreateDeck($input: DeckInput!) {
    createDeck(input: $input) {
      deck {
        id
        name
        format
        status
        shareToken
        coverImageUrl
        commanderColorIdentity
        cardCount
        uniqueCardCount
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
        shareToken
        coverImageUrl
        commanderColorIdentity
        cardCount
        uniqueCardCount
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

export const DeckDocument = graphql(`
  query Deck($id: ID!) {
    deck(id: $id) {
      id
      name
      format
      status
      shareToken
      cardCount
      uniqueCardCount
      legality {
        status
        issues {
          code
          message
          severity
          cardName
        }
      }
      deckCards(first: 500) {
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
              deckCategory
              deckThemes
              printings(first: 300) {
                pageInfo {
                  endCursor
                  hasNextPage
                }
                edges {
                  node {
                    id
                    scryfallId
                    imageUrl
                    artCropUrl
                    setCode
                    setName
                    collectorNumber
                    rarity
                    finishes
                  }
                }
              }
            }
            preferredPrinting {
              id
              scryfallId
              imageUrl
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

export const EnsureDeckShareTokenDocument = graphql(`
  mutation EnsureDeckShareToken($id: ID!) {
    ensureDeckShareToken(id: $id) {
      deck {
        id
        shareToken
      }
    }
  }
`)

export const UpdateDeckCardDocument = graphql(`
  mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) {
    updateDeckCard(id: $id, input: $input) {
      deckCard {
        id
        quantity
        zone
        finish
        tag
        card {
          id
          oracleId
          name
          typeLine
        }
        preferredPrinting {
          id
          scryfallId
          imageUrl
          artCropUrl
          setCode
          setName
          collectorNumber
          rarity
          finishes
        }
      }
    }
  }
`)

export const UpdateDeckCardsTagDocument = graphql(`
  mutation UpdateDeckCardsTag($deckCardIds: [ID!]!, $tag: String) {
    updateDeckCardsTag(deckCardIds: $deckCardIds, tag: $tag) {
      deckCards {
        id
        tag
      }
    }
  }
`)

export const OptimizeDeckCardPrintingsDocument = graphql(`
  mutation OptimizeDeckCardPrintings($deckCardIds: [ID!]!) {
    optimizeDeckCardPrintings(deckCardIds: $deckCardIds) {
      deckCards {
        id
        quantity
        zone
        finish
        tag
        card {
          id
          oracleId
          name
          typeLine
        }
        preferredPrinting {
          id
          scryfallId
          imageUrl
          artCropUrl
          setCode
          setName
          collectorNumber
          rarity
          finishes
        }
      }
    }
  }
`)

export const AddDeckCardDocument = graphql(`
  mutation AddDeckCard($deckId: ID!, $input: DeckCardInput!) {
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
          typeLine
        }
        preferredPrinting {
          id
          scryfallId
          imageUrl
          artCropUrl
          setCode
          setName
          collectorNumber
          rarity
        }
      }
    }
  }
`)

export const DeleteDeckCardDocument = graphql(`
  mutation DeleteDeckCard($id: ID!) {
    deleteDeckCard(id: $id) {
      deckCard {
        id
      }
    }
  }
`)

export const SetDeckCommanderDocument = graphql(`
  mutation SetDeckCommander($id: ID!) {
    setDeckCommander(id: $id) {
      deckCard {
        id
        quantity
        zone
        finish
        card {
          id
          oracleId
          name
          typeLine
        }
        preferredPrinting {
          id
          scryfallId
          imageUrl
          artCropUrl
          setCode
          setName
          collectorNumber
          rarity
        }
      }
    }
  }
`)

export const AllocateDeckCardItemDocument = graphql(`
  mutation AllocateDeckCardItem($deckCardId: ID!, $collectionItemId: ID!) {
    allocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
      deckCard {
        id
        allocationStatus {
          state
          required
          owned
          allocated
          proxyAllocated
          available
          allocatedElsewhere
          missing
        }
      }
    }
  }
`)

export const DeallocateDeckCardItemDocument = graphql(`
  mutation DeallocateDeckCardItem($deckCardId: ID!, $collectionItemId: ID!) {
    deallocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
      deckCard {
        id
        allocationStatus {
          state
          required
          owned
          allocated
          proxyAllocated
          available
          allocatedElsewhere
          missing
        }
      }
    }
  }
`)

export const AllocateDeckCardProxyDocument = graphql(`
  mutation AllocateDeckCardProxy($deckCardId: ID!, $quantity: Int!) {
    allocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {
      deckCard {
        id
        allocationStatus {
          state
          required
          owned
          allocated
          proxyAllocated
          available
          allocatedElsewhere
          missing
        }
      }
    }
  }
`)

export const DeallocateDeckCardProxyDocument = graphql(`
  mutation DeallocateDeckCardProxy($deckCardId: ID!, $quantity: Int!) {
    deallocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {
      deckCard {
        id
        allocationStatus {
          state
          required
          owned
          allocated
          proxyAllocated
          available
          allocatedElsewhere
          missing
        }
      }
    }
  }
`)

export const PreviewBulkAllocateDeckDocument = graphql(`
  mutation PreviewBulkAllocateDeck($id: ID!, $mode: String!) {
    previewBulkAllocateDeck(id: $id, mode: $mode) {
      allocationPreview {
        mode
        allocated
        cards
        skipped
        entries {
          quantity
          exact
          deckCard {
            id
            quantity
            finish
            card {
              name
            }
            preferredPrinting {
              id
              scryfallId
              setCode
              setName
              collectorNumber
            }
          }
          item {
            id
            quantity
            finish
            printing {
              id
              scryfallId
              setCode
              setName
              collectorNumber
              card {
                name
              }
            }
          }
        }
      }
    }
  }
`)

export const BulkAllocateDeckDocument = graphql(`
  mutation BulkAllocateDeck($id: ID!, $mode: String!) {
    bulkAllocateDeck(id: $id, mode: $mode) {
      allocationResult {
        allocated
        cards
        skipped
      }
    }
  }
`)

export const ImportDecklistDocument = graphql(`
  mutation ImportDecklist($id: ID!, $text: String!, $replaceExisting: Boolean!) {
    importDecklist(id: $id, text: $text, replaceExisting: $replaceExisting) {
      importResult {
        imported
        unresolved
        skippedPrintings
      }
    }
  }
`)

export const DeckExportTextDocument = graphql(`
  query DeckExportText($id: ID!) {
    deckExportText(id: $id)
  }
`)

export const DeckBuylistDocument = graphql(`
  query DeckBuylist(
    $id: ID!
    $printingMode: String!
    $exportFormat: String!
    $includeBasicLands: Boolean!
    $assumeNoOwned: Boolean!
    $includeSideboard: Boolean!
    $includeMaybeboard: Boolean!
  ) {
    deckBuylist(
      id: $id
      printingMode: $printingMode
      includeBasicLands: $includeBasicLands
      assumeNoOwned: $assumeNoOwned
      includeSideboard: $includeSideboard
      includeMaybeboard: $includeMaybeboard
    ) {
      cardName
      quantity
      missing
      unavailable
      reason
      finish
      setCode
      collectorNumber
      language
      unitPriceText
      totalPriceCents
      totalPriceText
    }
    deckBuylistExport(
      id: $id
      format: $exportFormat
      printingMode: $printingMode
      includeBasicLands: $includeBasicLands
      assumeNoOwned: $assumeNoOwned
      includeSideboard: $includeSideboard
      includeMaybeboard: $includeMaybeboard
    )
  }
`)

export const DeckEdhrecDocument = graphql(`
  query DeckEdhrec($id: ID!, $excludeLands: Boolean!) {
    deckEdhrec(id: $id, excludeLands: $excludeLands) {
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
          printings(first: 300) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                id
                scryfallId
                imageUrl
                artCropUrl
                priceText
              }
            }
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
          printings(first: 300) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                id
                scryfallId
                imageUrl
                artCropUrl
                priceText
              }
            }
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
              printings(first: 300) {
                pageInfo {
                  endCursor
                  hasNextPage
                }
                edges {
                  node {
                    id
                    scryfallId
                    imageUrl
                    artCropUrl
                    priceText
                  }
                }
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
