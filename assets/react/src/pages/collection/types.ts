import type {
  CollectionQuery,
  LocationCoverCardSearchQuery,
  LocationQuery,
  PreviewCollectionImportMutation,
} from "../../gql/graphql"

export type CollectionItem = {
  id: string
  allocatedQuantity?: number | null
  condition: string
  priceText?: string | null
  purchasePriceCents?: number | null
  purchasePriceText?: string | null
  valueGainText?: string | null
  valueGainPercentText?: string | null
  quantity: number
  finish: string
  language: string
  location?: { id: string; name: string } | null
  notes?: string | null
  printing?: {
    scryfallId: string
    setCode?: string | null
    setName?: string | null
    collectorNumber?: string | null
    imageUrl?: string | null
    rarity?: string | null
    card?: { oracleId: string; name: string; typeLine?: string | null } | null
  } | null
}

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
  text: string
}
export type CollectionExportFilters = { locationId?: string; q?: string }

export type LocationSummary = CollectionQuery["locations"][number]
export type LocationDetail = NonNullable<LocationQuery["location"]>
export type CollectionValueSummary = NonNullable<CollectionQuery["collectionValueSummary"]>
export type LocationCoverCard = LocationCoverCardSearchQuery["cards"][number]
export type LocationCoverPrinting = NonNullable<NonNullable<LocationCoverCard["printings"]>[number]>
export type CollectionImportPreview = NonNullable<
  PreviewCollectionImportMutation["previewCollectionImport"]
>
export type CollectionImportRow = CollectionImportPreview["rows"][number]
export type CollectionImportCandidate = CollectionImportRow["candidates"][number]
export type LocationCoverSelection = {
  cardName?: string | null
  collectorNumber?: string | null
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
  imageUrl?: string | null
  rarity?: string | null
  scryfallId: string
  setCode?: string | null
  setName?: string | null
  typeLine?: string | null
}
export type AddCollectionItemPrintingSelection = AddCollectionItemInitialPrinting
