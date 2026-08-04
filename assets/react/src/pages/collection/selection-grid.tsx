import { useApolloClient } from "@apollo/client/react"
import { Link, useLocation } from "@tanstack/react-router"
import { CheckSquare, Edit3, Layers, ListPlus, MoveUpRight, Trash2, X } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EmptyState } from "../../components/card-image"
import { addToDeckAction, addToListAction, CardTile } from "../../components/card-tile"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { useCardSize } from "../../lib/card-size"
import { collectionCardReturnSearch, invalidateCollectionViews } from "./collection-navigation"
import { CARD_TILE_GAP } from "./constants"
import {
  AddCollectionItemToDeckDialog,
  BulkEditCollectionItemsDialog,
  DeleteCollectionItemDialog,
  EditCollectionItemDialog,
  MoveCollectionItemDialog,
} from "./item-dialogs"
import type { CollectionItem, CollectionItemGroup } from "./types"

// Selection is tracked as a set expression instead of materializing every row:
// "select all" flips `all`, while explicitly toggled printing groups retain a
// snapshot of their member row ids so pagination or sorting cannot lose them.
type CollectionSelectionState = {
  all: boolean
  included: Map<string, CollectionGroupSelectionSnapshot>
  excluded: Map<string, CollectionGroupSelectionSnapshot>
}

type CollectionGroupSelectionSnapshot = {
  itemIds: Set<string>
  finishesByCard: Map<string, Set<string>>
}

const EMPTY_SELECTION: CollectionSelectionState = {
  all: false,
  included: new Map(),
  excluded: new Map(),
}

export type CollectionItemSelection = ReturnType<typeof useCollectionItemSelection>

