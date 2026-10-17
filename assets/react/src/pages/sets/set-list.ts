// Filtering, sorting, and grouping the set browser's list of sets.

export type SetListEntry = {
  code: string
  name: string
  releasedAt?: string | null
  setType?: string | null
  cardCount: number
  ownedCount: number
}

export type SetCategory =
  | "expansion"
  | "masters"
  | "commander"
  | "draft"
  | "other"
  | "promo"
  | "token"

export const SET_CATEGORIES: { key: SetCategory; label: string }[] = [
  { key: "expansion", label: "Expansions" },
  { key: "masters", label: "Remasters" },
  { key: "commander", label: "Commander" },
  { key: "draft", label: "Draft innovation" },
  { key: "other", label: "Supplemental" },
  { key: "promo", label: "Promos" },
  { key: "token", label: "Tokens" },
]

// Promo and token sets number in the hundreds; they are a click away.
export const DEFAULT_SET_CATEGORIES: SetCategory[] = [
  "expansion",
  "masters",
  "commander",
  "draft",
  "other",
]

const CATEGORY_BY_TYPE: Record<string, SetCategory> = {
  expansion: "expansion",
  core: "expansion",
  masters: "masters",
  eternal: "masters",
  commander: "commander",
  draft_innovation: "draft",
  promo: "promo",
  token: "token",
  memorabilia: "token",
}

/** The browser's category for a Scryfall set type; unknown types are supplemental. */
export function setCategory(setType?: string | null): SetCategory {
  return CATEGORY_BY_TYPE[setType ?? ""] ?? "other"
}

export type SetListSortField = "released" | "name" | "cards" | "owned"

export type SetListSort = { field: SetListSortField; direction: "asc" | "desc" }

export const DEFAULT_SET_LIST_SORT: SetListSort = { field: "released", direction: "desc" }

export const SET_LIST_SORT_OPTIONS: { field: SetListSortField; label: string }[] = [
  { field: "released", label: "Release date" },
  { field: "name", label: "Set name" },
  { field: "cards", label: "Card count" },
  { field: "owned", label: "Completion" },
]

export function completion(set: Pick<SetListEntry, "cardCount" | "ownedCount">) {
  return set.cardCount ? set.ownedCount / set.cardCount : 0
}

function compareBy(field: SetListSortField, a: SetListEntry, b: SetListEntry) {
  switch (field) {
    case "name":
      return a.name.localeCompare(b.name)
    case "cards":
      return a.cardCount - b.cardCount
    case "owned":
      return completion(a) - completion(b) || a.ownedCount - b.ownedCount
    case "released":
      return (a.releasedAt ?? "").localeCompare(b.releasedAt ?? "")
  }
}

/** Sets matching a name or code and the chosen categories, in sort order. */
export function filterSets<S extends SetListEntry>(
  sets: readonly S[],
  {
    query,
    categories,
    ownedOnly = false,
    sort = DEFAULT_SET_LIST_SORT,
  }: {
    query: string
    categories: readonly SetCategory[]
    ownedOnly?: boolean
    sort?: SetListSort
  },
): S[] {
  const term = query.trim().toLowerCase()
  const direction = sort.direction === "desc" ? -1 : 1
  return sets
    .filter(
      (set) =>
        // A search finds a set whatever its category.
        (term
          ? set.code.toLowerCase() === term || set.name.toLowerCase().includes(term)
          : categories.includes(setCategory(set.setType))) &&
        (!ownedOnly || set.ownedCount > 0),
    )
    .sort(
      (a, b) =>
        direction * compareBy(sort.field, a, b) ||
        (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "") ||
        a.code.localeCompare(b.code),
    )
}

/**
 * Sets in release order shelved by year; any other order is one shelf, since
 * year headings would interrupt it.
 */
export function shelveSets<S extends SetListEntry>(
  sets: readonly S[],
  sort: SetListSort,
): { label: string | null; sets: S[] }[] {
  if (sort.field !== "released") return sets.length ? [{ label: null, sets: [...sets] }] : []

  const shelves: { label: string; sets: S[] }[] = []
  for (const set of sets) {
    const year = set.releasedAt?.slice(0, 4) || "Undated"
    const shelf = shelves.at(-1)
    if (shelf?.label === year) shelf.sets.push(set)
    else shelves.push({ label: year, sets: [set] })
  }
  return shelves
}

export function serializeSetListSort(sort: SetListSort) {
  return sort.field === DEFAULT_SET_LIST_SORT.field &&
    sort.direction === DEFAULT_SET_LIST_SORT.direction
    ? undefined
    : `${sort.field}:${sort.direction}`
}

export function deserializeSetListSort(value: unknown): SetListSort {
  if (typeof value !== "string") return DEFAULT_SET_LIST_SORT
  const [field, direction] = value.split(":")
  const known = SET_LIST_SORT_OPTIONS.find((option) => option.field === field)
  return {
    field: known?.field ?? DEFAULT_SET_LIST_SORT.field,
    direction:
      direction === "asc" || direction === "desc" ? direction : DEFAULT_SET_LIST_SORT.direction,
  }
}

export function serializeSetCategories(categories: readonly SetCategory[]) {
  const sorted = SET_CATEGORIES.map(({ key }) => key).filter((key) => categories.includes(key))
  return sorted.join(",") === DEFAULT_SET_CATEGORIES.join(",") ? undefined : sorted.join(",")
}

export function deserializeSetCategories(value: unknown): SetCategory[] {
  if (typeof value !== "string") return DEFAULT_SET_CATEGORIES
  const keys = value.split(",")
  return SET_CATEGORIES.map(({ key }) => key).filter((key) => keys.includes(key))
}
