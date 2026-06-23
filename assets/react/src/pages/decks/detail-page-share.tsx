import { XCircle } from "lucide-react"
import { useState } from "react"
import { createPortal } from "react-dom"
import { DeckPlaytester } from "../../components/deck-playtester"
import { exportDecklistText } from "../../lib/deck-export"
import { createPlaytestState } from "../../lib/deck-playtest"
import { deckPlaytestCards } from "./deck-card-model"
import type { DeckCardEntry, DeckDetail } from "./deck-types"

export function SharePlaytestOverlay({
  deck,
  deckCards,
  onClose,
}: {
  deck: DeckDetail
  deckCards: DeckCardEntry[]
  onClose: () => void
}) {
  const playtestCards = deckPlaytestCards(deckCards)
  const initialPlaytestState = createPlaytestState(playtestCards.library, playtestCards.command)

  return createPortal(
    <div className="fixed inset-0 z-[1200] bg-[#0d0e0c]">
      <DeckPlaytester
        closeSlot={
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1 text-base-content/60"
            onClick={onClose}
          >
            <XCircle className="h-3.5 w-3.5" />
            Close
          </button>
        }
        deckId={deck.id}
        deckName={deck.name}
        initialState={initialPlaytestState}
      />
    </div>,
    document.body,
  )
}

export function useSharedDecklistActions(deckName: string, deckCards: DeckCardEntry[]) {
  const [shareCopyState, setShareCopyState] = useState<"idle" | "copied" | "failed">("idle")

  async function copySharedDecklist() {
    try {
      await navigator.clipboard.writeText(exportDecklistText(deckCards))
      setShareCopyState("copied")
    } catch {
      setShareCopyState("failed")
    }
  }

  return {
    copySharedDecklist,
    downloadSharedDecklist: () => downloadDecklistText(deckName, deckCards),
    shareCopyState,
  }
}

function downloadDecklistText(deckName: string, deckCards: DeckCardEntry[]) {
  const blob = new Blob([exportDecklistText(deckCards)], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = `${deckName || "deck"}.txt`
  link.click()
  URL.revokeObjectURL(url)
}
