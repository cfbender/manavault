import { useEffect } from "react"

import type { DeckDetailOverlay } from "./deck-detail-overlay"
import { useDeckAllocationActions } from "./use-deck-allocation-actions"
import { useDeckBulkActions } from "./use-deck-bulk-actions"
import { useDeckCardActions } from "./use-deck-card-actions"
import { useDeckDisassemblyActions } from "./use-deck-disassembly-actions"
import { useDeckTags } from "./use-deck-tags"

type OverlaySetter = (
  value: DeckDetailOverlay | ((current: DeckDetailOverlay) => DeckDetailOverlay),
) => void

export function useDeckMutations({
  clearSelection,
  deckId,
  onArchived,
  onRefetch,
  onToast,
  setOverlay,
}: {
  clearSelection: () => void
  deckId: string
  onArchived: () => void
  onRefetch: () => void
  onToast: (message: string) => void
  setOverlay: OverlaySetter
}) {
  const card = useDeckCardActions({ deckId, onRefetch, onToast, setOverlay })
  const allocation = useDeckAllocationActions({ onRefetch, onToast })
  const bulk = useDeckBulkActions({ onClearSelection: clearSelection, onRefetch, onToast })
  const disassembly = useDeckDisassemblyActions({
    onArchived,
    onRefetch,
    onToast,
    setOverlay,
  })
  const tags = useDeckTags(deckId)

  useEffect(() => {
    if (tags.error) onToast(tags.error)
  }, [onToast, tags.error])

  return { allocation, bulk, card, disassembly, tags }
}
