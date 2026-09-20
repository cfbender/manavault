import { graphql } from "../../gql"

export const CardPrintingsDocument = graphql(`
  query CardPrintings($id: ID!) {
    card(id: $id) {
      printings(first: 300) {
        edges {
          node {
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

export const RotateDeckShareTokenDocument = graphql(`
  mutation RotateDeckShareToken($id: ID!) {
    rotateDeckShareToken(id: $id) {
      deck {
        id
        shareToken
      }
    }
  }
`)

export const DisableDeckSharingDocument = graphql(`
  mutation DisableDeckSharing($id: ID!) {
    disableDeckSharing(id: $id) {
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
          backImageUrl
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

export const CreateDeckTagDocument = graphql(`
  mutation CreateDeckTag($deckId: ID!, $input: DeckTagInput!) {
    createDeckTag(deckId: $deckId, input: $input) {
      deckTag {
        id
        name
        color
        targetCount
        position
        cardCount
      }
    }
  }
`)

export const UpdateDeckTagDocument = graphql(`
  mutation UpdateDeckTag($id: ID!, $input: DeckTagInput!) {
    updateDeckTag(id: $id, input: $input) {
      deckTag {
        id
        name
        color
        targetCount
        position
        cardCount
      }
    }
  }
`)

export const DeleteDeckTagDocument = graphql(`
  mutation DeleteDeckTag($id: ID!) {
    deleteDeckTag(id: $id) {
      deckTagId
    }
  }
`)

export const ReorderDeckTagsDocument = graphql(`
  mutation ReorderDeckTags($deckId: ID!, $tagIds: [ID!]!) {
    reorderDeckTags(deckId: $deckId, tagIds: $tagIds) {
      tags {
        id
        name
        color
        targetCount
        position
        cardCount
      }
    }
  }
`)

export const AssignDeckCardTagDocument = graphql(`
  mutation AssignDeckCardTag($deckCardId: ID!, $tagId: ID!) {
    assignDeckCardTag(deckCardId: $deckCardId, tagId: $tagId) {
      deckCard {
        id
        tagIds
      }
      deckTags {
        id
        cardCount
      }
    }
  }
`)

export const UnassignDeckCardTagDocument = graphql(`
  mutation UnassignDeckCardTag($deckCardId: ID!, $tagId: ID!) {
    unassignDeckCardTag(deckCardId: $deckCardId, tagId: $tagId) {
      deckCard {
        id
        tagIds
      }
      deckTags {
        id
        cardCount
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
          backImageUrl
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
          backImageUrl
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

export const BulkUpdateDeckCardsDocument = graphql(`
  mutation BulkUpdateDeckCards($deckCardIds: [ID!]!, $input: DeckCardUpdateInput!) {
    bulkUpdateDeckCards(deckCardIds: $deckCardIds, input: $input) {
      deckCards {
        id
        quantity
        zone
        finish
        tag
      }
    }
  }
`)

export const BulkDeleteDeckCardsDocument = graphql(`
  mutation BulkDeleteDeckCards($deckCardIds: [ID!]!) {
    bulkDeleteDeckCards(deckCardIds: $deckCardIds) {
      deckCards {
        id
      }
    }
  }
`)

export const BulkDeallocateDeckCardsDocument = graphql(`
  mutation BulkDeallocateDeckCards($deckCardIds: [ID!]!) {
    bulkDeallocateDeckCards(deckCardIds: $deckCardIds) {
      deckCards {
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
          backImageUrl
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

export const AddDeckPartnerDocument = graphql(`
  mutation AddDeckPartner($id: ID!) {
    addDeckPartner(id: $id) {
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
          backImageUrl
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
