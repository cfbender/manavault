import { COLOR_OPTIONS, RARITY_OPTIONS } from "../collection/constants"
import type {
  CollectionAutoSortRuleInput,
  CollectionAutoSortSettingsQuery,
} from "../../gql/graphql"
import { titleize } from "../../lib/utils"

export type AutoSortRuleFormRow = {
  colorMode: string
  colors: string[]
  enabled: boolean
  id: string | null
  key: string
  maxPrice: string
  minPrice: string
  name: string
  rarities: string[]
  releaseDate: string
  releaseDateOperator: string
  setCodes: string
  setOperator: string
  targetLocationId: string
  targetLocationKind: string
  targetLocationName: string
  typeLineExcludes: string
  typeLineIncludes: string
}

export type StorageLocation = {
  id: string
  kind: string
  name: string
}

export type CollectionAutoSortSettingsLocation = NonNullable<
  NonNullable<
    NonNullable<NonNullable<CollectionAutoSortSettingsQuery["locations"]>["edges"]>[number]
  >["node"]
>

export type CollectionAutoSortSettingsRule =
  CollectionAutoSortSettingsQuery["collectionAutoSortRules"][number]

type NullableStringList = readonly (string | null | undefined)[] | null | undefined

export const AUTO_SORT_COLORS = COLOR_OPTIONS.filter((color) => color.value !== "c").map(
  (color) => ({
    label: color.label,
    symbol: color.symbol,
    value: color.value.toUpperCase(),
  }),
)

export const AUTO_SORT_COLOR_MODES = [
  { label: "Ignore color", value: "any" },
  { label: "Has any selected color", value: "include_any" },
  { label: "Has all selected colors", value: "include_all" },
  { label: "Has exactly selected colors", value: "exact" },
  { label: "No colors (colorless)", value: "colorless" },
  { label: "Two or more colors (multicolor)", value: "multicolor" },
] as const

export const AUTO_SORT_SET_OPERATORS = [
  { label: "Set is in", value: "in" },
  { label: "Set is not in", value: "not_in" },
] as const

export const AUTO_SORT_RELEASE_DATE_OPERATORS = [
  { label: "Released before", value: "before" },
  { label: "Released after", value: "after" },
] as const

export const AUTO_SORT_RARITIES = [
  ...RARITY_OPTIONS.map((rarity) => rarity.value),
  "special",
  "bonus",
] as const

let newRuleCounter = 0

export function isAutoSortStorageLocation(
  location: CollectionAutoSortSettingsLocation,
): location is StorageLocation {
  return location.kind === "box" || location.kind === "binder"
}

