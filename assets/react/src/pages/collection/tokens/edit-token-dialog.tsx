import { useMutation } from "@apollo/client/react"
import { useEffect, useState, type FormEvent } from "react"
import { Button } from "../../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { useToast } from "../../../components/ui/toast"
import { present } from "../../../lib/utils"
import { collectionFinishValue } from "../form-helpers"
import {
  CollectionFinishField,
  CollectionQuantityField,
  type CollectionFinishOption,
} from "../item-form-fields"
import type { TokenItem } from "../types"
import { UpdateTokenItemDocument } from "./documents"
import { tokenItemName } from "./token-item-name"

export function EditTokenDialog({
  item,
  onOpenChange,
  onSaved,
}: {
  item: TokenItem | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [quantity, setQuantity] = useState(1)
  const [finish, setFinish] = useState<CollectionFinishOption>("nonfoil")
  const [error, setError] = useState<string | null>(null)
  const [updateTokenItem, updateResult] = useMutation(UpdateTokenItemDocument)
  const finishOptions = (item?.printing.finishes?.filter(present) ?? []).map(collectionFinishValue)

  useEffect(() => {
    if (!item) return
    setQuantity(item.quantity)
    setFinish(collectionFinishValue(item.finish))
    setError(null)
  }, [item])

  function close() {
    if (updateResult.loading) return
    onOpenChange(false)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!item) return
    setError(null)
    if (quantity < 1) return setError("Quantity must be at least 1")

    void updateTokenItem({
      variables: { id: item.id, input: { quantity, finish } },
      onCompleted: () => {
        showToast(`${tokenItemName(item)} updated`)
        onSaved()
        onOpenChange(false)
      },
      onError: (error) => setError(error.message || "Could not update token"),
    })
  }

  return (
    <Dialog open={item !== null} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-lg" labelledBy="edit-token-dialog-title">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle id="edit-token-dialog-title">Edit token</DialogTitle>
            {item ? (
              <p className="mt-1 truncate text-sm text-base-content/60">
                {tokenItemName(item)} · {item.printing.setCode?.toUpperCase()} #
                {item.printing.collectorNumber}
              </p>
            ) : null}
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <CollectionQuantityField autoFocus value={quantity} onChange={setQuantity} />
            <CollectionFinishField options={finishOptions} value={finish} onChange={setFinish} />
          </div>
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={updateResult.loading} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateResult.loading}>
              {updateResult.loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
