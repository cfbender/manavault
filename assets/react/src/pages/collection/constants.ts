import type {
  ColorOperator,
  ComparisonOperator,
  ManaColor,
  RarityFilter,
} from "../../lib/collection-filters"
import type { CollectionSort, CollectionSortDirection, CollectionSortField } from "./types"

export const COLLECTION_PAGE_SIZE = 48
export const CARD_TILE_WIDTH = 228
export const CARD_TILE_ROW_HEIGHT = 352
export const CARD_TILE_GAP = 24

export {
  COLLECTION_ACTIVE_TAB_STORAGE_KEY,
  COLLECTION_APPLIED_SEARCH_STORAGE_KEY,
  COLLECTION_FILTERS_STORAGE_KEY,
  COLLECTION_LOCATION_STATE_STORAGE_PREFIX,
  COLLECTION_SEARCH_DRAFT_STORAGE_KEY,
  COLLECTION_SORT_STORAGE_KEY,
  COLLECTION_STATE_STORAGE_PREFIX,
} from "./storage-keys"
export const DEFAULT_COLLECTION_SORT: CollectionSort = {
  field: "name",
  direction: "asc",
}
export const COLLECTION_SORT_FIELDS: CollectionSortField[] = [
  "quantity",
  "name",
  "set",
  "rarity",
  "price",
  "added",
]
export const COLLECTION_SORT_DIRECTIONS: CollectionSortDirection[] = ["asc", "desc"]

export const SORT_OPTIONS: { field: CollectionSortField; label: string }[] = [
  { field: "quantity", label: "Quantity" },
  { field: "name", label: "Card name" },
  { field: "set", label: "Set" },
  { field: "rarity", label: "Rarity" },
  { field: "price", label: "Price" },
  { field: "added", label: "Added date" },
]

export const COLOR_OPTIONS: { value: ManaColor; label: string; symbol: string }[] = [
  { value: "w", label: "White", symbol: "W" },
  { value: "u", label: "Blue", symbol: "U" },
  { value: "b", label: "Black", symbol: "B" },
  { value: "r", label: "Red", symbol: "R" },
  { value: "g", label: "Green", symbol: "G" },
  { value: "c", label: "Colorless", symbol: "C" },
]

export const RARITY_OPTIONS: {
  value: RarityFilter
  label: string
  className: string
}[] = [
  { value: "common", label: "Common", className: "bg-zinc-300" },
  { value: "uncommon", label: "Uncommon", className: "bg-slate-400" },
  { value: "rare", label: "Rare", className: "bg-yellow-400" },
  { value: "mythic", label: "Mythic", className: "bg-orange-400" },
]

export const COMPARISON_OPTIONS: ComparisonOperator[] = ["=", "!=", ">", ">=", "<", "<="]
export const COLOR_OPERATOR_OPTIONS: { value: ColorOperator; label: string }[] = [
  { value: ":", label: "Exactly" },
  { value: ">=", label: "Includes" },
  { value: "<=", label: "At most" },
]

export const TYPE_OPTIONS = [
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

export const LOCATION_KINDS = ["box", "binder", "deck_box", "list", "folder", "other"] as const
export const COLLECTION_CONDITIONS = [
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
] as const
export const COLLECTION_FINISHES = ["nonfoil", "foil", "etched"] as const
export const MODAL_SEARCH_DEBOUNCE_MS = 250
