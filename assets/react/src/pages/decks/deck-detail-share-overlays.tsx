import type { DeckDetailOverlay } from "./deck-detail-overlay"
import { ShareDeckBuylistDialog, SharePlaytestOverlay } from "./detail-page-share"
import type { DeckCardEntry, DeckDetail } from "./deck-types"

type DeckDetailShareOverlaysProps = {
  deck: DeckDetail
  deckCards: DeckCardEntry[]
  onClose: () => void
  overlay: DeckDetailOverlay
  shareMode: boolean
  shareToken: string
}

export function DeckDetailShareOverlays({
  deck,
  deckCards,
  onClose,
  overlay,
  shareMode,
  shareToken,
}: DeckDetailShareOverlaysProps) {
  if (!shareMode) return null

  if (overlay.kind === "share-playtest") {
    return <SharePlaytestOverlay deck={deck} deckCards={deckCards} onClose={onClose} />
  }

  if (overlay.kind === "share-buylist") {
    return (
      <ShareDeckBuylistDialog
        deck={deck}
        open
        onOpenChange={(open) => !open && onClose()}
        shareToken={shareToken}
      />
    )
  }

  return null
}
