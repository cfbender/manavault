import type { DeckGroup } from "../../lib/deck-grouping"
import { DeckStackGroup } from "./deck-stack-group"
import type { DeckCardEntry, DeckCardTag, DeckCustomTag } from "./deck-types"
import { CARD_WIDTH_DEFAULT_REM, useCardSize } from "../../lib/card-size"

export { DeckStackCard } from "./deck-stack-card"
export { DeckStackGroup, deckStackIndexFromPointer } from "./deck-stack-group"

export function DeckGroupGrid({
  canEditDecklist = true,
  commanderFormat,
  deckId,
  deckTags,
  groups,
  isSelecting,
  isUpdating,
  partnerCandidateIds,
  selectedCardIds,
  highlightedCardIds,
  onAddPartner,
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
  canEditDecklist?: boolean
  /** The deck's format when commanders can be set here; null otherwise. */
  commanderFormat: string | null
  deckId: string
  deckTags: DeckCustomTag[]
  groups: DeckGroup<DeckCardEntry>[]
  isUpdating: boolean
  highlightedCardIds: Set<string> | null
  isSelecting: boolean
  partnerCandidateIds: Set<string>
  selectedCardIds: Set<string>
  onAddPartner: (deckCard: DeckCardEntry) => void
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
  const responsiveScale = size.widthRem / CARD_WIDTH_DEFAULT_REM
  // Three default-sized groups fit a split-screen desktop. Scale that target
  // with the user's preference, so choosing larger cards still reduces columns.
  const columnWidth = `clamp(${16 * responsiveScale}rem, calc((100cqw - 4rem) / 3 * ${responsiveScale}), ${size.widthRem}rem)`
  return (
    <div style={{ containerType: "inline-size" }}>
      <div
        className="mx-auto gap-8"
        style={{
          columnWidth,
          maxWidth: `calc(${columns} * ${columnWidth} + ${Math.max(columns - 1, 0)} * 2rem)`,
        }}
      >
        {groups.map((group) => (
          <DeckStackGroup
            key={group.key}
            canEditDecklist={canEditDecklist}
            commanderFormat={commanderFormat}
            deckId={deckId}
            deckTags={deckTags}
            group={group}
            highlightedCardIds={highlightedCardIds}
            isUpdating={isUpdating}
            isSelecting={isSelecting}
            partnerCandidateIds={partnerCandidateIds}
            selectedCardIds={selectedCardIds}
            onAddPartner={onAddPartner}
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
    </div>
  )
}
