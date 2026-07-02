import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { useNavigate } from "@tanstack/react-router"
import { CheckSquare, ListFilter, Search } from "lucide-react"
import type * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { PageSection } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { CardNameSearchField } from "../../components/card-name-search-field"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { useToast } from "../../components/ui/toast"
import {
  buildCollectionFilterQuery,
  combineCollectionQueries,
  countActiveCollectionFilters,
  decodeCollectionFilters,
  type CollectionFilterState,
} from "../../lib/collection-filters"
import {
  subscribeSharedImport,
  takePendingNativeSharedImport,
  type SharedImportPayload,
} from "../../lib/native-shared-import"
import { useLocalStorageState } from "../../lib/use-local-storage"
import { pluralize, present } from "../../lib/utils"
import { AutoSortSetupDialog, hasEnabledAutoSortRules } from "./auto-sort-setup-dialog"
import { AutoSortSummaryDialog } from "./auto-sort-summary-dialog"
import { CollectionLocationsSection } from "./collection-locations-section"
import { invalidateCollectionViews } from "./collection-navigation"
import { CollectionPageHeader } from "./collection-page-header"
import {
  COLLECTION_ACTIVE_TAB_STORAGE_KEY,
  COLLECTION_APPLIED_SEARCH_STORAGE_KEY,
  COLLECTION_FILTERS_STORAGE_KEY,
  COLLECTION_PAGE_SIZE,
  COLLECTION_SEARCH_DRAFT_STORAGE_KEY,
  DEFAULT_COLLECTION_SORT,
} from "./constants"
import {
  AutoSortCollectionDocument,
  CollectionDocument,
  CollectionItemsPageDocument,
  DeleteLocationDocument,
} from "./documents"
import { CollectionFilterModal } from "./filter-modal"
import { ExportCollectionDialog, ImportCollectionDialog } from "./import-export-dialogs"
import {
  AddCollectionItemDialog,
  AddCollectionItemToDeckDialog,
  BulkEditCollectionItemsDialog,
  DeleteCollectionItemDialog,
  MoveCollectionItemDialog,
} from "./item-dialogs"
import { collectionSelectionTarget, type CollectionSelectionTarget } from "./item-target"
import { AddLocationDialog, EditLocationDialog } from "./location-dialogs"
import {
  CollectionBulkActionBar,
  VirtualizedCollectionGrid,
  useCollectionItemSelection,
} from "./selection-grid"
import { SellCardsDialog } from "./sell-cards-dialog"
import { SortDropdown } from "./sort-controls"
import { collectionSortStorageKey } from "./storage-keys"
import {
  createEmptyCollectionFilters,
  deserializeCollectionSort,
  deserializeCollectionTab,
  hasNoCollectionFilters,
  isBlankStorageString,
  isDefaultCollectionSort,
  serializeStoredCollectionFilters,
} from "./storage"
import type {
  AutoSortCollectionResult,
  CollectionExportFormat,
  CollectionSort,
  CollectionTab,
  LocationSummary,
} from "./types"

const COLLECTION_PAGE_SORT_STORAGE_KEY = collectionSortStorageKey("collection")

type ActiveFilterChip = {
  key: string
  label: string
}

const RECENT_COLLECTION_SORT: CollectionSort = { field: "added", direction: "desc" }

