import type { DeckCardEntry } from "./deck-types"

export function hasMainboardAllocationAvailable(deckCards: DeckCardEntry[]) {
  return deckCards.some(
    (deckCard) =>
      deckCard.zone === "mainboard" &&
      deckCard.allocationStatus.available > 0 &&
      deckCard.allocationStatus.allocated < deckCard.allocationStatus.required,
  )
}
