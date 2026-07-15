import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import type { DeckCardUpdateInput } from "../../gql/graphql"
import { AddDeckCardDialog } from "./add-card-dialog"
import { EditDeckCardDialog, MoveDeckCardDialog } from "./deck-card-dialogs"
import { DeckCardDetailDialog } from "./deck-card-detail-dialog"
import type { DeckDetailOverlay } from "./deck-detail-overlay"
import type { DetailZoneCounts } from "./deck-detail-types"
import type { DeckDetail, DeckZone } from "./deck-types"

type DeckDetailCardOverlaysProps = {
  deck: DeckDetail
  isDeleting: boolean
  isUpdating: boolean
  onClose: () => void
  onDelete: (deckCardId: string) => void
  onMove: (deckCardId: string, zone: DeckZone) => void
  onSave: (deckCardId: string, input: DeckCardUpdateInput) => void
  overlay: DeckDetailOverlay
  shareMode: boolean
  zoneCounts: DetailZoneCounts
}

export function DeckDetailCardOverlays({
  deck,
  isDeleting,
  isUpdating,
  onClose,
  onDelete,
  onMove,
  onSave,
  overlay,
  shareMode,
  zoneCounts,
}: DeckDetailCardOverlaysProps) {
  return (
    <>
      <DeckCardDetailDialog
        deckCard={overlay.kind === "preview-card" ? overlay.deckCard : null}
        onOpenChange={(open) => !open && onClose()}
        shareMode={shareMode}
      />
      {!shareMode && overlay.kind === "add-card" ? (
        <AddDeckCardDialog deck={deck} open onOpenChange={(open) => !open && onClose()} />
      ) : null}
      {!shareMode && overlay.kind === "edit-card" ? (
        <EditDeckCardDialog
          deckCard={overlay.deckCard}
          deckFormat={deck.format}
          error={overlay.error}
          isPending={isUpdating}
          onClose={onClose}
          onSave={(input) => onSave(overlay.deckCard.id, input)}
        />
      ) : null}
      {!shareMode && overlay.kind === "move-card" ? (
        <MoveDeckCardDialog
          deckCard={overlay.deckCard}
          error={overlay.error}
          isPending={isUpdating}
          onClose={onClose}
          onMove={(zone) => onMove(overlay.deckCard.id, zone)}
          zoneCounts={zoneCounts}
        />
      ) : null}
      {!shareMode && overlay.kind === "delete-card" ? (
        <ConfirmDialog
          destructive
          confirmLabel="Delete card"
          open
          title={`Delete ${overlay.deckCard.card?.name || "this card"} from this deck?`}
          onConfirm={() => onDelete(overlay.deckCard.id)}
          onOpenChange={(open) => {
            if (!open && !isDeleting) onClose()
          }}
        />
      ) : null}
    </>
  )
}
