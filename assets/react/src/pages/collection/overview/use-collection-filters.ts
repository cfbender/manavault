import { useMemo, useState } from "react"
import {
  buildCollectionFilterQuery,
  combineCollectionQueries,
  countActiveCollectionFilters,
  decodeCollectionFilters,
  type CollectionFilterState,
} from "../../../lib/collection-filters"
import { useLocalStorageState } from "../../../lib/use-local-storage"
import {
  COLLECTION_ACTIVE_TAB_STORAGE_KEY,
  COLLECTION_APPLIED_SEARCH_STORAGE_KEY,
  COLLECTION_FILTERS_STORAGE_KEY,
  COLLECTION_SEARCH_DRAFT_STORAGE_KEY,
  DEFAULT_COLLECTION_SORT,
} from "../constants"
import { collectionSortStorageKey } from "../storage-keys"
import {
  createEmptyCollectionFilters,
  deserializeCollectionSort,
  deserializeCollectionTab,
  hasNoCollectionFilters,
  isBlankStorageString,
  isDefaultCollectionSort,
  serializeStoredCollectionFilters,
} from "../storage"
import type { CollectionSort, CollectionTab } from "../types"

const COLLECTION_PAGE_SORT_STORAGE_KEY = collectionSortStorageKey("collection")

export function useCollectionFilters() {
  const [activeTab, setActiveTab] = useLocalStorageState<CollectionTab>(
    COLLECTION_ACTIVE_TAB_STORAGE_KEY,
    "locations",
    { deserialize: deserializeCollectionTab },
  )
  const [searchDraft, setSearchDraft] = useLocalStorageState<string>(
    COLLECTION_SEARCH_DRAFT_STORAGE_KEY,
    "",
    { shouldRemove: isBlankStorageString },
  )
  const [appliedSearch, setAppliedSearch] = useLocalStorageState<string>(
    COLLECTION_APPLIED_SEARCH_STORAGE_KEY,
    "",
    { shouldRemove: isBlankStorageString },
  )
  const [sort, setSort] = useLocalStorageState<CollectionSort>(
    COLLECTION_PAGE_SORT_STORAGE_KEY,
    DEFAULT_COLLECTION_SORT,
    { deserialize: deserializeCollectionSort, shouldRemove: isDefaultCollectionSort },
  )
  const [structuredFilters, setStructuredFilters] = useLocalStorageState<CollectionFilterState>(
    COLLECTION_FILTERS_STORAGE_KEY,
    createEmptyCollectionFilters,
    {
      deserialize: decodeCollectionFilters,
      serialize: serializeStoredCollectionFilters,
      shouldRemove: hasNoCollectionFilters,
    },
  )
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const combinedQuery = combineCollectionQueries(
    appliedSearch,
    buildCollectionFilterQuery(structuredFilters),
  )
  const itemFilters = useMemo(() => {
    const filters: {
      q?: string
      locationId?: string
      unallocatedOnly?: boolean
      addedWithinDays?: number
    } = {}
    if (combinedQuery) filters.q = combinedQuery
    if (activeTab === "unfiled") filters.locationId = "unfiled"
    if (activeTab === "available") filters.unallocatedOnly = true
    if (activeTab === "recent") filters.addedWithinDays = 7
    return filters
  }, [activeTab, combinedQuery])
  const activeFilterChips = useMemo(
    () => collectionFilterChips(structuredFilters, appliedSearch),
    [appliedSearch, structuredFilters],
  )

  function applySearch(value: string) {
    setSearchDraft(value)
    setAppliedSearch(value.trim())
  }

  function updateSearchDraft(value: string) {
    setSearchDraft(value)
    if (!value.trim()) setAppliedSearch("")
  }

  function clearSearch() {
    setSearchDraft("")
    setAppliedSearch("")
  }

  function clearStructuredFilters() {
    setStructuredFilters(createEmptyCollectionFilters())
  }

  function clearAll() {
    clearSearch()
    clearStructuredFilters()
  }

  function applyStructuredFilters(filters: CollectionFilterState) {
    setStructuredFilters(filters)
    setFilterModalOpen(false)
  }

  function changeSort(nextSort: CollectionSort) {
    if (activeTab === "recent") setActiveTab("all")
    setSort(nextSort)
  }

  return {
    activeFilterChips,
    activeTab,
    appliedSearch,
    applySearch,
    applyStructuredFilters,
    changeSort,
    clearAll,
    clearSearch,
    clearStructuredFilters,
    combinedQuery,
    filterBadgeCount: countActiveCollectionFilters(structuredFilters),
    filterModalOpen,
    itemFilters,
    searchDraft,
    setActiveTab,
    setFilterModalOpen,
    sort,
    structuredFilters,
    updateSearchDraft,
  }
}

type FilterChip = { key: string; label: string }

function collectionFilterChips(
  filters: CollectionFilterState,
  appliedSearch: string,
): FilterChip[] {
  const chips: FilterChip[] = []
  const search = appliedSearch.trim()
  if (search) chips.push({ key: "search", label: `Search: ${search}` })
  if (filters.name.trim()) chips.push({ key: "name", label: `Name: ${filters.name.trim()}` })
  if (filters.typeLine.trim())
    chips.push({ key: "type", label: `Type: ${filters.typeLine.trim()}` })
  if (filters.colors.length) {
    chips.push({
      key: "colors",
      label: `Colors ${filters.colorOperator} ${filters.colors.join("")}`,
    })
  }
  if (filters.identity.length) {
    chips.push({
      key: "identity",
      label: `Identity ${filters.identityOperator} ${filters.identity.join("")}`,
    })
  }
  if (filters.manaValue.trim()) {
    chips.push({
      key: "manaValue",
      label: `Mana value ${filters.manaValueOperator} ${filters.manaValue.trim()}`,
    })
  }
  if (filters.rarities.length)
    chips.push({ key: "rarity", label: `Rarity: ${filters.rarities.join(", ")}` })
  if (filters.set.trim()) chips.push({ key: "set", label: `Set: ${filters.set.trim()}` })
  if (filters.collectorNumber.trim()) {
    chips.push({
      key: "collector",
      label: `Collector # ${filters.collectorOperator} ${filters.collectorNumber.trim()}`,
    })
  }
  if (filters.language.trim())
    chips.push({ key: "language", label: `Language: ${filters.language.trim()}` })
  if (filters.oracle.trim())
    chips.push({ key: "oracle", label: `Rules text: ${filters.oracle.trim()}` })
  if (filters.finish !== "any") chips.push({ key: "finish", label: `Finish: ${filters.finish}` })
  if (filters.quantity.trim()) {
    chips.push({
      key: "quantity",
      label: `Quantity ${filters.quantityOperator} ${filters.quantity.trim()}`,
    })
  }
  if (filters.priceUsd.trim())
    chips.push({ key: "price", label: `USD ${filters.priceOperator} ${filters.priceUsd.trim()}` })
  if (filters.releasedDate.trim()) {
    chips.push({
      key: "date",
      label: `Released ${filters.dateOperator} ${filters.releasedDate.trim()}`,
    })
  }
  if (filters.releasedYear.trim()) {
    chips.push({
      key: "year",
      label: `Year ${filters.yearOperator} ${filters.releasedYear.trim()}`,
    })
  }
  return chips
}
