import { useMutation } from "@apollo/client/react"
import { useState } from "react"

import {
  NO_DECK_DETAIL_OVERLAY,
  type DeckDetailOverlay,
} from "./deck-detail-overlay"
import { DisassembleDeckDocument, PreviewDeckDisassemblyDocument } from "./queries"

type OverlaySetter = (update: DeckDetailOverlay | ((current: DeckDetailOverlay) => DeckDetailOverlay)) => void

type UseDeckDisassemblyActionsOptions = {
  onArchived: () => void
  onRefetch: () => void
  onToast: (message: string) => void
  setOverlay: OverlaySetter
}

export function useDeckDisassemblyActions({
  onArchived,
  onRefetch,
  onToast,
  setOverlay,
}: UseDeckDisassemblyActionsOptions) {
  const [error, setError] = useState<string | null>(null)
  const [previewDeckDisassemblyMutation, previewDeckDisassemblyResult] = useMutation(
    PreviewDeckDisassemblyDocument,
  )
  const [disassembleDeckMutation, disassembleDeckResult] = useMutation(DisassembleDeckDocument)

  function preview(deckId: string) {
    setError(null)
    void previewDeckDisassemblyMutation({
      variables: { id: deckId },
      onCompleted: (data) => {
        const result = data.previewDeckDisassembly?.disassemblyResult
        if (result) setOverlay({ kind: "disassembly", result })
      },
      onError: (error) => setError(error instanceof Error ? error.message : "Could not preview deck archive"),
    })
  }

  function apply(deckId: string) {
    setError(null)
    void disassembleDeckMutation({
      variables: { id: deckId },
      onCompleted: () => {
        onRefetch()
        onToast("Deck archived")
        setOverlay(NO_DECK_DETAIL_OVERLAY)
        onArchived()
      },
      onError: (error) => setError(error instanceof Error ? error.message : "Could not archive deck"),
    })
  }

  return {
    apply,
    error,
    isApplying: disassembleDeckResult.loading,
    isPreviewing: previewDeckDisassemblyResult.loading,
    preview,
  }
}
