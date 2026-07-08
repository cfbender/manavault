import { useMutation, useQuery } from "@apollo/client/react"
import { Trash2 } from "lucide-react"
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
import { useToast } from "../../components/ui/toast"
import { pluralize, present, titleize } from "../../lib/utils"
import { COLLECTION_CONDITIONS, COLLECTION_FINISHES } from "./constants"
import { CollectionItemFormOptionsDocument, UpdateCollectionItemDocument } from "./documents"
import {
  centsToCurrencyInput,
  collectionConditionValue,
  collectionFinishValue,
  parseCurrencyInputCents,
} from "./form-helpers"
import { CollectionFinishField, CollectionQuantityField } from "./item-form-fields"
import { isUnfiledLocation } from "./location-summary"
import type { CollectionItem } from "./types"
import { collectionValueGainClass } from "./value-summary"

export function EditCollectionItemDialog({
  item,
  onDone,
  onOpenChange,
  onDelete,
}: {
  item: CollectionItem | null
  onDone: () => void
  onOpenChange: (open: boolean) => void
  onDelete?: (item: CollectionItem) => void
}) {
  const { showToast } = useToast()
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState<(typeof COLLECTION_CONDITIONS)[number]>("near_mint")
  const [finish, setFinish] = useState<(typeof COLLECTION_FINISHES)[number]>("nonfoil")
  const [language, setLanguage] = useState("en")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const open = Boolean(item)
  const optionsQuery = useQuery(CollectionItemFormOptionsDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const locations = useMemo(
    () => optionsQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) || [],
    [optionsQuery.data],
  )
  const [updateItemMutation, updateItem] = useMutation(UpdateCollectionItemDocument)

  useEffect(() => {
    if (item) {
      setQuantity(item.quantity || 1)
      setCondition(collectionConditionValue(item.condition))
      setFinish(collectionFinishValue(item.finish))
      setLanguage(item.language || "en")
      setLocationId(item.location?.id || "")
      setNotes(item.notes || "")
      setPurchasePrice(centsToCurrencyInput(item.purchasePriceCents))
      setError(null)
    }
  }, [item])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (quantity < 1) {
      setError("Quantity must be at least 1")
      return
    }

    const purchasePriceCents = parseCurrencyInputCents(purchasePrice)
    if (purchasePriceCents === undefined) {
      setError("Purchase price must be a dollar amount")
      return
    }

    if (!item) {
      setError("Collection item is required")
      return
    }

    void updateItemMutation({
      variables: {
        id: item.id,
        input: {
          quantity,
          condition,
          finish,
          language: language.trim() || "en",
          locationId: locationId || null,
          notes: notes.trim() || null,
          purchasePriceCents,
        },
      },
      onCompleted: () => {
        showToast(`${pluralize(1, "card")} edited`)
        onDone()
        onOpenChange(false)
      },
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not update collection item"),
    })
  }

  function close() {
    if (updateItem.loading) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-2xl" labelledBy="edit-collection-item-title">
        <DialogHeader>
          <div>
            <DialogTitle id="edit-collection-item-title">Edit collection item</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {item?.printing?.card?.name || "Collection item"}
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <form className="space-y-3 p-4 sm:p-5" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <CollectionQuantityField value={quantity} onChange={setQuantity} autoFocus />
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Language
              </span>
              <Input
                className="h-9 min-h-9"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Condition
              </span>
              <select
                className="select select-bordered h-9 min-h-9 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={condition}
                onChange={(event) => setCondition(collectionConditionValue(event.target.value))}
              >
                {COLLECTION_CONDITIONS.map((value) => (
                  <option key={value} value={value}>
                    {titleize(value)}
                  </option>
                ))}
              </select>
            </label>
            <CollectionFinishField
              options={COLLECTION_FINISHES}
              value={finish}
              onChange={setFinish}
            />
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Purchase price
              </span>
              <Input
                className="h-9 min-h-9"
                inputMode="decimal"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(event.target.value)}
                placeholder="Current market price"
              />
              <span className="block text-xs leading-tight text-base-content/55">
                Current {item?.priceText || "unknown"}
                {item?.valueGainText ? (
                  <>
                    {" · Gain "}
                    <span className={collectionValueGainClass(item.valueGainText)}>
                      {item.valueGainText}
                      {item.valueGainPercentText ? ` (${item.valueGainPercentText})` : ""}
                    </span>
                  </>
                ) : null}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Location
              </span>
              <select
                className="select select-bordered h-9 min-h-9 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">Unfiled</option>
                {locations
                  .filter((location) => !isUnfiledLocation(location))
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({titleize(location.kind)})
                    </option>
                  ))}
              </select>
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Notes
              </span>
              <textarea
                className="textarea textarea-bordered min-h-16 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onDelete && item ? (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                onClick={() => {
                  onOpenChange(false)
                  onDelete(item)
                }}
                disabled={updateItem.loading}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={close} disabled={updateItem.loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateItem.loading}>
              {updateItem.loading ? "Saving..." : "Save item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
