import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import type { DeckCardUpdateInput } from "../../gql/graphql"
import { AddDeckCardDialog } from "./add-card-dialog"
import { BulkAllocationPreviewDialog } from "./bulk-allocation"
import { ShareModeHidden } from "./deck-actions"
import { EditDeckCardDialog, MoveDeckCardDialog } from "./deck-card-dialogs"
import { DeckCardPreviewDialog } from "./deck-card-preview-dialog"
import { EditDeckDialog } from "./deck-editor-dialogs"
import { ExportDecklistDialog, ImportDecklistDialog, ShareDeckDialog } from "./deck-share-dialogs"
import type {
  BulkAllocationMode,
  BulkAllocationPreview,
  DeckCardEntry,
  DeckDetail,
  DeckZone,
  EDHRecAddZone,
  EDHRecCard,
  EDHRecSectionCard,
  EDHRecTab,
} from "./deck-types"
import type { DetailZoneCounts } from "./detail-page-content"
import { EDHRecDialog } from "./edhrec"
import { MissingCardsDialog } from "./missing-cards-dialog"

export function DeckDetailDialogs({
  addCardError,
  bulkAllocationError,
  bulkAllocationPreview,
  deck,
  deleteCardTarget,
  editError,
  editTarget,
  edhrecExcludeLands,
  edhrecTab,
  isAddCardOpen,
  isBulkAllocating,
  isDeleteDeckOpen,
  isAddingCard,
  isDeleteSelectedOpen,
  isEditDeckOpen,
  isExportDeckOpen,
  isImportDeckOpen,
  isMissingCardsOpen,
  isShareDeckOpen,
  isUpdatingDeckCard,
  mayCloseDeleteSelected,
  moveError,
  moveTarget,
  onAddEdhrecCard,
  onCloseBulkAllocationPreview,
  onCloseEditCard,
  onCloseMoveCard,
  onConfirmBulkAllocation,
  onDeleteCardTargetChange,
  onDeleteCurrentDeck,
  onDeleteSelectedCard,
  onDeleteDeckOpenChange,
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
  onShareDeckOpenChange,
  onAddCardOpenChange,
  previewDeckCard,
  previewDeckCards,
  selectedDeckCardCount,
  shareMode,
  updateDeckCardPending,
  zoneCounts,
}: {
  addCardError: string | null
  bulkAllocationError: string | null
  bulkAllocationPreview: BulkAllocationPreview | null
  deck: DeckDetail
  deleteCardTarget: DeckCardEntry | null
  editError: string | null
  editTarget: DeckCardEntry | null
  edhrecExcludeLands: boolean
  edhrecTab?: EDHRecTab
  isAddCardOpen: boolean
  isBulkAllocating: boolean
  isAddingCard: boolean
  isDeleteDeckOpen: boolean
  isDeleteSelectedOpen: boolean
  isEditDeckOpen: boolean
  isExportDeckOpen: boolean
  isImportDeckOpen: boolean
  isMissingCardsOpen: boolean
  isShareDeckOpen: boolean
  isUpdatingDeckCard: boolean
  mayCloseDeleteSelected: boolean
  moveError: string | null
  moveTarget: DeckCardEntry | null
  onAddEdhrecCard: (card: EDHRecCard | EDHRecSectionCard, zone: EDHRecAddZone) => void
  onCloseBulkAllocationPreview: () => void
  onCloseEditCard: () => void
  onCloseMoveCard: () => void
  onConfirmBulkAllocation: (mode: BulkAllocationMode) => void
  onDeleteCardTargetChange: (deckCard: DeckCardEntry | null) => void
  onDeleteCurrentDeck: () => void
  onDeleteDeckOpenChange: (open: boolean) => void
  onDeleteSelectedCard: () => void
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
  onShareDeckOpenChange: (open: boolean) => void
  onAddCardOpenChange: (open: boolean) => void
  previewDeckCard: DeckCardEntry | null
  previewDeckCards: DeckCardEntry[]
  selectedDeckCardCount: number
  shareMode: boolean
  updateDeckCardPending: boolean
  zoneCounts: DetailZoneCounts
}) {
  return (
    <>
      <DeckCardPreviewDialog
        deckCard={previewDeckCard}
        deckCards={previewDeckCards}
        onOpenChange={onPreviewCardOpenChange}
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
        <ConfirmDialog
          destructive
          confirmLabel="Delete deck"
          open={isDeleteDeckOpen}
          title={`Delete ${deck.name}?`}
          onConfirm={onDeleteCurrentDeck}
          onOpenChange={onDeleteDeckOpenChange}
        >
          This removes the deck and returns allocated cards to their original locations.
        </ConfirmDialog>
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
        <BulkAllocationPreviewDialog
          error={bulkAllocationError}
          isPending={isBulkAllocating}
          onClose={onCloseBulkAllocationPreview}
          onConfirm={onConfirmBulkAllocation}
          preview={bulkAllocationPreview}
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
