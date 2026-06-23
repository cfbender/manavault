import { graphql } from "../../gql"

export const DecksDocument = graphql(`
  query Decks {
    decks {
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
`)

export const CreateDeckDocument = graphql(`
  mutation CreateDeck($input: DeckInput!) {
    createDeck(input: $input) {
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
`)

export const UpdateDeckDocument = graphql(`
  mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {
    updateDeck(id: $id, input: $input) {
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
`)

export const DeleteDeckDocument = graphql(`
  mutation DeleteDeck($id: ID!) {
    deleteDeck(id: $id) {
      id
      name
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
      deckCards {
        id
        quantity
        zone
        finish
        tag
        card {
          oracleId
          name
          typeLine
          cmc
          manaCost
          oracleText
          colors
          colorIdentity
          deckCategory
          deckThemes
          printings {
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
        preferredPrinting {
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
`)

export const EnsureDeckShareTokenDocument = graphql(`
  mutation EnsureDeckShareToken($id: ID!) {
    ensureDeckShareToken(id: $id) {
      id
      shareToken
    }
  }
`)

export const UpdateDeckCardDocument = graphql(`
  mutation UpdateDeckCard($id: ID!, $input: DeckCardUpdateInput!) {
    updateDeckCard(id: $id, input: $input) {
      id
      quantity
      zone
      finish
      tag
      card {
        oracleId
        name
        typeLine
      }
      preferredPrinting {
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
`)

export const UpdateDeckCardsTagDocument = graphql(`
  mutation UpdateDeckCardsTag($deckCardIds: [ID!]!, $tag: String) {
    updateDeckCardsTag(deckCardIds: $deckCardIds, tag: $tag) {
      id
      tag
    }
  }
`)

export const AddDeckCardDocument = graphql(`
  mutation AddDeckCard($deckId: ID!, $input: DeckCardInput!) {
    addDeckCard(deckId: $deckId, input: $input) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
        typeLine
      }
      preferredPrinting {
        imageUrl
        artCropUrl
        setCode
        setName
        collectorNumber
        rarity
      }
    }
  }
`)

export const DeleteDeckCardDocument = graphql(`
  mutation DeleteDeckCard($id: ID!) {
    deleteDeckCard(id: $id) {
      id
    }
  }
`)

export const SetDeckCommanderDocument = graphql(`
  mutation SetDeckCommander($id: ID!) {
    setDeckCommander(id: $id) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
        typeLine
      }
      preferredPrinting {
        imageUrl
        artCropUrl
        setCode
        setName
        collectorNumber
        rarity
      }
    }
  }
`)

export const AllocateDeckCardItemDocument = graphql(`
  mutation AllocateDeckCardItem($deckCardId: ID!, $collectionItemId: ID!) {
    allocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
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
`)

export const DeallocateDeckCardItemDocument = graphql(`
  mutation DeallocateDeckCardItem($deckCardId: ID!, $collectionItemId: ID!) {
    deallocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
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
`)

export const AllocateDeckCardProxyDocument = graphql(`
  mutation AllocateDeckCardProxy($deckCardId: ID!, $quantity: Int!) {
    allocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {
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
`)

export const DeallocateDeckCardProxyDocument = graphql(`
  mutation DeallocateDeckCardProxy($deckCardId: ID!, $quantity: Int!) {
    deallocateDeckCardProxy(deckCardId: $deckCardId, quantity: $quantity) {
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
`)

export const PreviewBulkAllocateDeckDocument = graphql(`
  mutation PreviewBulkAllocateDeck($id: ID!, $mode: String!) {
    previewBulkAllocateDeck(id: $id, mode: $mode) {
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
`)

export const BulkAllocateDeckDocument = graphql(`
  mutation BulkAllocateDeck($id: ID!, $mode: String!) {
    bulkAllocateDeck(id: $id, mode: $mode) {
      allocated
      cards
      skipped
    }
  }
`)

export const ImportDecklistDocument = graphql(`
  mutation ImportDecklist($id: ID!, $text: String!, $replaceExisting: Boolean!) {
    importDecklist(id: $id, text: $text, replaceExisting: $replaceExisting) {
      imported
      unresolved
      skippedPrintings
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
  ) {
    deckBuylist(id: $id, printingMode: $printingMode, includeBasicLands: $includeBasicLands) {
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
      totalPriceText
    }
    deckBuylistExport(
      id: $id
      format: $exportFormat
      printingMode: $printingMode
      includeBasicLands: $includeBasicLands
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
          oracleId
          name
          typeLine
          printings {
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
          oracleId
          name
          typeLine
          printings {
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
              oracleId
              name
              typeLine
              printings {
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
