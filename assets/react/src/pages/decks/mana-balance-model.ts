import { MANA_STAT_COLORS, type DeckStats } from "../../lib/deck-stats"
import { titleize } from "../../lib/utils"

export const MANA_CURVE_PERMANENT_COLOR = "var(--color-primary)"
export const MANA_CURVE_SPELL_COLOR = "var(--color-accent)"
export const MANA_COLOR_LABELS: Record<(typeof MANA_STAT_COLORS)[number], string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
}
export const MANA_BALANCE_COLORS: Record<(typeof MANA_STAT_COLORS)[number], string> = {
  W: "#fef3c7",
  U: "#38bdf8",
  B: "#6b21a8",
  R: "#fb923c",
  G: "#4ade80",
  C: "#94a3b8",
}
export const MANA_ANY_PRODUCTION_COLOR = "#d4d4d8"
export const MANA_EMPTY_BAR_COLOR = "hsl(var(--b3))"

export type ManaStatColor = (typeof MANA_STAT_COLORS)[number]
export const FLEXIBLE_MANA_COLORS = new Set<ManaStatColor>(["W", "U", "B", "R", "G"])

export type ManaContributorColor = ManaStatColor | "any"
export type ManaBalanceSelection =
  | { mode: "cost"; color: ManaStatColor }
  | { mode: "production"; color: ManaContributorColor }

export function sameManaBalanceSelection(
  left: ManaBalanceSelection | null,
  right: ManaBalanceSelection,
) {
  return Boolean(left && left.mode === right.mode && left.color === right.color)
}
export type ManaBalanceSegment = {
  key: string
  label: string
  value: number
  color: string
  ariaLabel?: string
  isActive?: boolean
  onSelect?: () => void
}
export type ManaProductionCards = Partial<Record<ManaContributorColor, number>>
export type ManaContributor = {
  id?: string | null
  name?: string | null
  quantity?: number | null
  value?: number | null
  category?: string | null
  typeLine?: string | null
}
export type ManaBalanceContributor = {
  id: string
  name: string
  quantity: number
  value: number
  category: string
  typeLine?: string | null
}
export type ManaContributorMap = Partial<Record<ManaContributorColor, readonly ManaContributor[]>>
export type ManaProductionWithCards = DeckStats["manaProduction"] & {
  cards?: ManaProductionCards
  contributors?: ManaContributorMap
}
export type DeckStatsWithContributors = DeckStats & {
  costContributors?: Partial<Record<ManaStatColor, readonly ManaContributor[]>>
  manaProduction: ManaProductionWithCards
}
export type ManaBalanceRowModel = {
  color: ManaStatColor
  label: string
  cost: number
  costContributors: ManaBalanceContributor[]
  explicitProduction: number
  production: number
  productionContributors: ManaBalanceContributor[]
  sourceCardCount: number | undefined
  includesFlexibleProduction: boolean
}
export type ManaBalanceDetail = {
  title: string
  summary: string
  contributors: ManaBalanceContributor[]
  emptyText: string
}

export type HighlightDeckCards = (deckCardIds: Set<string> | null) => void

export function manaBalanceSelectionDetail(
  selection: ManaBalanceSelection | null,
  rows: readonly ManaBalanceRowModel[],
  anyProduction: number,
  anyContributors: readonly ManaBalanceContributor[],
): ManaBalanceDetail | null {
  if (selection === null) {
    return null
  }

  if (selection.mode === "production" && selection.color === "any") {
    return {
      title: "Flexible production",
      summary: `${anyProduction} any-color mana`,
      contributors: [...anyContributors],
      emptyText: "Flexible production contributor details are not available yet.",
    }
  }

  const row = rows.find((candidate) => candidate.color === selection.color)

  if (!row) {
    return null
  }

  if (selection.mode === "cost") {
    return {
      title: `${row.label} cost`,
      summary: `${row.cost} cost ${row.cost === 1 ? "pip" : "pips"}`,
      contributors: row.costContributors,
      emptyText: "Cost contributor details are not available yet.",
    }
  }

  return {
    title: `${row.label} production`,
    summary: row.includesFlexibleProduction
      ? `${row.production} practical mana (${row.explicitProduction} explicit + ${anyProduction} flexible)`
      : `${row.production} produced mana`,
    contributors: row.productionContributors,
    emptyText: "Production contributor details are not available yet.",
  }
}