export function compareAutoSortRulesByPriority(
  left: CollectionAutoSortSettingsRule,
  right: CollectionAutoSortSettingsRule,
) {
  return (
    (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}

export function rulesToFormRows(
  rules: readonly CollectionAutoSortSettingsRule[],
  storageLocations: readonly StorageLocation[],
) {
  return [...rules]
    .sort(compareAutoSortRulesByPriority)
    .map((rule) => ruleToFormRow(rule, storageLocations))
}

export function ruleToFormRow(
  rule: CollectionAutoSortSettingsRule,
  storageLocations: readonly StorageLocation[],
): AutoSortRuleFormRow {
  const targetLocation = storageLocations.find(
    (location) => location.id === rule.targetLocation?.id,
  )
  const targetLocationId = targetLocation?.id ?? rule.targetLocation?.id ?? ""

  return {
    colorMode: normalizeAutoSortColorMode(rule.colorMode),
    colors: normalizeSelectedValues(
      AUTO_SORT_COLORS.map((color) => color.value),
      rule.colors,
    ),
    enabled: rule.enabled,
    id: rule.id,
    key: rule.id,
    maxPrice: centsToCurrencyInput(rule.maxPriceCents),
    minPrice: centsToCurrencyInput(rule.minPriceCents),
    name: rule.name,
    rarities: normalizeSelectedValues(AUTO_SORT_RARITIES, rule.rarities),
    releaseDate: rule.releaseDate ?? "",
    releaseDateOperator: normalizeAutoSortReleaseDateOperator(rule.releaseDateOperator),
    targetLocationId,
    targetLocationKind: targetLocation?.kind ?? rule.targetLocation?.kind ?? "",
    targetLocationName: targetLocation?.name ?? rule.targetLocation?.name ?? "",
    typeLineExcludes: joinCommaField(rule.typeLineExcludes),
    typeLineIncludes: joinCommaField(rule.typeLineIncludes),
    setCodes: joinCommaField(rule.setCodes),
    setOperator: normalizeAutoSortSetOperator(rule.setOperator),
  }
}

export function newAutoSortRuleRow(targetLocation: StorageLocation): AutoSortRuleFormRow {
  newRuleCounter += 1

  return {
    colorMode: "any",
    colors: [],
    enabled: true,
    id: null,
    key: `new-${Date.now()}-${newRuleCounter}`,
    maxPrice: "",
    minPrice: "",
    name: "New auto-sort rule",
    rarities: [],
    releaseDate: "",
    releaseDateOperator: "after",
    targetLocationId: targetLocation.id,
    setCodes: "",
    setOperator: "in",
    targetLocationKind: targetLocation.kind,
    targetLocationName: targetLocation.name,
    typeLineExcludes: "",
    typeLineIncludes: "",
  }
}

export function cloneAutoSortRuleRow(row: AutoSortRuleFormRow): AutoSortRuleFormRow {
  return { ...row, colors: [...row.colors], rarities: [...row.rarities] }
}

export function formRowsToAutoSortRuleInput(
  rows: readonly AutoSortRuleFormRow[],
): CollectionAutoSortRuleInput[] | string {
  const input: CollectionAutoSortRuleInput[] = []

  for (const [index, row] of rows.entries()) {
    const name = row.name.trim()
    if (!name) return "Each auto-sort rule needs a name."
    if (!row.targetLocationId) return `${name}: choose a box or binder destination.`

    const minPriceCents = parseCurrencyInputCents(row.minPrice)
    if (minPriceCents === undefined) return `${name}: minimum price must be a dollar amount.`

    const maxPriceCents = parseCurrencyInputCents(row.maxPrice)
    if (maxPriceCents === undefined) return `${name}: maximum price must be a dollar amount.`

    if (
      typeof minPriceCents === "number" &&
      typeof maxPriceCents === "number" &&
      minPriceCents > maxPriceCents
    ) {
      return `${name}: minimum price cannot be greater than maximum price.`
    }

    const releaseDate = releaseDateInputValue(row.releaseDate)
    if (releaseDate === undefined) return `${name}: release date must be a valid date.`

    const colorMode = normalizeAutoSortColorMode(row.colorMode)
    input.push({
      ...(row.id ? { id: row.id } : {}),
      colorMode,
      colors: colorModeUsesSelectedColors(colorMode)
        ? normalizeSelectedValues(
            AUTO_SORT_COLORS.map((color) => color.value),
            row.colors,
          )
        : [],
      enabled: row.enabled,
      maxPriceCents,
      minPriceCents,
      name,
      priority: index + 1,
      rarities: normalizeSelectedValues(AUTO_SORT_RARITIES, row.rarities),
      releaseDate,
      releaseDateOperator: normalizeAutoSortReleaseDateOperator(row.releaseDateOperator),
      targetLocationId: row.targetLocationId,
      typeLineExcludes: splitCommaField(row.typeLineExcludes),
      setCodes: splitCommaField(row.setCodes),
      setOperator: normalizeAutoSortSetOperator(row.setOperator),
      typeLineIncludes: splitCommaField(row.typeLineIncludes),
    })
  }

  return input
}

export function moveAutoSortRuleRow(
  rows: readonly AutoSortRuleFormRow[],
  ruleKey: string,
  offset: -1 | 1,
) {
  const index = rows.findIndex((row) => row.key === ruleKey)
  if (index < 0) return rows

  const nextIndex = index + offset
  if (nextIndex < 0 || nextIndex >= rows.length) return rows

  const nextRows = [...rows]
  const [row] = nextRows.splice(index, 1)
  nextRows.splice(nextIndex, 0, row)
  return nextRows
}

export function formRowsEqual(
  left: readonly AutoSortRuleFormRow[],
  right: readonly AutoSortRuleFormRow[],
) {
  return left.length === right.length && left.every((row, index) => rowsEqual(row, right[index]))
}

export function autoSortRuleInputsEqual(
  left: readonly CollectionAutoSortRuleInput[],
  right: readonly CollectionAutoSortRuleInput[],
) {
  return (
    left.length === right.length &&
    left.every((rule, index) => {
      const candidate = right[index]

      return (
        candidate != null &&
        rule.colorMode === candidate.colorMode &&
        valuesEqual(rule.colors, candidate.colors) &&
        rule.enabled === candidate.enabled &&
        (rule.maxPriceCents ?? null) === (candidate.maxPriceCents ?? null) &&
        (rule.minPriceCents ?? null) === (candidate.minPriceCents ?? null) &&
        rule.name === candidate.name &&
        rule.priority === candidate.priority &&
        valuesEqual(rule.rarities, candidate.rarities) &&
        (rule.releaseDate ?? null) === (candidate.releaseDate ?? null) &&
        (rule.releaseDateOperator ?? null) === (candidate.releaseDateOperator ?? null) &&
        valuesEqual(rule.setCodes ?? [], candidate.setCodes ?? []) &&
        (rule.setOperator ?? null) === (candidate.setOperator ?? null) &&
        rule.targetLocationId === candidate.targetLocationId &&
        valuesEqual(rule.typeLineExcludes, candidate.typeLineExcludes) &&
        valuesEqual(rule.typeLineIncludes, candidate.typeLineIncludes)
      )
    })
  )
}

export function normalizeAutoSortColorMode(value: string | null | undefined) {
  return AUTO_SORT_COLOR_MODES.find((mode) => mode.value === value)?.value ?? "any"
}

export function colorModeLabel(value: string) {
  return AUTO_SORT_COLOR_MODES.find((mode) => mode.value === value)?.label ?? "Any color"
}

export function normalizeAutoSortSetOperator(value: string | null | undefined) {
  return AUTO_SORT_SET_OPERATORS.find((operator) => operator.value === value)?.value ?? "in"
}

export function setOperatorLabel(value: string) {
  return AUTO_SORT_SET_OPERATORS.find((operator) => operator.value === value)?.label ?? "Set is in"
}

export function normalizeAutoSortReleaseDateOperator(value: string | null | undefined) {
  return (
    AUTO_SORT_RELEASE_DATE_OPERATORS.find((operator) => operator.value === value)?.value ?? "after"
  )
}

export function releaseDateOperatorLabel(value: string) {
  return (
    AUTO_SORT_RELEASE_DATE_OPERATORS.find((operator) => operator.value === value)?.label ??
    "Released after"
  )
}

export function colorModeUsesSelectedColors(colorMode: string) {
  return colorMode !== "any" && colorMode !== "colorless" && colorMode !== "multicolor"
}

export function disabledColorHelp(colorMode: string) {
  if (colorMode === "any") {
    return "Ignore color already matches every card, so selected colors are ignored."
  }
  if (colorMode === "colorless") {
    return "No colors means the card has no card colors, so selected colors are ignored."
  }
  if (colorMode === "multicolor") {
    return "Two or more colors checks color count, so selected colors are ignored."
  }
  return ""
}

export function criteriaSummary(row: AutoSortRuleFormRow) {
  if (!row.enabled) return ["Rule disabled"]

  const items = [
    colorModeSummary(row),
    priceSummary(row),
    setSummary(row),
    releaseDateSummary(row),
    listSummary("Types", splitCommaField(row.typeLineIncludes)),
    listSummary("Excludes", splitCommaField(row.typeLineExcludes)),
    listSummary("Rarities", row.rarities.map(titleize)),
  ].filter((item): item is string => Boolean(item))

  return items.length ? items : ["Matches all cards"]
}

export function parseCurrencyInputCents(value: string) {
  const normalized = value.trim().replaceAll(",", "").replace(/^\$/, "")
  if (!normalized) return null

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return undefined

  const dollars = Number(match[1])
  const cents = Number((match[2] || "").padEnd(2, "0"))
  return dollars * 100 + cents
}

export function centsToCurrencyInput(cents?: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return ""
  return (cents / 100).toFixed(2).replace(/\.00$/, "")
}

export function releaseDateInputValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined

  const date = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return undefined
  }

  return trimmed
}

