import { graphql } from "../../../gql"

export const AutoSortResultFragment = graphql(`
  fragment AutoSortResultFields on CollectionAutoSortResult {
    checkedCount
    movedCount
    skippedCount
    dryRun
    moves {
      collectionItemId
      cardName
      cardId
      setCode
      collectorNumber
      imageUrl
      quantity
      finish
      fromLocationId
      fromLocationName
      toLocationId
      toLocationName
    }
  }
`)

export const AutoSortCollectionDocument = graphql(`
  mutation AutoSortCollection($input: AutoSortCollectionInput) {
    autoSortCollection(input: $input) {
      autoSortResult {
        ...AutoSortResultFields
      }
    }
  }
`)
