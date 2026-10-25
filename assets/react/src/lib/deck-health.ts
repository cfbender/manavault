import {
  MANA_STAT_COLORS,
  type DeckStats,
  type ManaProductionCounts,
  type ManaStatColor,
} from "./deck-stats.ts"

/**
 * A rules-based read of a deck: how widely played its cards are, how its mana
 * base compares to a template for its format, and the Commander power signals
 * the official bracket checklist cares about. Everything here comes from the
 * catalog's Scryfall data (oracle tags, Game Changer flags, EDHREC rank and
 * salt), Commander Spellbook's combo search, and the deck's own stats; nothing
 * asks an AI.
 */

export type DeckHealthCard = {
  id?: string
  quantity: number
  zone: string | null
  card: {
    name?: string | null
    typeLine: string | null
    oracleText?: string | null
    gameChanger?: boolean | null
    edhrecRank?: number | null
    deckCategory?: string | null
    deckThemes?: ReadonlyArray<string | null> | null
  } | null
}

export type DeckHealthTemplate = "commander" | "constructed"

export type DeckHealthStatus = "low" | "ok" | "high"

export type DeckHealthCardRef = {
  id: string
  name: string
  quantity: number
}

export type DeckHealthCheck = {
  key: string
  label: string
  /** What the check counts, for example "Mana rocks, dorks, and land ramp". */
  description: string
  count: number
  /** The band the count should sit in; `null` when the check is informational. */
  target: readonly [min: number, max: number] | null
  score: number
  status: DeckHealthStatus
  /** Copy for the row's status, for example "2 under target". */
  note: string
  cards: DeckHealthCardRef[]
}

export type DeckHealthSignal = {
  key: "gameChangers" | "extraTurns" | "massLandDenial" | "tutors"
  label: string
  description: string
  count: number
  cards: DeckHealthCardRef[]
}

export type DeckQualityBucketKey = "staples" | "played" | "fringe"

export type DeckQualityBucket = {
  key: DeckQualityBucketKey
  label: string
  description: string
  count: number
  /** Share of the deck's nonland cards, 0–100. */
  share: number
  cards: DeckHealthCardRef[]
}

export type DeckHealthQuality = {
  score: number
  nonlandCards: number
  buckets: DeckQualityBucket[]
}

export type DeckHealthCombo = {
  cards: ReadonlyArray<{ name: string }>
}

export type DeckHealthCombos = {
  count: number
  twoCard: number
  /** Deck cards that take part in at least one combo. */
  cards: DeckHealthCardRef[]
}

export type DeckBracketFloor = {
  /** The lowest official bracket this list fits by the checklist alone. */
  bracket: 2 | 3 | 4
  reasons: string[]
}

export type DeckHealthPower = {
  signals: DeckHealthSignal[]
  /** Infinite combos from Commander Spellbook; `null` until checked. */
  combos: DeckHealthCombos | null
  bracketFloor: DeckBracketFloor
  saltSum: number | null
}

export type DeckHealth = {
  template: DeckHealthTemplate
  /** Cards counted (commander and mainboard); zero disables the scores. */
  countedCards: number
  overall: number
  /** How widely played the nonland cards are; Commander decks with ranked cards only. */
  quality: DeckHealthQuality | null
  mana: { score: number; checks: DeckHealthCheck[] }
  power: DeckHealthPower | null
}

const COUNTED_ZONES: Record<string, true> = { commander: true, mainboard: true }

/**
 * Score lost for each card the count sits outside its target band. Too few
 * lands stumbles the deck, while a few extra merely flood it.
 */
const CARDS_UNDER_TARGET_PENALTY = 20
const CARDS_OVER_TARGET_PENALTY = 10

/** A color whose source share falls this far below its pip share is "short". */
const COLOR_COVERAGE_SHORT_RATIO = 0.85

/**
 * EDHREC ranks every card by how many decks run it. The top thousand are the
 * format's staples (Sol Ring, Swords to Plowshares, the signets); the next few
 * thousand are cards that see real play; past that a card is a pet card or a
 * niche pick. Game Changers count as staples whatever their rank.
 */
