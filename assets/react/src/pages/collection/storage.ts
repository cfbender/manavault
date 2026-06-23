import {
  cloneCollectionFilters,
  countActiveCollectionFilters,
  EMPTY_COLLECTION_FILTERS,
  encodeCollectionFilters,
  type CollectionFilterState,
} from "../../lib/collection-filters"
import {
  COLLECTION_SORT_DIRECTIONS,
  COLLECTION_SORT_FIELDS,
  DEFAULT_COLLECTION_SORT,
} from "./constants"
import type {
  CollectionSort,
  CollectionSortDirection,
  CollectionSortField,
  CollectionTab,
} from "./types"

export function deserializeCollectionTab(value: string): CollectionTab {
  let decoded: unknown = value
  try {
    decoded = JSON.parse(value)
  } catch {
    decoded = value
  }

  if (decoded === "all") return "all"
  return "locations"
}

export function isBlankStorageString(value: string) {
  const trimmed = value.trim()
  return !trimmed
}

export function createEmptyCollectionFilters() {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  return filters
}

export function deserializeCollectionSort(value: string): CollectionSort {
  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch {
    return DEFAULT_COLLECTION_SORT
  }

  if (!isStorageRecord(decoded)) return DEFAULT_COLLECTION_SORT

  const field = COLLECTION_SORT_FIELDS.includes(decoded.field as CollectionSortField)
    ? (decoded.field as CollectionSortField)
    : DEFAULT_COLLECTION_SORT.field
  const direction = COLLECTION_SORT_DIRECTIONS.includes(
    decoded.direction as CollectionSortDirection,
  )
    ? (decoded.direction as CollectionSortDirection)
    : DEFAULT_COLLECTION_SORT.direction

  return { field, direction }
}

export function isDefaultCollectionSort(sort: CollectionSort) {
  const matchesDefaultField = sort.field === DEFAULT_COLLECTION_SORT.field
  const matchesDefaultDirection = sort.direction === DEFAULT_COLLECTION_SORT.direction
  return matchesDefaultField && matchesDefaultDirection
}

export function serializeStoredCollectionFilters(filters: CollectionFilterState) {
  const encoded = encodeCollectionFilters(filters)
  return encoded || "{}"
}

export function hasNoCollectionFilters(filters: CollectionFilterState) {
  const activeFilterCount = countActiveCollectionFilters(filters)
  return activeFilterCount === 0
}

export function isStorageRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
