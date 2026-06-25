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

const COMPARISON_OPERATORS: readonly ComparisonOperator[] = ["=", "!=", ">", ">=", "<", "<="]
const COLOR_OPERATORS: readonly ColorOperator[] = [":", ">=", "<="]
const FINISH_FILTERS: readonly FinishFilter[] = ["any", "foil", "nonfoil", "etched"]
const RARITY_FILTERS: readonly RarityFilter[] = ["common", "uncommon", "rare", "mythic"]
const MANA_COLORS: readonly ManaColor[] = ["w", "u", "b", "r", "g", "c"]

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

export function encodeCollectionFilters(filters: CollectionFilterState) {
  if (!countActiveCollectionFilters(filters)) return undefined

  return JSON.stringify({
    name: trimmedValue(filters.name),
    oracle: trimmedValue(filters.oracle),
    typeLine: trimmedValue(filters.typeLine),
    colors: filters.colors.length ? filters.colors : undefined,
    colorOperator:
      filters.colors.length && filters.colorOperator !== EMPTY_COLLECTION_FILTERS.colorOperator
        ? filters.colorOperator
        : undefined,
    identity: filters.identity.length ? filters.identity : undefined,
    identityOperator:
      filters.identity.length &&
      filters.identityOperator !== EMPTY_COLLECTION_FILTERS.identityOperator
        ? filters.identityOperator
        : undefined,
    manaValue: trimmedValue(filters.manaValue),
    manaValueOperator:
      filters.manaValue.trim() &&
      filters.manaValueOperator !== EMPTY_COLLECTION_FILTERS.manaValueOperator
        ? filters.manaValueOperator
        : undefined,
    rarities: filters.rarities.length ? filters.rarities : undefined,
    set: trimmedValue(filters.set),
    collectorNumber: trimmedValue(filters.collectorNumber),
    collectorOperator:
      filters.collectorNumber.trim() &&
      filters.collectorOperator !== EMPTY_COLLECTION_FILTERS.collectorOperator
        ? filters.collectorOperator
        : undefined,
    language: trimmedValue(filters.language),
    finish: filters.finish === EMPTY_COLLECTION_FILTERS.finish ? undefined : filters.finish,
    priceUsd: trimmedValue(filters.priceUsd),
    priceOperator:
      filters.priceUsd.trim() && filters.priceOperator !== EMPTY_COLLECTION_FILTERS.priceOperator
        ? filters.priceOperator
        : undefined,
    releasedDate: trimmedValue(filters.releasedDate),
    dateOperator:
      filters.releasedDate.trim() && filters.dateOperator !== EMPTY_COLLECTION_FILTERS.dateOperator
        ? filters.dateOperator
        : undefined,
    releasedYear: trimmedValue(filters.releasedYear),
    yearOperator:
      filters.releasedYear.trim() && filters.yearOperator !== EMPTY_COLLECTION_FILTERS.yearOperator
        ? filters.yearOperator
        : undefined,
  })
}

export function decodeCollectionFilters(value: unknown): CollectionFilterState {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  if (typeof value !== "string" || !value.trim()) return filters

  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch {
    return filters
  }

  if (!isRecord(decoded)) return filters

  filters.name = stringValue(decoded.name)
  filters.oracle = stringValue(decoded.oracle)
  filters.typeLine = stringValue(decoded.typeLine)
  filters.colors = filteredValues(decoded.colors, MANA_COLORS)
  filters.colorOperator = operatorValue(
    decoded.colorOperator,
    COLOR_OPERATORS,
    filters.colorOperator,
  )
  filters.identity = filteredValues(decoded.identity, MANA_COLORS)
  filters.identityOperator = operatorValue(
    decoded.identityOperator,
    COLOR_OPERATORS,
    filters.identityOperator,
  )
  filters.manaValue = stringValue(decoded.manaValue)
  filters.manaValueOperator = operatorValue(
    decoded.manaValueOperator,
    COMPARISON_OPERATORS,
    filters.manaValueOperator,
  )
  filters.rarities = filteredValues(decoded.rarities, RARITY_FILTERS)
  filters.set = stringValue(decoded.set)
  filters.collectorNumber = stringValue(decoded.collectorNumber)
  filters.collectorOperator = operatorValue(
    decoded.collectorOperator,
    COMPARISON_OPERATORS,
    filters.collectorOperator,
  )
  filters.language = stringValue(decoded.language)
  filters.finish = operatorValue(decoded.finish, FINISH_FILTERS, filters.finish)
  filters.priceUsd = stringValue(decoded.priceUsd)
  filters.priceOperator = operatorValue(
    decoded.priceOperator,
    COMPARISON_OPERATORS,
    filters.priceOperator,
  )
  filters.releasedDate = stringValue(decoded.releasedDate)
  filters.dateOperator = operatorValue(
    decoded.dateOperator,
    COMPARISON_OPERATORS,
    filters.dateOperator,
  )
  filters.releasedYear = stringValue(decoded.releasedYear)
  filters.yearOperator = operatorValue(
    decoded.yearOperator,
    COMPARISON_OPERATORS,
    filters.yearOperator,
  )

  return filters
}

function trimmedValue(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function filteredValues<T extends string>(value: unknown, allowed: readonly T[]) {
  if (!Array.isArray(value)) return []

  return Array.from(new Set(value.filter((item): item is T => isAllowedValue(item, allowed))))
}

function operatorValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return isAllowedValue(value, allowed) ? value : fallback
}

function isAllowedValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T)
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
