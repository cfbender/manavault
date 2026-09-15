import { EmptyState } from "../../components/card-image"
import type { DeckGroup } from "../../lib/deck-grouping"
import { DeckGroupGrid } from "./deck-stack-grid"
import type { DeckCardEntry, DeckCardTag, DeckCustomTag } from "./deck-types"
import { DeckZoneTable } from "./deck-zone-table"

type DeckDetailCardCollectionsProps = {
  canEdit: boolean
  consideringCards: DeckCardEntry[]
  deckFormat: string
  deckId: string
  deckTags: DeckCustomTag[]
  groupedCards: DeckGroup<DeckCardEntry>[]
  highlightedCardIds: Set<string> | null
  isSelecting: boolean
  isUpdating: boolean
  onAddPartner: (deckCard: DeckCardEntry) => void
  onAllocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onAssignTag: (deckCard: DeckCardEntry, tagId: string) => void
  onDeallocate: (deckCard: DeckCardEntry, collectionItemId: string) => void
  onDelete: (deckCard: DeckCardEntry) => void
  onEdit: (deckCard: DeckCardEntry) => void
  onMove: (deckCard: DeckCardEntry) => void
  onPreview: (deckCard: DeckCardEntry) => void
  onSetCommander: (deckCard: DeckCardEntry) => void
  onTag: (deckCard: DeckCardEntry, tag: DeckCardTag | null) => void
  onToggleProxy: (deckCard: DeckCardEntry) => void
  onToggleSelected: (deckCardId: string, selectRange?: boolean) => void
  onUnassignTag: (deckCard: DeckCardEntry, tagId: string) => void
  partnerCandidateIds: Set<string>
  selectedCardIds: Set<string>
  shareMode: boolean
}

export function DeckDetailCardCollections({
  canEdit,
  consideringCards,
  deckFormat,
  deckId,
  deckTags,
  groupedCards,
  highlightedCardIds,
  isSelecting,
  isUpdating,
  onAddPartner,
  onAllocate,
  onAssignTag,
  onDeallocate,
  onDelete,
  onEdit,
  onMove,
  onPreview,
  onSetCommander,
  onTag,
  onToggleProxy,
  onToggleSelected,
  onUnassignTag,
  partnerCandidateIds,
  selectedCardIds,
  shareMode,
}: DeckDetailCardCollectionsProps) {
  const readOnly = shareMode || !canEdit

  return (
    <>
      {groupedCards.length ? (
        <DeckGroupGrid
          canSetCommander={canEdit && deckFormat === "commander"}
          deckId={deckId}
          deckTags={deckTags}
          groups={groupedCards}
          highlightedCardIds={highlightedCardIds}
          isSelecting={canEdit && isSelecting}
          isUpdating={isUpdating}
          onAddPartner={onAddPartner}
          onAllocate={onAllocate}
          onAssignTag={onAssignTag}
          onDeallocate={onDeallocate}
          onDelete={onDelete}
          onEdit={onEdit}
          onMove={onMove}
          onPreview={onPreview}
          onSetCommander={onSetCommander}
          onTag={onTag}
          onToggleProxy={onToggleProxy}
          onToggleSelected={onToggleSelected}
          onUnassignTag={onUnassignTag}
          partnerCandidateIds={partnerCandidateIds}
          selectedCardIds={selectedCardIds}
          shareMode={readOnly}
        />
      ) : (
        <EmptyState title="No cards in this deck" />
      )}

      <div className="space-y-3">
        <DeckZoneTable
          cards={consideringCards}
          deckId={deckId}
          highlightedCardIds={highlightedCardIds}
          isSelecting={canEdit && isSelecting}
          isUpdating={isUpdating}
          onDelete={onDelete}
          onEdit={onEdit}
          onMove={onMove}
          onPreview={onPreview}
          onTag={onTag}
          onToggleSelected={onToggleSelected}
          selectedCardIds={selectedCardIds}
          shareMode={readOnly}
          title="Considering"
        />
      </div>
    </>
  )
}
