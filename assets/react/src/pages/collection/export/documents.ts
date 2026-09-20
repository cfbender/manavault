import { graphql } from "../../../gql"

export const CollectionExportCsvDocument = graphql(`
  query CollectionExportCsv($filters: CollectionItemFilters) {
    collectionExportCsv(filters: $filters)
  }
`)

export const CollectionExportTextDocument = graphql(`
  query CollectionExportText($filters: CollectionItemFilters) {
    collectionExportText(filters: $filters)
  }
`)
