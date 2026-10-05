export type BulkCleanPull = {
  cardId: string
  cardName: string
  collectionItemId: string
  collectorNumber: string
  finish: string
  fromLocationId?: string | null
  fromLocationName: string
  imageUrl?: string | null
  ownedQuantity: number
  priceCents: number
  quantity: number
  setCode: string
}
export type BulkCleanCard = {
  cardId: string
  cardName: string
  colors: string[]
  pullQuantity: number
  pulls: BulkCleanPull[]
  swappableCopies: number
  totalCopies: number
  typeLine?: string | null
}

export type OrderLevel = "color" | "type"
export type ColorBucket = "W" | "U" | "B" | "R" | "G" | "M" | "C"
export type TypeBucket =
  | "legendary"
  | "creature"
  | "sorcery"
  | "instant"
  | "artifact"
  | "enchantment"
  | "planeswalker"
  | "battle"
  | "land"
export type BulkCleanOrder = {
  levels: { key: OrderLevel; enabled: boolean }[]
  colors: ColorBucket[]
  types: TypeBucket[]
}

export const LEVEL_LABELS: Record<OrderLevel, string> = { color: "Color", type: "Type" }
export const COLOR_LABELS: Record<ColorBucket, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  M: "Multicolor",
  C: "Colorless",
}
export const TYPE_LABELS: Record<TypeBucket, string> = {
  legendary: "Legendary",
  creature: "Creature",
  sorcery: "Sorcery",
  instant: "Instant",
  artifact: "Artifact",
  enchantment: "Enchantment",
  planeswalker: "Planeswalker",
  battle: "Battle",
  land: "Land",
}

export const DEFAULT_ORDER: BulkCleanOrder = {
  levels: [
    { key: "color", enabled: false },
    { key: "type", enabled: false },
  ],
  colors: ["W", "U", "B", "R", "G", "M", "C"],
  types: [
    "legendary",
    "creature",
    "sorcery",
    "instant",
    "artifact",
    "enchantment",
    "planeswalker",
    "battle",
    "land",
  ],
}

// Saved orders come from localStorage; keep known values in their saved order
// and append any the saved copy is missing.
export function deserializeOrder(value: string): BulkCleanOrder {
  const saved = JSON.parse(value) as Partial<BulkCleanOrder>
  const merge = <T>(savedValues: readonly T[] | undefined, defaults: readonly T[]) => {
    const known = (savedValues ?? []).filter((entry) => defaults.includes(entry))
    return [...known, ...defaults.filter((entry) => !known.includes(entry))]
  }
  const levels = merge(
    saved.levels?.map((level) => level.key),
    DEFAULT_ORDER.levels.map((level) => level.key),
  ).map((key) => ({
    key,
    enabled: saved.levels?.find((level) => level.key === key)?.enabled === true,
  }))

  return {
    levels,
    colors: merge(saved.colors, DEFAULT_ORDER.colors),
    types: merge(saved.types, DEFAULT_ORDER.types),
  }
}

export function colorBucket(colors: readonly string[]): ColorBucket {
  if (colors.length > 1) return "M"
  const color = colors[0]?.toUpperCase()
  return DEFAULT_ORDER.colors.find((bucket) => bucket === color) ?? "C"
}

// A card goes under the first type in the order its front face matches, so
// putting Legendary first collects legendary creatures, artifacts, and so on.
export function typeBucket(
  typeLine: string | null | undefined,
  types: readonly TypeBucket[],
): TypeBucket | null {
  const words = (typeLine ?? "").split("//")[0].split("—")[0].toLowerCase().split(/\s+/)
  return types.find((type) => words.includes(type)) ?? null
}

type CardSection = { key: string; label: string | null; cards: BulkCleanCard[] }
export type LocationGroup = {
  key: string
  locationName: string
  cardCount: number
  sections: CardSection[]
}

export function groupPulls(
  cards: readonly BulkCleanCard[],
  order: BulkCleanOrder = DEFAULT_ORDER,
): LocationGroup[] {
  const locations = new Map<string, { locationName: string; cards: BulkCleanCard[] }>()

  for (const card of cards) {
    for (const pull of card.pulls) {
      const key = pull.fromLocationId ?? "unfiled"
      const location = locations.get(key) ?? { locationName: pull.fromLocationName, cards: [] }
      locations.set(key, location)

      const locationCard = location.cards.find((entry) => entry.cardId === card.cardId)
      if (locationCard) locationCard.pulls.push(pull)
      else location.cards.push({ ...card, pulls: [pull] })
    }
  }

  return Array.from(locations, ([key, location]) => ({
    key,
    locationName: location.locationName,
    cardCount: location.cards.length,
    sections: sectionCards(location.cards, order),
  })).sort((left, right) => left.locationName.localeCompare(right.locationName))
}

function sectionCards(cards: readonly BulkCleanCard[], order: BulkCleanOrder): CardSection[] {
  const levels = order.levels.filter((level) => level.enabled).map((level) => level.key)
  const buckets = (card: BulkCleanCard) =>
    levels.map((level) => {
      if (level === "color") {
        const color = colorBucket(card.colors)
        return { rank: order.colors.indexOf(color), label: COLOR_LABELS[color] }
      }
      const type = typeBucket(card.typeLine, order.types)
      return type
        ? { rank: order.types.indexOf(type), label: TYPE_LABELS[type] }
        : { rank: order.types.length, label: "Other" }
    })

  const sorted = cards
    .map((card) => ({ card, buckets: buckets(card) }))
    .sort((left, right) => {
      for (const [index, bucket] of left.buckets.entries()) {
        const difference = bucket.rank - right.buckets[index].rank
        if (difference) return difference
      }
      return left.card.cardName.localeCompare(right.card.cardName)
    })

  const sections: CardSection[] = []
  for (const { card, buckets } of sorted) {
    const key = buckets.map((bucket) => bucket.label).join("|")
    const current = sections.at(-1)
    if (current?.key === key) current.cards.push(card)
    else
      sections.push({
        key,
        label: levels.length ? buckets.map((bucket) => bucket.label).join(" · ") : null,
        cards: [card],
      })
  }
  return sections
}
