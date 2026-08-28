import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { DeckCombosDialog } from "./deck-combos-dialog"
import { DeckCompareDialog } from "./deck-compare-dialog"
import { EditDeckDialog } from "./deck-editor-dialogs"
import type { DeckDetailOverlay } from "./deck-detail-overlay"
import { EDHRecDialog } from "./edhrec"
import { MissingCardsDialog } from "./missing-cards-dialog"
import { RecommanderDialog } from "./recommander"
import { OptimizePrintingsDialog } from "./optimize-printings-dialog"
import { ExportDecklistDialog, ImportDecklistDialog, ShareDeckDialog } from "./deck-share-dialogs"
import { SelectFromListDialog } from "./select-from-list-dialog"
import type {
  DeckCardEntry,
  DeckDetail,
  EDHRecAddZone,
  EDHRecTab,
  EDHRecThemeSelection,
  RecommendedCardLike,
} from "./deck-types"

type DeckDetailUtilityOverlaysProps = {
  addCardError: string | null
  canCloseDeleteSelected: boolean
  deck: DeckDetail
  edhrecExcludeLands: boolean
  edhrecTheme?: EDHRecThemeSelection
  edhrecTab?: EDHRecTab
  isAddingCard: boolean
  isUpdatingCard: boolean
  isOptimizing: boolean
  onAddEdhrecCard: (card: RecommendedCardLike, zone: EDHRecAddZone) => void
  onConsiderCuttingEdhrecCard: (deckCard: DeckCardEntry) => void
  onClose: () => void
  onCutEdhrecCard: (deckCardId: string) => void
  onDeleteSelected: () => void
  onOptimizePrintings: (deckCardIds: string[]) => void
  onSelectDeckCards: (deckCardIds: string[]) => void
  onSetEdhrecState: (state: {
    tab?: EDHRecTab
    excludeLands?: boolean
    theme?: EDHRecThemeSelection | null
  }) => void
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
  edhrecTheme,
  isAddingCard,
  isUpdatingCard,
  isOptimizing,
  onAddEdhrecCard,
  onConsiderCuttingEdhrecCard,
  onClose,
  onCutEdhrecCard,
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
      {overlay.kind === "combos" ? (
        <DeckCombosDialog deck={deck} open onOpenChange={(open) => !open && onClose()} />
      ) : null}
      {overlay.kind === "edit-deck" ? (
        <EditDeckDialog deck={deck} open onOpenChange={(open) => !open && onClose()} />
      ) : null}
      {overlay.kind === "share-deck" ? (
        <ShareDeckDialog deck={deck} open onOpenChange={(open) => !open && onClose()} />
      ) : null}
      {overlay.kind === "import-deck" ? (
        <ImportDecklistDialog deck={deck} open onOpenChange={(open) => !open && onClose()} />
      ) : null}
      {overlay.kind === "export-deck" ? (
        <ExportDecklistDialog deck={deck} open onOpenChange={(open) => !open && onClose()} />
      ) : null}
      {overlay.kind === "compare-deck" ? (
        <DeckCompareDialog
          deckId={deck.id}
          deckName={deck.name}
          open
          onOpenChange={(open) => !open && onClose()}
        />
      ) : null}
      {overlay.kind === "missing-cards" ? (
        <MissingCardsDialog deck={deck} open onOpenChange={(open) => !open && onClose()} />
      ) : null}
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
      {overlay.kind === "recommander" ? (
        <RecommanderDialog
          addCardError={addCardError}
          deck={deck}
          isAddingCard={isAddingCard}
          open
          onAddCard={onAddEdhrecCard}
          onOpenChange={(open) => !open && onClose()}
        />
      ) : null}
      {overlay.kind === "edhrec" ? (
        <EDHRecDialog
          activeTab={edhrecTab || "recs"}
          addCardError={addCardError}
          deck={deck}
          excludeLands={edhrecExcludeLands}
          selectedTheme={edhrecTheme}
          isAddingCard={isAddingCard}
          isUpdatingCard={isUpdatingCard}
          open
          onAddCard={onAddEdhrecCard}
          onConsiderCuttingCard={onConsiderCuttingEdhrecCard}
          onCutCard={onCutEdhrecCard}
          onExcludeLandsChange={(excludeLands) =>
            onSetEdhrecState({ tab: edhrecTab || "recs", excludeLands })
          }
          onOpenChange={(open) => {
            if (!open) {
              onSetEdhrecState({ tab: undefined, excludeLands: false, theme: null })
              onClose()
            }
          }}
          onTabChange={(tab) => onSetEdhrecState({ tab })}
          onThemeChange={(theme) => onSetEdhrecState({ tab: "commander", theme })}
        />
      ) : null}
    </>
  )
}
