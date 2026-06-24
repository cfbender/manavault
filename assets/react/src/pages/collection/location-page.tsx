import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Boxes, CheckSquare, ListFilter, Search } from "lucide-react"
import type * as React from "react"
import { useCallback, useMemo, useState } from "react"
import { PageSection } from "../../components/app-shell"
import { EmptyState } from "../../components/card-image"
import { CardNameSearchField } from "../../components/card-name-search-field"
import { ImageSummaryCard } from "../../components/image-summary-card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import {
  buildCollectionFilterQuery,
  combineCollectionQueries,
  countActiveCollectionFilters,
  decodeCollectionFilters,
  type CollectionFilterState,
} from "../../lib/collection-filters"
import { request } from "../../lib/graphql"
import { useLocalStorageState } from "../../lib/use-local-storage"
import { compactNumber, present, titleize } from "../../lib/utils"
import { invalidateCollectionViews } from "./collection-navigation"
import {
  COLLECTION_LOCATION_STATE_STORAGE_PREFIX,
  COLLECTION_PAGE_SIZE,
  DEFAULT_COLLECTION_SORT,
} from "./constants"
import {
  CollectionItemsPageDocument,
  DeleteLocationDocument,
  LocationCollectionCountDocument,
  LocationDocument,
} from "./documents"
import { CollectionFilterModal } from "./filter-modal"
import { ExportCollectionDialog } from "./import-export-dialogs"
import {
  AddCollectionItemToDeckDialog,
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
import {
  createEmptyCollectionFilters,
  deserializeCollectionSort,
  hasNoCollectionFilters,
  isBlankStorageString,
  isDefaultCollectionSort,
  serializeStoredCollectionFilters,
} from "./storage"
import type { CollectionExportFormat, CollectionItem, CollectionSort } from "./types"
import { collectionValueLine } from "./value-summary"

export function LocationPage({ id }: { id: string }) {
  const locationStateStoragePrefix = `${COLLECTION_LOCATION_STATE_STORAGE_PREFIX}.${encodeURIComponent(id)}`
  const [q, setQ] = useLocalStorageState<string>(`${locationStateStoragePrefix}.searchDraft`, "", {
    shouldRemove: isBlankStorageString,
  })
  const [appliedSearch, setAppliedSearch] = useLocalStorageState<string>(
    `${locationStateStoragePrefix}.appliedSearch`,
    "",
    { shouldRemove: isBlankStorageString },
  )
  const [sort, setSort] = useLocalStorageState<CollectionSort>(
    `${locationStateStoragePrefix}.sort`,
    DEFAULT_COLLECTION_SORT,
    { deserialize: deserializeCollectionSort, shouldRemove: isDefaultCollectionSort },
  )
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [isEditLocationOpen, setIsEditLocationOpen] = useState(false)
  const [isDeleteLocationOpen, setIsDeleteLocationOpen] = useState(false)
  const [exportLocationFormat, setExportLocationFormat] = useState<CollectionExportFormat | null>(
    null,
  )
  const [bulkDeckTarget, setBulkDeckTarget] = useState<CollectionItem[] | null>(null)
  const [bulkListTarget, setBulkListTarget] = useState<CollectionItem[] | null>(null)
  const [bulkMoveTarget, setBulkMoveTarget] = useState<CollectionItem[] | null>(null)
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<CollectionItem[] | null>(null)
  const [isSelectingAllLocationItems, setIsSelectingAllLocationItems] = useState(false)
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
  const queryClient = useQueryClient()
  const deleteLocation = useMutation({
    mutationFn: (locationId: string) => request(DeleteLocationDocument, { id: locationId }),
    onSuccess: () => {
      invalidateCollectionViews(queryClient, id)
      navigate({ to: "/collection", search: { importFile: false } })
    },
  })
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedCollectionQuery = combineCollectionQueries(appliedSearch, structuredFilterSyntax)
  const itemFilters = useMemo(
    () => ({
      locationId: id,
      ...(combinedCollectionQuery ? { q: combinedCollectionQuery } : {}),
    }),
    [combinedCollectionQuery, id],
  )
  const { data, isLoading } = useQuery({
    queryKey: ["location", id],
    queryFn: () => request(LocationDocument, { id }),
  })
  const countQuery = useQuery({
    queryKey: ["collection-items", "location", id, "count", itemFilters],
    queryFn: () => request(LocationCollectionCountDocument, { filters: itemFilters }),
  })
  const itemsQuery = useInfiniteQuery({
    queryKey: ["collection-items", "location", id, itemFilters, sort],
    queryFn: ({ pageParam }) =>
      request(CollectionItemsPageDocument, {
        filters: itemFilters,
        sort,
        first: COLLECTION_PAGE_SIZE,
        after: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.collectionItems.pageInfo.hasNextPage
        ? (lastPage.collectionItems.pageInfo.endCursor ?? undefined)
        : undefined,
  })
  const collectionItems = useMemo(
    () =>
      itemsQuery.data?.pages.flatMap((page) =>
        (page.collectionItems.edges || []).map((edge) => edge?.node).filter(present),
      ) || [],
    [itemsQuery.data],
  )
  const selection = useCollectionItemSelection(collectionItems)
  const loadMore = useCallback(() => {
    if (isSelectingAllLocationItems) return
    void itemsQuery.fetchNextPage()
  }, [isSelectingAllLocationItems, itemsQuery])
  const location = data?.location
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
    if (isSelectingAllLocationItems || itemsQuery.isFetchingNextPage) return

    let itemsToSelect = collectionItems

    if (!itemsQuery.hasNextPage) {
      selection.selectItems(itemsToSelect)
      return
    }

    setIsSelectingAllLocationItems(true)
    try {
      let hasNextPage: boolean = itemsQuery.hasNextPage

      while (hasNextPage) {
        const result = await itemsQuery.fetchNextPage()
        itemsToSelect =
          result.data?.pages.flatMap((page) =>
            (page.collectionItems.edges || []).map((edge) => edge?.node).filter(present),
          ) || itemsToSelect
        hasNextPage = result.hasNextPage
      }

      selection.selectItems(itemsToSelect)
    } finally {
      setIsSelectingAllLocationItems(false)
    }
  }

  function finishBulkLocationAction() {
    invalidateCollectionViews(queryClient, id)
    selection.clearSelection()
  }

  function deleteCurrentLocation() {
    if (!location || isUnfiledLocation(location)) return
    deleteLocation.mutate(location.id)
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
        className="control-toolbar mb-7 grid gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto_auto_auto]"
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
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>
      {itemsQuery.isLoading ? (
        <EmptyState title="Loading collection..." />
      ) : (
        <div className="space-y-7">
          <CollectionBulkActionBar
            allLoadedSelected={selection.allLoadedSelected}
            hasNextPage={Boolean(itemsQuery.hasNextPage)}
            isSelectAllPending={isSelectingAllLocationItems || itemsQuery.isFetchingNextPage}
            loadedCount={collectionItems.length}
            selectedCount={selection.selectedCount}
            selectionActive={selection.selectionActive}
            onAddToDeck={() => setBulkDeckTarget(selection.selectedItems)}
            onAddToList={() => setBulkListTarget(selection.selectedItems)}
            onClear={selection.clearSelection}
            onDelete={() => setBulkDeleteTarget(selection.selectedItems)}
            onMove={() => setBulkMoveTarget(selection.selectedItems)}
            onSelectAll={() => void selectAllLocationItems()}
          />
          <PageSection count={locationCountLabel}>
            <VirtualizedCollectionGrid
              hasNextPage={itemsQuery.hasNextPage}
              isFetchingNextPage={itemsQuery.isFetchingNextPage}
              items={collectionItems}
              onLoadMore={loadMore}
              onToggleSelected={selection.toggleItem}
              selectedIds={selection.selectedIds}
              selectionActive={selection.selectionActive}
            />
          </PageSection>
        </div>
      )}
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