const STAPLE_RANK_MAX = 1000
const PLAYED_RANK_MAX = 5000
/** A played card is worth half a staple in the quality score. */
const PLAYED_WEIGHT = 0.5

const RAMP_THEMES = ["ramp"]
const TUTOR_THEMES = ["tutor"]
const EXTRA_TURN_THEMES = ["extra_turns"]

/**
 * Oracle text that wipes or locks every player's lands. Scryfall folds mass
 * land denial into the broader stax tag, so the text is the only signal.
 */
const MASS_LAND_DENIAL_PATTERN =
  /\b(?:destroy|exile|sacrifice)s? all (?:\w+ )?lands\b|\beach player sacrifices (?:all|\w+) (?:\w+ )?lands\b|\blands don't untap\b|\breturn all lands\b/i

export function buildDeckHealth(
  deckCards: readonly DeckHealthCard[],
  options: { format: string | null | undefined; stats: DeckStats },
): DeckHealth {
  const template: DeckHealthTemplate =
    options.format === "commander" || options.format === "duel_commander"
      ? "commander"
      : "constructed"
  const counted = countedCards(deckCards)
  const countedCards_ = counted.reduce((total, entry) => total + entry.quantity, 0)
  const mana = manaChecks(counted, options.stats, template)
  const quality = template === "commander" ? qualityBuckets(counted) : null
  const power = template === "commander" ? powerSignals(counted, options.stats) : null
  const overall =
    countedCards_ === 0 ? 0 : quality ? Math.round((quality.score + mana.score) / 2) : mana.score

  return { template, countedCards: countedCards_, overall, quality, mana, power }
}

/**
 * Folds Commander Spellbook's combo results into the power signals: the
 * combo count, how many need only two cards, and the deck cards involved.
 * Two-card infinite combos move the bracket floor to 3, since brackets 1 and
 * 2 exclude them. Pass `null` to mark combos as not checked.
 */
export function withCombos(
  health: DeckHealth,
  combos: readonly DeckHealthCombo[] | null,
  deckCards: readonly DeckHealthCard[],
): DeckHealth {
  if (!health.power) return health
  if (combos === null) {
    return { ...health, power: { ...health.power, combos: null } }
  }

  const byName = new Map<string, CountedCard>()
  for (const card of countedCards(deckCards)) {
    byName.set(normalizeName(card.name), card)
    byName.set(normalizeName(frontFaceName(card.name)), card)
  }

  const involved = new Map<string, CountedCard>()
  let twoCard = 0
  for (const combo of combos) {
    if (combo.cards.length === 2) twoCard += 1
    for (const comboCard of combo.cards) {
      const card = byName.get(normalizeName(comboCard.name))
      if (card) involved.set(card.id, card)
    }
  }

  const signals = health.power.signals
  const countOf = (key: DeckHealthSignal["key"]) =>
    signals.find((signal) => signal.key === key)?.count ?? 0

  return {
    ...health,
    power: {
      ...health.power,
      combos: { count: combos.length, twoCard, cards: cardRefs([...involved.values()]) },
      bracketFloor: bracketFloor({
        gameChangers: countOf("gameChangers"),
        massLandDenial: countOf("massLandDenial"),
        twoCardCombos: twoCard,
      }),
    },
  }
}

type CountedCard = {
  id: string
  name: string
  quantity: number
  typeLine: string
  oracleText: string
  gameChanger: boolean
  edhrecRank: number | null
  category: string
  themes: string[]
}

function countedCards(deckCards: readonly DeckHealthCard[]): CountedCard[] {
  const rows = Array.isArray(deckCards) ? deckCards : []
  const counted: CountedCard[] = []

  for (const [rowIndex, deckCard] of rows.entries()) {
    if (!isRecord(deckCard)) continue

    const quantity = clampQuantity(deckCard.quantity)
    const zone = getString(deckCard.zone)
    const card = deckCard.card

    if (quantity === 0 || COUNTED_ZONES[zone] !== true || !isRecord(card)) continue

    counted.push({
      id: getString(deckCard.id) || `card-${rowIndex + 1}`,
      name: getString(card.name) || "Unknown card",
      quantity,
      typeLine: getString(card.typeLine),
      oracleText: getString(card.oracleText),
      gameChanger: card.gameChanger === true,
      edhrecRank:
        typeof card.edhrecRank === "number" && Number.isFinite(card.edhrecRank)
          ? card.edhrecRank
          : null,
      category: getString(card.deckCategory),
      themes: Array.isArray(card.deckThemes)
        ? card.deckThemes.filter((theme): theme is string => typeof theme === "string")
        : [],
    })
  }

  return counted
}

