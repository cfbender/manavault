import { useApolloClient } from "@apollo/client/react"
import { Link, useLocation } from "@tanstack/react-router"
import { CheckSquare, Edit3, Layers, ListPlus, MoveUpRight, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

export function useCollectionItemSelection(items: CollectionItem[]) {
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

  const selectItems = useCallback((nextItems: CollectionItem[]) => {
    setSelectionMode(true)
    setSelectedIds(new Set(nextItems.map((item) => item.id)))
  }, [])

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
    selectItems,
    selectedCount,
    selectedIds,
    selectedItems,
    selectionActive,
    toggleItem,
    toggleSelectionMode,
  }
}

export function CollectionBulkActionBar({
  allLoadedSelected,
  hasNextPage,
  isSelectAllPending,
  loadedCount,
  onAddToDeck,
  onAddToList,
  onClear,
  onDelete,
  onEdit,
  onMove,
  onSelectAll,
  selectedCount,
  selectionActive,
}: {
  allLoadedSelected: boolean
  hasNextPage: boolean
  isSelectAllPending: boolean
  loadedCount: number
  onAddToDeck: () => void
  onAddToList: () => void
  onClear: () => void
  onDelete: () => void
  onEdit: () => void
  onMove: () => void
  onSelectAll: () => void
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
            aria-busy={isSelectAllPending}
            disabled={
              loadedCount === 0 || (allLoadedSelected && !hasNextPage) || isSelectAllPending
            }
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
}

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
