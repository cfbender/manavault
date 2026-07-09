import type { DeckGroup } from "../../lib/deck-grouping"
import { DeckStackGroup } from "./deck-stack-group"
import type { DeckCardEntry, DeckCardTag, DeckCustomTag } from "./deck-types"
import { useCardSize } from "../../lib/card-size"

export { DeckStackCard } from "./deck-stack-card"
export { DeckStackGroup, deckStackIndexFromPointer } from "./deck-stack-group"

export function DeckGroupGrid({
  canSetCommander,
  deckId,
  deckTags,
  groups,
  isSelecting,
  isUpdating,
  selectedCardIds,
  highlightedCardIds,
  onAllocate,
  onAssignTag,
  onDelete,
  onDeallocate,
  onEdit,
  onMove,
  onPreview,
  onSetCommander,
  onTag,
  onToggleProxy,
  onToggleSelected,
  onUnassignTag,
  shareMode = false,
}: {
  canSetCommander: boolean
  deckId: string
  deckTags: DeckCustomTag[]
  groups: DeckGroup<DeckCardEntry>[]
  isUpdating: boolean
  highlightedCardIds: Set<string> | null
  isSelecting: boolean
  selectedCardIds: Set<string>
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onAssignTag: (deckCard: DeckCardEntry, tagId: string) => void
  onDelete: (deckCard: DeckCardEntry) => void
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  onPreview: (deckCard: DeckCardEntry) => void
  onSetCommander: (deckCard: DeckCardEntry) => void
  onTag: (deckCard: DeckCardEntry, tag: DeckCardTag | null) => void
  onToggleProxy: (deckCard: DeckCardEntry) => void
  onUnassignTag: (deckCard: DeckCardEntry, tagId: string) => void
  shareMode?: boolean
  onToggleSelected: (deckCardId: string, selectRange?: boolean) => void
}) {
  const size = useCardSize()
  const columns = Math.min(groups.length, 5)
  return (
    <div
      className="mx-auto gap-8"
      style={{
        columnWidth: `${size.widthRem}rem`,
        maxWidth: `calc(${columns} * ${size.widthRem}rem + ${Math.max(columns - 1, 0)} * 2rem)`,
      }}
    >
      {groups.map((group) => (
        <DeckStackGroup
          key={group.key}
          canSetCommander={canSetCommander}
          deckId={deckId}
          deckTags={deckTags}
          group={group}
          highlightedCardIds={highlightedCardIds}
          isUpdating={isUpdating}
          isSelecting={isSelecting}
          selectedCardIds={selectedCardIds}
          onAllocate={onAllocate}
          onAssignTag={onAssignTag}
          onDelete={onDelete}
          onDeallocate={onDeallocate}
          onEdit={onEdit}
          onMove={onMove}
          onPreview={onPreview}
          onSetCommander={onSetCommander}
          onTag={onTag}
          onToggleProxy={onToggleProxy}
          onUnassignTag={onUnassignTag}
          shareMode={shareMode}
          onToggleSelected={onToggleSelected}
        />
      ))}
    </div>
  )
}
