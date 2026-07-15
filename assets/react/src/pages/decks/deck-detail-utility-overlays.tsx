import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { EditDeckDialog } from "./deck-editor-dialogs"
import type { DeckDetailOverlay } from "./deck-detail-overlay"
import { EDHRecDialog } from "./edhrec"
import { MissingCardsDialog } from "./missing-cards-dialog"
import { OptimizePrintingsDialog } from "./optimize-printings-dialog"
import { ExportDecklistDialog, ImportDecklistDialog, ShareDeckDialog } from "./deck-share-dialogs"
import { SelectFromListDialog } from "./select-from-list-dialog"
import type { DeckDetail, EDHRecAddZone, EDHRecCard, EDHRecSectionCard, EDHRecTab } from "./deck-types"

type DeckDetailUtilityOverlaysProps = {
  addCardError: string | null
  canCloseDeleteSelected: boolean
  deck: DeckDetail
  edhrecExcludeLands: boolean
  edhrecTab?: EDHRecTab
  isAddingCard: boolean
  isOptimizing: boolean
  onAddEdhrecCard: (card: EDHRecCard | EDHRecSectionCard, zone: EDHRecAddZone) => void
  onClose: () => void
  onDeleteSelected: () => void
  onOptimizePrintings: (deckCardIds: string[]) => void
  onSelectDeckCards: (deckCardIds: string[]) => void
  onSetEdhrecState: (tab: EDHRecTab | undefined, excludeLands?: boolean) => void
  overlay: DeckDetailOverlay
  selectedDeckCardCount: number
  shareMode: boolean
}

export function DeckDetailUtilityOverlays({
  addCardError,
  canCloseDeleteSelected,
  deck,
  edhrecExcludeLands,
  edhrecTab,
  isAddingCard,
  isOptimizing,
  onAddEdhrecCard,
  onClose,
  onDeleteSelected,
  onOptimizePrintings,
  onSelectDeckCards,
  onSetEdhrecState,
  overlay,
  selectedDeckCardCount,
  shareMode,
}: DeckDetailUtilityOverlaysProps) {
  if (shareMode) return null

  return (
    <>
      {overlay.kind === "edit-deck" ? <EditDeckDialog deck={deck} open onOpenChange={(open) => !open && onClose()} /> : null}
      {overlay.kind === "share-deck" ? <ShareDeckDialog deck={deck} open onOpenChange={(open) => !open && onClose()} /> : null}
      {overlay.kind === "import-deck" ? <ImportDecklistDialog deck={deck} open onOpenChange={(open) => !open && onClose()} /> : null}
      {overlay.kind === "export-deck" ? <ExportDecklistDialog deck={deck} open onOpenChange={(open) => !open && onClose()} /> : null}
      {overlay.kind === "missing-cards" ? <MissingCardsDialog deck={deck} open onOpenChange={(open) => !open && onClose()} /> : null}
      {overlay.kind === "select-from-list" ? (
        <SelectFromListDialog
          deckCards={deck.deckCards}
          open
          onOpenChange={(open) => !open && onClose()}
          onSelect={onSelectDeckCards}
        />
      ) : null}
      {overlay.kind === "optimize-printings" ? (
        <OptimizePrintingsDialog
          deckCards={deck.deckCards}
          error={overlay.error}
          isPending={isOptimizing}
          open
          onOpenChange={(open) => !open && !isOptimizing && onClose()}
          onSubmit={onOptimizePrintings}
        />
      ) : null}
      {overlay.kind === "delete-selected" ? (
        <ConfirmDialog
          destructive
          confirmLabel="Delete selected"
          open
          title={`Delete ${selectedDeckCardCount} selected cards from this deck?`}
          onConfirm={onDeleteSelected}
          onOpenChange={(open) => {
            if (!open && canCloseDeleteSelected) onClose()
          }}
        />
      ) : null}
      {overlay.kind === "edhrec" ? (
        <EDHRecDialog
          activeTab={edhrecTab || "recs"}
          addCardError={addCardError}
          deck={deck}
          excludeLands={edhrecExcludeLands}
          isAddingCard={isAddingCard}
          open
          onAddCard={onAddEdhrecCard}
          onExcludeLandsChange={(excludeLands) => onSetEdhrecState(edhrecTab || "recs", excludeLands)}
          onOpenChange={(open) => {
            if (!open) {
              onSetEdhrecState(undefined, false)
              onClose()
            }
          }}
          onTabChange={(tab) => onSetEdhrecState(tab)}
        />
      ) : null}
    </>
  )
}
