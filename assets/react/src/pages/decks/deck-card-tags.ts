import type { DeckCardTag } from "./deck-types"
import { DECK_CARD_TAGS } from "./deck-types"

export function deckCardTag(value?: string | null) {
  return DECK_CARD_TAGS.find((tag) => tag.value === value) || null
}

export function nextDeckCardTag(value?: string | null): DeckCardTag | null {
  if (value === "getting") return "consider_cutting"
  if (value === "consider_cutting") return null
  return "getting"
}

export function copyLabel(count: number) {
  return count === 1 ? "copy" : "copies"
}

export function deckCardLabel(count: number) {
  return count === 1 ? "deck card" : "deck cards"
}