export function useCollectionItemSelection({
  groups,
  totalCount,
  resetKey,
}: {
  groups: CollectionItemGroup[]
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

  const selectedGroups = useMemo(
    () => groups.filter((group) => isSelected(group.printingId)),
    [groups, isSelected],
  )
  const selectedItems = useMemo(
    () => selectedGroups.flatMap((group) => group.items),
    [selectedGroups],
  )
  const includedIds = useMemo(() => groupMemberIds(state.included), [state.included])
  const excludedIds = useMemo(() => groupMemberIds(state.excluded), [state.excluded])
  const selectedCount = state.all ? Math.max(totalCount - excludedIds.size, 0) : includedIds.size
  const selectionActive = selectionMode || selectedCount > 0
  const allSelected = state.all && state.excluded.size === 0
  const addToDeckDisabledReason = state.all
    ? "Add to deck isn't available with Select all. Choose printing groups with one finish instead."
    : mixedFinishSelection(state.included)
      ? "Choose printing groups with only one finish per card before adding to a deck."
      : undefined

  const toggleItem = useCallback((group: CollectionItemGroup) => {
    setSelectionMode(true)
    setState((current) => {
      if (current.all) {
        const excluded = new Map(current.excluded)
        if (excluded.has(group.printingId)) excluded.delete(group.printingId)
        else excluded.set(group.printingId, groupSelectionSnapshot(group))
        return { ...current, excluded }
      }

      const included = new Map(current.included)
      if (included.has(group.printingId)) included.delete(group.printingId)
      else included.set(group.printingId, groupSelectionSnapshot(group))
      return { ...current, included }
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectionMode(true)
    setState({ all: true, included: new Map(), excluded: new Map() })
  }, [])

  const toggleSelectionMode = useCallback(() => {
    if (selectionActive) clearSelection()
    else setSelectionMode(true)
  }, [clearSelection, selectionActive])

  return {
    all: state.all,
    addToDeckDisabledReason,
    allSelected,
    clearSelection,
    excludedIds,
    includedIds,
    isSelected,
    selectAll,
    selectedCount,
    selectedItems,
    selectionActive,
    toggleItem,
    toggleSelectionMode,
  }
}

function groupSelectionSnapshot(group: CollectionItemGroup): CollectionGroupSelectionSnapshot {
  const finishesByCard = new Map<string, Set<string>>()

  for (const item of group.items) {
    const cardId = item.printing?.card?.oracleId || item.printing?.card?.id || group.printingId
    const finishes = finishesByCard.get(cardId) || new Set<string>()
    finishes.add(item.finish)
    finishesByCard.set(cardId, finishes)
  }

  return {
    itemIds: new Set(group.items.map((item) => item.id)),
    finishesByCard,
  }
}

function groupMemberIds(groups: Map<string, CollectionGroupSelectionSnapshot>): Set<string> {
  return new Set([...groups.values()].flatMap((snapshot) => [...snapshot.itemIds]))
}

function mixedFinishSelection(groups: Map<string, CollectionGroupSelectionSnapshot>): boolean {
  const finishesByCard = new Map<string, Set<string>>()

  for (const snapshot of groups.values()) {
    for (const [cardId, finishes] of snapshot.finishesByCard) {
      const combined = finishesByCard.get(cardId) || new Set<string>()
      for (const finish of finishes) combined.add(finish)
      if (combined.size > 1) return true
      finishesByCard.set(cardId, combined)
    }
  }

  return false
}

export function CollectionBulkActionBar({
  addToDeckDisabledReason,
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
  addToDeckDisabledReason?: string
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
          <Button
            type="button"
            size="sm"
            disabled={!hasSelection || Boolean(addToDeckDisabledReason)}
            title={hasSelection ? addToDeckDisabledReason : undefined}
            onClick={onAddToDeck}
          >
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
  groups,
  hasNextPage,
  isFetchingNextPage,
  isSelected,
  onLoadMore,
  onToggleForTrade,
  onToggleSelected,
  selectionActive = false,
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isSelected?: (id: string) => boolean
  groups: CollectionItemGroup[]
  onLoadMore: () => void
  onToggleForTrade?: (group: CollectionItemGroup) => void
  onToggleSelected?: (group: CollectionItemGroup) => void
  selectionActive?: boolean
}) {
  const size = useCardSize()
  const containerRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(1)
  const [range, setRange] = useState({ startRow: 0, endRow: 8 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateColumns = () => {
      const width = container.getBoundingClientRect().width
      setColumns(Math.max(1, Math.floor((width + CARD_TILE_GAP) / (size.widthPx + CARD_TILE_GAP))))
    }

    updateColumns()
    const resizeObserver = new ResizeObserver(updateColumns)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [size.widthPx])

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
        const overscan = size.rowHeightPx * 3
        const visibleTop = Math.max(0, -rect.top - overscan)
        const visibleBottom = Math.min(
          rowCount * size.rowHeightPx,
          viewportHeight - rect.top + overscan,
        )
        const startRow = Math.max(0, Math.floor(visibleTop / size.rowHeightPx))
        const endRow = Math.max(startRow + 1, Math.ceil(visibleBottom / size.rowHeightPx))

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
  }, [columns, groups.length, size.rowHeightPx])

  const rowCount = Math.ceil(groups.length / columns)
  const totalHeight = Math.max(0, rowCount * size.rowHeightPx - CARD_TILE_GAP)
  const startIndex = range.startRow * columns
  const endIndex = Math.min(groups.length, range.endRow * columns)
  const visibleGroups = groups.slice(startIndex, endIndex)

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && endIndex >= groups.length - columns * 4) {
      onLoadMore()
    }
  }, [columns, endIndex, groups.length, hasNextPage, isFetchingNextPage, onLoadMore])

  if (!groups.length) {
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
        className="grid justify-center gap-x-6 gap-y-8"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(min(${size.widthRem}rem, 100%), ${size.widthRem}rem))`,
          transform: `translateY(${range.startRow * size.rowHeightPx}px)`,
        }}
      >
        {visibleGroups.map((group) => (
          <CollectionItemTile
            key={group.printingId}
            group={group}
            isSelected={isSelected?.(group.printingId) || false}
            onToggleForTrade={onToggleForTrade}
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
  group,
  isSelected = false,
  onToggleForTrade,
  onToggleSelected,
  selectionActive = false,
}: {
  group: CollectionItemGroup
  isSelected?: boolean
  onToggleForTrade?: (group: CollectionItemGroup) => void
  onToggleSelected?: (group: CollectionItemGroup) => void
  selectionActive?: boolean
}) {
  const client = useApolloClient()
  const [deckTarget, setDeckTarget] = useState<CollectionItem[] | null>(null)
  const [listTarget, setListTarget] = useState<CollectionItem[] | null>(null)
  const [moveTarget, setMoveTarget] = useState<CollectionItem[] | null>(null)
  const [editTarget, setEditTarget] = useState<CollectionItem | null>(null)
  const [bulkEditTarget, setBulkEditTarget] = useState<CollectionItem[] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CollectionItem[] | null>(null)
  const { pathname } = useLocation()
  const cardReturnSearch = collectionCardReturnSearch(pathname)
  const item = group.items[0]

  function refreshCollection() {
    void invalidateCollectionViews(client, item.location?.id)
  }

  const allocatedQuantity = group.items.reduce(
    (total, member) => total + (member.allocatedQuantity || 0),
    0,
  )
  const freeQuantity = Math.max(group.quantity - allocatedQuantity, 0)
  const deckLocation = collectionItemDeckLocation(group.items)
  const finish = commonValue(group.items.map((member) => member.finish))
  const hasMixedFinishes = new Set(group.items.map((member) => member.finish)).size > 1
  const location = commonValue(group.items.map((member) => member.location?.name || "Unfiled"))
  const price = finish ? item.priceText : undefined
  const allocatedLabel = allocatedQuantity
    ? freeQuantity > 0
      ? `In deck x${allocatedQuantity} · Out x${freeQuantity}`
      : `In deck${allocatedQuantity > 1 ? ` x${allocatedQuantity}` : ""}`
    : undefined

  return (
    <>
      <CardTile
        allocatedLabel={allocatedLabel}
        count={group.quantity}
        defaultActions={[
          {
            icon: <MoveUpRight className="h-4 w-4" />,
            label: "Move",
            onClick: () => setMoveTarget(group.items),
          },
          {
            icon: <Edit3 className="h-4 w-4" />,
            label: "Edit",
            onClick: () =>
              group.items.length === 1 ? setEditTarget(item) : setBulkEditTarget(group.items),
          },
          {
            destructive: true,
            icon: <Trash2 className="h-4 w-4" />,
            label: "Delete",
            onClick: () => setDeleteTarget(group.items),
          },
        ]}
        finish={finish}
        forTradeActive={group.items.every((member) => member.forTrade)}
        forTradeCardName={item.printing?.card?.name || undefined}
        imageUrl={item.printing?.imageUrl}
        location={deckLocation || location}
        menuActions={[
          hasMixedFinishes
            ? {
                disabled: true,
                icon: <Layers className="h-4 w-4" />,
                label: "Add to deck (choose a finish on the card page)",
              }
            : addToDeckAction({
                onClick: () => setDeckTarget(group.items),
                disabled: !item.printing?.card?.id,
              }),
          addToListAction({ onClick: () => setListTarget(group.items) }),
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
        price={price}
        rarity={item.printing?.rarity}
        selectable={Boolean(onToggleSelected)}
        selected={isSelected}
        selectionActive={selectionActive}
        selectionLabel={`${isSelected ? "Deselect" : "Select"} ${item.printing?.card?.name || "card"}`}
        setCode={item.printing?.setCode}
        setLabel={`${item.printing?.setCode?.toUpperCase() || "?"} #${item.printing?.collectorNumber || "?"}`}
        setName={item.printing?.setName}
        typeLine={item.printing?.card?.typeLine}
        onToggleForTrade={onToggleForTrade ? () => onToggleForTrade(group) : undefined}
        onToggleSelected={() => onToggleSelected?.(group)}
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
      <BulkEditCollectionItemsDialog
        item={bulkEditTarget}
        onDone={refreshCollection}
        onOpenChange={(open) => !open && setBulkEditTarget(null)}
      />
      <DeleteCollectionItemDialog
        item={deleteTarget}
        onDone={refreshCollection}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </>
  )
})

function collectionItemDeckLocation(items: CollectionItem[]) {
  const allocationDecks = items.flatMap((item) => item.allocationDecks || [])

  if (!allocationDecks.length) return null

  const quantitiesByDeck = new Map<string, { name: string; quantity: number }>()
  for (const allocation of allocationDecks) {
    const current = quantitiesByDeck.get(allocation.deck.id)
    quantitiesByDeck.set(allocation.deck.id, {
      name: allocation.deck.name,
      quantity: (current?.quantity || 0) + allocation.quantity,
    })
  }

  return [...quantitiesByDeck.values()]
    .map(({ name, quantity }) => (quantity > 1 ? `${name} x${quantity}` : name))
    .join(", ")
}

function commonValue<T>(values: T[]): T | undefined {
  const first = values[0]
  return values.every((value) => value === first) ? first : undefined
}
