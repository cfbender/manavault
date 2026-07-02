import type { CollectionItemFilters, CollectionItemSelector } from "../../gql/graphql"
import type { CollectionItemSelection } from "./selection-grid"
import type { CollectionItem } from "./types"

// A bulk-selection target described as a set expression: either explicit ids,
// or "everything matching filters minus excludedIds" when all is set. `items`
// only carries the loaded selected items, for labels — with all set the full
// membership exists only server-side.
export type CollectionSelectionTarget = {
  kind: "selection"
  all: boolean
  ids: string[]
  excludedIds: string[]
  filters: CollectionItemFilters
  count: number
  items: CollectionItem[]
}

export type CollectionItemTarget =
  | CollectionItem
  | CollectionItem[]
  | CollectionSelectionTarget
  | null

export function collectionSelectionTarget(
  selection: CollectionItemSelection,
  filters: CollectionItemFilters,
): CollectionSelectionTarget {
  return {
    kind: "selection",
    all: selection.all,
    ids: [...selection.includedIds],
    excludedIds: [...selection.excludedIds],
    filters,
    count: selection.selectedCount,
    items: selection.selectedItems,
  }
}

function isSelectionTarget(target: CollectionItemTarget): target is CollectionSelectionTarget {
  return Boolean(target) && !Array.isArray(target) && "kind" in (target as object)
}

export function collectionTargetItems(target: CollectionItemTarget): CollectionItem[] {
  if (!target) return []
  if (isSelectionTarget(target)) return target.items
  return Array.isArray(target) ? target : [target]
}

export function collectionTargetCount(target: CollectionItemTarget): number {
  if (!target) return 0
  if (isSelectionTarget(target)) return target.count
  return Array.isArray(target) ? target.length : 1
}

// The mutation input naming this target, matching the backend's
// CollectionItemSelector semantics.
export function collectionTargetSelector(target: CollectionItemTarget): CollectionItemSelector {
  if (isSelectionTarget(target) && target.all) {
    return { all: true, filters: target.filters, excludedIds: target.excludedIds }
  }

  if (isSelectionTarget(target)) return { ids: target.ids }

  return { ids: collectionTargetItems(target).map((item) => item.id) }
}

export function collectionTargetLabel(target: CollectionItemTarget) {
  const count = collectionTargetCount(target)
  const items = collectionTargetItems(target)

  if (count === 1 && items.length === 1) return items[0].printing?.card?.name || "Collection item"
  return `${count} selected items`
}
