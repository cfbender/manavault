import { Link, useNavigate } from "@tanstack/react-router"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import {
  ArrowDownUp,
  Boxes,
  CheckSquare,
  Download,
  Edit3,
  Layers,
  ListFilter,
  ListPlus,
  MoreVertical,
  MoveUpRight,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PageHeader, PageSection } from "../components/app-shell"
import { EmptyState } from "../components/card-image"
import { CardNameSearchField } from "../components/card-name-search-field"
import { addToDeckAction, addToListAction, CardTile } from "../components/card-tile"
import { ImageSummaryCard } from "../components/image-summary-card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { ConfirmDialog } from "../components/ui/confirm-dialog"
import { Card } from "../components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { graphql } from "../gql"
import {
  CollectionItemsPageDocument as GeneratedCollectionItemsPageDocument,
  type CollectionQuery,
  type LocationCoverCardSearchQuery,
  type LocationQuery,
  type PreviewCollectionImportMutation,
} from "../gql/graphql"
import { request } from "../lib/graphql"
import {
  subscribeSharedImport,
  takePendingNativeSharedImport,
  type SharedImportPayload,
} from "../lib/native-shared-import"
import {
  buildCollectionFilterQuery,
  cloneCollectionFilters,
  combineCollectionQueries,
  countActiveCollectionFilters,
  EMPTY_COLLECTION_FILTERS,
  type CollectionFilterState,
  type ColorOperator,
  type ComparisonOperator,
  type FinishFilter,
  type ManaColor,
  type RarityFilter,
} from "../lib/collection-filters"
import { cn, compactNumber, present, titleize } from "../lib/utils"

const CollectionDocument = graphql(`
  query Collection($filters: CollectionItemFilters) {
    locations {
      id
      name
      kind
      description
      itemCount
      totalPriceText
      valueSummary {
        totalPriceText
        purchasePriceText
        valueGainText
        valueGainPercentText
      }
      coverPrinting {
        scryfallId
        artCropUrl
      }
    }
    collectionValueSummary {
      totalPriceText
      purchasePriceText
      valueGainText
      valueGainPercentText
    }
    collectionItemCount(filters: $filters)
  }
`)

const LocationDocument = graphql(`
  query Location($id: ID!) {
    location(id: $id) {
      id
      name
      kind
      description
      itemCount
      totalPriceText
      valueSummary {
        totalPriceText
        purchasePriceText
        valueGainText
        valueGainPercentText
      }
      coverPrinting {
        scryfallId
        artCropUrl
      }
    }
  }
`)

const LocationCollectionCountDocument = graphql(`
  query LocationCollectionCount($filters: CollectionItemFilters) {
    collectionItemCount(filters: $filters)
  }
`)

const LocationCoverCardSearchDocument = graphql(`
  query LocationCoverCardSearch($q: String!, $limit: Int!) {
    cards(q: $q, limit: $limit) {
      oracleId
      name
      typeLine
      printings {
        scryfallId
        setCode
        setName
        collectorNumber
        finishes
        imageUrl
        artCropUrl
        rarity
      }
    }
  }
`)

const CollectionItemFormOptionsDocument = graphql(`
  query CollectionItemFormOptions {
    locations {
      id
      name
      kind
    }
  }
`)

const CollectionItemDeckOptionsDocument = graphql(`
  query CollectionItemDeckOptions {
    decks {
      id
      name
      format
      status
    }
  }
`)

const CreateCollectionItemDocument = graphql(`
  mutation CreateCollectionItem($input: CollectionItemInput!) {
    createCollectionItem(input: $input) {
      id
      quantity
      condition
      language
      finish
      notes
      priceText
      purchasePriceCents
      purchasePriceText
      valueGainText
      valueGainPercentText
      allocatedQuantity
      location {
        id
        name
      }
      printing {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
        card {
          oracleId
          name
          typeLine
        }
      }
    }
  }
`)

const UpdateCollectionItemDocument = graphql(`
  mutation UpdateCollectionItem($id: ID!, $input: CollectionItemUpdateInput!) {
    updateCollectionItem(id: $id, input: $input) {
      id
      quantity
      condition
      language
      finish
      notes
      priceText
      purchasePriceCents
      purchasePriceText
      valueGainText
      valueGainPercentText
      allocatedQuantity
      location {
        id
        name
      }
      printing {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
        card {
          oracleId
          name
          typeLine
        }
      }
    }
  }
`)

const DeleteCollectionItemDocument = graphql(`
  mutation DeleteCollectionItem($id: ID!) {
    deleteCollectionItem(id: $id) {
      id
    }
  }
`)

const AddCollectionItemToDeckDocument = graphql(`
  mutation AddCollectionItemToDeck($id: ID!, $deckId: ID!, $zone: String) {
    addCollectionItemToDeck(id: $id, deckId: $deckId, zone: $zone) {
      id
      quantity
      zone
      finish
      card {
        oracleId
        name
      }
      preferredPrinting {
        scryfallId
        setCode
        collectorNumber
        imageUrl
      }
    }
  }
`)

const CreateLocationDocument = graphql(`
  mutation CreateLocation($input: LocationInput!) {
    createLocation(input: $input) {
      id
      name
      kind
      description
      itemCount
      totalPriceText
      valueSummary {
        totalPriceText
        purchasePriceText
        valueGainText
        valueGainPercentText
      }
      coverPrinting {
        scryfallId
        artCropUrl
      }
    }
  }
`)

const UpdateLocationDocument = graphql(`
  mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
    updateLocation(id: $id, input: $input) {
      id
      name
      kind
      description
      itemCount
      totalPriceText
      valueSummary {
        totalPriceText
        purchasePriceText
        valueGainText
        valueGainPercentText
      }
      coverPrinting {
        scryfallId
        artCropUrl
      }
    }
  }
`)

const DeleteLocationDocument = graphql(`
  mutation DeleteLocation($id: ID!) {
    deleteLocation(id: $id) {
      id
      name
    }
  }
`)

const CollectionItemsPageDocument = graphql(`
  query CollectionItemsPage(
    $filters: CollectionItemFilters
    $sort: CollectionItemSort
    $limit: Int!
    $offset: Int!
  ) {
    collectionItems(filters: $filters, sort: $sort, limit: $limit, offset: $offset) {
      id
      quantity
      condition
      language
      finish
      notes
      priceText
      purchasePriceCents
      purchasePriceText
      valueGainText
      valueGainPercentText
      allocatedQuantity
      location {
        id
        name
      }
      printing {
        scryfallId
        setCode
        setName
        collectorNumber
        imageUrl
        rarity
        card {
          oracleId
          name
          typeLine
        }
      }
    }
  }
`) as typeof GeneratedCollectionItemsPageDocument

const CollectionExportCsvDocument = graphql(`
  query CollectionExportCsv($filters: CollectionItemFilters) {
    collectionExportCsv(filters: $filters)
  }
`)

const CollectionExportTextDocument = graphql(`
  query CollectionExportText($filters: CollectionItemFilters) {
    collectionExportText(filters: $filters)
  }
`)

const PreviewCollectionImportDocument = graphql(`
  mutation PreviewCollectionImport($input: CollectionImportPreviewInput!) {
    previewCollectionImport(input: $input) {
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
          scryfallId
          setCode
          setName
          collectorNumber
          imageUrl
          rarity
          card {
            oracleId
            name
            typeLine
          }
        }
        candidates {
          scryfallId
          setCode
          setName
          collectorNumber
          imageUrl
          rarity
          card {
            oracleId
            name
            typeLine
          }
        }
      }
    }
  }
`)

const CommitCollectionImportDocument = graphql(`
  mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
    commitCollectionImport(input: $input) {
      imported
      skipped
    }
  }
`)

const COLLECTION_PAGE_SIZE = 48
const CARD_TILE_WIDTH = 228
const CARD_TILE_ROW_HEIGHT = 352
const CARD_TILE_GAP = 24

type CollectionItem = {
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

type CollectionTab = "locations" | "all"
type CollectionSortField = "quantity" | "name" | "set" | "rarity" | "price" | "added"
type CollectionSortDirection = "asc" | "desc"
type CollectionSort = {
  field: CollectionSortField
  direction: CollectionSortDirection
}
type CollectionExportFormat = "csv" | "text"
type CollectionImportFormat = "auto" | "csv" | "txt"
type PreviewCollectionImportValues = {
  fileName: string
  format: CollectionImportFormat
  locationId: string
  text: string
}
type CollectionExportFilters = { locationId?: string; q?: string }

const SORT_OPTIONS: { field: CollectionSortField; label: string }[] = [
  { field: "quantity", label: "Quantity" },
  { field: "name", label: "Card name" },
  { field: "set", label: "Set" },
  { field: "rarity", label: "Rarity" },
  { field: "price", label: "Price" },
  { field: "added", label: "Added date" },
]

const COLOR_OPTIONS: { value: ManaColor; label: string; symbol: string }[] = [
  { value: "w", label: "White", symbol: "W" },
  { value: "u", label: "Blue", symbol: "U" },
  { value: "b", label: "Black", symbol: "B" },
  { value: "r", label: "Red", symbol: "R" },
  { value: "g", label: "Green", symbol: "G" },
  { value: "c", label: "Colorless", symbol: "C" },
]

const RARITY_OPTIONS: {
  value: RarityFilter
  label: string
  className: string
}[] = [
  { value: "common", label: "Common", className: "bg-zinc-300" },
  { value: "uncommon", label: "Uncommon", className: "bg-slate-400" },
  { value: "rare", label: "Rare", className: "bg-yellow-400" },
  { value: "mythic", label: "Mythic", className: "bg-orange-400" },
]

const COMPARISON_OPTIONS: ComparisonOperator[] = ["=", "!=", ">", ">=", "<", "<="]
const COLOR_OPERATOR_OPTIONS: { value: ColorOperator; label: string }[] = [
  { value: ":", label: "Exactly" },
  { value: ">=", label: "Includes" },
  { value: "<=", label: "At most" },
]

const TYPE_OPTIONS = [
  "Creature",
  "Land",
  "Artifact",
  "Enchantment",
  "Instant",
  "Sorcery",
  "Planeswalker",
  "Battle",
  "Legendary",
  "Basic",
  "Token",
  "Kindred",
]

type CollectionItemTarget = CollectionItem | CollectionItem[] | null

function collectionTargetItems(target: CollectionItemTarget) {
  if (!target) return []
  return Array.isArray(target) ? target : [target]
}

function collectionTargetLabel(target: CollectionItemTarget) {
  const items = collectionTargetItems(target)
  if (items.length === 1) return items[0].printing?.card?.name || "Collection item"
  return `${items.length} selected items`
}

function invalidateCollectionViews(queryClient: QueryClient, locationId?: string) {
  queryClient.invalidateQueries({ queryKey: ["collection"] })
  queryClient.invalidateQueries({ queryKey: ["collection-items"] })
  queryClient.invalidateQueries({ queryKey: ["home"] })
  if (locationId) queryClient.invalidateQueries({ queryKey: ["location", locationId] })
}

function useCollectionItemSelection(items: CollectionItem[]) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  )
  const selectedCount = selectedItems.length
  const selectionActive = selectionMode || selectedCount > 0
  const allLoadedSelected = items.length > 0 && selectedCount === items.length

  useEffect(() => {
    const loadedIds = new Set(items.map((item) => item.id))
    setSelectedIds((current) => {
      let changed = false
      const next = new Set<string>()

      for (const id of current) {
        if (loadedIds.has(id)) next.add(id)
        else changed = true
      }

      return changed ? next : current
    })
  }, [items])

  const toggleItem = useCallback((item: CollectionItem) => {
    setSelectionMode(true)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }, [])

  const selectLoaded = useCallback(() => {
    setSelectionMode(true)
    setSelectedIds(new Set(items.map((item) => item.id)))
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelectionMode = useCallback(() => {
    if (selectionActive) clearSelection()
    else setSelectionMode(true)
  }, [clearSelection, selectionActive])

  return {
    allLoadedSelected,
    clearSelection,
    selectLoaded,
    selectedCount,
    selectedIds,
    selectedItems,
    selectionActive,
    toggleItem,
    toggleSelectionMode,
  }
}

function CollectionBulkActionBar({
  allLoadedSelected,
  loadedCount,
  onAddToDeck,
  onAddToList,
  onClear,
  onDelete,
  onMove,
  onSelectLoaded,
  selectedCount,
  selectionActive,
}: {
  allLoadedSelected: boolean
  loadedCount: number
  onAddToDeck: () => void
  onAddToList: () => void
  onClear: () => void
  onDelete: () => void
  onMove: () => void
  onSelectLoaded: () => void
  selectedCount: number
  selectionActive: boolean
}) {
  if (!selectionActive) return null

  const hasSelection = selectedCount > 0

  return (
    <div className="sticky top-2 z-40 rounded-box border border-primary/30 bg-base-100/95 p-3 shadow-xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={hasSelection ? "primary" : "neutral"}>{selectedCount} selected</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadedCount === 0 || allLoadedSelected}
            onClick={onSelectLoaded}
          >
            <CheckSquare className="h-4 w-4" />
            Select loaded
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={!hasSelection} onClick={onAddToDeck}>
            <Layers className="h-4 w-4" />
            Add to deck
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasSelection}
            onClick={onAddToList}
          >
            <ListPlus className="h-4 w-4" />
            Add to list
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasSelection}
            onClick={onMove}
          >
            <MoveUpRight className="h-4 w-4" />
            Move
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!hasSelection}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

