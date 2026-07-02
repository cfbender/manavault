import type { FullscreenPrinting } from "../../components/fullscreen-printing-dialog"
import type { PlaytestCard } from "../../lib/deck-playtest"
import { compareDeckCards } from "../../lib/deck-grouping"
import type { DeckCardEntry, DeckZone } from "./deck-types"
import { COLOR_ORDER } from "./deck-types"

export function countDeckZones(deckCards: DeckCardEntry[]) {
  return deckCards.reduce<Record<DeckZone, number>>(
    (counts, deckCard) => {
      counts[deckCard.zone as DeckZone] =
        (counts[deckCard.zone as DeckZone] || 0) + deckCard.quantity
      return counts
    },
    { commander: 0, mainboard: 0, maybeboard: 0, sideboard: 0 },
  )
}

export function isLegendaryCreature(deckCard: DeckCardEntry) {
  const typeLine = deckCard.card?.typeLine || ""
  return typeLine.includes("Legendary") && typeLine.includes("Creature")
}

// DeckCardEntry is assignable to DeckGroupingDeckCard, so the grouping module's
// comparator serves both; re-export it to keep existing importers working.
export { compareDeckCards }

export function cardImageUrl(deckCard: DeckCardEntry, key: "artCropUrl" | "imageUrl") {
  const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting
  return printing?.[key] || null
}

export function deckCardPreviewPrinting(deckCard: DeckCardEntry): FullscreenPrinting {
  const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting

  return {
    scryfallId: deckCard.id,
    artCropUrl: printing?.artCropUrl || null,
    collectorNumber: printing?.collectorNumber || null,
    finishes: deckCard.finish ? [deckCard.finish] : printing?.finishes,
    imageUrl: printing?.imageUrl || null,
    backImageUrl: printing?.backImageUrl || null,
    rarity: printing?.rarity || null,
    setCode: printing?.setCode || null,
    setName: printing?.setName || null,
  }
}

export function deckPlaytestCards(deckCards: DeckCardEntry[]) {
  const library: PlaytestCard[] = []
  const command: PlaytestCard[] = []

  for (const deckCard of [...deckCards].sort(compareDeckCards)) {
    if (deckCard.zone === "sideboard" || deckCard.zone === "maybeboard") continue

    const target = deckCard.zone === "commander" ? command : library
    const quantity = Math.max(deckCard.quantity || 0, 0)
    const printing = deckCard.preferredPrinting || deckCard.fallbackPrinting

    for (let index = 0; index < quantity; index += 1) {
      target.push({
        deckCardId: deckCard.id,
        id: `${deckCard.id}:${index}`,
        imageUrl: cardImageUrl(deckCard, "imageUrl"),
        name: deckCard.card?.name || "Unknown card",
        setLabel: printing?.setCode
          ? `${printing.setCode.toUpperCase()} #${printing.collectorNumber || "?"}`
          : null,
        typeLine: deckCard.card?.typeLine,
      })
    }
  }

  return { command, library }
}

export function colorOrder(color: string) {
  const index = COLOR_ORDER.indexOf(color)
  return index === -1 ? 99 : index
}

export function deckDetailCoverUrl(deckCards: DeckCardEntry[]) {
  const cover = deckCards.find(
    (deckCard) => cardImageUrl(deckCard, "artCropUrl") || cardImageUrl(deckCard, "imageUrl"),
  )
  return cover ? cardImageUrl(cover, "artCropUrl") || cardImageUrl(cover, "imageUrl") : null
}
