import type { DeckGroup } from "../../lib/deck-grouping"
import { DeckStackGroup } from "./deck-stack-group"
import type { DeckCardEntry, DeckCardTag } from "./deck-types"
import { DECK_STACK_CARD_WIDTH_REM } from "./deck-types"

export { DeckStackCard } from "./deck-stack-card"
export { DeckStackGroup, deckStackIndexFromPointer } from "./deck-stack-group"

export function DeckGroupGrid({
  allocationError,
  canSetCommander,
  deckId,
  groups,
  isSelecting,
  isUpdating,
  selectedCardIds,
  highlightedCardIds,
  onAllocate,
  onDeallocate,
  onDelete,
  onEdit,
  onMove,
  onPreview,
  onSetCommander,
  onTag,
  onToggleProxy,
  onToggleSelected,
  shareMode = false,
}: {
  allocationError: string | null
  canSetCommander: boolean
  deckId: string
  groups: DeckGroup<DeckCardEntry>[]
  isUpdating: boolean
  highlightedCardIds: Set<string> | null
  isSelecting: boolean
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  selectedCardIds: Set<string>
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onDelete: (deckCard: DeckCardEntry) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  onPreview: (deckCard: DeckCardEntry) => void
  onSetCommander: (deckCard: DeckCardEntry) => void
  onToggleProxy: (deckCard: DeckCardEntry) => void
  onTag: (deckCard: DeckCardEntry, tag: DeckCardTag | null) => void
  shareMode?: boolean
  onToggleSelected: (deckCardId: string, selectRange?: boolean) => void
}) {
  return (
    <div
      className="mx-auto gap-8"
      style={{
        columnWidth: `${DECK_STACK_CARD_WIDTH_REM}rem`,
        maxWidth: `calc(${Math.min(groups.length, 5)} * ${DECK_STACK_CARD_WIDTH_REM}rem + ${Math.max(Math.min(groups.length, 5) - 1, 0)} * 2rem)`,
      }}
    >
      {groups.map((group) => (
        <DeckStackGroup
          key={group.key}
          canSetCommander={canSetCommander}
          deckId={deckId}
          group={group}
          highlightedCardIds={highlightedCardIds}
          isUpdating={isUpdating}
          isSelecting={isSelecting}
          allocationError={allocationError}
          selectedCardIds={selectedCardIds}
          onAllocate={onAllocate}
          onDeallocate={onDeallocate}
          onDelete={onDelete}
          onEdit={onEdit}
          onMove={onMove}
          onPreview={onPreview}
          onSetCommander={onSetCommander}
          onToggleProxy={onToggleProxy}
          onTag={onTag}
          shareMode={shareMode}
          onToggleSelected={onToggleSelected}
        />
      ))}
    </div>
  )
}
