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
import {
  SELECT_NONE_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { Textarea } from "../../components/ui/textarea"
import { useToast } from "../../components/ui/toast"
import { pluralize, present, titleize } from "../../lib/utils"
import { COLLECTION_CONDITIONS, COLLECTION_FINISHES } from "./constants"
import {
  CollectionItemFormOptionsDocument,
  CollectionItemPrintingsDocument,
  UpdateCollectionItemDocument,
} from "./documents"
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
  const [printingId, setPrintingId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const open = Boolean(item)
  const optionsQuery = useQuery(CollectionItemFormOptionsDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const printingsQuery = useQuery(CollectionItemPrintingsDocument, {
    variables: { cardId: item?.printing?.card?.id || "" },
    skip: !item?.printing?.card?.id,
  })
  const locations = useMemo(
    () => optionsQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) || [],
    [optionsQuery.data],
  )
  const printings = useMemo(
    () =>
      printingsQuery.data?.card?.printings?.edges?.map((edge) => edge?.node).filter(present) || [],
    [printingsQuery.data],
  )
  const selectedPrinting = printings.find((printing) => printing.id === printingId)
  const finishOptions = printingFinishOptions(selectedPrinting?.finishes)
  const [updateItemMutation, updateItem] = useMutation(UpdateCollectionItemDocument)

  useEffect(() => {
    if (item) {
      setQuantity(item.quantity || 1)
      setCondition(collectionConditionValue(item.condition))
      setFinish(collectionFinishValue(item.finish))
      setLanguage(item.language || "en")
      setPrintingId(item.printing?.id || "")
      setLocationId(item.location?.id || "")
      setNotes(item.notes || "")
      setPurchasePrice(centsToCurrencyInput(item.purchasePriceCents))
      setError(null)
    }
  }, [item])

  function selectPrinting(nextPrintingId: string) {
    setPrintingId(nextPrintingId)

    const printing = printings.find((option) => option.id === nextPrintingId)
    const availableFinishes = printingFinishOptions(printing?.finishes)

    if (!availableFinishes.includes(finish)) {
      setFinish(availableFinishes[0])
    }
  }

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
          scryfallId: printingId,
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
                Printing
              </span>
              <Select
                value={printingId}
                onValueChange={selectPrinting}
                disabled={printingsQuery.loading || printings.length === 0}
              >
                <SelectTrigger className="h-9 min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {printings.length === 0 && item?.printing ? (
                    <SelectItem value={item.printing.id}>{printingLabel(item.printing)}</SelectItem>
                  ) : null}
                  {printings.map((printing) => (
                    <SelectItem key={printing.id} value={printing.id}>
                      {printingLabel(printing)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
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
              <Select
                value={condition}
                onValueChange={(value) => setCondition(collectionConditionValue(value))}
              >
                <SelectTrigger className="h-9 min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLLECTION_CONDITIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {titleize(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <CollectionFinishField options={finishOptions} value={finish} onChange={setFinish} />
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
              <Select
                value={locationId || SELECT_NONE_VALUE}
                onValueChange={(value) => setLocationId(value === SELECT_NONE_VALUE ? "" : value)}
              >
                <SelectTrigger className="h-9 min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE_VALUE}>Unfiled</SelectItem>
                  {locations
                    .filter((location) => !isUnfiledLocation(location))
                    .map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name} ({titleize(location.kind)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Notes
              </span>
              <Textarea
                className="min-h-16"
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

function printingLabel(printing: {
  collectorNumber?: string | null
  rarity?: string | null
  setCode?: string | null
  setName?: string | null
}) {
  return [
    printing.setCode?.toUpperCase(),
    printing.collectorNumber ? `#${printing.collectorNumber}` : null,
    printing.setName,
    printing.rarity ? titleize(printing.rarity) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

function printingFinishOptions(finishes?: Array<string | null> | null) {
  const options = (finishes || []).filter(
    (value): value is (typeof COLLECTION_FINISHES)[number] =>
      typeof value === "string" && COLLECTION_FINISHES.some((finish: string) => finish === value),
  )

  return options.length ? options : COLLECTION_FINISHES
}