function VirtualizedCollectionGrid({
  hasNextPage,
  isFetchingNextPage,
  items,
  onLoadMore,
  onToggleSelected,
  selectedIds,
  selectionActive = false,
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  items: CollectionItem[]
  onLoadMore: () => void
  onToggleSelected?: (item: CollectionItem) => void
  selectedIds?: Set<string>
  selectionActive?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(1)
  const [range, setRange] = useState({ startRow: 0, endRow: 8 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateColumns = () => {
      const width = container.getBoundingClientRect().width
      setColumns(
        Math.max(1, Math.floor((width + CARD_TILE_GAP) / (CARD_TILE_WIDTH + CARD_TILE_GAP))),
      )
    }

    updateColumns()
    const resizeObserver = new ResizeObserver(updateColumns)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const scrollParent = document.querySelector(".app-shell-main")
    const scrollTarget = scrollParent || window
    let frame = 0

    const updateRange = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const container = containerRef.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const overscan = CARD_TILE_ROW_HEIGHT * 3
        const visibleTop = Math.max(0, -rect.top - overscan)
        const visibleBottom = Math.min(
          rowCount * CARD_TILE_ROW_HEIGHT,
          viewportHeight - rect.top + overscan,
        )
        const startRow = Math.max(0, Math.floor(visibleTop / CARD_TILE_ROW_HEIGHT))
        const endRow = Math.max(startRow + 1, Math.ceil(visibleBottom / CARD_TILE_ROW_HEIGHT))

        setRange({ startRow, endRow })
      })
    }

    updateRange()
    scrollTarget.addEventListener("scroll", updateRange, { passive: true })
    window.addEventListener("resize", updateRange)

    return () => {
      cancelAnimationFrame(frame)
      scrollTarget.removeEventListener("scroll", updateRange)
      window.removeEventListener("resize", updateRange)
    }
  }, [columns, items.length])

  const rowCount = Math.ceil(items.length / columns)
  const totalHeight = Math.max(0, rowCount * CARD_TILE_ROW_HEIGHT - CARD_TILE_GAP)
  const startIndex = range.startRow * columns
  const endIndex = Math.min(items.length, range.endRow * columns)
  const visibleItems = items.slice(startIndex, endIndex)

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && endIndex >= items.length - columns * 4) {
      onLoadMore()
    }
  }, [columns, endIndex, hasNextPage, isFetchingNextPage, items.length, onLoadMore])

  if (!items.length) return <EmptyState title="No collection items found" />

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: totalHeight }}>
      <div
        className="grid justify-center gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(14.25rem,14.25rem))]"
        style={{
          transform: `translateY(${range.startRow * CARD_TILE_ROW_HEIGHT}px)`,
        }}
      >
        {visibleItems.map((item) => (
          <CollectionItemTile
            key={item.id}
            isSelected={selectedIds?.has(item.id) || false}
            item={item}
            onToggleSelected={onToggleSelected}
            selectionActive={selectionActive}
          />
        ))}
      </div>
      {isFetchingNextPage ? (
        <div className="absolute inset-x-0 bottom-0 py-6">
          <EmptyState title="Loading more..." />
        </div>
      ) : null}
    </div>
  )
}

function CollectionItemTile({
  isSelected = false,
  item,
  onToggleSelected,
  selectionActive = false,
}: {
  isSelected?: boolean
  item: CollectionItem
  onToggleSelected?: (item: CollectionItem) => void
  selectionActive?: boolean
}) {
  const queryClient = useQueryClient()
  const [deckTarget, setDeckTarget] = useState<CollectionItem | null>(null)
  const [listTarget, setListTarget] = useState<CollectionItem | null>(null)
  const [moveTarget, setMoveTarget] = useState<CollectionItem | null>(null)
  const [editTarget, setEditTarget] = useState<CollectionItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CollectionItem | null>(null)

  function refreshCollection() {
    invalidateCollectionViews(queryClient, item.location?.id)
  }

  return (
    <>
      <CardTile
        allocatedLabel={
          item.allocatedQuantity
            ? `In deck${item.allocatedQuantity > 1 ? ` x${item.allocatedQuantity}` : ""}`
            : undefined
        }
        count={item.quantity}
        defaultActions={[
          {
            icon: <MoveUpRight className="h-4 w-4" />,
            label: "Move",
            onClick: () => setMoveTarget(item),
          },
          {
            icon: <Edit3 className="h-4 w-4" />,
            label: "Edit",
            onClick: () => setEditTarget(item),
          },
          {
            destructive: true,
            icon: <Trash2 className="h-4 w-4" />,
            label: "Delete",
            onClick: () => setDeleteTarget(item),
          },
        ]}
        finish={item.finish}
        imageUrl={item.printing?.imageUrl}
        location={item.location?.name}
        menuActions={[
          addToDeckAction({
            onClick: () => setDeckTarget(item),
            disabled: !item.printing?.card?.oracleId,
          }),
          addToListAction({ onClick: () => setListTarget(item) }),
        ]}
        name={
          <Link
            to="/cards/$id"
            params={{ id: item.printing?.card?.oracleId || "" }}
            className="hover:underline"
          >
            {item.printing?.card?.name || "Unknown card"}
          </Link>
        }
        price={item.priceText}
        rarity={item.printing?.rarity}
        selectable={Boolean(onToggleSelected)}
        selected={isSelected}
        selectionActive={selectionActive}
        selectionLabel={`${isSelected ? "Deselect" : "Select"} ${item.printing?.card?.name || "card"}`}
        setCode={item.printing?.setCode}
        setLabel={`${item.printing?.setCode?.toUpperCase() || "?"} #${item.printing?.collectorNumber || "?"}`}
        setName={item.printing?.setName}
        typeLine={item.printing?.card?.typeLine}
        onToggleSelected={() => onToggleSelected?.(item)}
      />
      <AddCollectionItemToDeckDialog
        item={deckTarget}
        onDone={refreshCollection}
        onOpenChange={(open) => !open && setDeckTarget(null)}
      />
      <MoveCollectionItemDialog
        item={listTarget}
        listOnly
        onDone={refreshCollection}
        onOpenChange={(open) => !open && setListTarget(null)}
      />
      <MoveCollectionItemDialog
        item={moveTarget}
        onDone={refreshCollection}
        onOpenChange={(open) => !open && setMoveTarget(null)}
      />
      <EditCollectionItemDialog
        item={editTarget}
        onDone={refreshCollection}
        onOpenChange={(open) => !open && setEditTarget(null)}
      />
      <DeleteCollectionItemDialog
        item={deleteTarget}
        onDone={refreshCollection}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </>
  )
}

