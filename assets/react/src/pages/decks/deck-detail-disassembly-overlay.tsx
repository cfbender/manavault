import { AutoSortSummaryDialog } from "../collection/auto-sort-summary-dialog"

import type { DeckDetailOverlay } from "./deck-detail-overlay"
import type { DeckDetail } from "./deck-types"

type DeckDetailDisassemblyOverlayProps = {
  deck: DeckDetail
  isApplying: boolean
  onApply: () => void
  onClose: () => void
  overlay: DeckDetailOverlay
}

export function DeckDetailDisassemblyOverlay({
  deck,
  isApplying,
  onApply,
  onClose,
  overlay,
}: DeckDetailDisassemblyOverlayProps) {
  if (overlay.kind !== "disassembly") return null

  return (
    <AutoSortSummaryDialog
      applyLabel="Disassemble deck"
      applyPending={isApplying}
      applyPendingLabel="Disassembling..."
      checkedCountLabel="Cards checked"
      completeDescription="Review where allocated cards were returned."
      completeEmptyDescription="The deck was archived without moving any allocated collection cards."
      completeEmptyTitle="Deck archived."
      completeMoveLabel="Returned"
      completeTitle="Deck archived"
      disableApplyWhenNoMoves={false}
      dryRunDescription="Preview where allocated cards will return before archiving this deck."
      dryRunEmptyDescription="This will still archive the deck and leave its decklist viewable."
      dryRunEmptyTitle="No allocated cards to move."
      dryRunMoveLabel="Will return"
      dryRunTitle={`Disassemble ${deck.name}?`}
      onApply={onApply}
      onOpenChange={(open) => !open && !isApplying && onClose()}
      open
      result={overlay.result}
      showItemMetadata={false}
      skippedCountLabel="Skipped cards"
    />
  )
}
