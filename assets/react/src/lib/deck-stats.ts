export const MANA_STAT_COLORS = ["W", "U", "B", "R", "G", "C"] as const

export type ManaStatColor = (typeof MANA_STAT_COLORS)[number]

export type DeckStatsCard = {
  id?: string
  quantity: number
  zone: string | null
  card: {
    name?: string | null
    typeLine: string | null
    cmc: number | null
    manaCost: string | null
    oracleText: string | null
    deckCategory?: string | null
  } | null
}

export type ManaCurveBucket = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7+"

export type ManaCurveStat = {
  bucket: ManaCurveBucket
  quantity: number
  permanents: number
  spells: number
}

export type DeckStatsContributor = {
  id: string
  name: string
  quantity: number
  value: number
  category: string
  typeLine: string
}

export type ManaSymbolCounts = Record<ManaStatColor, number> & {
  total: number
}

export type ManaProductionCardCounts = Record<ManaStatColor, number> & {
  any: number
  total: number
}

export type ManaProductionContributors = Record<ManaStatColor | "any", DeckStatsContributor[]>

export type ManaProductionCounts = Record<ManaStatColor, number> & {
  any: number
  total: number
  cards: ManaProductionCardCounts
  contributors: ManaProductionContributors
}

export type DeckStats = {
  totalCards: number
  nonlandCards: number
  landCards: number
  averageManaValue: number
  totalManaValue: number
  medianManaValue: number
  manaCurve: ManaCurveStat[]
  manaCost: ManaSymbolCounts
  costContributors: Record<ManaStatColor, DeckStatsContributor[]>
  manaProduction: ManaProductionCounts
}

const COUNTED_ZONES: Record<string, true> = { commander: true, mainboard: true }
const MANA_CURVE_BUCKETS: ManaCurveBucket[] = ["0", "1", "2", "3", "4", "5", "6", "7+"]
const ADD_FRAGMENT_PATTERN = /[\n.;]+/
const ANY_COLOR_PRODUCTION_PATTERN =
  /\b(?:(one|two|three|four|five|\d+|a)\s+)?mana\s+(?:of\s+any\s+(?:one\s+)?color\b|in\s+any\s+combination\s+of\s+colors\b|of\s+any\s+type\b)/i
const PRODUCTION_WORD_PATTERN = /\b(?:add|adds|produce|produces)\b/i
const MANA_SYMBOL_PATTERN = /\{([^}]+)\}/g

export function buildDeckStats(deckCards: readonly DeckStatsCard[]): DeckStats {
  const manaCurve = MANA_CURVE_BUCKETS.map((bucket) => ({
    bucket,
    quantity: 0,
    permanents: 0,
    spells: 0,
  }))
  const manaCost: ManaSymbolCounts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, total: 0 }
  const costContributors = emptyManaContributorLists()
  const manaProduction: ManaProductionCounts = {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
    any: 0,
    total: 0,
    cards: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, any: 0, total: 0 },
    contributors: emptyProductionContributorLists(),
  }
  const manaValues: Array<[cmc: number, quantity: number]> = []
  let totalCards = 0
  let nonlandCards = 0
  let landCards = 0
  let totalManaValue = 0
  const rows = Array.isArray(deckCards) ? deckCards : []

  for (const [rowIndex, deckCard] of rows.entries()) {
    if (!isRecord(deckCard)) {
      continue
    }

    const quantity = clampQuantity(deckCard.quantity)
    const zone = getString(deckCard.zone)
    const card = deckCard.card

    if (quantity === 0 || COUNTED_ZONES[zone] !== true || !isRecord(card)) {
      continue
    }

    const typeLine = getString(card.typeLine)
    const cmc = typeof card.cmc === "number" && Number.isFinite(card.cmc) ? Math.max(0, card.cmc) : 0
    const manaCostText = getString(card.manaCost)
    const oracleText = getString(card.oracleText)
    const contributor = deckStatsContributor(deckCard, card, quantity, rowIndex, typeLine)

    totalCards += quantity

    if (/\bLand\b/i.test(typeLine)) {
      landCards += quantity
    } else {
      const curveStat = manaCurve[bucketIndex(cmc)]

      nonlandCards += quantity
      totalManaValue += cmc * quantity
      manaValues.push([cmc, quantity])
      curveStat.quantity += quantity

      if (isPermanentType(typeLine)) {
        curveStat.permanents += quantity
      } else {
        curveStat.spells += quantity
      }
    }

    addManaCost(manaCost, costContributors, manaCostText, quantity, contributor)
    addManaProduction(manaProduction, oracleText, quantity, contributor)
  }

  manaCost.total = MANA_STAT_COLORS.reduce((total, color) => total + manaCost[color], 0)
  manaProduction.total = MANA_STAT_COLORS.reduce((total, color) => total + manaProduction[color], manaProduction.any)
  sortManaContributorLists(costContributors)
  sortProductionContributorLists(manaProduction.contributors)

  return {
    totalCards,
    nonlandCards,
    landCards,
    averageManaValue: nonlandCards === 0 ? 0 : totalManaValue / nonlandCards,
    totalManaValue,
    medianManaValue: calculateMedianManaValue(manaValues, nonlandCards),
    manaCurve,
    manaCost,
    costContributors,
    manaProduction,
  }
}