export function CollectionFilterModal({
  filters,
  onApply,
  onClear,
  onClose,
  open,
}: {
  filters: CollectionFilterState
  onApply: (filters: CollectionFilterState) => void
  onClear: () => void
  onClose: () => void
  open: boolean
}) {
  const [draft, setDraft] = useState<CollectionFilterState>(() => cloneCollectionFilters(filters))
  const syntax = buildCollectionFilterQuery(draft)
  const activeCount = countActiveCollectionFilters(draft)

  useEffect(() => {
    if (open) setDraft(cloneCollectionFilters(filters))
  }, [filters, open])

  if (!open) return null

  function update<K extends keyof CollectionFilterState>(key: K, value: CollectionFilterState[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function resetDraft() {
    setDraft(cloneCollectionFilters(EMPTY_COLLECTION_FILTERS))
  }

  function clearAndClose() {
    resetDraft()
    onClear()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent labelledBy="collection-filter-title" className="max-w-4xl">
        <DialogHeader>
          <div>
            <DialogTitle id="collection-filter-title">Filter collection</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Build a Scryfall query from supported collection fields.
            </p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="grid max-h-[calc(100vh-11rem)] overflow-y-auto lg:grid-cols-[1fr_19rem]">
          <div className="divide-y divide-base-300">
            <FilterSection label="Name" syntax='name:"Black Lotus"'>
              <Input
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Card name"
              />
            </FilterSection>

            <FilterSection label="Oracle text" syntax="oracle:draw">
              <Input
                value={draft.oracle}
                onChange={(event) => update("oracle", event.target.value)}
                placeholder="Rules text"
              />
            </FilterSection>

            <FilterSection label="Type" syntax="type:legendary">
              <TypeCombobox
                value={draft.typeLine}
                onValueChange={(value) => update("typeLine", value)}
              />
            </FilterSection>

            <FilterSection label="Colors" syntax="c:w, c>=uw, c:c">
              <ColorFilterControl
                operator={draft.colorOperator}
                selected={draft.colors}
                onOperatorChange={(operator) => update("colorOperator", operator)}
                onSelectedChange={(colors) => update("colors", colors)}
              />
            </FilterSection>

            <FilterSection label="Color identity" syntax="id:u, id<=esper, id:c">
              <ColorFilterControl
                operator={draft.identityOperator}
                selected={draft.identity}
                onOperatorChange={(operator) => update("identityOperator", operator)}
                onSelectedChange={(identity) => update("identity", identity)}
              />
            </FilterSection>

            <FilterSection label="Mana value" syntax="mv>=3">
              <ComparisonFilterControl
                inputMode="decimal"
                operator={draft.manaValueOperator}
                value={draft.manaValue}
                onOperatorChange={(operator) => update("manaValueOperator", operator)}
                onValueChange={(value) => update("manaValue", value)}
              />
            </FilterSection>

            <FilterSection label="Rarity" syntax="rarity:rare">
              <RarityFilterControl
                selected={draft.rarities}
                onSelectedChange={(rarities) => update("rarities", rarities)}
              />
            </FilterSection>

            <FilterSection label="Printing" syntax="set:lea number:232 lang:ja">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={draft.set}
                  onChange={(event) => update("set", event.target.value)}
                  placeholder="Set code or name"
                />
                <ComparisonFilterControl
                  className="sm:col-start-1"
                  inputMode="numeric"
                  operator={draft.collectorOperator}
                  value={draft.collectorNumber}
                  onOperatorChange={(operator) => update("collectorOperator", operator)}
                  onValueChange={(value) => update("collectorNumber", value)}
                />
                <Input
                  value={draft.language}
                  onChange={(event) => update("language", event.target.value)}
                  placeholder="Language"
                />
              </div>
            </FilterSection>

            <FilterSection label="Finish" syntax="is:foil">
              <SegmentedFilter
                options={[
                  { value: "any", label: "Any" },
                  { value: "foil", label: "Foil" },
                  { value: "nonfoil", label: "Non-foil" },
                  { value: "etched", label: "Etched" },
                ]}
                value={draft.finish}
                onChange={(finish) => update("finish", finish as FinishFilter)}
              />
            </FilterSection>

            <FilterSection label="USD price" syntax="usd<10">
              <ComparisonFilterControl
                inputMode="decimal"
                operator={draft.priceOperator}
                value={draft.priceUsd}
                onOperatorChange={(operator) => update("priceOperator", operator)}
                onValueChange={(value) => update("priceUsd", value)}
              />
            </FilterSection>

            <FilterSection label="Release date" syntax="date>=2020-01-01 year=2024">
              <div className="grid gap-3 sm:grid-cols-2">
                <ComparisonFilterControl
                  className="sm:col-span-2"
                  operator={draft.dateOperator}
                  type="date"
                  value={draft.releasedDate}
                  onOperatorChange={(operator) => update("dateOperator", operator)}
                  onValueChange={(value) => update("releasedDate", value)}
                />
                <ComparisonFilterControl
                  inputMode="numeric"
                  operator={draft.yearOperator}
                  value={draft.releasedYear}
                  onOperatorChange={(operator) => update("yearOperator", operator)}
                  onValueChange={(value) => update("releasedYear", value)}
                  placeholder="Year"
                />
              </div>
            </FilterSection>
          </div>

          <aside className="border-t border-base-300 bg-base-200/40 p-5 lg:border-l lg:border-t-0">
            <div className="sticky top-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black uppercase tracking-[0.22em] text-primary">
                  Scryfall syntax
                </h3>
                <Badge tone={activeCount ? "primary" : "neutral"}>{activeCount} active</Badge>
              </div>
              <div className="min-h-24 rounded-box border border-base-300 bg-base-100 p-3 font-mono text-sm leading-6 text-base-content/80">
                {syntax || (
                  <span className="font-sans text-base-content/45">No filters selected</span>
                )}
              </div>
              <div className="grid gap-2">
                <Button type="button" disabled={!syntax} onClick={() => onApply(draft)}>
                  Apply filters
                </Button>
                <Button type="button" variant="outline" onClick={resetDraft}>
                  Reset form
                </Button>
                <Button type="button" variant="ghost" onClick={clearAndClose}>
                  Clear applied filters
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FilterSection({
  children,
  label,
  syntax,
}: {
  children: React.ReactNode
  label: string
  syntax: string
}) {
  return (
    <section className="grid gap-3 px-5 py-4 sm:grid-cols-[9rem_1fr]">
      <div>
        <h3 className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-accent">
          {label}
        </h3>
        <p className="mt-2 font-mono text-[0.68rem] text-base-content/45">{syntax}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function TypeCombobox({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void
  value: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const query = value.trim().toLowerCase()
  const options = TYPE_OPTIONS.filter((option) => option.toLowerCase().includes(query))

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  function selectType(type: string) {
    onValueChange(type)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Type or pick..."
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
      />
      {open && options.length ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-2xl"
          role="listbox"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              className="block w-full rounded-btn px-3 py-2 text-left text-sm transition-colors hover:bg-base-200"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectType(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ComparisonFilterControl({
  className,
  inputMode,
  onOperatorChange,
  onValueChange,
  operator,
  placeholder = "Value",
  type = "text",
  value,
}: {
  className?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  onOperatorChange: (operator: ComparisonOperator) => void
  onValueChange: (value: string) => void
  operator: ComparisonOperator
  placeholder?: string
  type?: string
  value: string
}) {
  return (
    <div className={cn("grid grid-cols-[5rem_minmax(0,1fr)] gap-2", className)}>
      <select
        className="select select-bordered w-full bg-base-100"
        value={operator}
        onChange={(event) => onOperatorChange(event.target.value as ComparisonOperator)}
        aria-label="Comparison"
      >
        {COMPARISON_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Input
        inputMode={inputMode}
        type={type}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function ColorFilterControl({
  onOperatorChange,
  onSelectedChange,
  operator,
  selected,
}: {
  onOperatorChange: (operator: ColorOperator) => void
  onSelectedChange: (colors: ManaColor[]) => void
  operator: ColorOperator
  selected: ManaColor[]
}) {
  function toggleColor(color: ManaColor) {
    if (color === "c") {
      onSelectedChange(selected.includes("c") ? [] : ["c"])
      return
    }

    const withoutColorless = selected.filter((value) => value !== "c")
    const next = withoutColorless.includes(color)
      ? withoutColorless.filter((value) => value !== color)
      : [...withoutColorless, color]
    onSelectedChange(next)
  }

  const colorlessSelected = selected.includes("c")

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="select select-bordered min-w-36 bg-base-100"
        value={operator}
        onChange={(event) => onOperatorChange(event.target.value as ColorOperator)}
        aria-label="Color comparison"
        disabled={colorlessSelected}
      >
        {COLOR_OPERATOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.map((color) => {
          const active = selected.includes(color.value)

          return (
            <button
              key={color.value}
              type="button"
              aria-pressed={active}
              title={color.label}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full border bg-transparent p-0.5 shadow-sm transition-all",
                active
                  ? "scale-105 border-accent ring-2 ring-accent/60"
                  : "border-transparent opacity-60 hover:opacity-95",
              )}
              onClick={() => toggleColor(color.value)}
            >
              <img
                src={`/scryfall-assets/symbols/${color.symbol}.svg`}
                alt={color.label}
                className="h-8 w-8"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RarityFilterControl({
  onSelectedChange,
  selected,
}: {
  onSelectedChange: (rarities: RarityFilter[]) => void
  selected: RarityFilter[]
}) {
  function toggleRarity(rarity: RarityFilter) {
    onSelectedChange(
      selected.includes(rarity)
        ? selected.filter((value) => value !== rarity)
        : [...selected, rarity],
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {RARITY_OPTIONS.map((rarity) => {
        const active = selected.includes(rarity.value)

        return (
          <button
            key={rarity.value}
            type="button"
            aria-pressed={active}
            className={cn(
              "btn btn-outline btn-sm gap-2",
              active ? "border-primary bg-primary/15 text-primary" : "text-base-content/75",
            )}
            onClick={() => toggleRarity(rarity.value)}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", rarity.className)} />
            {rarity.label}
          </button>
        )
      })}
    </div>
  )
}

function SegmentedFilter<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  value: T
}) {
  return (
    <div className="inline-grid overflow-hidden rounded-btn border border-base-300 sm:auto-cols-fr sm:grid-flow-col">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "border-base-300 px-4 py-2 text-sm font-bold transition-colors [&:not(:last-child)]:border-r",
            value === option.value
              ? "bg-primary text-primary-content"
              : "bg-base-100 text-base-content/65 hover:bg-base-200",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

type LocationSummary = CollectionQuery["locations"][number]
type LocationDetail = NonNullable<LocationQuery["location"]>
type CollectionValueSummary = NonNullable<CollectionQuery["collectionValueSummary"]>
type LocationCoverCard = LocationCoverCardSearchQuery["cards"][number]
type LocationCoverPrinting = NonNullable<NonNullable<LocationCoverCard["printings"]>[number]>
type CollectionImportPreview = NonNullable<
  PreviewCollectionImportMutation["previewCollectionImport"]
>
type CollectionImportRow = CollectionImportPreview["rows"][number]
type CollectionImportCandidate = CollectionImportRow["candidates"][number]
type LocationCoverSelection = {
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
type AddCollectionItemPrintingSelection = AddCollectionItemInitialPrinting

const LOCATION_KINDS = ["box", "binder", "deck_box", "list", "folder", "other"] as const
const COLLECTION_CONDITIONS = [
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
] as const
const COLLECTION_FINISHES = ["nonfoil", "foil", "etched"] as const
const MODAL_SEARCH_DEBOUNCE_MS = 250

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [delayMs, value])

  return debouncedValue
}

function centsToCurrencyInput(cents?: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return ""
  return (cents / 100).toFixed(2).replace(/\.00$/, "")
}

function parseCurrencyInputCents(value: string) {
  const normalized = value.trim().replaceAll(",", "").replace(/^\$/, "")
  if (!normalized) return null

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return undefined

  const dollars = Number(match[1])
  const cents = Number((match[2] || "").padEnd(2, "0"))
  return dollars * 100 + cents
}

function collectionValueLine(summary?: Partial<CollectionValueSummary> | null) {
  if (!summary) return null

  const total = summary.totalPriceText
  const gain = summary.valueGainText
  const percent = summary.valueGainPercentText
  const delta = gain ? `${gain}${percent ? ` (${percent})` : ""}` : null

  return [total, delta].filter(Boolean).join(" · ")
}

function isUnfiledLocation(location: { id: string }) {
  return location.id === "unfiled"
}

function SummaryActionMenu({
  label,
  onDelete,
  onEdit,
  onExportCsv,
  onExportText,
}: {
  label: string
  onDelete?: () => void
  onEdit: () => void
  onExportCsv?: () => void
  onExportText?: () => void
}) {
  return (
    <div
      className="dropdown dropdown-end absolute right-3 top-3 z-[80]"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="btn btn-circle btn-xs border-0 bg-neutral/85 text-neutral-content shadow backdrop-blur transition hover:bg-neutral"
        tabIndex={0}
        aria-label={label}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-50 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
      >
        <li>
          <button type="button" onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
        </li>
        {onExportCsv ? (
          <li>
            <button type="button" onClick={onExportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </li>
        ) : null}
        {onExportText ? (
          <li>
            <button type="button" onClick={onExportText}>
              <Download className="h-4 w-4" />
              Export TXT
            </button>
          </li>
        ) : null}
        {onDelete ? (
          <li>
            <button type="button" className="text-error" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete location
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

function UnfiledLocationCard({
  countLine,
  detailLine,
  interactive = true,
  location,
  priceLine,
}: {
  countLine?: ReactNode
  detailLine?: ReactNode
  interactive?: boolean
  location: LocationSummary | LocationDetail
  priceLine?: ReactNode
}) {
  return (
    <Card
      className={cn(
        "group relative min-h-52 overflow-hidden transition-all",
        interactive &&
          "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-base-100 hover:shadow-xl",
      )}
    >
      <div className="relative z-10 flex min-h-52 flex-col justify-between gap-8 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-box border border-base-300 bg-base-200 text-base-content/60">
            <Boxes className="h-5 w-5" />
          </span>
          <Badge>{titleize(location.kind)}</Badge>
          {countLine ? (
            <span className="text-sm font-bold text-base-content/70">{countLine}</span>
          ) : null}
          {priceLine ? (
            <span className="text-sm font-bold text-base-content/70">{priceLine}</span>
          ) : null}
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-3xl font-black tracking-normal">{location.name}</h3>
          {detailLine ? (
            <div className="mt-3 max-w-2xl text-sm text-base-content/65">{detailLine}</div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function AddCollectionItemToDeckDialog({
  item,
  onDone,
  onOpenChange,
}: {
  item: CollectionItemTarget
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [deckId, setDeckId] = useState("")
  const [zone, setZone] = useState("mainboard")
  const [error, setError] = useState<string | null>(null)
  const targetItems = collectionTargetItems(item)
  const targetCount = targetItems.length
  const open = targetCount > 0
  const decksQuery = useQuery({
    queryKey: ["collection-item-deck-options"],
    queryFn: () => request(CollectionItemDeckOptionsDocument),
    enabled: open,
  })
  const addToDeck = useMutation({
    mutationFn: () => {
      if (!targetItems.length) throw new Error("Choose at least one item")
      if (!deckId) throw new Error("Choose a deck")

      return Promise.all(
        targetItems.map((targetItem) =>
          request(AddCollectionItemToDeckDocument, {
            id: targetItem.id,
            deckId,
            zone,
          }),
        ),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      onDone()
      close()
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not add cards to deck"),
  })

  useEffect(() => {
    if (!open) {
      setDeckId("")
      setZone("mainboard")
      setError(null)
    }
  }, [open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    addToDeck.mutate()
  }

  function close() {
    if (addToDeck.isPending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-lg" labelledBy="add-collection-item-to-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="add-collection-item-to-deck-title">
              {targetCount > 1 ? "Add items to deck" : "Add to deck"}
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{collectionTargetLabel(item)}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Deck</span>
            <select
              className="select select-bordered w-full bg-base-100"
              value={deckId}
              onChange={(event) => setDeckId(event.target.value)}
              autoFocus
            >
              <option value="">Choose a deck</option>
              {decksQuery.data?.decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name} ({titleize(deck.format)})
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Zone</span>
            <select
              className="select select-bordered w-full bg-base-100"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
            >
              <option value="mainboard">Mainboard</option>
              <option value="sideboard">Sideboard</option>
              <option value="maybeboard">Maybeboard</option>
            </select>
          </label>
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={addToDeck.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={addToDeck.isPending || !deckId}>
              {addToDeck.isPending
                ? "Adding..."
                : targetCount > 1
                  ? `Add ${targetCount} to deck`
                  : "Add to deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MoveCollectionItemDialog({
  item,
  listOnly = false,
  onDone,
  onOpenChange,
}: {
  item: CollectionItemTarget
  listOnly?: boolean
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [locationId, setLocationId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const targetItems = collectionTargetItems(item)
  const targetCount = targetItems.length
  const singleTarget = targetCount === 1 ? targetItems[0] : null
  const open = targetCount > 0
  const optionsQuery = useQuery({
    queryKey: ["collection-item-form-options"],
    queryFn: () => request(CollectionItemFormOptionsDocument),
    enabled: open,
  })
  const updateItem = useMutation({
    mutationFn: () => {
      if (!targetItems.length) throw new Error("Choose at least one item")

      return Promise.all(
        targetItems.map((targetItem) =>
          request(UpdateCollectionItemDocument, {
            id: targetItem.id,
            input: { locationId: locationId || null },
          }),
        ),
      )
    },
    onSuccess: () => {
      onDone()
      close()
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not move collection items"),
  })
  const locations = (optionsQuery.data?.locations || []).filter(
    (location) => !isUnfiledLocation(location) && (!listOnly || location.kind === "list"),
  )

  useEffect(() => {
    if (open) setLocationId(listOnly ? "" : singleTarget?.location?.id || "")
    else {
      setLocationId("")
      setError(null)
    }
  }, [listOnly, open, singleTarget])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (listOnly && !locationId) {
      setError("Choose a list")
      return
    }

    updateItem.mutate()
  }

  function close() {
    if (updateItem.isPending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent
        className="max-w-lg"
        labelledBy={listOnly ? "add-collection-item-to-list-title" : "move-collection-item-title"}
      >
        <DialogHeader>
          <div>
            <DialogTitle
              id={listOnly ? "add-collection-item-to-list-title" : "move-collection-item-title"}
            >
              {listOnly
                ? targetCount > 1
                  ? "Add items to list"
                  : "Add to list"
                : targetCount > 1
                  ? "Move items"
                  : "Move item"}
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{collectionTargetLabel(item)}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              {listOnly ? "List" : "Location"}
            </span>
            <select
              className="select select-bordered w-full bg-base-100"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              autoFocus
            >
              {!listOnly ? (
                <option value="">Unfiled</option>
              ) : (
                <option value="">Choose a list</option>
              )}
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({titleize(location.kind)})
                </option>
              ))}
            </select>
          </label>
          {listOnly && !optionsQuery.isLoading && locations.length === 0 ? (
            <p className="text-sm text-base-content/60">
              Create a List location before adding items to a list.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={updateItem.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateItem.isPending || (listOnly && !locationId)}>
              {updateItem.isPending
                ? "Saving..."
                : listOnly
                  ? targetCount > 1
                    ? `Add ${targetCount} to list`
                    : "Add to list"
                  : targetCount > 1
                    ? `Move ${targetCount}`
                    : "Move"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditCollectionItemDialog({
  item,
  onDone,
  onOpenChange,
}: {
  item: CollectionItem | null
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState<(typeof COLLECTION_CONDITIONS)[number]>("near_mint")
  const [finish, setFinish] = useState<(typeof COLLECTION_FINISHES)[number]>("nonfoil")
  const [language, setLanguage] = useState("en")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const open = Boolean(item)
  const optionsQuery = useQuery({
    queryKey: ["collection-item-form-options"],
    queryFn: () => request(CollectionItemFormOptionsDocument),
    enabled: open,
  })
  const updateItem = useMutation({
    mutationFn: () => {
      if (!item) throw new Error("Collection item is required")
      const purchasePriceCents = parseCurrencyInputCents(purchasePrice)

      if (purchasePriceCents === undefined)
        throw new Error("Purchase price must be a dollar amount")

      return request(UpdateCollectionItemDocument, {
        id: item.id,
        input: {
          quantity,
          condition,
          finish,
          language: language.trim() || "en",
          locationId: locationId || null,
          notes: notes.trim() || null,
          purchasePriceCents,
        },
      })
    },
    onSuccess: () => {
      onDone()
      close()
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not update collection item"),
  })

  useEffect(() => {
    if (item) {
      setQuantity(item.quantity || 1)
      setCondition(collectionConditionValue(item.condition))
      setFinish(collectionFinishValue(item.finish))
      setLanguage(item.language || "en")
      setLocationId(item.location?.id || "")
      setNotes(item.notes || "")
      setPurchasePrice(centsToCurrencyInput(item.purchasePriceCents))
      setError(null)
    }
  }, [item])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (quantity < 1) {
      setError("Quantity must be at least 1")
      return
    }

    if (parseCurrencyInputCents(purchasePrice) === undefined) {
      setError("Purchase price must be a dollar amount")
      return
    }

    updateItem.mutate()
  }

  function close() {
    if (updateItem.isPending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-2xl" labelledBy="edit-collection-item-title">
        <DialogHeader>
          <div>
            <DialogTitle id="edit-collection-item-title">Edit collection item</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {item?.printing?.card?.name || "Collection item"}
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Quantity
              </span>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value) || 1)}
                autoFocus
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Language
              </span>
              <Input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Condition
              </span>
              <select
                className="select select-bordered w-full bg-base-100"
                value={condition}
                onChange={(event) => setCondition(collectionConditionValue(event.target.value))}
              >
                {COLLECTION_CONDITIONS.map((value) => (
                  <option key={value} value={value}>
                    {titleize(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Finish
              </span>
              <select
                className="select select-bordered w-full bg-base-100"
                value={finish}
                onChange={(event) => setFinish(collectionFinishValue(event.target.value))}
              >
                {COLLECTION_FINISHES.map((value) => (
                  <option key={value} value={value}>
                    {titleize(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Purchase price
              </span>
              <Input
                inputMode="decimal"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(event.target.value)}
                placeholder="Current market price"
              />
              <span className="block text-xs text-base-content/55">
                Current {item?.priceText || "unknown"}
                {item?.valueGainText
                  ? ` · Gain ${item.valueGainText}${
                      item.valueGainPercentText ? ` (${item.valueGainPercentText})` : ""
                    }`
                  : ""}
              </span>
            </label>
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Location
              </span>
              <select
                className="select select-bordered w-full bg-base-100"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">Unfiled</option>
                {optionsQuery.data?.locations
                  .filter((location) => !isUnfiledLocation(location))
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({titleize(location.kind)})
                    </option>
                  ))}
              </select>
            </label>
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Notes
              </span>
              <textarea
                className="textarea textarea-bordered min-h-24 w-full bg-base-100"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={updateItem.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateItem.isPending}>
              {updateItem.isPending ? "Saving..." : "Save item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteCollectionItemDialog({
  item,
  onDone,
  onOpenChange,
}: {
  item: CollectionItemTarget
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const targetItems = collectionTargetItems(item)
  const targetCount = targetItems.length
  const open = targetCount > 0
  const deleteItem = useMutation({
    mutationFn: () => {
      if (!targetItems.length) throw new Error("Choose at least one item")
      return Promise.all(
        targetItems.map((targetItem) =>
          request(DeleteCollectionItemDocument, { id: targetItem.id }),
        ),
      )
    },
    onSuccess: () => {
      onDone()
      close()
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not delete collection items"),
  })

  useEffect(() => {
    if (!open) setError(null)
  }, [open])

  function close() {
    if (deleteItem.isPending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-lg" labelledBy="delete-collection-item-title">
        <DialogHeader>
          <div>
            <DialogTitle id="delete-collection-item-title">
              {targetCount > 1 ? "Delete collection items" : "Delete collection item"}
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{collectionTargetLabel(item)}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <div className="space-y-4 p-5">
          <p className="text-sm text-base-content/70">
            {targetCount > 1
              ? "Remove these owned printings from your collection."
              : "Remove this owned printing from your collection."}
          </p>
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={deleteItem.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteItem.mutate()}
              disabled={deleteItem.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {deleteItem.isPending
                ? "Deleting..."
                : targetCount > 1
                  ? `Delete ${targetCount}`
                  : "Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AddCollectionItemDialog({
  initialPrinting,
  onOpenChange,
  open,
}: {
  initialPrinting?: AddCollectionItemInitialPrinting | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [selectedPrinting, setSelectedPrinting] =
    useState<AddCollectionItemPrintingSelection | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState<(typeof COLLECTION_CONDITIONS)[number]>("near_mint")
  const [finish, setFinish] = useState<(typeof COLLECTION_FINISHES)[number]>("nonfoil")
  const [language, setLanguage] = useState("en")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(search, MODAL_SEARCH_DEBOUNCE_MS)
  const searchTerm = debouncedSearch.trim()
  const searchDraftTerm = search.trim()
  const selectedFinishes = selectedPrinting?.finishes?.filter(present) || []
  const finishOptions = selectedFinishes.length ? selectedFinishes : COLLECTION_FINISHES

  const optionsQuery = useQuery({
    queryKey: ["collection-item-form-options"],
    queryFn: () => request(CollectionItemFormOptionsDocument),
    enabled: open,
  })
  const cardSearchQuery = useQuery({
    queryKey: ["collection-item-card-search", searchTerm],
    queryFn: () => request(LocationCoverCardSearchDocument, { q: searchTerm, limit: 8 }),
    enabled: open && searchTerm.length > 1,
    staleTime: 60_000,
  })
  const createItem = useMutation({
    mutationFn: () => {
      if (!selectedPrinting) throw new Error("Choose a printing")
      const purchasePriceCents = parseCurrencyInputCents(purchasePrice)

      if (purchasePriceCents === undefined)
        throw new Error("Purchase price must be a dollar amount")

      return request(CreateCollectionItemDocument, {
        input: {
          scryfallId: selectedPrinting.scryfallId,
          quantity,
          condition,
          finish,
          language: language.trim() || "en",
          locationId: locationId || null,
          notes: notes.trim() || null,
          purchasePriceCents,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
      queryClient.invalidateQueries({ queryKey: ["home"] })
      close(true)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not add collection item"),
  })

  useEffect(() => {
    if (!open) return

    setSelectedPrinting(initialPrinting || null)
    setSearch("")
    setQuantity(1)
    setCondition("near_mint")
    setFinish(collectionFinishValue(initialPrinting?.finishes?.filter(present)[0] || "nonfoil"))
    setLanguage("en")
    setLocationId("")
    setNotes("")
    setPurchasePrice("")
    setError(null)
  }, [initialPrinting, open])

  useEffect(() => {
    if (!finishOptions.includes(finish))
      setFinish(collectionFinishValue(finishOptions[0] || "nonfoil"))
  }, [finish, finishOptions])

  function selectPrinting(card: LocationCoverCard, printing: LocationCoverPrinting) {
    setSelectedPrinting({
      cardName: card.name,
      collectorNumber: printing.collectorNumber,
      finishes: printing.finishes,
      imageUrl: printing.imageUrl,
      rarity: printing.rarity,
      scryfallId: printing.scryfallId,
      setCode: printing.setCode,
      setName: printing.setName,
      typeLine: card.typeLine,
    })
    setFinish(collectionFinishValue(printing.finishes?.filter(present)[0] || "nonfoil"))
    setSearch("")
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!selectedPrinting) {
      setError("Choose a printing")
      return
    }

    if (quantity < 1) {
      setError("Quantity must be at least 1")
      return
    }

    if (parseCurrencyInputCents(purchasePrice) === undefined) {
      setError("Purchase price must be a dollar amount")
      return
    }

    createItem.mutate()
  }

  function close(force = false) {
    if (createItem.isPending && !force) return
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent
        className="max-h-[calc(100vh-3rem)] max-w-4xl overflow-y-auto"
        labelledBy="add-collection-item-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="add-collection-item-title">Add collection item</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Choose an exact printing and where it lives.
            </p>
          </div>
          <DialogClose onClose={() => close()} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <section className="space-y-3">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Printing
            </span>
            {selectedPrinting ? (
              <div className="flex gap-3 rounded-box border border-base-300 bg-base-200/40 p-3">
                <div className="h-32 w-24 shrink-0 overflow-hidden rounded-lg bg-base-300">
                  {selectedPrinting.imageUrl ? (
                    <img
                      src={selectedPrinting.imageUrl}
                      alt={selectedPrinting.cardName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <p className="font-bold">{selectedPrinting.cardName}</p>
                  {selectedPrinting.typeLine ? (
                    <p className="text-sm text-base-content/60">{selectedPrinting.typeLine}</p>
                  ) : null}
                  <p className="mt-2 text-sm text-base-content/65">
                    {printingSetLabel(selectedPrinting)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPrinting(null)}
                >
                  Change
                </Button>
              </div>
            ) : null}

            {!selectedPrinting ? (
              <>
                <CardNameSearchField
                  value={search}
                  onValueChange={setSearch}
                  onClear={() => setSearch("")}
                  onSuggestionSelect={setSearch}
                  placeholder="Search for a card"
                  suggestionLimit={8}
                />
                {searchDraftTerm.length > 1 ? (
                  <div className="max-h-80 overflow-y-auto rounded-box border border-base-300 bg-base-100">
                    {cardSearchQuery.isFetching || searchTerm !== searchDraftTerm ? (
                      <p className="px-3 py-2 text-sm text-base-content/55">Searching...</p>
                    ) : null}
                    {!cardSearchQuery.isFetching &&
                    searchTerm === searchDraftTerm &&
                    cardSearchQuery.data?.cards.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-base-content/55">No cards found.</p>
                    ) : null}
                    {searchTerm === searchDraftTerm
                      ? cardSearchQuery.data?.cards.map((card) => (
                          <div
                            key={card.oracleId}
                            className="border-t border-base-300 p-3 first:border-t-0"
                          >
                            <div className="mb-2">
                              <p className="font-bold">{card.name}</p>
                              {card.typeLine ? (
                                <p className="text-xs text-base-content/55">{card.typeLine}</p>
                              ) : null}
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                              {card.printings
                                ?.filter(present)
                                .slice(0, 8)
                                .map((printing) => (
                                  <button
                                    key={printing.scryfallId}
                                    type="button"
                                    className="group rounded-lg border border-base-300 bg-base-200/40 p-2 text-left transition hover:border-primary hover:bg-base-200"
                                    onClick={() => selectPrinting(card, printing)}
                                  >
                                    <div className="aspect-[5/7] overflow-hidden rounded bg-base-300">
                                      {printing.imageUrl ? (
                                        <img
                                          src={printing.imageUrl}
                                          alt={`${card.name} ${printing.setCode || "printing"}`}
                                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                                          No image
                                        </div>
                                      )}
                                    </div>
                                    <p className="mt-2 truncate text-xs font-bold uppercase">
                                      {printing.setCode || "Unknown set"}
                                    </p>
                                    <p className="truncate text-xs text-base-content/60">
                                      #{printing.collectorNumber || "-"}
                                    </p>
                                  </button>
                                ))}
                            </div>
                          </div>
                        ))
                      : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Quantity
              </span>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Condition
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={condition}
                onChange={(event) => setCondition(collectionConditionValue(event.target.value))}
              >
                {COLLECTION_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {titleize(condition)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Finish
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={finish}
                onChange={(event) => setFinish(collectionFinishValue(event.target.value))}
              >
                {finishOptions.map((finish) => (
                  <option key={finish} value={finish}>
                    {titleize(finish)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Language
              </span>
              <Input value={language} onChange={(event) => setLanguage(event.target.value)} />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Purchase price
            </span>
            <Input
              inputMode="decimal"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              placeholder="Current market price"
            />
            <span className="block text-xs text-base-content/55">
              Leave blank to use the current market price.
            </span>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Location
            </span>
            <select
              className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">Unfiled</option>
              {optionsQuery.data?.locations
                .filter((location) => !isUnfiledLocation(location))
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({titleize(location.kind)})
                  </option>
                ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Notes
            </span>
            <textarea
              className="textarea textarea-bordered min-h-20 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes"
            />
          </label>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => close()}
              disabled={createItem.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createItem.isPending}>
              <Plus className="h-4 w-4" />
              {createItem.isPending ? "Adding..." : "Add item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ImportCollectionDialog({
  initialImport,
  onOpenChange,
  open,
}: {
  initialImport?: SharedImportPayload | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [importText, setImportText] = useState("")
  const [fileName, setFileName] = useState("")
  const [sharedFileName, setSharedFileName] = useState<string | null>(null)
  const [format, setFormat] = useState<CollectionImportFormat>("auto")
  const [locationId, setLocationId] = useState("")
  const [preview, setPreview] = useState<CollectionImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const optionsQuery = useQuery({
    queryKey: ["collection-item-form-options"],
    queryFn: () => request(CollectionItemFormOptionsDocument),
    enabled: open,
  })
  const previewImport = useMutation({
    mutationFn: (values?: PreviewCollectionImportValues) =>
      request(PreviewCollectionImportDocument, {
        input: {
          text: values?.text ?? importText,
          format: values?.format ?? format,
          fileName: (values?.fileName ?? fileName) || null,
          locationId: (values?.locationId ?? locationId) || null,
        },
      }),
    onSuccess: (data) => {
      setPreview(data.previewCollectionImport || null)
      setError(null)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not preview collection import"),
  })
  const commitImport = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Preview a file before importing")
      return request(CommitCollectionImportDocument, {
        input: { rows: preview.rows.map(commitImportRow) },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
      queryClient.invalidateQueries({ queryKey: ["home"] })
      reset()
      onOpenChange(false)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not import collection file"),
  })

  useEffect(() => {
    if (!open) reset()
  }, [open])

  useEffect(() => {
    if (open && initialImport?.text) loadSharedImport(initialImport)
  }, [open, initialImport])

  async function chooseFile(file: File | undefined) {
    setError(null)
    setPreview(null)
    setFileName(file?.name || "")
    setSharedFileName(null)
    setFormat(file ? importFormatFromSource(file.name, file.type) : "auto")
    setImportText(file ? await file.text() : "")
  }

  function loadSharedImport(payload: SharedImportPayload) {
    const nextFileName = payload.fileName || "Shared list"
    const nextFormat = importFormatFromSource(payload.fileName || "", payload.mimeType || "")

    setError(null)
    setPreview(null)
    setFileName(nextFileName)
    setSharedFileName(nextFileName)
    setFormat(nextFormat)
    setImportText(payload.text)
    previewImport.mutate({
      fileName: nextFileName,
      format: nextFormat,
      locationId,
      text: payload.text,
    })
  }

  function updateImportText(value: string) {
    setImportText(value)
    setPreview(null)
  }

  function submitPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!importText.trim()) {
      setError("Choose or paste a CSV or TXT file to import")
      return
    }

    previewImport.mutate(undefined)
  }

  function selectCandidate(rowNumber: number, candidate: CollectionImportCandidate) {
    if (!preview) return

    const rows = preview.rows.map((row) =>
      row.rowNumber === rowNumber
        ? {
            ...row,
            status: "exact",
            attrs: { ...row.attrs, scryfallId: candidate.scryfallId },
            printing: candidate,
            candidates: [],
          }
        : row,
    )

    setPreview({ ...preview, ...collectionImportCounts(rows), rows })
  }

  function close() {
    if (previewImport.isPending || commitImport.isPending) return
    reset()
    onOpenChange(false)
  }

  function reset() {
    setImportText("")
    setFileName("")
    setSharedFileName(null)
    setFormat("auto")
    setLocationId("")
    setPreview(null)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent
        className="flex max-h-[calc(100vh-3rem)] max-w-5xl flex-col"
        labelledBy="import-collection-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="import-collection-title">Import collection</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Preview CSV or TXT rows before adding exact matches to your collection.
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <form className="space-y-4" onSubmit={submitPreview}>
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Import location
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">No location</option>
                {optionsQuery.data?.locations
                  .filter((location) => !isUnfiledLocation(location))
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({titleize(location.kind)})
                    </option>
                  ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                CSV or TXT file
              </span>
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain,text/comma-separated-values,application/vnd.ms-excel"
                className="file-input file-input-bordered w-full bg-base-100"
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
              {sharedFileName ? (
                <p className="rounded-box border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  Loaded shared file: {sharedFileName}. The Android file picker may still say no
                  file chosen; the shared TXT is in the import text box below.
                </p>
              ) : fileName ? (
                <p className="text-sm text-base-content/55">{fileName}</p>
              ) : null}
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                File type
              </span>
              <select
                className="select select-bordered w-full bg-base-100"
                value={format}
                onChange={(event) => setFormat(event.target.value as CollectionImportFormat)}
              >
                <option value="auto">Auto-detect</option>
                <option value="csv">CSV</option>
                <option value="txt">TXT list</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Import text
              </span>
              <textarea
                className="textarea textarea-bordered min-h-40 w-full bg-base-100 font-mono text-sm"
                value={importText}
                onChange={(event) => updateImportText(event.target.value)}
                placeholder={"1x Jund Charm (C13) 195\n1x Zuko's Exile (TLA) 3 *F*"}
              />
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={previewImport.isPending}>
                <Upload className="h-4 w-4" />
                {previewImport.isPending ? "Previewing..." : "Preview import"}
              </Button>
            </div>
          </form>

          {preview ? (
            <div className="space-y-3">
              <div className="stats stats-vertical w-full border border-base-300 bg-base-100 shadow-sm sm:stats-horizontal">
                <div className="stat">
                  <div className="stat-title">Rows</div>
                  <div className="stat-value text-2xl">{preview.total}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Exact</div>
                  <div className="stat-value text-2xl text-success">{preview.exact}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Needs review</div>
                  <div className="stat-value text-2xl text-warning">
                    {preview.ambiguous + preview.unresolved}
                  </div>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-box border border-base-300">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Status</th>
                      <th>Card</th>
                      <th>Qty</th>
                      <th>Finish</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>
                          <Badge tone={importStatusTone(row.status)}>
                            {importStatusLabel(row.status)}
                          </Badge>
                        </td>
                        <td>{row.printing?.card?.name || row.attrs.name || "Unknown card"}</td>
                        <td>{row.attrs.quantity}</td>
                        <td>{row.attrs.finish}</td>
                        <td>
                          {row.status === "ambiguous" ? (
                            <div className="flex flex-wrap gap-1">
                              {row.candidates.map((candidate) => (
                                <Button
                                  key={candidate.scryfallId}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => selectCandidate(row.rowNumber, candidate)}
                                >
                                  {printingSetLabel({
                                    collectorNumber: candidate.collectorNumber,
                                    rarity: candidate.rarity,
                                    scryfallId: candidate.scryfallId,
                                    setCode: candidate.setCode,
                                    setName: candidate.setName,
                                  })}
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-base-content/45">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
        </div>
        {preview ? (
          <div className="flex justify-end border-t border-base-300 bg-base-100 px-5 py-4">
            <Button
              type="button"
              disabled={preview.exact === 0 || commitImport.isPending}
              onClick={() => commitImport.mutate()}
            >
              <Upload className="h-4 w-4" />
              {commitImport.isPending ? "Importing..." : "Import exact rows"}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ExportCollectionDialog({
  filters,
  format,
  onOpenChange,
  open,
  title = format === "csv" ? "Export collection CSV" : "Export collection TXT",
}: {
  filters: CollectionExportFilters
  format: CollectionExportFormat
  onOpenChange: (open: boolean) => void
  open: boolean
  title?: string
}) {
  const [exportText, setExportText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const exportCollection = useMutation({
    mutationFn: async () => {
      if (format === "csv") {
        const data = await request(CollectionExportCsvDocument, { filters })
        return data.collectionExportCsv
      }

      const data = await request(CollectionExportTextDocument, { filters })
      return data.collectionExportText
    },
    onSuccess: (text) => {
      setExportText(text)
      setError(null)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : `Could not export ${format.toUpperCase()}`),
  })

  useEffect(() => {
    if (open) exportCollection.mutate()
    else {
      setExportText("")
      setError(null)
    }
  }, [open, format])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-3rem)] max-w-4xl overflow-y-auto"
        labelledBy="export-collection-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="export-collection-title">{title}</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Copy the {format.toUpperCase()} or save it from the text area.
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <textarea
            className="textarea textarea-bordered min-h-72 w-full bg-base-100 font-mono text-xs"
            readOnly
            value={exportCollection.isPending ? "Exporting..." : exportText}
          />
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddLocationDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<(typeof LOCATION_KINDS)[number]>("box")
  const [description, setDescription] = useState("")
  const [coverSearch, setCoverSearch] = useState("")
  const [selectedCover, setSelectedCover] = useState<LocationCoverSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debouncedCoverSearch = useDebouncedValue(coverSearch, MODAL_SEARCH_DEBOUNCE_MS)
  const coverSearchTerm = debouncedCoverSearch.trim()
  const coverSearchDraftTerm = coverSearch.trim()

  const coverSearchQuery = useQuery({
    queryKey: ["location-cover-card-search", coverSearchTerm],
    queryFn: () =>
      request(LocationCoverCardSearchDocument, {
        q: coverSearchTerm,
        limit: 8,
      }),
    enabled: open && coverSearchTerm.length > 1,
    staleTime: 60_000,
  })
  const createLocation = useMutation({
    mutationFn: () =>
      request(CreateLocationDocument, {
        input: {
          name: name.trim(),
          kind,
          description: description.trim() || null,
          coverScryfallId: selectedCover?.scryfallId ?? null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({
        queryKey: ["collection-item-form-options"],
      })
      queryClient.invalidateQueries({ queryKey: ["home"] })
      reset()
      onOpenChange(false)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not create location"),
  })

  useEffect(() => {
    if (!open) return
    reset()
  }, [open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Location name is required")
      return
    }

    createLocation.mutate()
  }

  function close() {
    if (createLocation.isPending) return
    setError(null)
    onOpenChange(false)
  }

  function reset() {
    setName("")
    setKind("box")
    setDescription("")
    setCoverSearch("")
    setSelectedCover(null)
    setError(null)
  }

  function selectCover(card: LocationCoverCard, printing: LocationCoverPrinting) {
    setSelectedCover({
      cardName: card.name,
      collectorNumber: printing.collectorNumber,
      imageUrl: printing.artCropUrl || printing.imageUrl,
      rarity: printing.rarity,
      scryfallId: printing.scryfallId,
      setCode: printing.setCode,
      setName: printing.setName,
    })
    setCoverSearch("")
  }

  function clearCover() {
    setSelectedCover(null)
    setCoverSearch("")
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent
        className="max-h-[calc(100vh-3rem)] max-w-3xl overflow-y-auto"
        labelledBy="add-location-title"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="add-location-title">Add location</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Create a box, binder, list, or other place for collection items.
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Location name"
              autoFocus
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Kind</span>
            <select
              className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={kind}
              onChange={(event) => setKind(locationKindValue(event.target.value))}
            >
              {LOCATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {titleize(kind)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Description
            </span>
            <textarea
              className="textarea textarea-bordered min-h-24 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional notes"
            />
          </label>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Cover image
                </span>
                <p className="mt-1 text-xs text-base-content/55">
                  Search for a card, then choose the printing to use as this location's cover.
                </p>
              </div>
              {selectedCover ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearCover}>
                  Remove cover
                </Button>
              ) : null}
            </div>

            {selectedCover ? (
              <div className="flex gap-3 rounded-box border border-base-300 bg-base-200/40 p-3">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-base-300">
                  {selectedCover.imageUrl ? (
                    <img
                      src={selectedCover.imageUrl}
                      alt={selectedCover.cardName || "Selected cover"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 py-1">
                  <p className="font-bold">{selectedCover.cardName || "Selected printing"}</p>
                  <p className="text-sm text-base-content/65">{printingSetLabel(selectedCover)}</p>
                  <p className="mt-2 text-xs text-base-content/45">Cover selected</p>
                </div>
              </div>
            ) : null}

            <CardNameSearchField
              value={coverSearch}
              onValueChange={setCoverSearch}
              onClear={() => setCoverSearch("")}
              onSuggestionSelect={setCoverSearch}
              placeholder="Search for a cover card"
              suggestionLimit={8}
            />

            {coverSearchDraftTerm.length > 1 ? (
              <div className="max-h-80 overflow-y-auto rounded-box border border-base-300 bg-base-100">
                {coverSearchQuery.isFetching || coverSearchTerm !== coverSearchDraftTerm ? (
                  <p className="px-3 py-2 text-sm text-base-content/55">Searching...</p>
                ) : null}
                {!coverSearchQuery.isFetching &&
                coverSearchTerm === coverSearchDraftTerm &&
                coverSearchQuery.data?.cards.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-base-content/55">No cards found.</p>
                ) : null}
                {coverSearchTerm === coverSearchDraftTerm
                  ? coverSearchQuery.data?.cards.map((card) => (
                      <div
                        key={card.oracleId}
                        className="border-t border-base-300 p-3 first:border-t-0"
                      >
                        <div className="mb-2">
                          <p className="font-bold">{card.name}</p>
                          {card.typeLine ? (
                            <p className="text-xs text-base-content/55">{card.typeLine}</p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {card.printings
                            ?.filter(present)
                            .slice(0, 8)
                            .map((printing) => (
                              <button
                                key={printing.scryfallId}
                                type="button"
                                className="group rounded-lg border border-base-300 bg-base-200/40 p-2 text-left transition hover:border-primary hover:bg-base-200"
                                onClick={() => selectCover(card, printing)}
                              >
                                <div className="aspect-[5/7] overflow-hidden rounded bg-base-300">
                                  {printing.imageUrl ? (
                                    <img
                                      src={printing.imageUrl}
                                      alt={`${card.name} ${printing.setCode || "printing"}`}
                                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                                      No image
                                    </div>
                                  )}
                                </div>
                                <p className="mt-2 truncate text-xs font-bold uppercase">
                                  {printing.setCode || "Unknown set"}
                                </p>
                                <p className="truncate text-xs text-base-content/60">
                                  #{printing.collectorNumber || "-"}
                                </p>
                              </button>
                            ))}
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            ) : null}
          </section>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={createLocation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLocation.isPending}>
              <Plus className="h-4 w-4" />
              {createLocation.isPending ? "Creating..." : "Create location"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditLocationDialog({
  location,
  onOpenChange,
  open,
}: {
  location: LocationSummary | LocationDetail | null
  onOpenChange: (open: boolean) => void
  open?: boolean
}) {
  const queryClient = useQueryClient()
  const isOpen = open ?? Boolean(location)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<(typeof LOCATION_KINDS)[number]>("box")
  const [description, setDescription] = useState("")
  const [coverSearch, setCoverSearch] = useState("")
  const [selectedCover, setSelectedCover] = useState<LocationCoverSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debouncedCoverSearch = useDebouncedValue(coverSearch, MODAL_SEARCH_DEBOUNCE_MS)
  const coverSearchTerm = debouncedCoverSearch.trim()
  const coverSearchDraftTerm = coverSearch.trim()

  const coverSearchQuery = useQuery({
    queryKey: ["location-cover-card-search", coverSearchTerm],
    queryFn: () =>
      request(LocationCoverCardSearchDocument, {
        q: coverSearchTerm,
        limit: 8,
      }),
    enabled: isOpen && coverSearchTerm.length > 1,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!location || !isOpen) return
    setName(location.name)
    setKind(locationKindValue(location.kind))
    setDescription(location.description || "")
    setSelectedCover(
      location.coverPrinting
        ? {
            imageUrl: location.coverPrinting.artCropUrl,
            scryfallId: location.coverPrinting.scryfallId,
          }
        : null,
    )
    setCoverSearch("")
    setError(null)
  }, [location, isOpen])

  const updateLocation = useMutation({
    mutationFn: () => {
      if (!location) throw new Error("Location is required")
      return request(UpdateLocationDocument, {
        id: location.id,
        input: {
          name: name.trim(),
          kind,
          description: description.trim() || null,
          coverScryfallId: selectedCover?.scryfallId ?? null,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] })
      queryClient.invalidateQueries({ queryKey: ["collection-items"] })
      if (location) queryClient.invalidateQueries({ queryKey: ["location", location.id] })
      setError(null)
      onOpenChange(false)
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not update location"),
  })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Location name is required")
      return
    }

    updateLocation.mutate()
  }

  function close() {
    if (updateLocation.isPending) return
    setError(null)
    onOpenChange(false)
  }

  function selectCover(card: LocationCoverCard, printing: LocationCoverPrinting) {
    setSelectedCover({
      cardName: card.name,
      collectorNumber: printing.collectorNumber,
      imageUrl: printing.artCropUrl || printing.imageUrl,
      rarity: printing.rarity,
      scryfallId: printing.scryfallId,
      setCode: printing.setCode,
      setName: printing.setName,
    })
    setCoverSearch("")
  }

  function clearCover() {
    setSelectedCover(null)
    setCoverSearch("")
  }

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl" labelledBy="edit-location-title">
        <DialogHeader>
          <div>
            <DialogTitle id="edit-location-title">Edit location</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Update location metadata and cover image printing.
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Location name"
              autoFocus
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Kind</span>
            <select
              className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={kind}
              onChange={(event) => setKind(locationKindValue(event.target.value))}
            >
              {LOCATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {titleize(kind)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Description
            </span>
            <textarea
              className="textarea textarea-bordered min-h-24 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional notes"
            />
          </label>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Cover image
                </span>
                <p className="mt-1 text-xs text-base-content/55">
                  Search for a card, then choose the printing to use as this location's cover.
                </p>
              </div>
              {selectedCover ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearCover}>
                  Remove cover
                </Button>
              ) : null}
            </div>

            {selectedCover ? (
              <div className="flex gap-3 rounded-box border border-base-300 bg-base-200/40 p-3">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-base-300">
                  {selectedCover.imageUrl ? (
                    <img
                      src={selectedCover.imageUrl}
                      alt={selectedCover.cardName || "Selected cover"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 py-1">
                  <p className="font-bold">{selectedCover.cardName || "Selected printing"}</p>
                  <p className="text-sm text-base-content/65">{printingSetLabel(selectedCover)}</p>
                  <p className="mt-2 text-xs text-base-content/45">Cover selected</p>
                </div>
              </div>
            ) : null}

            <CardNameSearchField
              value={coverSearch}
              onValueChange={setCoverSearch}
              onClear={() => setCoverSearch("")}
              onSuggestionSelect={setCoverSearch}
              placeholder="Search for a cover card"
              suggestionLimit={8}
            />

            {coverSearchDraftTerm.length > 1 ? (
              <div className="max-h-80 overflow-y-auto rounded-box border border-base-300 bg-base-100">
                {coverSearchQuery.isFetching || coverSearchTerm !== coverSearchDraftTerm ? (
                  <p className="px-3 py-2 text-sm text-base-content/55">Searching...</p>
                ) : null}
                {!coverSearchQuery.isFetching &&
                coverSearchTerm === coverSearchDraftTerm &&
                coverSearchQuery.data?.cards.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-base-content/55">No cards found.</p>
                ) : null}
                {coverSearchTerm === coverSearchDraftTerm
                  ? coverSearchQuery.data?.cards.map((card) => (
                      <div
                        key={card.oracleId}
                        className="border-t border-base-300 first:border-t-0 p-3"
                      >
                        <div className="mb-2">
                          <p className="font-bold">{card.name}</p>
                          {card.typeLine ? (
                            <p className="text-xs text-base-content/55">{card.typeLine}</p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {card.printings
                            ?.filter(present)
                            .slice(0, 8)
                            .map((printing) => (
                              <button
                                key={printing.scryfallId}
                                type="button"
                                className="group rounded-lg border border-base-300 bg-base-200/40 p-2 text-left transition hover:border-primary hover:bg-base-200"
                                onClick={() => selectCover(card, printing)}
                              >
                                <div className="aspect-[5/7] overflow-hidden rounded bg-base-300">
                                  {printing.imageUrl ? (
                                    <img
                                      src={printing.imageUrl}
                                      alt={`${card.name} ${printing.setCode || "printing"}`}
                                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-base-content/50">
                                      No image
                                    </div>
                                  )}
                                </div>
                                <p className="mt-2 truncate text-xs font-bold uppercase">
                                  {printing.setCode || "Unknown set"}
                                </p>
                                <p className="truncate text-xs text-base-content/60">
                                  #{printing.collectorNumber || "—"}
                                </p>
                              </button>
                            ))}
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            ) : null}
          </section>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={updateLocation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateLocation.isPending}>
              <Edit3 className="h-4 w-4" />
              {updateLocation.isPending ? "Saving..." : "Save location"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function printingSetLabel(printing: LocationCoverSelection) {
  return (
    [
      printing.setName || printing.setCode,
      printing.collectorNumber ? `#${printing.collectorNumber}` : null,
      printing.rarity ? titleize(printing.rarity) : null,
    ]
      .filter(present)
      .join(" • ") || "Selected printing"
  )
}

function locationKindValue(value: string): (typeof LOCATION_KINDS)[number] {
  return LOCATION_KINDS.find((kind) => kind === value) || "box"
}

function collectionConditionValue(value: string): (typeof COLLECTION_CONDITIONS)[number] {
  return COLLECTION_CONDITIONS.find((condition) => condition === value) || "near_mint"
}

function collectionFinishValue(value: string): (typeof COLLECTION_FINISHES)[number] {
  return COLLECTION_FINISHES.find((finish) => finish === value) || "nonfoil"
}

function importFormatFromSource(
  fileName: string,
  mimeType?: string | null,
): CollectionImportFormat {
  const extension = fileName.trim().toLowerCase().split(".").pop()
  if (extension === "csv") return "csv"
  if (extension === "txt") return "txt"

  const normalizedMime = (mimeType || "").toLowerCase()
  if (normalizedMime.includes("csv") || normalizedMime.includes("excel")) return "csv"
  if (normalizedMime.includes("plain") || normalizedMime.includes("text")) return "txt"

  return "auto"
}

function collectionImportCounts(rows: CollectionImportRow[]) {
  return {
    exact: rows.filter((row) => row.status === "exact").length,
    ambiguous: rows.filter((row) => row.status === "ambiguous").length,
    unresolved: rows.filter((row) => row.status === "unresolved").length,
  }
}

function commitImportRow(row: CollectionImportRow) {
  return {
    rowNumber: row.rowNumber,
    status: row.status,
    attrs: {
      name: row.attrs.name,
      setCode: row.attrs.setCode,
      collectorNumber: row.attrs.collectorNumber,
      quantity: row.attrs.quantity,
      finish: row.attrs.finish,
      condition: row.attrs.condition,
      language: row.attrs.language,
      scryfallId: row.attrs.scryfallId,
      locationId: row.attrs.locationId,
      purchasePriceCents: row.attrs.purchasePriceCents,
    },
  }
}

function importStatusLabel(status: string) {
  if (status === "exact") return "Exact"
  if (status === "ambiguous") return "Review"
  if (status === "unresolved") return "Unresolved"
  return titleize(status)
}

function importStatusTone(status: string): "neutral" | "success" | "warning" | "error" {
  if (status === "exact") return "success"
  if (status === "ambiguous") return "warning"
  if (status === "unresolved") return "error"
  return "neutral"
}

export function CollectionPage({ importFile = false }: { importFile?: boolean }) {
  const [activeTab, setActiveTab] = useState<CollectionTab>("locations")
  const [q, setQ] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [sort, setSort] = useState<CollectionSort>({
    field: "name",
    direction: "asc",
  })
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isExportCsvOpen, setIsExportCsvOpen] = useState(false)
  const [sharedImport, setSharedImport] = useState<SharedImportPayload | null>(null)
  const [editingLocation, setEditingLocation] = useState<LocationSummary | null>(null)
  const [deletingLocation, setDeletingLocation] = useState<LocationSummary | null>(null)
  const [exportingLocation, setExportingLocation] = useState<{
    format: CollectionExportFormat
    location: LocationSummary
  } | null>(null)
  const [bulkDeckTarget, setBulkDeckTarget] = useState<CollectionItem[] | null>(null)
  const [bulkListTarget, setBulkListTarget] = useState<CollectionItem[] | null>(null)
  const [bulkMoveTarget, setBulkMoveTarget] = useState<CollectionItem[] | null>(null)
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<CollectionItem[] | null>(null)
  const [structuredFilters, setStructuredFilters] =
    useState<CollectionFilterState>(EMPTY_COLLECTION_FILTERS)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const deleteLocation = useMutation({
    mutationFn: (locationId: string) => request(DeleteLocationDocument, { id: locationId }),
    onSuccess: () => {
      invalidateCollectionViews(queryClient)
    },
  })
  const structuredFilterSyntax = buildCollectionFilterQuery(structuredFilters)
  const combinedCollectionQuery = combineCollectionQueries(appliedSearch, structuredFilterSyntax)
  const filters = useMemo(
    () => (combinedCollectionQuery ? { q: combinedCollectionQuery } : {}),
    [combinedCollectionQuery],
  )
  const { data, isLoading } = useQuery({
    queryKey: ["collection", filters],
    queryFn: () => request(CollectionDocument, { filters }),
  })
  const allItemsQuery = useInfiniteQuery({
    queryKey: ["collection-items", "all", filters, sort],
    queryFn: ({ pageParam }) =>
      request(CollectionItemsPageDocument, {
        filters,
        sort,
        limit: COLLECTION_PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: activeTab === "all",
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.collectionItems.length < COLLECTION_PAGE_SIZE
        ? undefined
        : lastPageParam + COLLECTION_PAGE_SIZE,
  })
  const allCollectionItems = useMemo(
    () => allItemsQuery.data?.pages.flatMap((page) => page.collectionItems).filter(present) || [],
    [allItemsQuery.data],
  )
  const selection = useCollectionItemSelection(allCollectionItems)
  const hasCollectionFilters = Boolean(combinedCollectionQuery)
  const activeStructuredFilterCount = countActiveCollectionFilters(structuredFilters)
  const filterBadgeCount = activeStructuredFilterCount
  const collectionCountLabel = `${data?.collectionItemCount || 0} ${hasCollectionFilters ? "shown" : "total"}`
  const loadMoreAllItems = useCallback(() => {
    void allItemsQuery.fetchNextPage()
  }, [allItemsQuery])
  const locationGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof data>["locations"]>()

    for (const location of data?.locations || []) {
      const kind = location.kind || "other"
      groups.set(kind, [...(groups.get(kind) || []), location])
    }

    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right))
  }, [data?.locations])

  useEffect(() => {
    if (!importFile) return

    let ignore = false

    void (async () => {
      const payload = await takePendingNativeSharedImport()
      if (ignore) return

      if (payload) setSharedImport(payload)
      setIsImportOpen(true)
      void navigate({ to: "/collection", search: { importFile: false }, replace: true })
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
    setStructuredFilters(EMPTY_COLLECTION_FILTERS)
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
    if (activeTab === "all" && tab !== "all") clearAllCollectionFilters()
    selection.clearSelection()
    setActiveTab(tab)
  }

  function finishBulkCollectionAction() {
    invalidateCollectionViews(queryClient)
    selection.clearSelection()
  }

  function exportLocation(location: LocationSummary, format: CollectionExportFormat) {
    setExportingLocation({ format, location })
  }

  function deleteSelectedLocation() {
    if (!deletingLocation) return
    deleteLocation.mutate(deletingLocation.id)
    if (editingLocation?.id === deletingLocation.id) setEditingLocation(null)
    if (exportingLocation?.location.id === deletingLocation.id) setExportingLocation(null)
  }

  return (
    <>
      <PageHeader
        title="Collection"
        eyebrow="ManaVault Inventory"
        description="Your boxes, binders, lists, and owned printings."
        bottomActions={
          <Button type="button" onClick={() => setIsAddItemOpen(true)}>
            <Plus className="h-4 w-4" />
            Add item
          </Button>
        }
        actions={
          <div className="dropdown dropdown-end absolute right-3 top-3 z-[80]">
            <button
              type="button"
              className="btn btn-circle btn-xs border-0 bg-neutral/85 text-neutral-content shadow backdrop-blur transition hover:bg-neutral"
              tabIndex={0}
              aria-label="Collection actions"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            <ul
              tabIndex={0}
              className="menu dropdown-content z-50 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
            >
              <li>
                <button type="button" onClick={() => setIsAddLocationOpen(true)}>
                  <Boxes className="h-4 w-4" />
                  Add location
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setIsImportOpen(true)}>
                  <Upload className="h-4 w-4" />
                  Import CSV/TXT
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setIsExportCsvOpen(true)}>
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </li>
            </ul>
          </div>
        }
      />

      {data?.collectionValueSummary ? (
        <div className="mb-7 grid gap-3 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/50">
              Market value
            </p>
            <p className="mt-1 font-mono text-2xl font-black">
              {data.collectionValueSummary.totalPriceText || "$0"}
            </p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/50">
              Purchase basis
            </p>
            <p className="mt-1 font-mono text-2xl font-black">
              {data.collectionValueSummary.purchasePriceText || "$0"}
            </p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-base-content/50">
              Value gain
            </p>
            <p className="mt-1 font-mono text-2xl font-black">
              {data.collectionValueSummary.valueGainText || "$0"}
              {data.collectionValueSummary.valueGainPercentText
                ? ` (${data.collectionValueSummary.valueGainPercentText})`
                : ""}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className="mb-7 flex flex-wrap gap-2 border-b border-base-300"
        role="tablist"
        aria-label="Collection view"
      >
        <CollectionTabButton
          active={activeTab === "locations"}
          count={data?.locations?.length || 0}
          label="Locations"
          onClick={() => selectTab("locations")}
        />
        <CollectionTabButton
          active={activeTab === "all"}
          count={data?.collectionItemCount || 0}
          label="All"
          onClick={() => selectTab("all")}
        />
      </div>

      {activeTab === "locations" ? (
        <PageSection count={`${data?.locations?.length || 0} total`}>
          {isLoading ? (
            <EmptyState title="Loading locations..." />
          ) : locationGroups.length ? (
            <div className="space-y-10">
              {locationGroups.map(([kind, locations]) => (
                <section key={kind} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-black tracking-normal">{titleize(kind)}</h3>
                    <span className="badge border-transparent bg-base-200 text-sm">
                      {locations.length}
                    </span>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    {locations.map((location) => (
                      <div key={location.id} className="relative">
                        <Link
                          to="/collection/locations/$id"
                          params={{ id: location.id }}
                          className="block"
                        >
                          {isUnfiledLocation(location) ? (
                            <UnfiledLocationCard
                              location={location}
                              countLine={`${compactNumber(location.itemCount || 0)} cards`}
                              priceLine={collectionValueLine(location.valueSummary)}
                            />
                          ) : (
                            <ImageSummaryCard
                              imageUrl={location.coverPrinting?.artCropUrl}
                              fallback={<Boxes className="h-12 w-12" />}
                              typeLine={<Badge>{titleize(location.kind)}</Badge>}
                              countLine={`${compactNumber(location.itemCount || 0)} cards`}
                              priceLine={collectionValueLine(location.valueSummary)}
                              nameLine={location.name}
                            />
                          )}
                        </Link>
                        {!isUnfiledLocation(location) ? (
                          <SummaryActionMenu
                            label={`${location.name} actions`}
                            onEdit={() => setEditingLocation(location)}
                            onExportCsv={() => exportLocation(location, "csv")}
                            onExportText={() => exportLocation(location, "text")}
                            onDelete={() => setDeletingLocation(location)}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState title="No locations found" />
          )}
        </PageSection>
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

          <CollectionBulkActionBar
            allLoadedSelected={selection.allLoadedSelected}
            loadedCount={allCollectionItems.length}
            selectedCount={selection.selectedCount}
            selectionActive={selection.selectionActive}
            onAddToDeck={() => setBulkDeckTarget(selection.selectedItems)}
            onAddToList={() => setBulkListTarget(selection.selectedItems)}
            onClear={selection.clearSelection}
            onDelete={() => setBulkDeleteTarget(selection.selectedItems)}
            onMove={() => setBulkMoveTarget(selection.selectedItems)}
            onSelectLoaded={selection.selectLoaded}
          />

          <PageSection count={collectionCountLabel}>
            {allItemsQuery.isLoading ? (
              <EmptyState title="Loading collection..." />
            ) : (
              <VirtualizedCollectionGrid
                hasNextPage={allItemsQuery.hasNextPage}
                isFetchingNextPage={allItemsQuery.isFetchingNextPage}
                items={allCollectionItems}
                onLoadMore={loadMoreAllItems}
                onToggleSelected={selection.toggleItem}
                selectedIds={selection.selectedIds}
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
      />
      <ExportCollectionDialog
        filters={exportingLocation ? { locationId: exportingLocation.location.id } : {}}
        format={exportingLocation?.format || "csv"}
        title={
          exportingLocation
            ? `Export ${exportingLocation.location.name} ${exportingLocation.format.toUpperCase()}`
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
      <AddCollectionItemToDeckDialog
        item={bulkDeckTarget}
        onDone={finishBulkCollectionAction}
        onOpenChange={(open) => !open && setBulkDeckTarget(null)}
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

function SortDropdown({
  onSortChange,
  sort,
}: {
  onSortChange: (sort: CollectionSort) => void
  sort: CollectionSort
}) {
  const currentOption =
    SORT_OPTIONS.find((option) => option.field === sort.field) || SORT_OPTIONS[1]
  const directionLabel = sort.direction === "asc" ? "Asc" : "Desc"
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [open])

  return (
    <div ref={ref} className="dropdown dropdown-end">
      <button
        type="button"
        className="btn btn-outline min-w-44 justify-between gap-2"
        aria-label={`Sort by ${currentOption.label}, ${directionLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4" />
          Sort
        </span>
        <span className="flex items-center gap-1">
          <span className="badge badge-ghost text-[0.65rem]">{currentOption.label}</span>
          <span className="badge badge-ghost text-[0.65rem]">{directionLabel}</span>
        </span>
      </button>
      {open ? (
        <div className="dropdown-content z-50 mt-2 w-72 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-box bg-base-200 p-1">
            {(["asc", "desc"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                className={[
                  "rounded-btn px-3 py-2 text-sm font-bold transition-colors",
                  sort.direction === direction
                    ? "bg-primary text-primary-content shadow-sm"
                    : "text-base-content/70 hover:bg-base-100",
                ].join(" ")}
                onClick={() => {
                  onSortChange({ ...sort, direction })
                  setOpen(false)
                }}
              >
                {direction === "asc" ? "Ascending" : "Descending"}
              </button>
            ))}
          </div>

          <div className="grid gap-1">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.field}
                type="button"
                className={[
                  "flex items-center justify-between rounded-btn px-3 py-2 text-left text-sm transition-colors",
                  sort.field === option.field ? "bg-primary/15 text-primary" : "hover:bg-base-200",
                ].join(" ")}
                onClick={() => {
                  onSortChange({ ...sort, field: option.field })
                  setOpen(false)
                }}
              >
                <span className="font-semibold">{option.label}</span>
                {sort.field === option.field ? (
                  <span className="badge badge-primary badge-sm">{directionLabel}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CollectionTabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={[
        "relative flex items-center gap-2 px-4 pb-3 pt-1 text-sm font-bold transition-colors",
        active ? "text-primary" : "text-base-content/60 hover:text-base-content",
      ].join(" ")}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={active ? "badge badge-primary badge-sm" : "badge badge-ghost badge-sm"}>
        {count}
      </span>
      {active ? (
        <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-primary" />
      ) : null}
    </button>
  )
}

export function LocationPage({ id }: { id: string }) {
  const [q, setQ] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [sort, setSort] = useState<CollectionSort>({
    field: "name",
    direction: "asc",
  })
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
  const [structuredFilters, setStructuredFilters] =
    useState<CollectionFilterState>(EMPTY_COLLECTION_FILTERS)
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
        limit: COLLECTION_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.collectionItems.length < COLLECTION_PAGE_SIZE
        ? undefined
        : lastPageParam + COLLECTION_PAGE_SIZE,
  })
  const collectionItems = useMemo(
    () => itemsQuery.data?.pages.flatMap((page) => page.collectionItems).filter(present) || [],
    [itemsQuery.data],
  )
  const selection = useCollectionItemSelection(collectionItems)
  const loadMore = useCallback(() => {
    void itemsQuery.fetchNextPage()
  }, [itemsQuery])
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
    setStructuredFilters(EMPTY_COLLECTION_FILTERS)
  }

  function applyStructuredFilters(nextFilters: CollectionFilterState) {
    setStructuredFilters(nextFilters)
    setIsFilterModalOpen(false)
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
            loadedCount={collectionItems.length}
            selectedCount={selection.selectedCount}
            selectionActive={selection.selectionActive}
            onAddToDeck={() => setBulkDeckTarget(selection.selectedItems)}
            onAddToList={() => setBulkListTarget(selection.selectedItems)}
            onClear={selection.clearSelection}
            onDelete={() => setBulkDeleteTarget(selection.selectedItems)}
            onMove={() => setBulkMoveTarget(selection.selectedItems)}
            onSelectLoaded={selection.selectLoaded}
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
