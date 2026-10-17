import type { SortOption, SortState } from "../../components/sort-dropdown"

export type SetSortField = "number" | "name" | "mana_value" | "color" | "type" | "rarity" | "price"

export type SetSort = SortState<SetSortField>

export const DEFAULT_SET_SORT: SetSort = { field: "number", direction: "asc" }

export const SET_SORT_OPTIONS: SortOption<SetSortField>[] = [
  { field: "number", label: "Set number" },
  { field: "name", label: "Card name" },
  { field: "mana_value", label: "Mana value" },
  { field: "color", label: "Color" },
  { field: "type", label: "Type" },
  { field: "rarity", label: "Rarity" },
  { field: "price", label: "Price" },
]

export function serializeSetSort(sort: SetSort): string | undefined {
  return sort.field === DEFAULT_SET_SORT.field && sort.direction === DEFAULT_SET_SORT.direction
    ? undefined
    : `${sort.field}:${sort.direction}`
}

export function deserializeSetSort(value: unknown): SetSort {
  if (typeof value !== "string") return DEFAULT_SET_SORT
  const [field, direction] = value.split(":")
  const option = SET_SORT_OPTIONS.find((candidate) => candidate.field === field)
  return {
    field: option?.field ?? DEFAULT_SET_SORT.field,
    direction: direction === "asc" || direction === "desc" ? direction : DEFAULT_SET_SORT.direction,
  }
}
