export type DeckGroupBy =
  | "theme"
  | "category"
  | "type"
  | "color"
  | "colorIdentity"
  | "manaValue"
  | "rarity"
  | "set"
  | "tag"
  | "price"
  | "allocation"
  | "none"

export type DeckGroupIcon =
  | "commander"
  | "creature"
  | "instant"
  | "sorcery"
  | "artifact"
  | "enchantment"
  | "planeswalker"
  | "land"
  | "none"
  | "getting"
  | "consider_cutting"
  | "aristocrats"
  | "auras"
  | "blink"
  | "burn"
  | "card_advantage"
  | "combo"
  | "copy"
  | "counters"
  | "discard"
  | "drain"
  | "engine"
  | "equipment"
  | "evasion"
  | "graveyard_hate"
  | "lifegain"
  | "mass_disruption"
  | "mill"
  | "protection"
  | "pump"
  | "ramp"
  | "recursion"
  | "sacrifice"
  | "spellslinger"
  | "stax"
  | "storm"
  | "sunforger"
  | "targeted_disruption"
  | "theft"
  | "tokens"
  | "tutor"
  | "voltron"
  | "win_condition"
  | { kind: "colors"; colors: string[] }
  | { kind: "manaValue"; plus: boolean; value: number }
  | { kind: "rarity"; rarity: string }
  | { kind: "set"; setCode: string | null }
  | { kind: "allocation"; state: string }
  | { kind: "tagColor"; color: string }

type DeckGroupingPrinting = {
  rarity: string | null
  setCode: string | null
  setName: string | null
}

export type DeckGroupingCard = {
  name: string | null
  typeLine: string | null
  cmc: number | null
  colors: Array<string | null> | null
  colorIdentity: Array<string | null> | null
  deckCategory: string | null
  deckThemes: Array<string | null> | null
}

export type DeckGroupingDeckCard = {
  id: string
  quantity: number
  zone: string | null
  tag?: string | null
  tagIds?: string[] | null
  priceCents?: number | null
  allocationStatus?: { state: string | null } | null
  card: DeckGroupingCard | null
  preferredPrinting: DeckGroupingPrinting | null
  fallbackPrinting: DeckGroupingPrinting | null
}

export type DeckGroup<T extends DeckGroupingDeckCard = DeckGroupingDeckCard> = {
  cards: T[]
  icon: DeckGroupIcon
  key: string
  label: string
  order: number
  quantity: number
}

export type DeckGroupingTag = { id: string; name: string; color: string; position: number }

export const DECK_GROUP_OPTIONS: Array<{ label: string; value: DeckGroupBy }> = [
  { label: "Theme", value: "theme" },
  { label: "Category", value: "category" },
  { label: "Type", value: "type" },
  { label: "Color", value: "color" },
  { label: "Color Identity", value: "colorIdentity" },
  { label: "Mana Value", value: "manaValue" },
  { label: "Rarity", value: "rarity" },
  { label: "Set", value: "set" },
  { label: "Tags", value: "tag" },
  { label: "Price", value: "price" },
  { label: "Allocation", value: "allocation" },
  { label: "None", value: "none" },
]

const TYPE_ORDER = [
  "commander",
  "creature",
  "instant",
  "sorcery",
  "artifact",
  "enchantment",
  "planeswalker",
  "battle",
  "land",
  "other",
]
const COLOR_ORDER = ["W", "U", "B", "R", "G", "M", "C"]
const CATEGORY_ORDER = [
  "ramp",
  "card_advantage",
  "targeted_disruption",
  "mass_disruption",
  "lands",
  "other",
]
type PriceBucket = {
  key: string
  label: string
  minCents?: number
  maxExclusiveCents?: number
  order: number
}

