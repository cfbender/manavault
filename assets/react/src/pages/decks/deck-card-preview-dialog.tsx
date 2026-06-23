import { useEffect, useMemo, useState } from "react"
import { FullscreenPrintingDialog } from "../../components/fullscreen-printing-dialog"
import { deckCardPreviewPrinting } from "./deck-card-model"
import type { DeckCardEntry } from "./deck-types"

export function DeckCardPreviewDialog({
  deckCard,
  deckCards,
  onOpenChange,
}: {
  deckCard: DeckCardEntry | null
  deckCards: DeckCardEntry[]
  onOpenChange: (open: boolean) => void
}) {
  const [currentDeckCardId, setCurrentDeckCardId] = useState<string | null>(null)
  const previewCards = deckCards.length ? deckCards : deckCard ? [deckCard] : []
  const printings = useMemo(() => previewCards.map(deckCardPreviewPrinting), [previewCards])
  const currentDeckCard =
    previewCards.find((previewCard) => previewCard.id === currentDeckCardId) || deckCard
  const name = currentDeckCard?.card?.name || "Card preview"

  useEffect(() => {
    setCurrentDeckCardId(deckCard?.id || null)
  }, [deckCard])

  useEffect(() => {
    if (!currentDeckCardId) return
    if (printings.some((printing) => printing.scryfallId === currentDeckCardId)) return

    setCurrentDeckCardId(printings[0]?.scryfallId || null)
  }, [currentDeckCardId, printings])

  return (
    <FullscreenPrintingDialog
      card={{ name }}
      currentPrintingId={currentDeckCardId}
      printings={printings}
      onOpenChange={onOpenChange}
      onPrintingChange={setCurrentDeckCardId}
    />
  )
}