function addManaCost(
  counts: ManaSymbolCounts,
  contributors: Record<ManaStatColor, DeckStatsContributor[]>,
  text: string,
  quantity: number,
  contributor: Omit<DeckStatsContributor, "value">,
) {
  const symbolCounts = manaSymbolCountsInText(text)

  for (const color of MANA_STAT_COLORS) {
    const value = symbolCounts[color] * quantity

    if (value === 0) {
      continue
    }

    counts[color] += value
    contributors[color].push({ ...contributor, value })
  }
}

function addManaProduction(
  counts: ManaProductionCounts,
  oracleText: string,
  quantity: number,
  contributor: Omit<DeckStatsContributor, "value">,
) {
  const explicitProductionTotals = emptyManaColorCounts()
  let anyProductionTotal = 0

  for (const fragment of oracleText.split(ADD_FRAGMENT_PATTERN)) {
    const clause = productionClause(fragment)

    if (clause === null) {
      continue
    }

    const explicitProduction = explicitManaProduction(clause)

    for (const color of MANA_STAT_COLORS) {
      explicitProductionTotals[color] += explicitProduction[color]
    }

    anyProductionTotal += anyColorProductionAmount(clause)
  }

  for (const color of MANA_STAT_COLORS) {
    const value = explicitProductionTotals[color] * quantity

    if (value === 0) {
      continue
    }

    counts[color] += value
    counts.cards[color] += quantity
    counts.contributors[color].push({ ...contributor, value })
  }

  if (anyProductionTotal > 0) {
    counts.any += anyProductionTotal * quantity
    counts.cards.any += quantity
    counts.contributors.any.push({ ...contributor, value: anyProductionTotal * quantity })
  }

  if (MANA_STAT_COLORS.some((color) => explicitProductionTotals[color] > 0) || anyProductionTotal > 0) {
    counts.cards.total += quantity
  }
}

function productionClause(fragment: string) {
  const match = PRODUCTION_WORD_PATTERN.exec(fragment)

  return match === null ? null : fragment.slice(match.index + match[0].length)
}

function explicitManaProduction(clause: string) {
  if (!/\bor\b/i.test(clause)) {
    return manaSymbolCountsInText(clause)
  }

  const counts = emptyManaColorCounts()

  for (const alternative of clause.split(/\s*,\s*|\s+or\s+/i)) {
    const alternativeCounts = manaSymbolCountsInText(alternative)

    for (const color of MANA_STAT_COLORS) {
      counts[color] = Math.max(counts[color], alternativeCounts[color])
    }
  }

  return counts
}

function manaSymbolCountsInText(text: string) {
  const counts = emptyManaColorCounts()

  for (const symbol of text.matchAll(MANA_SYMBOL_PATTERN)) {
    for (const color of colorsInManaSymbol(symbol)) {
      counts[color] += 1
    }
  }

  return counts
}

function anyColorProductionAmount(clause: string) {
  const match = ANY_COLOR_PRODUCTION_PATTERN.exec(clause)

  if (match === null) {
    return 0
  }

  return manaAmount(match[1])
}