const PRICE_BUCKETS: PriceBucket[] = [
  { key: "under-1", label: "<$1", maxExclusiveCents: 100, order: 0 },
  { key: "1-3", label: "$1–$3", minCents: 100, maxExclusiveCents: 300, order: 1 },
  { key: "3-5", label: "$3–$5", minCents: 300, maxExclusiveCents: 500, order: 2 },
  { key: "5-10", label: "$5–$10", minCents: 500, maxExclusiveCents: 1000, order: 3 },
  { key: "10-25", label: "$10–$25", minCents: 1000, maxExclusiveCents: 2500, order: 4 },
  { key: "25-50", label: "$25–$50", minCents: 2500, maxExclusiveCents: 5000, order: 5 },
  { key: "50-plus", label: "$50+", minCents: 5000, order: 6 },
]
const GROUP_VALUE_ICONS: Record<string, DeckGroupIcon> = {
  aristocrats: "aristocrats",
  artifact: "artifact",
  auras: "auras",
  blink: "blink",
  board_wipe: "mass_disruption",
  burn: "burn",
  card_advantage: "card_advantage",
  combo: "combo",
  copy: "copy",
  counters: "counters",
  creature: "creature",
  discard: "discard",
  drain: "drain",
  engine: "engine",
  enchantment: "enchantment",
  equipment: "equipment",
  evasion: "evasion",
  graveyard_hate: "graveyard_hate",
  instant: "instant",
  land: "land",
  lands: "land",
  lifegain: "lifegain",
  mass_disruption: "mass_disruption",
  mill: "mill",
  planeswalker: "planeswalker",
  protection: "protection",
  pump: "pump",
  ramp: "ramp",
  recursion: "recursion",
  removal: "targeted_disruption",
  sacrifice: "sacrifice",
  sorcery: "sorcery",
  spellslinger: "spellslinger",
  stax: "stax",
  storm: "storm",
  sunforger: "sunforger",
  targeted_disruption: "targeted_disruption",
  theft: "theft",
  tokens: "tokens",
  tutor: "tutor",
  voltron: "voltron",
  win_condition: "win_condition",
}

export function groupDeckCards<T extends DeckGroupingDeckCard>(
  deckCards: T[],
  groupBy: DeckGroupBy,
  deckTags: DeckGroupingTag[] = [],
): DeckGroup<T>[] {
  const groups = new Map<string, DeckGroup<T>>()

  for (const deckCard of deckCards) {
    const descriptors = deckCardGroupDescriptors(deckCard, groupBy, deckTags)
    for (const descriptor of descriptors) {
      const existing: DeckGroup<T> = groups.get(descriptor.key) || {
        cards: [],
        icon: descriptor.icon,
        key: descriptor.key,
        label: descriptor.label,
        order: descriptor.order,
        quantity: 0,
      }

      existing.cards.push(deckCard)
      existing.quantity += deckCard.quantity
      groups.set(descriptor.key, existing)
    }
  }

  return [...groups.values()]
    .map((group) => ({ ...group, cards: group.cards.sort(compareDeckCards) }))
    .sort((left, right) => compareDeckGroups(left, right, groupBy))
}

// A card can belong to multiple custom-tag groups (many-to-many); every other
// grouping mode yields exactly one descriptor per card.
function deckCardGroupDescriptors<T extends DeckGroupingDeckCard>(
  deckCard: T,
  groupBy: DeckGroupBy,
  deckTags: DeckGroupingTag[],
): Array<Omit<DeckGroup<T>, "cards" | "quantity">> {
  if (groupBy === "tag") {
    return customTagDescriptors(deckCard, deckTags)
  }

  return [deckCardGroupDescriptor(deckCard, groupBy)]
}

function customTagDescriptors<T extends DeckGroupingDeckCard>(
  deckCard: T,
  deckTags: DeckGroupingTag[],
): Array<Omit<DeckGroup<T>, "cards" | "quantity">> {
  const tagById = new Map(deckTags.map((tag) => [tag.id, tag]))
  const assigned = (deckCard.tagIds || [])
    .map((id) => tagById.get(id))
    .filter((tag): tag is DeckGroupingTag => tag != null)

  // Custom tags take precedence: a card with any custom tag is grouped by those.
  if (assigned.length > 0) {
    return assigned.map((tag) => ({
      icon: { kind: "tagColor", color: tag.color },
      key: `tag:${tag.id}`,
      label: tag.name,
      order: tag.position,
    }))
  }

  // Fall back to the legacy getting/consider_cutting axis, then untagged.
  if (deckCard.tag === "getting") {
    return [{ icon: "getting", key: "getting", label: "Getting", order: 1000 }]
  }

  if (deckCard.tag === "consider_cutting") {
    return [
      { icon: "consider_cutting", key: "consider_cutting", label: "Consider Cutting", order: 1001 },
    ]
  }

  return [{ icon: "none", key: "untagged", label: "Untagged", order: 1002 }]
}

