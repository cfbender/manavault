import type { SortDirection, SortOption, SortState } from "../../components/sort-dropdown"

export type CatalogSortField =
  | "name"
  | "mana_value"
  | "color"
  | "type"
  | "released"
  | "rarity"
  | "price"

export type CatalogSort = SortState<CatalogSortField>

export const DEFAULT_CATALOG_SORT: CatalogSort = { field: "name", direction: "asc" }

const CATALOG_SORT_FIELDS: CatalogSortField[] = [
  "name",
  "mana_value",
  "color",
  "type",
  "released",
  "rarity",
  "price",
]

export const CATALOG_SORT_OPTIONS: SortOption<CatalogSortField>[] = [
  { field: "name", label: "Card name" },
  { field: "mana_value", label: "Mana value" },
  { field: "color", label: "Color" },
  { field: "type", label: "Type" },
  { field: "released", label: "Release date" },
  { field: "rarity", label: "Rarity" },
  { field: "price", label: "Price" },
]

export function serializeCatalogSort(sort: CatalogSort): string | undefined {
  return sort.field === DEFAULT_CATALOG_SORT.field &&
    sort.direction === DEFAULT_CATALOG_SORT.direction
    ? undefined
    : `${sort.field}:${sort.direction}`
}

export function deserializeCatalogSort(value: unknown): CatalogSort {
  if (typeof value !== "string") return DEFAULT_CATALOG_SORT

  const [field, direction] = value.split(":")

  return {
    field: CATALOG_SORT_FIELDS.includes(field as CatalogSortField)
      ? (field as CatalogSortField)
      : DEFAULT_CATALOG_SORT.field,
    direction:
      direction === "desc" || direction === "asc"
        ? (direction as SortDirection)
        : DEFAULT_CATALOG_SORT.direction,
  }
}