/**
 * Splits the nonland cards by how widely EDHREC players run them and scores
 * the deck by its staple share, with played cards worth half. Skipped when no
 * nonland card carries a rank, which means the catalog has no EDHREC data.
 */
function qualityBuckets(cards: CountedCard[]): DeckHealthQuality | null {
  const nonlands = cards.filter((card) => !isLand(card))
  if (!nonlands.some((card) => card.edhrecRank !== null)) return null

  const total = quantityOf(nonlands)
  const bucket = (
    key: DeckQualityBucketKey,
    label: string,
    description: string,
    matches: CountedCard[],
  ): DeckQualityBucket => {
    const count = quantityOf(matches)
    return {
      key,
      label,
      description,
      count,
      share: total === 0 ? 0 : Math.round((count / total) * 100),
      cards: cardRefs(matches),
    }
  }
  const staples = bucket(
    "staples",
    "Staples",
    `EDHREC top ${STAPLE_RANK_MAX.toLocaleString()} or a Game Changer`,
    nonlands.filter((card) => qualityBucketOf(card) === "staples"),
  )
  const played = bucket(
    "played",
    "Played",
    `Ranked ${(STAPLE_RANK_MAX + 1).toLocaleString()}–${PLAYED_RANK_MAX.toLocaleString()}`,
    nonlands.filter((card) => qualityBucketOf(card) === "played"),
  )
  const fringe = bucket(
    "fringe",
    "Fringe",
    "Rarely played, unranked, or new",
    nonlands.filter((card) => qualityBucketOf(card) === "fringe"),
  )

  return {
    score:
      total === 0 ? 0 : Math.round(((staples.count + played.count * PLAYED_WEIGHT) / total) * 100),
    nonlandCards: total,
    buckets: [staples, played, fringe],
  }
}

function qualityBucketOf(card: CountedCard): DeckQualityBucketKey {
  if (card.gameChanger) return "staples"
  if (card.edhrecRank === null) return "fringe"
  if (card.edhrecRank <= STAPLE_RANK_MAX) return "staples"
  if (card.edhrecRank <= PLAYED_RANK_MAX) return "played"
  return "fringe"
}

function manaChecks(cards: CountedCard[], stats: DeckStats, template: DeckHealthTemplate) {
  const lands = cards.filter(isLand)
  const landTarget = landTargetBand(stats.averageManaValue, template)
  const checks: DeckHealthCheck[] = [
    bandCheck({
      key: "lands",
      label: "Lands",
      description:
        stats.nonlandCards === 0
          ? "Target for the format's deck size"
          : `Target at your average mana value of ${stats.averageManaValue.toFixed(1)}`,
      target: landTarget,
      cards: lands,
    }),
    manaValueCheck(stats, template),
    colorCoverageCheck(stats),
  ]

  return { score: averageScore(checks), checks }
}

/**
 * The land band for a deck of this size and curve: the usual 36 of 99 at an
 * average mana value of 3.0 (24 of 60 at 2.5), moving three lands (two for
 * 60-card decks) for each full point the curve sits above or below that.
 */
export function landTargetBand(
  averageManaValue: number,
  template: DeckHealthTemplate,
): readonly [number, number] {
  const [base, baseManaValue, slope, min, max] =
    template === "commander" ? [36, 3, 3, 30, 42] : [24, 2.5, 2, 17, 28]
  const center = Math.round(base + (averageManaValue - baseManaValue) * slope)
  const clamped = Math.min(max, Math.max(min, center))

  return [clamped - 2, clamped + 2]
}