function compareDeckGroups<T extends DeckGroupingDeckCard>(
  left: DeckGroup<T>,
  right: DeckGroup<T>,
  groupBy: DeckGroupBy,
) {
  if (groupBy === "type") {
    if (left.key === "commander" && right.key !== "commander") return -1
    if (right.key === "commander" && left.key !== "commander") return 1

    return left.label.localeCompare(right.label)
  }

  return left.order - right.order || left.label.localeCompare(right.label)
}

function deckCardGroupDescriptor<T extends DeckGroupingDeckCard>(
  deckCard: T,
  groupBy: DeckGroupBy,
): Omit<DeckGroup<T>, "cards" | "quantity"> {
  const card = deckCard.card
  const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting

  if ((groupBy === "theme" || groupBy === "category") && deckCard.zone === "commander") {
    return commanderGroup()
  }

  if (groupBy === "none") return { icon: "none", key: "all", label: "Deck", order: 0 }

  if (groupBy === "theme") {
    const theme = firstNonEmpty(card?.deckThemes)
    if (!theme) return { icon: "none", key: "other", label: "Other", order: 99 }
    return {
      icon: groupValueIcon(theme),
      key: theme,
      label: titleizeGroupValue(theme),
      order: theme.toLowerCase() === "other" ? 99 : 0,
    }
  }

  if (groupBy === "category") {
    const category = normalizedGroupValue(card?.deckCategory) || "other"
    return {
      icon: groupValueIcon(category),
      key: category,
      label: category === "other" ? "Other" : titleizeGroupValue(category),
      order: orderIndex(CATEGORY_ORDER, category),
    }
  }

  if (groupBy === "color") {
    const colors = (card?.colors || []).filter(present)
    const key = colors.length === 0 ? "C" : colors.length > 1 ? "M" : colors[0] || "C"
    const iconColors = key === "M" ? ["W", "U", "B", "R", "G"] : [key]
    return {
      icon: { kind: "colors", colors: iconColors },
      key,
      label: colorLabel(key),
      order: colorOrder(key),
    }
  }

  if (groupBy === "colorIdentity") {
    const identity = (card?.colorIdentity || [])
      .filter(present)
      .sort((left, right) => colorOrder(left) - colorOrder(right))
    const key = identity.length ? identity.join("") : "C"
    return {
      icon: { kind: "colors", colors: identity.length ? identity : ["C"] },
      key,
      label: key === "C" ? "Colorless" : `${key} Identity`,
      order: identity.length ? identity.reduce((sum, color) => sum + colorOrder(color), 0) : 99,
    }
  }

  if (groupBy === "manaValue") {
    const cmc = Math.floor(card?.cmc || 0)
    const key = cmc >= 6 ? "6+" : String(cmc)
    return {
      icon: { kind: "manaValue", plus: cmc >= 6, value: cmc >= 6 ? 6 : Math.max(cmc, 0) },
      key,
      label: `Mana ${key}`,
      order: cmc >= 6 ? 6 : cmc,
    }
  }

  if (groupBy === "rarity") {
    const rarity = printing?.rarity || "unknown"
    return {
      icon: { kind: "rarity", rarity },
      key: rarity,
      label: titleizeGroupValue(rarity),
      order: rarityOrder(rarity),
    }
  }

  if (groupBy === "set") {
    const key = printing?.setCode || "unknown"
    return {
      icon: { kind: "set", setCode: key === "unknown" ? null : key },
      key,
      label: printing?.setName || key.toUpperCase(),
      order: 0,
    }
  }

  if (groupBy === "price") {
    return priceDescriptor(deckCard.priceCents)
  }

  if (groupBy === "allocation") {
    return allocationDescriptor(deckCard.allocationStatus?.state)
  }

  return typeDescriptor(deckCard)
}

