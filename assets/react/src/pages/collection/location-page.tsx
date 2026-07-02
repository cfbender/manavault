import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Boxes, CheckSquare, ListFilter, Search, WandSparkles } from "lucide-react"
import type * as React from "react"
import { useCallback, useMemo, useState } from "react"
import { PageSection } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { CardNameSearchField } from "../../components/card-name-search-field"
import { ImageSummaryCard } from "../../components/image-summary-card"
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
import { useLocalStorageState } from "../../lib/use-local-storage"
import { usePageTitle } from "../../lib/page-title"
import { cn, compactNumber, pluralize, present, titleize } from "../../lib/utils"
import { AutoSortSetupDialog, hasEnabledAutoSortRules } from "./auto-sort-setup-dialog"
import { AutoSortSummaryDialog } from "./auto-sort-summary-dialog"
import { invalidateCollectionViews } from "./collection-navigation"
import { COLLECTION_PAGE_SIZE, DEFAULT_COLLECTION_SORT } from "./constants"
import {
  AutoSortCollectionDocument,
  CollectionItemFormOptionsDocument,
  CollectionItemsPageDocument,
  DeleteLocationDocument,
  LocationCollectionCountDocument,
  LocationDocument,
} from "./documents"
import { CollectionFilterModal } from "./filter-modal"
import { ExportCollectionDialog } from "./import-export-dialogs"
import {
  AddCollectionItemToDeckDialog,
  BulkEditCollectionItemsDialog,
  DeleteCollectionItemDialog,
  MoveCollectionItemDialog,
} from "./item-dialogs"
import { EditLocationDialog } from "./location-dialogs"
import { SummaryActionMenu, UnfiledLocationCard, isUnfiledLocation } from "./location-summary"
import {
  CollectionBulkActionBar,
  VirtualizedCollectionGrid,
  useCollectionItemSelection,
} from "./selection-grid"
import { SortDropdown } from "./sort-controls"
import { collectionLocationStateStoragePrefix, collectionSortStorageKey } from "./storage-keys"
import {
  createEmptyCollectionFilters,
  deserializeCollectionSort,
  hasNoCollectionFilters,
  isBlankStorageString,
  isDefaultCollectionSort,
  serializeStoredCollectionFilters,
} from "./storage"
import type {
  AutoSortCollectionResult,
  CollectionExportFormat,
  CollectionItem,
  CollectionSort,
} from "./types"
import { collectionValueLine } from "./value-summary"

const LOCATION_PAGE_SORT_STORAGE_KEY = collectionSortStorageKey("location")

