import type {
  AutoSortCollectionMutation,
  CollectionItemsPageQuery,
  CollectionQuery,
  LocationCoverCardSearchQuery,
  LocationQuery,
  PreviewCollectionImportMutation,
} from "../../gql/graphql"

type ConnectionNode<T> = T extends { edges?: ReadonlyArray<(infer Edge) | null> | null }
  ? NonNullable<Edge> extends { node?: (infer Node) | null }
    ? NonNullable<Node>
    : never
  : T extends ReadonlyArray<infer Node>
    ? NonNullable<Node>
    : never

type PayloadField<T, Field extends string> = T extends { [Key in Field]?: infer Value }
  ? NonNullable<Value>
  : NonNullable<T>

export type CollectionItem = ConnectionNode<CollectionItemsPageQuery["collectionItems"]>

export type CollectionTab = "locations" | "all"
export type CollectionSortField = "quantity" | "name" | "set" | "rarity" | "price" | "added"
export type CollectionSortDirection = "asc" | "desc"
export type CollectionSort = {
  field: CollectionSortField
  direction: CollectionSortDirection
}
export type CollectionExportFormat = "csv" | "text"
export type CollectionImportFormat = "auto" | "csv" | "txt"
export type PreviewCollectionImportValues = {
  fileName: string
  format: CollectionImportFormat
  locationId: string
  purchasePrice?: string
  text: string
}
export type CollectionExportFilters = { locationId?: string; q?: string }
export type LocationSummary = ConnectionNode<CollectionQuery["locations"]>
export type LocationDetail = NonNullable<LocationQuery["location"]>
export type CollectionValueSummary = NonNullable<CollectionQuery["collectionValueSummary"]>
type AutoSortCollectionPayload = NonNullable<AutoSortCollectionMutation["autoSortCollection"]>
export type AutoSortCollectionResult = NonNullable<AutoSortCollectionPayload["autoSortResult"]>
type LocationCoverCardNode = ConnectionNode<LocationCoverCardSearchQuery["cards"]>
export type LocationCoverPrinting = ConnectionNode<NonNullable<LocationCoverCardNode["printings"]>>
export type LocationCoverCard = Omit<LocationCoverCardNode, "printings"> & {
  printings: LocationCoverPrinting[]
}
export type CollectionImportPreview = PayloadField<
  NonNullable<PreviewCollectionImportMutation["previewCollectionImport"]>,
  "importPreview"
>
export type CollectionImportRow = CollectionImportPreview["rows"][number]
export type CollectionImportCandidate = CollectionImportRow["candidates"][number]
export type LocationCoverSelection = {
  cardName?: string | null
  collectorNumber?: string | null
  id: string
  imageUrl?: string | null
  rarity?: string | null
  scryfallId: string
  setCode?: string | null
  setName?: string | null
}
export type AddCollectionItemInitialPrinting = {
  cardName: string
  collectorNumber?: string | null
  finishes?: Array<string | null> | null
  id: string
  imageUrl?: string | null
  rarity?: string | null
  scryfallId: string
  setCode?: string | null
  setName?: string | null
  typeLine?: string | null
}
export type AddCollectionItemPrintingSelection = AddCollectionItemInitialPrinting