function activeCollectionFilterChips(
  filters: CollectionFilterState,
  appliedSearch: string,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []
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
  if (filters.rarities.length) {
    chips.push({ key: "rarity", label: `Rarity: ${filters.rarities.join(", ")}` })
  }
  if (filters.set.trim()) chips.push({ key: "set", label: `Set: ${filters.set.trim()}` })
  if (filters.collectorNumber.trim()) {
    chips.push({
      key: "collector",
      label: `Collector # ${filters.collectorOperator} ${filters.collectorNumber.trim()}`,
    })
  }
  if (filters.language.trim()) {
    chips.push({ key: "language", label: `Language: ${filters.language.trim()}` })
  }
  if (filters.oracle.trim())
    chips.push({ key: "oracle", label: `Rules text: ${filters.oracle.trim()}` })
  if (filters.finish !== "any") chips.push({ key: "finish", label: `Finish: ${filters.finish}` })
  if (filters.quantity.trim()) {
    chips.push({
      key: "quantity",
      label: `Quantity ${filters.quantityOperator} ${filters.quantity.trim()}`,
    })
  }
  if (filters.priceUsd.trim()) {
    chips.push({ key: "price", label: `USD ${filters.priceOperator} ${filters.priceUsd.trim()}` })
  }
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

export function CollectionPage({ importFile = false }: { importFile?: boolean }) {
  const [activeTab, setActiveTab] = useLocalStorageState<CollectionTab>(
    COLLECTION_ACTIVE_TAB_STORAGE_KEY,
    "locations",
    { deserialize: deserializeCollectionTab },
  )
  const [q, setQ] = useLocalStorageState<string>(COLLECTION_SEARCH_DRAFT_STORAGE_KEY, "", {
    shouldRemove: isBlankStorageString,
  })
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
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isExportCsvOpen, setIsExportCsvOpen] = useState(false)
  const [isSellCardsOpen, setIsSellCardsOpen] = useState(false)
  const [isAutoSortSetupOpen, setIsAutoSortSetupOpen] = useState(false)
  const [autoSortResult, setAutoSortResult] = useState<AutoSortCollectionResult | null>(null)
  const [autoSortError, setAutoSortError] = useState<string | null>(null)
  const [sharedImport, setSharedImport] = useState<SharedImportPayload | null>(null)
  const [editingLocation, setEditingLocation] = useState<LocationSummary | null>(null)
  const [deletingLocation, setDeletingLocation] = useState<LocationSummary | null>(null)
  const [exportingLocation, setExportingLocation] = useState<{
    format: CollectionExportFormat
    location: LocationSummary
  } | null>(null)
  const [bulkDeckTarget, setBulkDeckTarget] = useState<CollectionSelectionTarget | null>(null)
  const [bulkListTarget, setBulkListTarget] = useState<CollectionSelectionTarget | null>(null)
  const [bulkMoveTarget, setBulkMoveTarget] = useState<CollectionSelectionTarget | null>(null)
  const [bulkEditTarget, setBulkEditTarget] = useState<CollectionSelectionTarget | null>(null)
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<CollectionSelectionTarget | null>(null)
  const [isFetchingMoreAllItems, setIsFetchingMoreAllItems] = useState(false)
  const [structuredFilters, setStructuredFilters] = useLocalStorageState<CollectionFilterState>(
    COLLECTION_FILTERS_STORAGE_KEY,
    createEmptyCollectionFilters,
    {
      deserialize: decodeCollectionFilters,
      serialize: serializeStoredCollectionFilters,
      shouldRemove: hasNoCollectionFilters,
    },
  )
  const client = useApolloClient()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [deleteLocationMutation] = useMutation(DeleteLocationDocument)
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedCollectionQuery = combineCollectionQueries(appliedSearch, structuredFilterSyntax)
  const collectionItemSort = activeTab === "recent" ? RECENT_COLLECTION_SORT : sort
  const filters = useMemo(() => {
    const nextFilters: { q?: string; locationId?: string; unallocatedOnly?: boolean } = {}
    if (combinedCollectionQuery) nextFilters.q = combinedCollectionQuery
    if (activeTab === "unfiled") nextFilters.locationId = "unfiled"
    if (activeTab === "available") nextFilters.unallocatedOnly = true
    return nextFilters
  }, [activeTab, combinedCollectionQuery])
  const { data, loading: isLoading } = useQuery(CollectionDocument, {
    variables: { filters },
    fetchPolicy: "cache-and-network",
  })
  const allItemsQuery = useQuery(CollectionItemsPageDocument, {
    variables: {
      filters,
      sort: collectionItemSort,
      first: COLLECTION_PAGE_SIZE,
      after: null,
    },
    skip: activeTab === "locations",
    fetchPolicy: "cache-and-network",
  })
  const allItemsPageInfo = allItemsQuery.data?.collectionItems.pageInfo
  const allItemsHasNextPage = Boolean(allItemsPageInfo?.hasNextPage)
  const allCollectionItems = useMemo(
    () =>
      (allItemsQuery.data?.collectionItems.edges || []).map((edge) => edge?.node).filter(present),
    [allItemsQuery.data],
  )
  const locations = useMemo(
    () => data?.locations?.edges?.map((edge) => edge?.node).filter(present) || [],
    [data?.locations],
  )
  const autoSortRules = data?.collectionAutoSortRules ?? []
  const collectionEntryCount = data?.collectionItemEntryCount ?? 0
  const selection = useCollectionItemSelection({
    items: allCollectionItems,
    totalCount: collectionEntryCount,
    resetKey: JSON.stringify(filters),
  })
  const bulkSelectionTarget = () => collectionSelectionTarget(selection, filters)
  const [autoSortCollectionMutation, autoSortCollection] = useMutation(AutoSortCollectionDocument)
  const fetchMoreAllItemsPage = useCallback(
    (after: string | null | undefined) =>
      allItemsQuery.fetchMore({
        variables: {
          filters,
          sort: collectionItemSort,
          first: COLLECTION_PAGE_SIZE,
          after: after ?? null,
        },
      }),
    [allItemsQuery, collectionItemSort, filters],
  )
  const hasCollectionFilters = Boolean(combinedCollectionQuery)
  const activeStructuredFilterCount = countActiveCollectionFilters(structuredFilters)
  const activeFilterChips = useMemo(
    () => activeCollectionFilterChips(structuredFilters, appliedSearch),
    [appliedSearch, structuredFilters],
  )
  const filterBadgeCount = activeStructuredFilterCount
  const collectionCountLabel = `${data?.collectionItemCount || 0} ${hasCollectionFilters ? "shown" : "total"}`
  const unfiledItemCount =
    data?.unfiledCollectionItemCount ??
    locations.find((location) => location.id === "unfiled")?.itemCount ??
    0
  const itemCounts = {
    all: data?.allCollectionItemCount ?? data?.collectionItemCount ?? 0,
    recent: data?.allCollectionItemCount ?? data?.collectionItemCount ?? 0,
    available: data?.availableCollectionItemCount ?? 0,
    unfiled: unfiledItemCount,
  }
  const loadMoreAllItems = useCallback(() => {
    if (isFetchingMoreAllItems || !allItemsHasNextPage) return

    setIsFetchingMoreAllItems(true)
    void fetchMoreAllItemsPage(allItemsPageInfo?.endCursor).finally(() =>
      setIsFetchingMoreAllItems(false),
    )
  }, [
    allItemsHasNextPage,
    allItemsPageInfo?.endCursor,
    fetchMoreAllItemsPage,
    isFetchingMoreAllItems,
  ])
  const locationGroups = useMemo(() => {
    const groups = new Map<string, typeof locations>()

    for (const location of locations) {
      const kind = location.kind || "other"
      groups.set(kind, [...(groups.get(kind) || []), location])
    }

    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right))
  }, [locations])

  useEffect(() => {
    if (!importFile) return

    let ignore = false

    void (async () => {
      const payload = await takePendingNativeSharedImport()
      if (ignore) return

      if (payload) setSharedImport(payload)
      setIsImportOpen(true)
      void navigate({
        to: "/collection",
        search: { importFile: false },
        replace: true,
      })
    })()

    return () => {
      ignore = true
    }
  }, [importFile, navigate])

  useEffect(
    () =>
      subscribeSharedImport((payload) => {
        setSharedImport(payload)
        setIsImportOpen(true)
      }),
    [],
  )

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applyCollectionSearch(q)
  }

  function applyCollectionSearch(value: string) {
    setQ(value)
    setAppliedSearch(value.trim())
  }

  function updateCollectionSearchDraft(value: string) {
    setQ(value)
    if (!value.trim()) setAppliedSearch("")
  }

  function clearCollectionSearch() {
    setQ("")
    setAppliedSearch("")
  }

  function clearStructuredFilters() {
    setStructuredFilters(createEmptyCollectionFilters())
  }

  function clearAllCollectionFilters() {
    clearCollectionSearch()
    clearStructuredFilters()
  }

  function applyStructuredFilters(nextFilters: CollectionFilterState) {
    setStructuredFilters(nextFilters)
    setIsFilterModalOpen(false)
  }

  function selectTab(tab: CollectionTab) {
    selection.clearSelection()
    setActiveTab(tab)
  }

  function changeCollectionSort(nextSort: CollectionSort) {
    if (activeTab === "recent") setActiveTab("all")
    setSort(nextSort)
  }

  function finishBulkCollectionAction() {
    void invalidateCollectionViews(client)
    selection.clearSelection()
  }

  function exportLocation(location: LocationSummary, format: CollectionExportFormat) {
    setExportingLocation({ format, location })
  }

  function deleteSelectedLocation() {
    if (!deletingLocation) return
    const locationName = deletingLocation.name
    void deleteLocationMutation({
      variables: { id: deletingLocation.id },
      onCompleted: () => {
        void invalidateCollectionViews(client)
        showToast(`Deleted location ${locationName}`)
      },
    })
    if (editingLocation?.id === deletingLocation.id) setEditingLocation(null)
    if (exportingLocation?.location.id === deletingLocation.id) setExportingLocation(null)
  }

  function runCollectionAutoSort(dryRun: boolean) {
    void autoSortCollectionMutation({
      variables: { input: { sourceLocationId: null, dryRun } },
      onCompleted: (data) => {
        const result = data.autoSortCollection?.autoSortResult
        if (!dryRun) {
          void invalidateCollectionViews(client)
          selection.clearSelection()
          showToast(`${pluralize(result?.movedCount ?? 0, "card")} auto-sorted`)
          setAutoSortResult(null)
        } else {
          setAutoSortResult(result ?? null)
        }
        setAutoSortError(null)
      },
      onError: (error) => {
        setAutoSortResult(null)
        setAutoSortError(error instanceof Error ? error.message : "Could not auto-sort collection")
      },
    })
  }

  function previewCollectionAutoSort() {
    setAutoSortResult(null)
    setAutoSortError(null)

    if (!hasEnabledAutoSortRules(autoSortRules)) {
      setIsAutoSortSetupOpen(true)
      return
    }

    runCollectionAutoSort(true)
  }

  function applyCollectionAutoSort() {
    setAutoSortError(null)
    runCollectionAutoSort(false)
  }

  return (
    <>
      <CollectionPageHeader
        activeTab={activeTab}
        autoSortDisabled={isLoading}
        autoSortPending={autoSortCollection.loading}
        itemCounts={itemCounts}
        locationCount={locations.length}
        valueSummary={data?.collectionValueSummary}
        onAddItem={() => setIsAddItemOpen(true)}
        onAddLocation={() => setIsAddLocationOpen(true)}
        onAutoSort={previewCollectionAutoSort}
        onImport={() => setIsImportOpen(true)}
        onExportCsv={() => setIsExportCsvOpen(true)}
        onSellCards={() => setIsSellCardsOpen(true)}
        onSelectTab={selectTab}
      />

      {autoSortError ? (
        <p
          role="alert"
          className="mb-5 rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
        >
          {autoSortError}
        </p>
      ) : null}

      {activeTab === "locations" ? (
        <CollectionLocationsSection
          isLoading={isLoading}
          locationCount={locations.length}
          locationGroups={locationGroups}
          onDeleteLocation={setDeletingLocation}
          onEditLocation={setEditingLocation}
          onExportLocation={exportLocation}
        />
      ) : (
        <div className="space-y-7">
          <form
            onSubmit={submit}
            className="control-toolbar grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto_auto_auto]"
          >
            <CardNameSearchField
              name="q"
              value={q}
              onValueChange={updateCollectionSearchDraft}
              onClear={clearCollectionSearch}
              onSuggestionSelect={applyCollectionSearch}
              placeholder="Filter collection"
            />
            <SortDropdown sort={collectionItemSort} onSortChange={changeCollectionSort} />
            <Button
              type="button"
              variant={selection.selectionActive ? "secondary" : "outline"}
              onClick={selection.toggleSelectionMode}
            >
              <CheckSquare className="h-4 w-4" />
              Select
            </Button>
            <Button
              type="button"
              variant="outline"
              className="relative"
              onClick={() => setIsFilterModalOpen(true)}
            >
              <ListFilter className="h-4 w-4" />
              Filter
              {filterBadgeCount ? (
                <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">
                  {filterBadgeCount}
                </span>
              ) : null}
            </Button>
            <Button type="submit">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </form>

          {activeFilterChips.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm">
              <span className="font-bold text-base-content/70">Active filters</span>
              {activeFilterChips.map((chip) => (
                <Badge key={chip.key} tone="primary">
                  {chip.label}
                </Badge>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={clearAllCollectionFilters}>
                Clear all
              </Button>
            </div>
          ) : null}

          <CollectionBulkActionBar
            allSelected={selection.allSelected}
            selectableCount={collectionEntryCount || allCollectionItems.length}
            selectedCount={selection.selectedCount}
            selectionActive={selection.selectionActive}
            onAddToDeck={() => setBulkDeckTarget(bulkSelectionTarget())}
            onAddToList={() => setBulkListTarget(bulkSelectionTarget())}
            onClear={selection.clearSelection}
            onDelete={() => setBulkDeleteTarget(bulkSelectionTarget())}
            onEdit={() => setBulkEditTarget(bulkSelectionTarget())}
            onMove={() => setBulkMoveTarget(bulkSelectionTarget())}
            onSelectAll={selection.selectAll}
          />

          <PageSection count={collectionCountLabel}>
            {allItemsQuery.loading && !allItemsQuery.data ? (
              <EmptyState title="Loading collection..." />
            ) : (
              <VirtualizedCollectionGrid
                hasNextPage={allItemsHasNextPage}
                isFetchingNextPage={isFetchingMoreAllItems}
                isSelected={selection.isSelected}
                items={allCollectionItems}
                onLoadMore={loadMoreAllItems}
                onToggleSelected={selection.toggleItem}
                selectionActive={selection.selectionActive}
              />
            )}
          </PageSection>

          <CollectionFilterModal
            filters={structuredFilters}
            open={isFilterModalOpen}
            onApply={applyStructuredFilters}
            onClear={clearStructuredFilters}
            onClose={() => setIsFilterModalOpen(false)}
          />
        </div>
      )}
      <AddCollectionItemDialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen} />
      <AddLocationDialog open={isAddLocationOpen} onOpenChange={setIsAddLocationOpen} />
      <ImportCollectionDialog
        initialImport={sharedImport}
        open={isImportOpen}
        onOpenChange={(open) => {
          setIsImportOpen(open)
          if (!open) setSharedImport(null)
        }}
      />
      <ExportCollectionDialog
        filters={filters}
        format="csv"
        open={isExportCsvOpen}
        onOpenChange={setIsExportCsvOpen}
        fileName="collection.csv"
      />
      <SellCardsDialog
        open={isSellCardsOpen}
        onDone={finishBulkCollectionAction}
        onOpenChange={setIsSellCardsOpen}
      />
      <ExportCollectionDialog
        filters={exportingLocation ? { locationId: exportingLocation.location.id } : {}}
        format={exportingLocation?.format || "csv"}
        title={
          exportingLocation
            ? `Export ${exportingLocation.location.name} ${exportingLocation.format.toUpperCase()}`
            : undefined
        }
        fileName={
          exportingLocation
            ? `${exportingLocation.location.name}.${exportingLocation.format === "csv" ? "csv" : "txt"}`
            : undefined
        }
        open={Boolean(exportingLocation)}
        onOpenChange={(open) => !open && setExportingLocation(null)}
      />
      <ConfirmDialog
        destructive
        confirmLabel="Delete location"
        open={Boolean(deletingLocation)}
        title={deletingLocation ? `Delete ${deletingLocation.name}?` : "Delete location?"}
        onConfirm={deleteSelectedLocation}
        onOpenChange={(open) => !open && setDeletingLocation(null)}
      >
        Cards in this location will become unfiled.
      </ConfirmDialog>
      <AutoSortSetupDialog open={isAutoSortSetupOpen} onOpenChange={setIsAutoSortSetupOpen} />
      <AutoSortSummaryDialog
        open={Boolean(autoSortResult)}
        result={autoSortResult}
        onOpenChange={(open) => !open && setAutoSortResult(null)}
        applyPending={autoSortCollection.loading}
        onApply={applyCollectionAutoSort}
      />
      <AddCollectionItemToDeckDialog
        item={bulkDeckTarget}
        onDone={finishBulkCollectionAction}
        onOpenChange={(open) => !open && setBulkDeckTarget(null)}
      />
      <BulkEditCollectionItemsDialog
        item={bulkEditTarget}
        onDone={finishBulkCollectionAction}
        onOpenChange={(open) => !open && setBulkEditTarget(null)}
      />
      <MoveCollectionItemDialog
        item={bulkListTarget}
        listOnly
        onDone={finishBulkCollectionAction}
        onOpenChange={(open) => !open && setBulkListTarget(null)}
      />
      <MoveCollectionItemDialog
        item={bulkMoveTarget}
        onDone={finishBulkCollectionAction}
        onOpenChange={(open) => !open && setBulkMoveTarget(null)}
      />
      <DeleteCollectionItemDialog
        item={bulkDeleteTarget}
        onDone={finishBulkCollectionAction}
        onOpenChange={(open) => !open && setBulkDeleteTarget(null)}
      />
      <EditLocationDialog
        location={editingLocation}
        onOpenChange={(open) => !open && setEditingLocation(null)}
      />
    </>
  )
}
