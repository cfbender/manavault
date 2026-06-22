export type ComparisonOperator = "=" | "!=" | ">" | ">=" | "<" | "<="
export type ColorOperator = ":" | ">=" | "<="
export type FinishFilter = "any" | "foil" | "nonfoil" | "etched"
export type RarityFilter = "common" | "uncommon" | "rare" | "mythic"
export type ManaColor = "w" | "u" | "b" | "r" | "g" | "c"

export type CollectionFilterState = {
  name: string
  oracle: string
  typeLine: string
  colors: ManaColor[]
  colorOperator: ColorOperator
  identity: ManaColor[]
  identityOperator: ColorOperator
  manaValueOperator: ComparisonOperator
  manaValue: string
  rarities: RarityFilter[]
  set: string
  collectorOperator: ComparisonOperator
  collectorNumber: string
  language: string
  finish: FinishFilter
  priceOperator: ComparisonOperator
  priceUsd: string
  dateOperator: ComparisonOperator
  releasedDate: string
  yearOperator: ComparisonOperator
  releasedYear: string
}

export const EMPTY_COLLECTION_FILTERS: CollectionFilterState = {
  name: "",
  oracle: "",
  typeLine: "",
  colors: [],
  colorOperator: ":",
  identity: [],
  identityOperator: ":",
  manaValueOperator: "=",
  manaValue: "",
  rarities: [],
  set: "",
  collectorOperator: "=",
  collectorNumber: "",
  language: "",
  finish: "any",
  priceOperator: ">=",
  priceUsd: "",
  dateOperator: ">=",
  releasedDate: "",
  yearOperator: ">=",
  releasedYear: "",
}

export function buildCollectionFilterQuery(filters: CollectionFilterState) {
  const terms = [
    textPredicate("name", filters.name),
    textPredicate("oracle", filters.oracle),
    textPredicate("type", filters.typeLine),
    colorPredicate("c", filters.colorOperator, filters.colors),
    colorPredicate("id", filters.identityOperator, filters.identity),
    comparisonPredicate("mv", filters.manaValueOperator, filters.manaValue),
    rarityPredicate(filters.rarities),
    textPredicate("set", filters.set),
    comparisonPredicate("number", filters.collectorOperator, filters.collectorNumber),
    textPredicate("lang", filters.language),
    filters.finish === "any" ? "" : `is:${filters.finish}`,
    comparisonPredicate("usd", filters.priceOperator, filters.priceUsd),
    comparisonPredicate("date", filters.dateOperator, filters.releasedDate),
    comparisonPredicate("year", filters.yearOperator, filters.releasedYear),
  ].filter(Boolean)

  return terms.join(" ")
}

export function combineCollectionQueries(...parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `(${part})`)
    .join(" ")
}

export function countActiveCollectionFilters(filters: CollectionFilterState) {
  return [
    filters.name.trim(),
    filters.oracle.trim(),
    filters.typeLine.trim(),
    filters.colors.length,
    filters.identity.length,
    filters.manaValue.trim(),
    filters.rarities.length,
    filters.set.trim(),
    filters.collectorNumber.trim(),
    filters.language.trim(),
    filters.finish !== "any",
    filters.priceUsd.trim(),
    filters.releasedDate.trim(),
    filters.releasedYear.trim(),
  ].filter(Boolean).length
}

export function cloneCollectionFilters(filters: CollectionFilterState): CollectionFilterState {
  return {
    ...filters,
    colors: [...filters.colors],
    identity: [...filters.identity],
    rarities: [...filters.rarities],
  }
}

function textPredicate(field: string, value: string) {
  const trimmed = value.trim()
  return trimmed ? `${field}:${quoteScryfallValue(trimmed)}` : ""
}

function comparisonPredicate(field: string, operator: ComparisonOperator, value: string) {
  const trimmed = value.trim()
  return trimmed ? `${field}${operator}${quoteScryfallValue(trimmed)}` : ""
}

function colorPredicate(field: "c" | "id", operator: ColorOperator, colors: ManaColor[]) {
  if (!colors.length) return ""
  if (colors.includes("c")) return `${field}:c`

  return `${field}${operator}${colors.join("")}`
}

function rarityPredicate(rarities: RarityFilter[]) {
  if (!rarities.length) return ""

  const terms = rarities.map((rarity) => `rarity:${rarity}`)
  return terms.length === 1 ? terms[0] : `(${terms.join(" or ")})`
}

function quoteScryfallValue(value: string) {
  return /[\s()"]/.test(value)
    ? `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
    : value
}
