import { useApolloClient } from "@apollo/client/react"
import { Link, useLocation } from "@tanstack/react-router"
import { CheckSquare, Edit3, Layers, ListPlus, MoveUpRight, Trash2, X } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { addToDeckAction, addToListAction, CardTile } from "../../components/card-tile"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { collectionCardReturnSearch, invalidateCollectionViews } from "./collection-navigation"
import { CARD_TILE_GAP, CARD_TILE_ROW_HEIGHT, CARD_TILE_WIDTH } from "./constants"
import {
  AddCollectionItemToDeckDialog,
  DeleteCollectionItemDialog,
  EditCollectionItemDialog,
  MoveCollectionItemDialog,
} from "./item-dialogs"
import type { CollectionItem } from "./types"

// Selection is tracked as a set expression instead of materialized ids:
// "select all" just flips `all` (no queries), and unchecking under `all`
// records an exclusion. Membership is `all ? !excluded.has(id) : included.has(id)`.
type CollectionSelectionState = {
  all: boolean
  included: Set<string>
  excluded: Set<string>
}

const EMPTY_SELECTION: CollectionSelectionState = {
  all: false,
  included: new Set(),
  excluded: new Set(),
}

export type CollectionItemSelection = ReturnType<typeof useCollectionItemSelection>

export function useCollectionItemSelection({
  items,
  totalCount,
  resetKey,
}: {
  items: CollectionItem[]
  // Row count of every item matching the current filters (not just loaded pages).
  totalCount: number
  // Selection is defined against the active filters; when they change the
  // membership rules change with them, so the selection resets.
  resetKey: string
}) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [state, setState] = useState<CollectionSelectionState>(EMPTY_SELECTION)

  const clearSelection = useCallback(() => {
    setSelectionMode(false)
    setState(EMPTY_SELECTION)
  }, [])

  const lastResetKey = useRef(resetKey)
  useEffect(() => {
    if (lastResetKey.current === resetKey) return
    lastResetKey.current = resetKey
    clearSelection()
  }, [clearSelection, resetKey])

  const isSelected = useCallback(
    (id: string) => (state.all ? !state.excluded.has(id) : state.included.has(id)),
    [state],
  )

  const selectedItems = useMemo(
    () => items.filter((item) => isSelected(item.id)),
    [isSelected, items],
  )
  const selectedCount = state.all
    ? Math.max(totalCount - state.excluded.size, 0)
    : state.included.size
  const selectionActive = selectionMode || selectedCount > 0
  const allSelected = state.all && state.excluded.size === 0

  const toggleItem = useCallback((item: CollectionItem) => {
    setSelectionMode(true)
    setState((current) => {
      if (current.all) {
        const excluded = new Set(current.excluded)
        if (excluded.has(item.id)) excluded.delete(item.id)
        else excluded.add(item.id)
        return { ...current, excluded }
      }

      const included = new Set(current.included)
      if (included.has(item.id)) included.delete(item.id)
      else included.add(item.id)
      return { ...current, included }
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectionMode(true)
    setState({ all: true, included: new Set(), excluded: new Set() })
  }, [])

  const toggleSelectionMode = useCallback(() => {
    if (selectionActive) clearSelection()
    else setSelectionMode(true)
  }, [clearSelection, selectionActive])

  return {
    all: state.all,
    allSelected,
    clearSelection,
    excludedIds: state.excluded,
    includedIds: state.included,
    isSelected,
    selectAll,
    selectedCount,
    selectedItems,
    selectionActive,
    toggleItem,
    toggleSelectionMode,
  }
}

export function CollectionBulkActionBar({
  allSelected,
  onAddToDeck,
  onAddToList,
  onClear,
  onDelete,
  onEdit,
  onMove,
  onSelectAll,
  selectableCount,
  selectedCount,
  selectionActive,
}: {
  allSelected: boolean
  onAddToDeck: () => void
  onAddToList: () => void
  onClear: () => void
  onDelete: () => void
  onEdit: () => void
  onMove: () => void
  onSelectAll: () => void
  selectableCount: number
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
            disabled={selectableCount === 0 || allSelected}
            onClick={onSelectAll}
          >
            <CheckSquare className="h-4 w-4" />
            Select all
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
            onClick={onEdit}
          >
            <Edit3 className="h-4 w-4" />
            Edit
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

export function VirtualizedCollectionGrid({
  hasNextPage,
  isFetchingNextPage,
  isSelected,
  items,
  onLoadMore,
  onToggleSelected,
  selectionActive = false,
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isSelected?: (id: string) => boolean
  items: CollectionItem[]
  onLoadMore: () => void
  onToggleSelected?: (item: CollectionItem) => void
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

  if (!items.length) {
    return (
      <EmptyState
        title="No collection items found"
        description="Clear active filters, switch back to all cards, or add a card before starting a pull."
      />
    )
  }

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
            isSelected={isSelected?.(item.id) || false}
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

// Memoized so that toggling one selection only re-renders the affected tile.
// `onToggleSelected` is a stable useCallback from useCollectionItemSelection and
// `item` identity is stable, so isSelected/selectionActive drive re-renders.
const CollectionItemTile = memo(function CollectionItemTile({
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
  const client = useApolloClient()
  const [deckTarget, setDeckTarget] = useState<CollectionItem | null>(null)
  const [listTarget, setListTarget] = useState<CollectionItem | null>(null)
  const [moveTarget, setMoveTarget] = useState<CollectionItem | null>(null)
  const [editTarget, setEditTarget] = useState<CollectionItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CollectionItem | null>(null)
  const { pathname } = useLocation()
  const cardReturnSearch = collectionCardReturnSearch(pathname)

  function refreshCollection() {
    void invalidateCollectionViews(client, item.location?.id)
  }

  const allocatedQuantity = item.allocatedQuantity || 0
  const freeQuantity = Math.max((item.quantity || 0) - allocatedQuantity, 0)
  const deckLocation = collectionItemDeckLocation(item)
  const allocatedLabel = allocatedQuantity
    ? freeQuantity > 0
      ? `In deck x${allocatedQuantity} · Out x${freeQuantity}`
      : `In deck${allocatedQuantity > 1 ? ` x${allocatedQuantity}` : ""}`
    : undefined

  return (
    <>
      <CardTile
        allocatedLabel={allocatedLabel}
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
        location={deckLocation || item.location?.name}
        menuActions={[
          addToDeckAction({
            onClick: () => setDeckTarget(item),
            disabled: !item.printing?.card?.id,
          }),
          addToListAction({ onClick: () => setListTarget(item) }),
        ]}
        name={
          <Link
            to="/cards/$id"
            params={{ id: item.printing?.card?.id || "" }}
            search={cardReturnSearch}
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
})

function collectionItemDeckLocation(item: CollectionItem) {
  const allocationDecks = item.allocationDecks || []

  if (!allocationDecks.length) return null

  return allocationDecks
    .map((allocation) => {
      const name = allocation.deck.name
      return allocation.quantity > 1 ? `${name} x${allocation.quantity}` : name
    })
    .join(", ")
}
