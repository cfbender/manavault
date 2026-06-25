import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import type { DeckCardUpdateInput } from "../../gql/graphql"
import { AutoSortSummaryDialog } from "../collection/auto-sort-summary-dialog"
import { AddDeckCardDialog } from "./add-card-dialog"
import { BulkAllocationPullListDialog } from "./bulk-allocation"
import { ShareModeHidden } from "./deck-actions"
import { EditDeckCardDialog, MoveDeckCardDialog } from "./deck-card-dialogs"
import { DeckCardDetailDialog } from "./deck-card-detail-dialog"
import { EditDeckDialog } from "./deck-editor-dialogs"
import { ExportDecklistDialog, ImportDecklistDialog, ShareDeckDialog } from "./deck-share-dialogs"
import type { DeckPullList, DeckPullListMode } from "./deck-allocation-model"
import type {
  DeckCardEntry,
  DeckDetail,
  DeckDisassemblyResult,
  DeckZone,
  EDHRecAddZone,
  EDHRecCard,
  EDHRecSectionCard,
  EDHRecTab,
} from "./deck-types"
import type { DetailZoneCounts } from "./detail-page-content"
import { EDHRecDialog } from "./edhrec"
import { MissingCardsDialog } from "./missing-cards-dialog"
import { OptimizePrintingsDialog } from "./optimize-printings-dialog"

