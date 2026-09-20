import type { Dispatch, SetStateAction } from "react"

import { DeckDetailBulkAllocationOverlay } from "./deck-detail-bulk-allocation-overlay"
import { DeckDetailCardOverlays } from "./deck-detail-card-overlays"
import { DeckDetailDisassemblyOverlay } from "./deck-detail-disassembly-overlay"
import {
  NO_DECK_DETAIL_OVERLAY,
  type DeckDetailOverlay,
  updateBulkAllocationOverlay,
} from "./deck-detail-overlay"
import { DeckDetailShareOverlays } from "./deck-detail-share-overlays"
import { DeckDetailShortcutsOverlay } from "./deck-detail-shortcuts-overlay"
import { DeckDetailUtilityOverlays } from "./deck-detail-utility-overlays"
import type { useDeckDetailSelection } from "./detail-page-selection"
import type {
  DeckCardEntry,
  DeckDetail,
  EDHRecAddZone,
  EDHRecTab,
  EDHRecThemeSelection,
  RecommendedCardLike,
} from "./deck-types"
import type { useDeckMutations } from "./use-deck-mutations"

type Mutations = ReturnType<typeof useDeckMutations>
type Selection = ReturnType<typeof useDeckDetailSelection>

export function DeckDetailDialogLauncher({
  canEdit,
  deck,
  deckCards,
  edhrecExcludeLands,
  edhrecTab,
  edhrecTheme,
  mutations,
  onAddEdhrecCard,
  onSetEdhrecState,
  overlay,
  selection,
  setOverlay,
  shareMode,
  shareToken,
  zoneCounts,
}: {
  canEdit: boolean
  deck: DeckDetail
  deckCards: DeckCardEntry[]
  edhrecExcludeLands: boolean
  edhrecTab?: EDHRecTab
  edhrecTheme?: EDHRecThemeSelection
  mutations: Mutations
  onAddEdhrecCard: (card: RecommendedCardLike, zone: EDHRecAddZone) => void
  onSetEdhrecState: (state: {
    tab?: EDHRecTab
    excludeLands?: boolean
    theme?: EDHRecThemeSelection | null
  }) => void
  overlay: DeckDetailOverlay
  selection: Selection
  setOverlay: Dispatch<SetStateAction<DeckDetailOverlay>>
  shareMode: boolean
  shareToken: string
  zoneCounts: ReturnType<typeof import("./deck-card-model").countDeckZones>
}) {
  const { allocation, bulk, card, disassembly } = mutations
  const close = () => setOverlay(NO_DECK_DETAIL_OVERLAY)

  return (
    <>
      <DeckDetailCardOverlays
        deck={deck}
        isDeleting={card.isDeletingCard}
        isUpdating={card.isUpdatingCard}
        onClose={close}
        onDelete={card.deleteDeckCard}
        onMove={(deckCardId, zone) => card.updateDeckCard(deckCardId, { zone }, "move-card")}
        onSave={(deckCardId, input) => card.updateDeckCard(deckCardId, input, "edit-card")}
        overlay={overlay}
        shareMode={shareMode}
        zoneCounts={zoneCounts}
      />
      <DeckDetailUtilityOverlays
        addCardError={card.addCardError || card.tagError || card.deleteError}
        canCloseDeleteSelected={!bulk.isDeleting}
        deck={deck}
        edhrecExcludeLands={edhrecExcludeLands}
        edhrecTheme={edhrecTheme}
        edhrecTab={edhrecTab}
        isAddingCard={card.isAddingCard}
        isUpdatingCard={card.isPending}
        isOptimizing={allocation.isOptimizingPrintings}
        onAddEdhrecCard={onAddEdhrecCard}
        onConsiderCuttingEdhrecCard={(deckCard) => card.tagDeckCard(deckCard, "consider_cutting")}
        onClose={close}
        onCutEdhrecCard={card.deleteDeckCard}
        onDeleteSelected={() => {
          if (selection.selectedDeckCardIdList.length) {
            bulk.remove(selection.selectedDeckCardIdList, close)
          }
        }}
        onOptimizePrintings={(deckCardIds) =>
          allocation.optimizePrintings(deckCardIds, {
            onError: (error) =>
              setOverlay((current) =>
                current.kind === "optimize-printings" ? { ...current, error } : current,
              ),
            onSuccess: close,
          })
        }
        onSelectDeckCards={(deckCardIds) => {
          selection.selectDeckCardIds(deckCardIds)
          close()
        }}
        onSetEdhrecState={onSetEdhrecState}
        overlay={overlay}
        selectedDeckCardCount={selection.selectedDeckCardCount}
        shareMode={shareMode}
      />
      <DeckDetailBulkAllocationOverlay
        deck={deck}
        isPending={allocation.isBulkAllocating}
        onClose={close}
        onConfirm={(entries) =>
          allocation.allocatePullList(deck, entries, {
            onError: (error) =>
              setOverlay((current) => updateBulkAllocationOverlay(current, { error })),
            onSkipped: (error) =>
              setOverlay((current) => updateBulkAllocationOverlay(current, { error })),
            onSuccess: close,
          })
        }
        onOverlayChange={setOverlay}
        overlay={canEdit ? overlay : NO_DECK_DETAIL_OVERLAY}
      />
      <DeckDetailDisassemblyOverlay
        deck={deck}
        isApplying={disassembly.isApplying}
        onApply={() => disassembly.apply(deck.id)}
        onClose={close}
        overlay={canEdit ? overlay : NO_DECK_DETAIL_OVERLAY}
      />
      <DeckDetailShareOverlays
        deck={deck}
        deckCards={deckCards}
        onClose={close}
        overlay={overlay}
        shareMode={shareMode}
        shareToken={shareToken}
      />
      <DeckDetailShortcutsOverlay onClose={close} overlay={overlay} />
    </>
  )
}
