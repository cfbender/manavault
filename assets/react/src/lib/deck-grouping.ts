export type DeckGroupBy =
  | "theme"
  | "category"
  | "type"
  | "color"
  | "colorIdentity"
  | "manaValue"
  | "rarity"
  | "set"
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
  | { kind: "colors"; colors: string[] }
  | { kind: "manaValue"; plus: boolean; value: number }
  | { kind: "rarity"; rarity: string }
  | { kind: "set"; setCode: string | null }

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
  printings: Array<DeckGroupingPrinting | null> | null
}

export type DeckGroupingDeckCard = {
  id: string
  quantity: number
  zone: string | null
  card: DeckGroupingCard | null
  preferredPrinting: DeckGroupingPrinting | null
}

export type DeckGroup<T extends DeckGroupingDeckCard = DeckGroupingDeckCard> = {
  cards: T[]
  icon: DeckGroupIcon
  key: string
  label: string
  order: number
  quantity: number
}

export const DECK_GROUP_OPTIONS: Array<{ label: string; value: DeckGroupBy }> = [
  { label: "Theme", value: "theme" },
  { label: "Category", value: "category" },
  { label: "Type", value: "type" },
  { label: "Color", value: "color" },
  { label: "Color Identity", value: "colorIdentity" },
  { label: "Mana Value", value: "manaValue" },
  { label: "Rarity", value: "rarity" },
  { label: "Set", value: "set" },
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

export function groupDeckCards<T extends DeckGroupingDeckCard>(
  deckCards: T[],
  groupBy: DeckGroupBy,
): DeckGroup<T>[] {
  const groups = new Map<string, DeckGroup<T>>()

  for (const deckCard of deckCards) {
    const descriptor = deckCardGroupDescriptor(deckCard, groupBy)
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

  return [...groups.values()]
    .map((group) => ({ ...group, cards: group.cards.sort(compareDeckCards) }))
    .sort((left, right) => compareDeckGroups(left, right, groupBy))
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
  const printing = deckCard.preferredPrinting || card?.printings?.[0]

  if (groupBy === "none") return { icon: "none", key: "all", label: "Deck", order: 0 }

  if (groupBy === "theme") {
    const theme = firstNonEmpty(card?.deckThemes)
    if (!theme) return { icon: "none", key: "other", label: "Other", order: 99 }
    return {
      icon: "none",
      key: theme,
      label: titleizeGroupValue(theme),
      order: theme.toLowerCase() === "other" ? 99 : 0,
    }
  }

  if (groupBy === "category") {
    const category = normalizedGroupValue(card?.deckCategory) || "other"
    return {
      icon: "none",
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

  return typeDescriptor(deckCard)
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

function typeGroup(key: string, label: string, icon: DeckGroupIcon) {
  return { icon, key, label, order: orderIndex(TYPE_ORDER, key) }
}

function compareDeckCards(left: DeckGroupingDeckCard, right: DeckGroupingDeckCard) {
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
