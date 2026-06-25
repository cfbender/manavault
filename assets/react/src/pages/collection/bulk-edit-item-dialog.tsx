import { useMutation } from "@tanstack/react-query"
import type * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import type { CollectionItemUpdateInput } from "../../gql/graphql"
import { request } from "../../lib/graphql"
import { COLLECTION_FINISHES } from "./constants"
import { BulkUpdateCollectionItemsDocument } from "./documents"
import { buildBulkCollectionItemUpdateInput } from "./bulk-edit-input"
import { collectionFinishValue } from "./form-helpers"
import { CollectionFinishField, type CollectionFinishOption } from "./item-form-fields"
import {
  collectionTargetItems,
  collectionTargetLabel,
  type CollectionItemTarget,
} from "./item-target"
import type { CollectionItem } from "./types"

export function BulkEditCollectionItemsDialog({
  item,
  onDone,
  onOpenChange,
}: {
  item: CollectionItemTarget
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const targetItems = useMemo(() => collectionTargetItems(item), [item])
  const targetCount = targetItems.length
  const commonFinish = useMemo(() => commonCollectionFinish(targetItems), [targetItems])
  const open = targetCount > 0
  const [updateFinish, setUpdateFinish] = useState(false)
  const [finish, setFinish] = useState<CollectionFinishOption>("nonfoil")
  const [updatePurchasePrice, setUpdatePurchasePrice] = useState(false)
  const [purchasePrice, setPurchasePrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const hasSelectedFields = updateFinish || updatePurchasePrice
  const updateItems = useMutation({
    mutationFn: (input: CollectionItemUpdateInput) => {
      if (!targetItems.length) throw new Error("Choose at least one item")

      return request(BulkUpdateCollectionItemsDocument, {
        ids: targetItems.map((targetItem) => targetItem.id),
        input,
      })
    },
    onSuccess: () => {
      onDone()
      close()
    },
    onError: (error) =>
      setError(error instanceof Error ? error.message : "Could not update collection items"),
  })

  useEffect(() => {
    if (open) {
      setUpdateFinish(false)
      setFinish(commonFinish)
      setUpdatePurchasePrice(false)
      setPurchasePrice("")
      setError(null)
      return
    }

    setUpdateFinish(false)
    setFinish("nonfoil")
    setUpdatePurchasePrice(false)
    setPurchasePrice("")
    setError(null)
  }, [commonFinish, open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const result = buildBulkCollectionItemUpdateInput({
      finish,
      purchasePrice,
      updateFinish,
      updatePurchasePrice,
    })

    if (!result.ok) {
      setError(result.error)
      return
    }

    updateItems.mutate(result.input)
  }

  function close() {
    if (updateItems.isPending) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-lg" labelledBy="bulk-edit-collection-items-title">
        <DialogHeader>
          <div>
            <DialogTitle id="bulk-edit-collection-items-title">
              Bulk edit collection items
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{collectionTargetLabel(item)}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <form className="space-y-4 p-4 sm:p-5" onSubmit={submit}>
          <p className="text-sm text-base-content/70">
            Only checked fields are changed on every selected item.
          </p>

          <fieldset className="space-y-3 rounded-box border border-base-300 p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary mt-0.5"
                checked={updateFinish}
                onChange={(event) => setUpdateFinish(event.target.checked)}
                autoFocus
              />
              <span>
                <span className="block text-sm font-black uppercase tracking-[0.18em] text-accent">
                  Finish
                </span>
                <span className="block text-xs leading-tight text-base-content/55">
                  Set one finish across the selected items.
                </span>
              </span>
            </label>
            <fieldset disabled={!updateFinish} className={!updateFinish ? "opacity-60" : undefined}>
              <CollectionFinishField
                options={COLLECTION_FINISHES}
                value={finish}
                onChange={setFinish}
              />
            </fieldset>
          </fieldset>

          <fieldset className="space-y-3 rounded-box border border-base-300 p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary mt-0.5"
                checked={updatePurchasePrice}
                onChange={(event) => setUpdatePurchasePrice(event.target.checked)}
              />
              <span>
                <span className="block text-sm font-black uppercase tracking-[0.18em] text-accent">
                  Purchase price
                </span>
                <span className="block text-xs leading-tight text-base-content/55">
                  Apply one purchase price to every selected item. Leave blank to clear it.
                </span>
              </span>
            </label>
            <Input
              className="h-9 min-h-9"
              inputMode="decimal"
              value={purchasePrice}
              disabled={!updatePurchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              placeholder="12.34"
            />
          </fieldset>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={updateItems.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateItems.isPending || !hasSelectedFields}>
              {updateItems.isPending ? "Applying..." : "Apply changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function commonCollectionFinish(items: CollectionItem[]): CollectionFinishOption {
  const firstFinish = collectionFinishValue(items[0]?.finish || "nonfoil")
  const allMatch = items.every((item) => collectionFinishValue(item.finish) === firstFinish)

  return allMatch ? firstFinish : "nonfoil"
}
