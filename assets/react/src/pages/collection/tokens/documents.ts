import { graphql } from "../../../gql"

export const TokenItemFieldsFragment = graphql(`
  fragment TokenItemFields on TokenItem {
    id
    quantity
    finish
    printing {
      id
      scryfallId
      setCode
      setName
      collectorNumber
      imageUrl
      finishes
      card {
        id
        name
        typeLine
      }
    }
    backPrinting {
      id
      scryfallId
      setCode
      collectorNumber
      imageUrl
      card {
        id
        name
        typeLine
      }
    }
  }
`)

export const TokenItemsDocument = graphql(`
  query TokenItems($q: String) {
    tokenItems(q: $q) {
      ...TokenItemFields
    }
  }
`)

/** Token printings by name for the add dialog. */
export const TokenPrintingSearchDocument = graphql(`
  query TokenPrintingSearch($q: String!) {
    tokenPrintings(q: $q, limit: 48) {
      id
      scryfallId
      setCode
      setName
      collectorNumber
      imageUrl
      finishes
      card {
        id
        name
        typeLine
      }
    }
  }
`)

export const AddTokenItemDocument = graphql(`
  mutation AddTokenItem($input: TokenItemInput!) {
    addTokenItem(input: $input) {
      tokenItem {
        ...TokenItemFields
      }
    }
  }
`)

export const UpdateTokenItemDocument = graphql(`
  mutation UpdateTokenItem($id: ID!, $input: TokenItemUpdateInput!) {
    updateTokenItem(id: $id, input: $input) {
      tokenItem {
        ...TokenItemFields
      }
    }
  }
`)

export const DeleteTokenItemDocument = graphql(`
  mutation DeleteTokenItem($id: ID!) {
    deleteTokenItem(id: $id) {
      tokenItem {
        id
      }
    }
  }
`)

export const DeleteTokenItemsDocument = graphql(`
  mutation DeleteTokenItems($ids: [ID!]!) {
    deleteTokenItems(ids: $ids) {
      deletedCount
    }
  }
`)
