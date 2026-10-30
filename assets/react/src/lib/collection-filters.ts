export type ComparisonOperator = "=" | "!=" | ">" | ">=" | "<" | "<="
export type ColorOperator = "=" | ">=" | "<="
export type FinishFilter = "any" | "foil" | "nonfoil" | "etched"
export type AllocationFilter = "any" | "allocated" | "unallocated"
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
  sets: string[]
  collectorOperator: ComparisonOperator
  collectorNumber: string
  language: string
  finish: FinishFilter
  allocation: AllocationFilter
  quantityOperator: ComparisonOperator
  quantity: string
  purchasePriceMin: string
  purchasePriceMax: string
  addedFrom: string
  addedTo: string
  priceOperator: ComparisonOperator
  priceUsd: string
  dateOperator: ComparisonOperator
  releasedDate: string
  yearOperator: ComparisonOperator
  releasedYear: string
}

const COMPARISON_OPERATORS: readonly ComparisonOperator[] = ["=", "!=", ">", ">=", "<", "<="]
const COLOR_OPERATORS: readonly ColorOperator[] = ["=", ">=", "<="]
const FINISH_FILTERS: readonly FinishFilter[] = ["any", "foil", "nonfoil", "etched"]
const ALLOCATION_FILTERS: readonly AllocationFilter[] = ["any", "allocated", "unallocated"]
const RARITY_FILTERS: readonly RarityFilter[] = ["common", "uncommon", "rare", "mythic"]
const MANA_COLORS: readonly ManaColor[] = ["w", "u", "b", "r", "g", "c"]

export const EMPTY_COLLECTION_FILTERS: CollectionFilterState = {
  name: "",
  oracle: "",
  typeLine: "",
  colors: [],
  // Scryfall's `c:` (at least these colors) and `id:` (fits this identity).
  colorOperator: ">=",
  identity: [],
  identityOperator: "<=",
  manaValueOperator: "=",
  manaValue: "",
  rarities: [],
  sets: [],
  collectorOperator: "=",
  collectorNumber: "",
  language: "",
  finish: "any",
  allocation: "any",
  quantityOperator: ">=",
  quantity: "",
  purchasePriceMin: "",
  purchasePriceMax: "",
  addedFrom: "",
  addedTo: "",
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
    setPredicate(filters.sets),
    comparisonPredicate("number", filters.collectorOperator, filters.collectorNumber),
    textPredicate("lang", filters.language),
    filters.finish === "any" ? "" : `is:${filters.finish}`,
    filters.allocation === "any" ? "" : `is:${filters.allocation}`,
    comparisonPredicate("qty", filters.quantityOperator, filters.quantity),
    comparisonPredicate("paid", ">=", filters.purchasePriceMin),
    comparisonPredicate("paid", "<=", filters.purchasePriceMax),
    comparisonPredicate("added", ">=", filters.addedFrom),
    comparisonPredicate("added", "<=", filters.addedTo),
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
    filters.sets.length,
    filters.collectorNumber.trim(),
    filters.language.trim(),
    filters.finish !== "any",
    filters.allocation !== "any",
    filters.quantity.trim(),
    filters.purchasePriceMin.trim() || filters.purchasePriceMax.trim(),
    filters.addedFrom.trim() || filters.addedTo.trim(),
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
    sets: [...filters.sets],
  }
}