function manaAmount(value: string | undefined) {
  if (value === undefined) {
    return 1
  }

  const normalized = value.toLowerCase()
  const wordAmounts: Record<string, number> = {
    a: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
  }

  if (wordAmounts[normalized] !== undefined) {
    return wordAmounts[normalized]
  }

  const numericAmount = Number.parseInt(normalized, 10)

  return Number.isFinite(numericAmount) ? Math.max(0, numericAmount) : 1
}

function emptyManaContributorLists(): Record<ManaStatColor, DeckStatsContributor[]> {
  return { W: [], U: [], B: [], R: [], G: [], C: [] }
}

function emptyProductionContributorLists(): ManaProductionContributors {
  return { W: [], U: [], B: [], R: [], G: [], C: [], any: [] }
}

function deckStatsContributor(
  deckCard: Record<string, unknown>,
  card: Record<string, unknown>,
  quantity: number,
  rowIndex: number,
  typeLine: string,
): Omit<DeckStatsContributor, "value"> {
  const name = getString(card.name) || "Unknown card"

  return {
    id: getString(deckCard.id) || `card-${rowIndex + 1}`,
    name,
    quantity,
    category: getString(card.deckCategory) || "other",
    typeLine,
  }
}

function sortManaContributorLists(contributors: Record<ManaStatColor, DeckStatsContributor[]>) {
  for (const color of MANA_STAT_COLORS) {
    contributors[color].sort(compareContributors)
  }
}

function sortProductionContributorLists(contributors: ManaProductionContributors) {
  sortManaContributorLists(contributors)
  contributors.any.sort(compareContributors)
}

function compareContributors(left: DeckStatsContributor, right: DeckStatsContributor) {
  return (
    left.category.localeCompare(right.category) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}

function emptyManaColorCounts(): Record<ManaStatColor, number> {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
}

function colorsInManaSymbol(match: RegExpMatchArray): ManaStatColor[] {
  const symbol = String(match[1] || "").trim().toUpperCase()
  const colors = new Set<ManaStatColor>()

  for (const part of symbol.split("/")) {
    addManaSymbolPart(colors, part)
  }

  return MANA_STAT_COLORS.filter((color) => colors.has(color))
}

function addManaSymbolPart(colors: Set<ManaStatColor>, part: string) {
  if (isManaStatColor(part)) {
    colors.add(part)
    return
  }

  if (!/^[WUBRGC]+$/.test(part)) {
    return
  }

  for (const character of part) {
    if (isManaStatColor(character)) {
      colors.add(character)
    }
  }
}

function bucketIndex(cmc: number) {
  if (cmc >= 7) {
    return MANA_CURVE_BUCKETS.length - 1
  }

  return Math.min(Math.max(Math.trunc(cmc), 0), MANA_CURVE_BUCKETS.length - 2)
}

function calculateMedianManaValue(values: Array<[cmc: number, quantity: number]>, quantity: number) {
  if (quantity === 0) {
    return 0
  }

  const lowMiddle = Math.floor((quantity - 1) / 2)
  const highMiddle = Math.floor(quantity / 2)
  let seen = 0
  let lowValue = 0
  let highValue = 0

  values.sort(([leftCmc], [rightCmc]) => leftCmc - rightCmc)

  for (const [cmc, valueQuantity] of values) {
    const nextSeen = seen + valueQuantity

    if (seen <= lowMiddle && lowMiddle < nextSeen) {
      lowValue = cmc
    }

    if (seen <= highMiddle && highMiddle < nextSeen) {
      highValue = cmc
      break
    }

    seen = nextSeen
  }

  return (lowValue + highValue) / 2
}

function isPermanentType(typeLine: string) {
  return /\b(?:Artifact|Battle|Creature|Enchantment|Planeswalker)\b/i.test(typeLine)
}

function clampQuantity(quantity: unknown) {
  return typeof quantity === "number" && Number.isFinite(quantity)
    ? Math.max(0, Math.trunc(quantity))
    : 0
}

function isManaStatColor(value: string): value is ManaStatColor {
  return MANA_STAT_COLORS.includes(value as ManaStatColor)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getString(value: unknown) {
  return typeof value === "string" ? value : ""
}