export function LocationPage({ id }: { id: string }) {
  const locationStateStoragePrefix = collectionLocationStateStoragePrefix(id)
  const [q, setQ] = useLocalStorageState<string>(`${locationStateStoragePrefix}.searchDraft`, "", {
    shouldRemove: isBlankStorageString,
  })
  const [appliedSearch, setAppliedSearch] = useLocalStorageState<string>(
    `${locationStateStoragePrefix}.appliedSearch`,
    "",
    { shouldRemove: isBlankStorageString },
  )
  const [sort, setSort] = useLocalStorageState<CollectionSort>(
    LOCATION_PAGE_SORT_STORAGE_KEY,
    DEFAULT_COLLECTION_SORT,
    { deserialize: deserializeCollectionSort, shouldRemove: isDefaultCollectionSort },
  )
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [isEditLocationOpen, setIsEditLocationOpen] = useState(false)
  const [isDeleteLocationOpen, setIsDeleteLocationOpen] = useState(false)
  const [exportLocationFormat, setExportLocationFormat] = useState<CollectionExportFormat | null>(
    null,
  )
  const [isAutoSortSetupOpen, setIsAutoSortSetupOpen] = useState(false)
  const [autoSortResult, setAutoSortResult] = useState<AutoSortCollectionResult | null>(null)
  const [autoSortError, setAutoSortError] = useState<string | null>(null)
  const [bulkDeckTarget, setBulkDeckTarget] = useState<CollectionItem[] | null>(null)
  const [bulkListTarget, setBulkListTarget] = useState<CollectionItem[] | null>(null)
  const [bulkMoveTarget, setBulkMoveTarget] = useState<CollectionItem[] | null>(null)
  const [bulkEditTarget, setBulkEditTarget] = useState<CollectionItem[] | null>(null)
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<CollectionItem[] | null>(null)
  const [isSelectingAllLocationItems, setIsSelectingAllLocationItems] = useState(false)
  const [isFetchingMoreLocationItems, setIsFetchingMoreLocationItems] = useState(false)
  const [structuredFilters, setStructuredFilters] = useLocalStorageState<CollectionFilterState>(
    `${locationStateStoragePrefix}.filters`,
    createEmptyCollectionFilters,
    {
      deserialize: decodeCollectionFilters,
      serialize: serializeStoredCollectionFilters,
      shouldRemove: hasNoCollectionFilters,
    },
  )
  const navigate = useNavigate()
  const client = useApolloClient()
  const { showToast } = useToast()
  const [deleteLocationMutation] = useMutation(DeleteLocationDocument)
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedCollectionQuery = combineCollectionQueries(appliedSearch, structuredFilterSyntax)
  const itemFilters = useMemo(
    () => ({
      locationId: id,
      ...(combinedCollectionQuery ? { q: combinedCollectionQuery } : {}),
    }),
    [combinedCollectionQuery, id],
  )
  const { data, loading: isLoading } = useQuery(LocationDocument, {
    variables: { id },
    fetchPolicy: "cache-and-network",
  })
  const autoSortRuleOptionsQuery = useQuery(CollectionItemFormOptionsDocument, {
    skip: id !== "unfiled",
    fetchPolicy: "cache-and-network",
  })
  const countQuery = useQuery(LocationCollectionCountDocument, {
    variables: { filters: itemFilters },
    fetchPolicy: "cache-and-network",
  })
  const itemsQuery = useQuery(CollectionItemsPageDocument, {
    variables: {
      filters: itemFilters,
      sort,
      first: COLLECTION_PAGE_SIZE,
      after: null,
    },
    fetchPolicy: "cache-and-network",
  })
  const itemsPageInfo = itemsQuery.data?.collectionItems.pageInfo
  const itemsHasNextPage = Boolean(itemsPageInfo?.hasNextPage)
  const collectionItems = useMemo(
    () => (itemsQuery.data?.collectionItems.edges || []).map((edge) => edge?.node).filter(present),
    [itemsQuery.data],
  )
  const selection = useCollectionItemSelection(collectionItems)
  const autoSortRules = autoSortRuleOptionsQuery.data?.collectionAutoSortRules ?? []
  const [autoSortUnfiledMutation, autoSortUnfiled] = useMutation(AutoSortCollectionDocument)
  const fetchMoreLocationItemsPage = useCallback(
    (after: string | null | undefined) =>
      itemsQuery.fetchMore({
        variables: {
          filters: itemFilters,
          sort,
          first: COLLECTION_PAGE_SIZE,
          after: after ?? null,
        },
      }),
    [itemFilters, itemsQuery, sort],
  )
  const loadMore = useCallback(() => {
    if (isSelectingAllLocationItems || isFetchingMoreLocationItems || !itemsHasNextPage) return

    setIsFetchingMoreLocationItems(true)
    void fetchMoreLocationItemsPage(itemsPageInfo?.endCursor).finally(() =>
      setIsFetchingMoreLocationItems(false),
    )
  }, [
    fetchMoreLocationItemsPage,
    isFetchingMoreLocationItems,
    isSelectingAllLocationItems,
    itemsHasNextPage,
    itemsPageInfo?.endCursor,
  ])
  const location = data?.location
  usePageTitle(location?.name ?? (isLoading ? "Collection Location" : "Location not found"))
  const activeStructuredFilterCount = countActiveCollectionFilters(structuredFilters)
  const hasLocationFilters = Boolean(combinedCollectionQuery)
  const locationCountLabel = `${countQuery.data?.collectionItemCount ?? location?.itemCount ?? 0} ${hasLocationFilters ? "shown" : "total"}`

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applyLocationSearch(q)
  }

  function applyLocationSearch(value: string) {
    setQ(value)
    setAppliedSearch(value.trim())
  }

  function updateLocationSearchDraft(value: string) {
    setQ(value)
    if (!value.trim()) setAppliedSearch("")
  }

  function clearLocationSearch() {
    setQ("")
    setAppliedSearch("")
  }

  function clearStructuredFilters() {
    setStructuredFilters(createEmptyCollectionFilters())
  }

  function applyStructuredFilters(nextFilters: CollectionFilterState) {
    setStructuredFilters(nextFilters)
    setIsFilterModalOpen(false)
  }

  async function selectAllLocationItems() {
    if (isSelectingAllLocationItems || isFetchingMoreLocationItems) return

    let itemsToSelect = collectionItems
    let pageInfo = itemsPageInfo

    if (!pageInfo?.hasNextPage) {
      selection.selectItems(itemsToSelect)
      return
    }

    setIsSelectingAllLocationItems(true)
    try {
      while (pageInfo?.hasNextPage) {
        const result = await fetchMoreLocationItemsPage(pageInfo.endCursor)
        const nextConnection = result.data?.collectionItems
        const nextItems = nextConnection?.edges?.map((edge) => edge?.node).filter(present) || []

        itemsToSelect = [...itemsToSelect, ...nextItems]
        pageInfo = nextConnection?.pageInfo
      }

      selection.selectItems(itemsToSelect)
    } finally {
      setIsSelectingAllLocationItems(false)
    }
  }

  function finishBulkLocationAction() {
    void invalidateCollectionViews(client, id)
    selection.clearSelection()
  }

  function deleteCurrentLocation() {
    if (!location || isUnfiledLocation(location)) return
    const locationName = location.name
    void deleteLocationMutation({
      variables: { id: location.id },
      onCompleted: () => {
        void invalidateCollectionViews(client, id)
        showToast(`Deleted location ${locationName}`)
        navigate({ to: "/collection", search: { importFile: false } })
      },
    })
  }

  function runUnfiledAutoSort(dryRun: boolean) {
    void autoSortUnfiledMutation({
      variables: { input: { sourceLocationId: "unfiled", dryRun } },
      onCompleted: (data) => {
        const result = data.autoSortCollection?.autoSortResult
        if (!dryRun) {
          void invalidateCollectionViews(client, id)
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
        setAutoSortError(
          error instanceof Error ? error.message : "Could not auto-sort unfiled cards",
        )
      },
    })
  }

  function previewUnfiledAutoSort() {
    setAutoSortResult(null)
    setAutoSortError(null)

    if (!hasEnabledAutoSortRules(autoSortRules)) {
      setIsAutoSortSetupOpen(true)
      return
    }

    runUnfiledAutoSort(true)
  }

  function applyUnfiledAutoSort() {
    setAutoSortError(null)
    runUnfiledAutoSort(false)
  }

  if (isLoading) return <EmptyState title="Loading location..." />
  if (!location) return <EmptyState title="Location not found" />

  return (
    <>
      <div className="mb-7 space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/collection" search={{ importFile: false }}>
            Back to collection
          </Link>
        </Button>
        {isUnfiledLocation(location) ? (
          <UnfiledLocationCard
            location={location}
            countLine={`${compactNumber(location.itemCount || 0)} cards`}
            priceLine={collectionValueLine(location.valueSummary)}
            detailLine={location.description}
            interactive={false}
          />
        ) : (
          <ImageSummaryCard
            imageUrl={location.coverPrinting?.artCropUrl}
            fallback={<Boxes className="h-12 w-12" />}
            typeLine={<Badge>{titleize(location.kind)}</Badge>}
            countLine={`${compactNumber(location.itemCount || 0)} cards`}
            priceLine={collectionValueLine(location.valueSummary)}
            nameLine={location.name}
            detailLine={location.description}
            interactive={false}
            actionSlot={
              <SummaryActionMenu
                label={`${location.name} actions`}
                onEdit={() => setIsEditLocationOpen(true)}
                onExportCsv={() => setExportLocationFormat("csv")}
                onExportText={() => setExportLocationFormat("text")}
                onDelete={() => setIsDeleteLocationOpen(true)}
              />
            }
          />
        )}
      </div>
      <form
        onSubmit={submit}
        className={cn(
          "control-toolbar mb-7 grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm",
          isUnfiledLocation(location)
            ? "sm:grid-cols-[1fr_auto_auto_auto_auto_auto]"
            : "sm:grid-cols-[1fr_auto_auto_auto_auto]",
        )}
      >
        <CardNameSearchField
          name="q"
          value={q}
          onValueChange={updateLocationSearchDraft}
          onClear={clearLocationSearch}
          onSuggestionSelect={applyLocationSearch}
          placeholder="Filter location"
        />
        <SortDropdown sort={sort} onSortChange={setSort} />
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
          {activeStructuredFilterCount ? (
            <span className="badge badge-primary badge-sm absolute -right-2 -top-2 min-w-5">
              {activeStructuredFilterCount}
            </span>
          ) : null}
        </Button>
        {isUnfiledLocation(location) ? (
          <Button
            type="button"
            variant="outline"
            disabled={autoSortRuleOptionsQuery.loading || autoSortUnfiled.loading}
            onClick={previewUnfiledAutoSort}
          >
            <WandSparkles className="h-4 w-4" />
            {autoSortUnfiled.loading ? "Previewing..." : "Preview unfiled sort"}
          </Button>
        ) : null}
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>
      {autoSortError ? (
        <p
          role="alert"
          className="mb-5 rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
        >
          {autoSortError}
        </p>
      ) : null}
      {itemsQuery.loading && !itemsQuery.data ? (
        <EmptyState title="Loading collection..." />
      ) : (
        <div className="space-y-7">
          <CollectionBulkActionBar
            allLoadedSelected={selection.allLoadedSelected}
            hasNextPage={itemsHasNextPage}
            isSelectAllPending={isSelectingAllLocationItems || isFetchingMoreLocationItems}
            loadedCount={collectionItems.length}
            selectedCount={selection.selectedCount}
            selectionActive={selection.selectionActive}
            onAddToDeck={() => setBulkDeckTarget(selection.selectedItems)}
            onAddToList={() => setBulkListTarget(selection.selectedItems)}
            onClear={selection.clearSelection}
            onEdit={() => setBulkEditTarget(selection.selectedItems)}
            onDelete={() => setBulkDeleteTarget(selection.selectedItems)}
            onMove={() => setBulkMoveTarget(selection.selectedItems)}
            onSelectAll={() => void selectAllLocationItems()}
          />
          <PageSection count={locationCountLabel}>
            <VirtualizedCollectionGrid
              hasNextPage={itemsHasNextPage}
              isFetchingNextPage={isFetchingMoreLocationItems}
              items={collectionItems}
              onLoadMore={loadMore}
              onToggleSelected={selection.toggleItem}
              selectedIds={selection.selectedIds}
              selectionActive={selection.selectionActive}
            />
          </PageSection>
        </div>
      )}
      <AutoSortSetupDialog open={isAutoSortSetupOpen} onOpenChange={setIsAutoSortSetupOpen} />
      <AutoSortSummaryDialog
        open={Boolean(autoSortResult)}
        result={autoSortResult}
        onOpenChange={(open) => !open && setAutoSortResult(null)}
        applyPending={autoSortUnfiled.loading}
        onApply={applyUnfiledAutoSort}
      />
      <EditLocationDialog
        location={location}
        onOpenChange={setIsEditLocationOpen}
        open={isEditLocationOpen}
      />
      <ExportCollectionDialog
        filters={{ locationId: location.id }}
        format={exportLocationFormat || "csv"}
        title={`Export ${location.name} ${(exportLocationFormat || "csv").toUpperCase()}`}
        fileName={`${location.name}.${(exportLocationFormat || "csv") === "csv" ? "csv" : "txt"}`}
        open={Boolean(exportLocationFormat)}
        onOpenChange={(open) => !open && setExportLocationFormat(null)}
      />
      <ConfirmDialog
        destructive
        confirmLabel="Delete location"
        open={isDeleteLocationOpen}
        title={`Delete ${location.name}?`}
        onConfirm={deleteCurrentLocation}
        onOpenChange={setIsDeleteLocationOpen}
      >
        Cards in this location will become unfiled.
      </ConfirmDialog>
      <AddCollectionItemToDeckDialog
        item={bulkDeckTarget}
        onDone={finishBulkLocationAction}
        onOpenChange={(open) => !open && setBulkDeckTarget(null)}
      />
      <BulkEditCollectionItemsDialog
        item={bulkEditTarget}
        onDone={finishBulkLocationAction}
        onOpenChange={(open) => !open && setBulkEditTarget(null)}
      />
      <MoveCollectionItemDialog
        item={bulkListTarget}
        listOnly
        onDone={finishBulkLocationAction}
        onOpenChange={(open) => !open && setBulkListTarget(null)}
      />
      <MoveCollectionItemDialog
        item={bulkMoveTarget}
        onDone={finishBulkLocationAction}
        onOpenChange={(open) => !open && setBulkMoveTarget(null)}
      />
      <DeleteCollectionItemDialog
        item={bulkDeleteTarget}
        onDone={finishBulkLocationAction}
        onOpenChange={(open) => !open && setBulkDeleteTarget(null)}
      />
      <CollectionFilterModal
        filters={structuredFilters}
        open={isFilterModalOpen}
        onApply={applyStructuredFilters}
        onClear={clearStructuredFilters}
        onClose={() => setIsFilterModalOpen(false)}
      />
    </>
  )
}
