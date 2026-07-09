import { CardAddDialog } from "../card-add-dialog"
import type { AddCollectionItemInitialPrinting } from "./types"

export function AddCollectionItemDialog({
  initialPrinting,
  onOpenChange,
  open,
}: {
  initialPrinting?: AddCollectionItemInitialPrinting | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return (
    <CardAddDialog
      mode="collection"
      initialPrinting={initialPrinting}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}
