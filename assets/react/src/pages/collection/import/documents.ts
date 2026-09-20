import { graphql } from "../../../gql"

export const CollectionImportPrintingFragment = graphql(`
  fragment CollectionImportPrintingFields on Printing {
    id
    scryfallId
    setCode
    setName
    collectorNumber
    imageUrl
    rarity
    card {
      id
      oracleId
      name
      typeLine
    }
  }
`)

export const PreviewCollectionImportDocument = graphql(`
  mutation PreviewCollectionImport($input: CollectionImportPreviewInput!) {
    previewCollectionImport(input: $input) {
      importPreview {
        locationId
        total
        exact
        ambiguous
        unresolved
        rows {
          rowNumber
          status
          attrs {
            name
            setCode
            collectorNumber
            quantity
            finish
            condition
            language
            scryfallId
            locationId
            purchasePriceCents
          }
          printing {
            ...CollectionImportPrintingFields
          }
          candidates {
            ...CollectionImportPrintingFields
          }
        }
      }
    }
  }
`)

export const CommitCollectionImportDocument = graphql(`
  mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
    commitCollectionImport(input: $input) {
      importResult {
        imported
        skipped
        autoSorted
      }
    }
  }
`)

export const PreviewCollectionImportAutoSortDocument = graphql(`
  mutation PreviewCollectionImportAutoSort($input: CollectionImportCommitInput!) {
    previewCollectionImportAutoSort(input: $input) {
      autoSortResult {
        ...AutoSortResultFields
      }
    }
  }
`)