function manaValueCheck(stats: DeckStats, template: DeckHealthTemplate): DeckHealthCheck {
  const [comfortable, ceiling] = template === "commander" ? [3.0, 4.2] : [2.5, 3.5]
  const average = stats.averageManaValue
  const score =
    stats.nonlandCards === 0
      ? 0
      : average <= comfortable
        ? 100
        : Math.max(0, Math.round(100 - ((average - comfortable) / (ceiling - comfortable)) * 100))
  const status: DeckHealthStatus = score >= 70 ? "ok" : "high"

  return {
    key: "manaValue",
    label: "Average mana value",
    description: `Nonland cards; ${comfortable.toFixed(1)} or lower keeps the curve castable`,
    count: Number(average.toFixed(2)),
    target: null,
    score,
    status,
    note:
      stats.nonlandCards === 0
        ? "No nonland cards"
        : status === "ok"
          ? "Castable curve"
          : `Runs ${(average - comfortable).toFixed(1)} above ${comfortable.toFixed(1)}`,
    cards: [],
  }
}

/**
 * How well the deck's sources match its colored costs: each color's share of
 * all sources against its share of all pips, weighted by that pip share. A
 * multicolor source counts for every color it makes, so a dual land pulls
 * both of its colors up, and an any-color source counts for all five.
 */
function colorCoverageCheck(stats: DeckStats): DeckHealthCheck {
  const production = stats.manaProduction
  const pipTotal = MANA_STAT_COLORS.reduce((total, color) => total + stats.manaCost[color], 0)
  const sourceTotal = distinctSourceCount(production)
  let covered = 0
  const shortColors: ManaStatColor[] = []

  for (const color of MANA_STAT_COLORS) {
    const pipShare = pipTotal === 0 ? 0 : stats.manaCost[color] / pipTotal
    if (pipShare === 0) continue
    const sources = production[color] + (color === "C" ? 0 : production.any)
    const sourceShare = sourceTotal === 0 ? 0 : sources / sourceTotal
    const ratio = Math.min(1, sourceShare / pipShare)

    covered += pipShare * ratio
    if (ratio < COLOR_COVERAGE_SHORT_RATIO) shortColors.push(color)
  }

  const score = pipTotal === 0 ? 100 : Math.round(covered * 100)
  const status: DeckHealthStatus = score >= 85 ? "ok" : "low"

  return {
    key: "colorCoverage",
    label: "Color coverage",
    description: "How closely the deck's mana sources follow its colored costs",
    count: score,
    target: null,
    score,
    status,
    note:
      pipTotal === 0
        ? "No colored costs"
        : shortColors.length === 0
          ? "Every color covered"
          : `Short on ${shortColors.join(", ")}`,
    cards: [],
  }
}

function powerSignals(cards: CountedCard[], stats: DeckStats) {
  const signal = (
    key: DeckHealthSignal["key"],
    label: string,
    description: string,
    matches: CountedCard[],
  ): DeckHealthSignal => ({
    key,
    label,
    description,
    count: quantityOf(matches),
    cards: cardRefs(matches),
  })
  const gameChangers = signal(
    "gameChangers",
    "Game Changers",
    "Cards on the official Game Changers list",
    cards.filter((card) => card.gameChanger),
  )
  const massLandDenial = signal(
    "massLandDenial",
    "Mass land denial",
    "Found in rules text: wipes or locks every player's lands",
    cards.filter((card) => MASS_LAND_DENIAL_PATTERN.test(card.oracleText)),
  )
  const extraTurns = signal(
    "extraTurns",
    "Extra turns",
    "Two or more can chain, which brackets 1–3 rule out",
    cards.filter((card) => hasRole(card, EXTRA_TURN_THEMES, null)),
  )
  const tutors = signal(
    "tutors",
    "Tutors",
    "No bracket limit; the strongest are Game Changers",
    // Fetchlands and land fetchers such as Cultivate carry the tutor tag
    // too; they are mana, not card selection.
    cards.filter(
      (card) =>
        hasRole(card, TUTOR_THEMES, null) && !isLand(card) && !hasRole(card, RAMP_THEMES, "ramp"),
    ),
  )

  return {
    signals: [gameChangers, massLandDenial, extraTurns, tutors],
    combos: null,
    bracketFloor: bracketFloor({
      gameChangers: gameChangers.count,
      massLandDenial: massLandDenial.count,
      twoCardCombos: 0,
    }),
    saltSum: stats.saltSum,
  }
}