export function splitCommaField(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}


function normalizeSelectedValues(allowed: readonly string[], values: NullableStringList) {
  return allowed.filter((value) => values?.includes(value) ?? false)
}

function joinCommaField(values: NullableStringList) {
  return values?.filter((value) => typeof value === "string").join(", ") ?? ""
}

function rowsEqual(left: AutoSortRuleFormRow, right: AutoSortRuleFormRow | undefined) {
  return (
    right != null &&
    left.colorMode === right.colorMode &&
    left.enabled === right.enabled &&
    left.id === right.id &&
    left.key === right.key &&
    left.maxPrice === right.maxPrice &&
    left.minPrice === right.minPrice &&
    left.name === right.name &&
    left.releaseDate === right.releaseDate &&
    left.releaseDateOperator === right.releaseDateOperator &&
    left.setCodes === right.setCodes &&
    left.setOperator === right.setOperator &&
    left.targetLocationId === right.targetLocationId &&
    left.targetLocationKind === right.targetLocationKind &&
    left.targetLocationName === right.targetLocationName &&
    left.typeLineExcludes === right.typeLineExcludes &&
    left.typeLineIncludes === right.typeLineIncludes &&
    valuesEqual(left.colors, right.colors) &&
    valuesEqual(left.rarities, right.rarities)
  )
}

function valuesEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function colorModeSummary(row: AutoSortRuleFormRow) {
  if (row.colorMode === "any" || row.colorMode === "colorless" || row.colorMode === "multicolor") {
    return colorModeLabel(row.colorMode)
  }

  return row.colors.length
    ? `${colorModeLabel(row.colorMode)}: ${row.colors.join("/")}`
    : colorModeLabel(row.colorMode)
}

function priceSummary(row: AutoSortRuleFormRow) {
  const minPrice = row.minPrice.trim().replace(/^\$/, "") || null
  const maxPrice = row.maxPrice.trim().replace(/^\$/, "") || null

  if (minPrice && maxPrice) return `$${minPrice}-$${maxPrice}`
  if (minPrice) return `≥ $${minPrice}`
  if (maxPrice) return `≤ $${maxPrice}`
  return null
}

function setSummary(row: AutoSortRuleFormRow) {
  const setCodes = splitCommaField(row.setCodes).map((code) => code.toUpperCase())
  if (!setCodes.length) return null
  return `${setOperatorLabel(row.setOperator)}: ${setCodes.join(", ")}`
}

function releaseDateSummary(row: AutoSortRuleFormRow) {
  const releaseDate = row.releaseDate.trim()
  if (!releaseDate) return null
  return `${releaseDateOperatorLabel(row.releaseDateOperator)} ${releaseDate}`
}

function listSummary(label: string, values: string[]) {
  return values.length ? `${label}: ${values.join(", ")}` : null
}
