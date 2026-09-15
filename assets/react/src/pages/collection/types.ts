import type {
  AutoSortCollectionMutation,
  CollectionCheckMutation,
  CollectionItemGroupsPageQuery,
  CollectionQuery,
  CollectionValueDashboardQuery,
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

export type CollectionItemGroup = ConnectionNode<
  CollectionItemGroupsPageQuery["collectionItemGroups"]
>
export type CollectionItem = CollectionItemGroup["items"][number]

export type CollectionTab = "locations" | "all" | "recent" | "available" | "unfiled" | "value"
export type CollectionSortField =
  | "quantity"
  | "name"
  | "set"
  | "rarity"
  | "price"
  | "value_gain"
  | "added"
export type CollectionSortDirection = "asc" | "desc"
export type CollectionSort = {
  field: CollectionSortField
  direction: CollectionSortDirection
}
export type CollectionExportFormat = "csv" | "text"
export type CollectionImportFormat = "auto" | "csv" | "txt"
export type CollectionImportPurchaseMode = "per_card" | "total_spend"
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
export type CollectionValueDashboardData = CollectionValueDashboardQuery["collectionValueDashboard"]
export type CollectionValueSummary = CollectionValueDashboardData["summary"]
export type CollectionValuePosition = CollectionValueDashboardData["biggestGains"][number]
export type CollectionCheckResult = CollectionCheckMutation["collectionCheck"]
export type CollectionCheckCard = CollectionCheckResult["cards"][number]
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