function priceDescriptor(priceCents: number | null | undefined) {
  if (typeof priceCents !== "number" || !Number.isFinite(priceCents)) {
    return { icon: "none", key: "unpriced", label: "Unpriced", order: 99 } as const
  }

  const bucket =
    PRICE_BUCKETS.find(
      ({ minCents = Number.NEGATIVE_INFINITY, maxExclusiveCents = Number.POSITIVE_INFINITY }) =>
        priceCents >= minCents && priceCents < maxExclusiveCents,
    ) || PRICE_BUCKETS[PRICE_BUCKETS.length - 1]

  return { icon: "none", key: bucket.key, label: bucket.label, order: bucket.order } as const
}

const ALLOCATION_GROUPS: Record<string, { label: string; order: number }> = {
  allocated: { label: "Fully allocated", order: 0 },
  available: { label: "Available to allocate", order: 1 },
  partial: { label: "Partially available", order: 2 },
  basic_land: { label: "Basic land", order: 3 },
  missing: { label: "Missing from collection", order: 4 },
}

function allocationDescriptor(state: string | null | undefined) {
  const key = state && ALLOCATION_GROUPS[state] ? state : "missing"
  const group = ALLOCATION_GROUPS[key]
  return {
    icon: { kind: "allocation", state: key } as const,
    key,
    label: group.label,
    order: group.order,
  }
}

function typeDescriptor<T extends DeckGroupingDeckCard>(
  deckCard: T,
): Omit<DeckGroup<T>, "cards" | "quantity"> {
  const typeLine = deckCard.card?.typeLine || ""

  if (deckCard.zone === "commander") return typeGroup("commander", "Commander", "commander")
  if (/\bCreature\b/.test(typeLine)) return typeGroup("creature", "Creatures", "creature")
  if (/\bInstant\b/.test(typeLine)) return typeGroup("instant", "Instants", "instant")
  if (/\bSorcery\b/.test(typeLine)) return typeGroup("sorcery", "Sorceries", "sorcery")
  if (/\bArtifact\b/.test(typeLine)) return typeGroup("artifact", "Artifacts", "artifact")
  if (/\bEnchantment\b/.test(typeLine))
    return typeGroup("enchantment", "Enchantments", "enchantment")
  if (/\bPlaneswalker\b/.test(typeLine))
    return typeGroup("planeswalker", "Planeswalkers", "planeswalker")
  if (/\bLand\b/.test(typeLine)) return typeGroup("land", "Lands", "land")

  return typeGroup("other", "Other", "none")
}

function commanderGroup() {
  return { icon: "commander", key: "commander", label: "Commander", order: -1 } as const
}

function typeGroup(key: string, label: string, icon: DeckGroupIcon) {
  return { icon, key, label, order: orderIndex(TYPE_ORDER, key) }
}

export function compareDeckCards(left: DeckGroupingDeckCard, right: DeckGroupingDeckCard) {
  return (
    (left.card?.name || "").localeCompare(right.card?.name || "") || left.id.localeCompare(right.id)
  )
}

function colorOrder(color: string) {
  return orderIndex(COLOR_ORDER, color)
}

function colorLabel(color: string) {
  const labels: Record<string, string> = {
    B: "Black",
    C: "Colorless",
    G: "Green",
    M: "Multicolor",
    R: "Red",
    U: "Blue",
    W: "White",
  }
  return labels[color] || color
}

function rarityOrder(rarity: string) {
  const order = ["common", "uncommon", "rare", "mythic", "special", "bonus"]
  return orderIndex(order, String(rarity).toLowerCase())
}

function orderIndex(order: string[], value: string) {
  const index = order.indexOf(value)
  return index === -1 ? 99 : index
}

function groupValueIcon(value: string): DeckGroupIcon {
  return GROUP_VALUE_ICONS[value] || "none"
}

function firstNonEmpty(values: Array<string | null> | null | undefined) {
  for (const value of values || []) {
    const normalizedValue = normalizedGroupValue(value)
    if (normalizedValue) return normalizedValue
  }

  return null
}

function normalizedGroupValue(value: string | null | undefined) {
  return String(value || "").trim()
}

function titleizeGroupValue(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function present<T>(value: T | null | undefined): value is T {
  return value != null
}