export function DeckDetailDialogs({
  addCardError,
  bulkAllocationError,
  bulkAllocationMode,
  bulkAllocationOpen,
  bulkAllocationPullList,
  deck,
  deleteCardTarget,
  disassemblyResult,
  editError,
  editTarget,
  edhrecExcludeLands,
  edhrecTab,
  isAddCardOpen,
  isBulkAllocating,
  isAddingCard,
  isDeleteSelectedOpen,
  isDisassemblingDeck,
  isEditDeckOpen,
  isExportDeckOpen,
  isImportDeckOpen,
  isMissingCardsOpen,
  isShareDeckOpen,
  isUpdatingDeckCard,
  optimizePrintingsError,
  optimizePrintingsOpen,
  mayCloseDeleteSelected,
  moveError,
  moveTarget,
  onAddEdhrecCard,
  onBulkAllocationModeChange,
  onCloseBulkAllocation,
  onCloseEditCard,
  onCloseMoveCard,
  onConfirmBulkAllocation,
  onDeleteCardTargetChange,
  onConfirmDeckDisassembly,
  onDeleteSelectedCard,
  onDisassemblyOpenChange,
  onDeleteSelectedDeckCards,
  onDeleteSelectedOpenChange,
  onEditCard,
  onEditDeckOpenChange,
  onExportDeckOpenChange,
  onImportDeckOpenChange,
  onMissingCardsOpenChange,
  onMoveCard,
  onPreviewCardOpenChange,
  onSetEdhrecState,
  onSelectBulkAllocationChoice,
  onShareDeckOpenChange,
  onOptimizePrintingsOpenChange,
  onOptimizePrintingsSubmit,
  onAddCardOpenChange,
  previewDeckCard,
  selectedBulkAllocationItemIds,
  selectedDeckCardCount,
  shareMode,
  updateDeckCardPending,
  zoneCounts,
}: {
  addCardError: string | null
  bulkAllocationError: string | null
  bulkAllocationMode: DeckPullListMode
  bulkAllocationOpen: boolean
  bulkAllocationPullList: DeckPullList
  deck: DeckDetail
  deleteCardTarget: DeckCardEntry | null
  disassemblyResult: DeckDisassemblyResult | null
  editError: string | null
  editTarget: DeckCardEntry | null
  edhrecExcludeLands: boolean
  edhrecTab?: EDHRecTab
  isAddCardOpen: boolean
  isBulkAllocating: boolean
  isAddingCard: boolean
  isDeleteSelectedOpen: boolean
  isDisassemblingDeck: boolean
  isEditDeckOpen: boolean
  isExportDeckOpen: boolean
  isImportDeckOpen: boolean
  isMissingCardsOpen: boolean
  isShareDeckOpen: boolean
  isUpdatingDeckCard: boolean
  optimizePrintingsError: string | null
  optimizePrintingsOpen: boolean
  mayCloseDeleteSelected: boolean
  moveError: string | null
  moveTarget: DeckCardEntry | null
  onAddEdhrecCard: (card: EDHRecCard | EDHRecSectionCard, zone: EDHRecAddZone) => void
  onBulkAllocationModeChange: (mode: DeckPullListMode) => void
  onCloseBulkAllocation: () => void
  onCloseEditCard: () => void
  onCloseMoveCard: () => void
  onConfirmBulkAllocation: () => void
  onDeleteCardTargetChange: (deckCard: DeckCardEntry | null) => void
  onConfirmDeckDisassembly: () => void
  onDeleteSelectedCard: () => void
  onDisassemblyOpenChange: (open: boolean) => void
  onDeleteSelectedDeckCards: () => void
  onDeleteSelectedOpenChange: (open: boolean) => void
  onEditCard: (input: DeckCardUpdateInput) => void
  onEditDeckOpenChange: (open: boolean) => void
  onExportDeckOpenChange: (open: boolean) => void
  onImportDeckOpenChange: (open: boolean) => void
  onMissingCardsOpenChange: (open: boolean) => void
  onMoveCard: (zone: DeckZone) => void
  onPreviewCardOpenChange: (open: boolean) => void
  onSetEdhrecState: (tab: EDHRecTab | undefined, excludeLands?: boolean) => void
  onSelectBulkAllocationChoice: (choiceId: string, collectionItemId: string | null) => void
  onShareDeckOpenChange: (open: boolean) => void
  onOptimizePrintingsOpenChange: (open: boolean) => void
  onOptimizePrintingsSubmit: (deckCardIds: string[]) => void
  onAddCardOpenChange: (open: boolean) => void
  previewDeckCard: DeckCardEntry | null
  selectedBulkAllocationItemIds: Record<string, string | null>
  selectedDeckCardCount: number
  shareMode: boolean
  updateDeckCardPending: boolean
  zoneCounts: DetailZoneCounts
}) {
  return (
    <>
      <DeckCardDetailDialog
        deckCard={previewDeckCard}
        onOpenChange={onPreviewCardOpenChange}
        shareMode={shareMode}
      />
      <ShareModeHidden shareMode={shareMode}>
        <EditDeckDialog deck={deck} onOpenChange={onEditDeckOpenChange} open={isEditDeckOpen} />
        <ShareDeckDialog deck={deck} onOpenChange={onShareDeckOpenChange} open={isShareDeckOpen} />
        <AddDeckCardDialog deck={deck} onOpenChange={onAddCardOpenChange} open={isAddCardOpen} />
        <ImportDecklistDialog
          deck={deck}
          onOpenChange={onImportDeckOpenChange}
          open={isImportDeckOpen}
        />
        <ExportDecklistDialog
          deck={deck}
          onOpenChange={onExportDeckOpenChange}
          open={isExportDeckOpen}
        />
        <MissingCardsDialog
          deck={deck}
          onOpenChange={onMissingCardsOpenChange}
          open={isMissingCardsOpen}
        />
        <OptimizePrintingsDialog
          deckCards={deck.deckCards}
          error={optimizePrintingsError}
          isPending={isUpdatingDeckCard}
          onOpenChange={onOptimizePrintingsOpenChange}
          onSubmit={onOptimizePrintingsSubmit}
          open={optimizePrintingsOpen}
        />
        <AutoSortSummaryDialog
          open={Boolean(disassemblyResult)}
          result={disassemblyResult}
          onOpenChange={onDisassemblyOpenChange}
          onApply={onConfirmDeckDisassembly}
          applyLabel="Disassemble deck"
          applyPending={isDisassemblingDeck}
          applyPendingLabel="Disassembling..."
          checkedCountLabel="Cards checked"
          skippedCountLabel="Skipped cards"
          completeDescription="Review where allocated cards were returned."
          completeEmptyDescription="The deck was removed without moving any allocated collection cards."
          completeEmptyTitle="Deck disassembled."
          completeMoveLabel="Returned"
          completeTitle="Deck disassembled"
          disableApplyWhenNoMoves={false}
          dryRunDescription="Preview where allocated cards will return before removing this deck."
          dryRunEmptyDescription="This will still remove the deck and its deck cards."
          dryRunEmptyTitle="No allocated cards to move."
          dryRunMoveLabel="Will return"
          dryRunTitle={`Disassemble ${deck.name}?`}
          showItemMetadata={false}
        />
        <ConfirmDialog
          destructive
          confirmLabel="Delete card"
          open={Boolean(deleteCardTarget)}
          title={`Delete ${deleteCardTarget?.card?.name || "this card"} from this deck?`}
          onConfirm={onDeleteSelectedCard}
          onOpenChange={(open) => !open && onDeleteCardTargetChange(null)}
        />
        <ConfirmDialog
          destructive
          confirmLabel="Delete selected"
          open={isDeleteSelectedOpen}
          title={`Delete ${selectedDeckCardCount} selected cards from this deck?`}
          onConfirm={onDeleteSelectedDeckCards}
          onOpenChange={(open) => {
            if (mayCloseDeleteSelected) onDeleteSelectedOpenChange(open)
          }}
        />
        <EDHRecDialog
          activeTab={edhrecTab || "recs"}
          addCardError={addCardError}
          deck={deck}
          excludeLands={edhrecExcludeLands}
          isAddingCard={isAddingCard}
          onAddCard={onAddEdhrecCard}
          onExcludeLandsChange={(excludeLands) =>
            onSetEdhrecState(edhrecTab || "recs", excludeLands)
          }
          onOpenChange={(open) => {
            if (!open) onSetEdhrecState(undefined, false)
            else onSetEdhrecState(edhrecTab || "recs")
          }}
          onTabChange={(tab) => onSetEdhrecState(tab)}
          open={Boolean(edhrecTab)}
        />
        <BulkAllocationPullListDialog
          error={bulkAllocationError}
          mode={bulkAllocationMode}
          isPending={isBulkAllocating}
          onClose={onCloseBulkAllocation}
          onConfirm={onConfirmBulkAllocation}
          onModeChange={onBulkAllocationModeChange}
          onSelectChoice={onSelectBulkAllocationChoice}
          open={bulkAllocationOpen}
          pullList={bulkAllocationPullList}
          selectedItemIds={selectedBulkAllocationItemIds}
        />

        <MoveDeckCardDialog
          deckCard={moveTarget}
          error={moveError}
          isPending={isUpdatingDeckCard}
          onClose={onCloseMoveCard}
          onMove={onMoveCard}
          zoneCounts={zoneCounts}
        />
        <EditDeckCardDialog
          deckCard={editTarget}
          deckFormat={deck.format}
          error={editError}
          isPending={updateDeckCardPending}
          onClose={onCloseEditCard}
          onSave={onEditCard}
        />
      </ShareModeHidden>
    </>
  )
}
