import { graphql } from "../../../gql"

export const CollectionDocument = graphql(`
  query Collection($filters: CollectionItemFilters) {
    locations(first: 100) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          ...CollectionLocationFields
        }
      }
    }
    collectionAutoSortRules {
      id
      name
      enabled
      priority
      targetLocation {
        id
        name
        kind
      }
    }
    collectionItemCount(filters: $filters)
    collectionItemEntryCount(filters: $filters)
    allCollectionItemCount: collectionItemCount
    unfiledCollectionItemCount: collectionItemCount(filters: { locationId: "unfiled" })
    availableCollectionItemCount: collectionItemCount(filters: { unallocatedOnly: true })
    recentCollectionItemCount: collectionItemCount(filters: { addedWithinDays: 7 })
  }
`)
