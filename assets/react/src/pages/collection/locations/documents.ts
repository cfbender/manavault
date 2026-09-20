import { graphql } from "../../../gql"

export const CollectionLocationFieldsFragment = graphql(`
  fragment CollectionLocationFields on Location {
    id
    name
    kind
    description
    itemCount
    totalPriceText
    valueSummary {
      totalPriceText
      purchasePriceText
      valueGainText
      valueGainPercentText
    }
    coverPrinting {
      id
      scryfallId
      artCropUrl
    }
  }
`)

export const LocationDocument = graphql(`
  query Location($id: ID!) {
    location(id: $id) {
      ...CollectionLocationFields
    }
  }
`)

export const LocationCollectionCountDocument = graphql(`
  query LocationCollectionCount($filters: CollectionItemFilters) {
    collectionItemCount(filters: $filters)
    collectionItemEntryCount(filters: $filters)
  }
`)

export const LocationCoverCardSearchDocument = graphql(`
  query LocationCoverCardSearch($q: String!, $first: Int!) {
    cards(q: $q, first: $first) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          oracleId
          name
          typeLine
          printings(first: 16) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                id
                scryfallId
                setCode
                setName
                collectorNumber
                finishes
                imageUrl
                artCropUrl
                rarity
              }
            }
          }
        }
      }
    }
  }
`)

export const CreateLocationDocument = graphql(`
  mutation CreateLocation($input: LocationInput!) {
    createLocation(input: $input) {
      location {
        ...CollectionLocationFields
      }
    }
  }
`)

export const UpdateLocationDocument = graphql(`
  mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
    updateLocation(id: $id, input: $input) {
      location {
        ...CollectionLocationFields
      }
    }
  }
`)

export const DeleteLocationDocument = graphql(`
  mutation DeleteLocation($id: ID!) {
    deleteLocation(id: $id) {
      location {
        id
        name
      }
    }
  }
`)
