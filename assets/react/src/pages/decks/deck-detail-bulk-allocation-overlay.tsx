import { BulkAllocationPullListDialog } from "./bulk-allocation"
import {
  allocatableDeckPullListEntries,
  createDeckPullList,
  type DeckPullListEntry,
} from "./deck-allocation-model"
import type { DeckDetailOverlay } from "./deck-detail-overlay"
import { updateBulkAllocationOverlay } from "./deck-detail-overlay"
import type { DeckDetail } from "./deck-types"

type DeckDetailBulkAllocationOverlayProps = {
  deck: DeckDetail
  isPending: boolean
  onClose: () => void
  onConfirm: (entries: DeckPullListEntry[]) => void
  onOverlayChange: (update: (overlay: DeckDetailOverlay) => DeckDetailOverlay) => void
  overlay: DeckDetailOverlay
}

export function DeckDetailBulkAllocationOverlay({
  deck,
  isPending,
  onClose,
  onConfirm,
  onOverlayChange,
  overlay,
}: DeckDetailBulkAllocationOverlayProps) {
  if (overlay.kind !== "bulk-allocation") return null

  const pullList = createDeckPullList(deck.deckCards, overlay.selectedItemIds, overlay.mode)

  return (
    <BulkAllocationPullListDialog
      excludedEntryIds={overlay.excludedEntryIds}
      error={overlay.error}
      isPending={isPending}
      mode={overlay.mode}
      open
      pullList={pullList}
      selectedItemIds={overlay.selectedItemIds}
      onClose={() => !isPending && onClose()}
      onConfirm={() =>
        onConfirm(allocatableDeckPullListEntries(pullList, overlay.excludedEntryIds))
      }
      onModeChange={(mode) =>
        onOverlayChange((current) =>
          updateBulkAllocationOverlay(current, {
            error: null,
            excludedEntryIds: {},
            mode,
            selectedItemIds: {},
          }),
        )
      }
      onSelectChoice={(choiceId, collectionItemId) =>
        onOverlayChange((current) => {
          if (current.kind !== "bulk-allocation") return current
          return updateBulkAllocationOverlay(current, {
            error: null,
            selectedItemIds: { ...current.selectedItemIds, [choiceId]: collectionItemId },
          })
        })
      }
      onToggleEntry={(entryId, excluded) =>
        onOverlayChange((current) => {
          if (current.kind !== "bulk-allocation") return current
          return updateBulkAllocationOverlay(current, {
            error: null,
            excludedEntryIds: { ...current.excludedEntryIds, [entryId]: excluded },
          })
        })
      }
    />
  )
}
