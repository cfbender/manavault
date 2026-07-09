import { CardAddDialog } from "../card-add-dialog"
import type { DeckDetail } from "./deck-types"

export function AddDeckCardDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return <CardAddDialog mode="deck" deck={deck} open={open} onOpenChange={onOpenChange} />
}