export function canSpendFlexibleManaOn(color: ManaStatColor) {
  return FLEXIBLE_MANA_COLORS.has(color)
}

export function practicalManaProduction(
  color: ManaStatColor,
  explicitProduction: number,
  anyProduction: number,
) {
  return canSpendFlexibleManaOn(color) ? explicitProduction + anyProduction : explicitProduction
}

export function manaContributorList(
  contributors: ManaContributorMap | undefined,
  color: ManaContributorColor,
) {
  const list = contributors?.[color]

  if (!Array.isArray(list)) {
    return []
  }

  return list
    .map(normalizeManaContributor)
    .filter((contributor): contributor is ManaBalanceContributor => contributor !== null)
    .sort(compareManaContributors)
}

export function normalizeManaContributor(
  contributor: ManaContributor,
): ManaBalanceContributor | null {
  const name =
    typeof contributor.name === "string" && contributor.name.trim()
      ? contributor.name.trim()
      : "Unknown card"
  const category =
    typeof contributor.category === "string" && contributor.category.trim()
      ? titleize(contributor.category.trim())
      : "Other"
  const value = positiveDisplayNumber(contributor.value)
  const quantity = positiveDisplayNumber(contributor.quantity) || (value > 0 ? 1 : 0)

  if (quantity === 0 && value === 0) {
    return null
  }

  return {
    id:
      typeof contributor.id === "string" && contributor.id.trim()
        ? contributor.id.trim()
        : `${category}:${name}`,
    name,
    quantity,
    value,
    category,
    typeLine: contributor.typeLine,
  }
}

export function mergeManaContributors(lists: readonly (readonly ManaBalanceContributor[])[]) {
  const merged = new Map<string, ManaBalanceContributor>()

  for (const list of lists) {
    for (const contributor of list) {
      const key = `${contributor.id}:${contributor.category}`
      const existing = merged.get(key)

      if (existing) {
        existing.quantity = Math.max(existing.quantity, contributor.quantity)
        existing.value += contributor.value
      } else {
        merged.set(key, { ...contributor })
      }
    }
  }

  return Array.from(merged.values()).sort(compareManaContributors)
}

export function groupManaContributors(contributors: readonly ManaBalanceContributor[]) {
  const groups = new Map<string, ManaBalanceContributor[]>()

  for (const contributor of contributors) {
    const group = groups.get(contributor.category)

    if (group) {
      group.push(contributor)
    } else {
      groups.set(contributor.category, [contributor])
    }
  }

  return Array.from(groups, ([category, groupContributors]) => ({
    category,
    contributors: groupContributors.sort(compareManaContributors),
  })).sort((left, right) => left.category.localeCompare(right.category))
}

export function compareManaContributors(
  left: ManaBalanceContributor,
  right: ManaBalanceContributor,
) {
  return (
    right.value - left.value ||
    right.quantity - left.quantity ||
    left.name.localeCompare(right.name)
  )
}

export function manaContributorQuantity(contributors: readonly ManaBalanceContributor[]) {
  return contributors.reduce((total, contributor) => total + contributor.quantity, 0)
}

export function manaContributorIdSet(contributors: readonly ManaBalanceContributor[] | undefined) {
  const ids = new Set(contributors?.map((contributor) => contributor.id).filter(Boolean))
  return ids.size > 0 ? ids : null
}

export function filterHighlightedDeckCardIds(
  current: Set<string> | null,
  availableIds: Set<string>,
) {
  if (!current) return null

  const highlightedIds = Array.from(current).filter((deckCardId) => availableIds.has(deckCardId))
  if (highlightedIds.length === current.size) return current
  return highlightedIds.length > 0 ? new Set(highlightedIds) : null
}

export function positiveDisplayNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

export function formatCardCount(count: number) {
  return `${count} ${count === 1 ? "card" : "cards"}`
}

export function formatManaValue(value: number) {
  return value.toFixed(2)
}
