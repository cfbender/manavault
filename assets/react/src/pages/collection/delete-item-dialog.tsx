import { useMutation } from "@apollo/client/react"
import { Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { useToast } from "../../components/ui/toast"
import { pluralize } from "../../lib/utils"
import { BulkDeleteCollectionItemsDocument } from "./documents"
import {
  collectionTargetCount,
  collectionTargetLabel,
  collectionTargetSelector,
  type CollectionItemTarget,
} from "./item-target"

export function DeleteCollectionItemDialog({
  item,
  onDone,
  onOpenChange,
}: {
  item: CollectionItemTarget
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const { showToast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const targetCount = collectionTargetCount(item)
  const open = targetCount > 0
  const [deleteItemsMutation, deleteItems] = useMutation(BulkDeleteCollectionItemsDocument)

  useEffect(() => {
    if (!open) setError(null)
  }, [open])

  function deleteTargetItems() {
    setError(null)

    if (!targetCount) {
      setError("Choose at least one item")
      return
    }

    void deleteItemsMutation({
      variables: { selector: collectionTargetSelector(item) },
      onCompleted: (data) => {
        const deleted = data.bulkDeleteCollectionItems?.deletedCount ?? targetCount
        showToast(`${pluralize(deleted, "card")} deleted`)
        onDone()
        onOpenChange(false)
      },
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not delete collection items"),
    })
  }

  function close() {
    if (deleteItems.loading) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-lg" labelledBy="delete-collection-item-title">
        <DialogHeader>
          <div>
            <DialogTitle id="delete-collection-item-title">
              {targetCount > 1 ? "Delete collection items" : "Delete collection item"}
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{collectionTargetLabel(item)}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <div className="space-y-4 p-5">
          <p className="text-sm text-base-content/70">
            {targetCount > 1
              ? "Remove these owned printings from your collection."
              : "Remove this owned printing from your collection."}
          </p>
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={deleteItems.loading}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deleteTargetItems}
              disabled={deleteItems.loading}
            >
              <Trash2 className="h-4 w-4" />
              {deleteItems.loading
                ? "Deleting..."
                : targetCount > 1
                  ? `Delete ${targetCount}`
                  : "Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