export function encodeCollectionFilters(filters: CollectionFilterState) {
  if (!countActiveCollectionFilters(filters)) return undefined

  return JSON.stringify({
    name: trimmedValue(filters.name),
    oracle: trimmedValue(filters.oracle),
    typeLine: trimmedValue(filters.typeLine),
    colors: filters.colors.length ? filters.colors : undefined,
    // Always written with colors: filters saved before the Scryfall defaults
    // omitted the operator to mean "exactly".
    colorOperator: filters.colors.length ? filters.colorOperator : undefined,
    identity: filters.identity.length ? filters.identity : undefined,
    identityOperator: filters.identity.length ? filters.identityOperator : undefined,
    manaValue: trimmedValue(filters.manaValue),
    manaValueOperator:
      filters.manaValue.trim() &&
      filters.manaValueOperator !== EMPTY_COLLECTION_FILTERS.manaValueOperator
        ? filters.manaValueOperator
        : undefined,
    rarities: filters.rarities.length ? filters.rarities : undefined,
    sets: filters.sets.length ? filters.sets : undefined,
    collectorNumber: trimmedValue(filters.collectorNumber),
    collectorOperator:
      filters.collectorNumber.trim() &&
      filters.collectorOperator !== EMPTY_COLLECTION_FILTERS.collectorOperator
        ? filters.collectorOperator
        : undefined,
    language: trimmedValue(filters.language),
    finish: filters.finish === EMPTY_COLLECTION_FILTERS.finish ? undefined : filters.finish,
    allocation:
      filters.allocation === EMPTY_COLLECTION_FILTERS.allocation ? undefined : filters.allocation,
    quantity: trimmedValue(filters.quantity),
    quantityOperator:
      filters.quantity.trim() &&
      filters.quantityOperator !== EMPTY_COLLECTION_FILTERS.quantityOperator
        ? filters.quantityOperator
        : undefined,
    purchasePriceMin: trimmedValue(filters.purchasePriceMin),
    purchasePriceMax: trimmedValue(filters.purchasePriceMax),
    addedFrom: trimmedValue(filters.addedFrom),
    addedTo: trimmedValue(filters.addedTo),
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
  filters.colorOperator = colorOperatorValue(
    decoded.colorOperator,
    filters.colors,
    filters.colorOperator,
  )
  filters.identity = filteredValues(decoded.identity, MANA_COLORS)
  filters.identityOperator = colorOperatorValue(
    decoded.identityOperator,
    filters.identity,
    filters.identityOperator,
  )
  filters.manaValue = stringValue(decoded.manaValue)
  filters.manaValueOperator = operatorValue(
    decoded.manaValueOperator,
    COMPARISON_OPERATORS,
    filters.manaValueOperator,
  )
  filters.rarities = filteredValues(decoded.rarities, RARITY_FILTERS)
  // Older saved filters stored a single `set` string.
  filters.sets = uniqueSetValues(
    Array.isArray(decoded.sets) ? decoded.sets : [stringValue(decoded.set)],
  )
  filters.collectorNumber = stringValue(decoded.collectorNumber)
  filters.collectorOperator = operatorValue(
    decoded.collectorOperator,
    COMPARISON_OPERATORS,
    filters.collectorOperator,
  )
  filters.language = stringValue(decoded.language)
  filters.finish = operatorValue(decoded.finish, FINISH_FILTERS, filters.finish)
  filters.allocation = operatorValue(decoded.allocation, ALLOCATION_FILTERS, filters.allocation)
  filters.quantity = stringValue(decoded.quantity)
  filters.quantityOperator = operatorValue(
    decoded.quantityOperator,
    COMPARISON_OPERATORS,
    filters.quantityOperator,
  )
  filters.purchasePriceMin = stringValue(decoded.purchasePriceMin)
  filters.purchasePriceMax = stringValue(decoded.purchasePriceMax)
  filters.addedFrom = stringValue(decoded.addedFrom)
  filters.addedTo = stringValue(decoded.addedTo)
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

/**
 * A saved color operator. Filters saved before the Scryfall defaults wrote
 * nothing (or `:`) alongside their colors to mean "exactly".
 */
function colorOperatorValue(
  value: unknown,
  colors: ManaColor[],
  fallback: ColorOperator,
): ColorOperator {
  if (colors.length && (value === undefined || value === ":")) return "="
  return operatorValue(value, COLOR_OPERATORS, fallback)
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

/** Writes the field's default comparison as Scryfall's `:` (`c:wu`, `id:wu`). */
function colorPredicate(field: "c" | "id", operator: ColorOperator, colors: ManaColor[]) {
  if (!colors.length) return ""
  if (colors.includes("c")) return `${field}:c`

  const defaultOperator =
    field === "c"
      ? EMPTY_COLLECTION_FILTERS.colorOperator
      : EMPTY_COLLECTION_FILTERS.identityOperator
  return `${field}${operator === defaultOperator ? ":" : operator}${colors.join("")}`
}

/** Trims, drops blanks, and removes case-insensitive duplicates, keeping the first spelling. */
export function uniqueSetValues(values: readonly unknown[]) {
  const seen = new Set<string>()
  const sets: string[] = []
  for (const value of values) {
    const set = stringValue(value)
    const key = set.toLowerCase()
    if (!set || seen.has(key)) continue
    seen.add(key)
    sets.push(set)
  }
  return sets
}

function setPredicate(sets: string[]) {
  const terms = sets.map((set) => textPredicate("set", set)).filter(Boolean)
  if (!terms.length) return ""

  return terms.length === 1 ? terms[0] : `(${terms.join(" or ")})`
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