/**
 * The lowest bracket the checklist allows: brackets 1 and 2 exclude Game
 * Changers, mass land denial, and two-card infinite combos; bracket 3 allows
 * up to three Game Changers and late two-card combos; brackets 4 and 5 are
 * unrestricted. Brackets 1 and 2 are separated by intent, not contents, so
 * the floor never reads 1.
 */
export function bracketFloor({
  gameChangers,
  massLandDenial,
  twoCardCombos = 0,
}: {
  gameChangers: number
  massLandDenial: number
  twoCardCombos?: number
}): DeckBracketFloor {
  const reasons: string[] = []

  if (massLandDenial > 0) {
    reasons.push(`${pluralize(massLandDenial, "mass land denial card")}`)
  }
  if (gameChangers > 3) {
    reasons.push(`${gameChangers} Game Changers (bracket 3 allows 3)`)
  }
  if (reasons.length > 0) return { bracket: 4, reasons }

  if (gameChangers > 0) {
    reasons.push(`${pluralize(gameChangers, "Game Changer")} (brackets 1–2 allow none)`)
  }
  if (twoCardCombos > 0) {
    reasons.push(`${pluralize(twoCardCombos, "two-card combo")} (brackets 1–2 allow none)`)
  }
  if (reasons.length > 0) return { bracket: 3, reasons }

  return { bracket: 2, reasons: ["No Game Changers, mass land denial, or two-card combos"] }
}

function bandCheck({
  cards,
  description,
  key,
  label,
  target,
}: {
  cards: CountedCard[]
  description: string
  key: string
  label: string
  target: readonly [number, number]
}): DeckHealthCheck {
  const count = quantityOf(cards)
  const [min, max] = target
  const distance = count < min ? min - count : count > max ? count - max : 0
  const status: DeckHealthStatus = count < min ? "low" : count > max ? "high" : "ok"
  const penalty = status === "low" ? CARDS_UNDER_TARGET_PENALTY : CARDS_OVER_TARGET_PENALTY

  return {
    key,
    label,
    description,
    count,
    target,
    score: Math.max(0, 100 - distance * penalty),
    status,
    note:
      status === "ok"
        ? "On target"
        : status === "low"
          ? `${distance} under target`
          : `${distance} over target`,
    cards: cardRefs(cards),
  }
}

function averageScore(checks: DeckHealthCheck[]) {
  if (checks.length === 0) return 0
  return Math.round(checks.reduce((total, check) => total + check.score, 0) / checks.length)
}

function hasRole(card: CountedCard, themes: readonly string[], category: string | null) {
  return (
    (category !== null && card.category === category) ||
    card.themes.some((theme) => themes.includes(theme))
  )
}

function isLand(card: CountedCard) {
  return /\bLand\b/i.test(card.typeLine)
}

function quantityOf(cards: CountedCard[]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}

/** Cards that make mana of any kind, each counted once however many colors it makes. */
function distinctSourceCount(production: ManaProductionCounts) {
  const quantities = new Map<string, number>()

  for (const color of [...MANA_STAT_COLORS, "any"] as const) {
    for (const contributor of production.contributors[color]) {
      quantities.set(contributor.id, contributor.quantity)
    }
  }

  let total = 0
  for (const quantity of quantities.values()) total += quantity
  return total
}

function cardRefs(cards: CountedCard[]): DeckHealthCardRef[] {
  return cards
    .map(({ id, name, quantity }) => ({ id, name, quantity }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

function normalizeName(name: string) {
  return name.trim().toLowerCase()
}

/** "Fire // Ice" → "Fire", so a combo naming one face still matches. */
function frontFaceName(name: string) {
  return name.split(" // ")[0] ?? name
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

function clampQuantity(quantity: unknown) {
  return typeof quantity === "number" && Number.isFinite(quantity)
    ? Math.max(0, Math.trunc(quantity))
    : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getString(value: unknown) {
  return typeof value === "string" ? value : ""
}
