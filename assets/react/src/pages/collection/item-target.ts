import type { CollectionItem } from "./types"

export type CollectionItemTarget = CollectionItem | CollectionItem[] | null

export function collectionTargetItems(target: CollectionItemTarget) {
  if (!target) return []
  return Array.isArray(target) ? target : [target]
}

export function collectionTargetLabel(target: CollectionItemTarget) {
  const items = collectionTargetItems(target)
  if (items.length === 1) return items[0].printing?.card?.name || "Collection item"
  return `${items.length} selected items`
}
