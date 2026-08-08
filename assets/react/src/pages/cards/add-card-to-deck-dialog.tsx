import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { useNavigate } from "@tanstack/react-router"
import type { FormEvent } from "react"
import { useEffect, useState } from "react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { useToast } from "../../components/ui/toast"
import { pluralize, present, titleize } from "../../lib/utils"
import { ADD_CARD_ZONES, NON_COMMANDER_ADD_CARD_ZONES, type DeckZone } from "../decks/deck-types"
import { ZoneToggle } from "../decks/zone-toggle"
import { AddCardToDeckDocument, CardDeckOptionsDocument } from "./data"

export type CardDeckPrintingOption = {
  id: string
  collectorNumber?: string | null
  finishes?: Array<string | null> | null
  imageUrl?: string | null
  ownedCount?: number | null
  priceText?: string | null
  rarity?: string | null
  setCode?: string | null
  setName?: string | null
}

export type CardDeckTarget = {
  cardName: string
  collectorNumber?: string | null
  finish?: string | null
  finishes?: string[] | null
  preferredPrintingId?: string | null
  printings?: CardDeckPrintingOption[]
  setCode?: string | null
}

const CARD_DECK_FINISHES = ["nonfoil", "foil", "etched"]

export function AddCatalogCardToDeckDialog({
  target,
  onOpenChange,
}: {
  target: CardDeckTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const client = useApolloClient()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [deckId, setDeckId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [zone, setZone] = useState<DeckZone>("mainboard")
  const [finish, setFinish] = useState("nonfoil")
  const [selectedPrintingId, setSelectedPrintingId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const open = Boolean(target)
  const decksQuery = useQuery(CardDeckOptionsDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const decks = decksQuery.data?.decks?.edges?.map((edge) => edge?.node).filter(present) || []
  const selectedDeck = decks.find((deck) => deck.id === deckId)
  const zoneOptions =
    selectedDeck?.format === "commander" ? ADD_CARD_ZONES : NON_COMMANDER_ADD_CARD_ZONES
  const selectedPrinting =
    target?.printings?.find((printing) => printing.id === selectedPrintingId) ||
    target?.printings?.find((printing) => printing.id === target.preferredPrintingId) ||
    target?.printings?.[0] ||
    null
  const selectedFinishes = selectedPrinting?.finishes?.filter(present) || target?.finishes || []
  const finishOptions =
    selectedFinishes.length && selectedFinishes.some((value) => CARD_DECK_FINISHES.includes(value))
      ? selectedFinishes.filter((value) => CARD_DECK_FINISHES.includes(value))
      : CARD_DECK_FINISHES
  const [addCardToDeck, { loading: isAddingToDeck }] = useMutation(AddCardToDeckDocument)

  useEffect(() => {
    if (open) {
      const preferredPrintingId = target?.preferredPrintingId || target?.printings?.[0]?.id || ""
      setSelectedPrintingId(preferredPrintingId)
      setFinish(target?.finish || "nonfoil")
      return
    }

    setDeckId("")
    setQuantity(1)
    setZone("mainboard")
    setFinish("nonfoil")
    setSelectedPrintingId("")
    setError(null)
  }, [open, target])

  useEffect(() => {
    if (!zoneOptions.includes(zone)) setZone("mainboard")
  }, [zone, zoneOptions])

  useEffect(() => {
    if (!finishOptions.includes(finish)) setFinish(finishOptions[0] || "nonfoil")
  }, [finish, finishOptions])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!target) {
      setError("Choose a card")
      return
    }
    if (!deckId) {
      setError("Choose a deck")
      return
    }

    const addedDeckId = deckId
    const addedQuantity = quantity
    void addCardToDeck({
      variables: {
        deckId: addedDeckId,
        input: {
          name: target.cardName,
          quantity,
          zone,
          finish,
          preferredPrintingId: selectedPrinting?.id || target.preferredPrintingId || null,
        },
      },
      onCompleted: () => {
        void client.refetchQueries({ include: "active" })
        showToast(`${pluralize(addedQuantity, "card")} added to deck`)
        onOpenChange(false)
        navigate({ to: "/decks/$id", params: { id: addedDeckId } })
      },
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not add card to deck"),
    })
  }

  function close() {
    if (isAddingToDeck) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-xl" labelledBy="add-catalog-card-to-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="add-catalog-card-to-deck-title">Add to deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              {target?.cardName}
              {selectedPrinting?.setCode ? (
                <>
                  {" "}
                  ({selectedPrinting.setCode.toUpperCase()}
                  {selectedPrinting.collectorNumber ? ` #${selectedPrinting.collectorNumber}` : ""})
                </>
              ) : null}
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="form-control">
            <span className="label-text mb-1 text-sm font-semibold">Deck</span>
            <Select value={deckId} disabled={isAddingToDeck} onValueChange={setDeckId}>
              <SelectTrigger autoFocus aria-label="Deck">
                <SelectValue placeholder="Choose a deck" />
              </SelectTrigger>
              <SelectContent>
                {decks.map((deck) => (
                  <SelectItem key={deck.id} value={deck.id}>
                    {deck.name} ({titleize(deck.format)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {selectedPrinting ? (
            <div className="rounded-box border border-base-300 bg-base-200/35 p-3">
              <div className="flex gap-3">
                {selectedPrinting.imageUrl ? (
                  <img
                    src={selectedPrinting.imageUrl}
                    alt=""
                    className="h-28 w-20 shrink-0 rounded-lg object-cover shadow"
                    loading="lazy"
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="font-semibold">{target?.cardName}</p>
                    <p className="text-sm text-base-content/65">
                      {printingOptionLabel(selectedPrinting)}
                    </p>
                    <p className="mt-1 text-xs text-base-content/60">
                      {selectedPrinting.ownedCount
                        ? `${selectedPrinting.ownedCount} owned in collection`
                        : "Not in collection"}
                      {selectedPrinting.priceText ? ` · ${selectedPrinting.priceText}` : ""}
                    </p>
                  </div>
                  {target?.printings?.length ? (
                    <label className="form-control">
                      <span className="label-text mb-1 text-sm font-semibold">Printing</span>
                      <Select
                        value={selectedPrintingId}
                        disabled={isAddingToDeck}
                        onValueChange={setSelectedPrintingId}
                      >
                        <SelectTrigger aria-label="Printing">
                          <SelectValue placeholder="Choose a printing" />
                        </SelectTrigger>
                        <SelectContent>
                          {target.printings.map((printing) => (
                            <SelectItem key={printing.id} value={printing.id}>
                              {printingOptionLabel(printing)}
                              {printing.ownedCount ? ` · ${printing.ownedCount} owned` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Quantity</span>
              <Input
                type="number"
                min={1}
                value={quantity}
                disabled={isAddingToDeck}
                onChange={(event) =>
                  setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                }
              />
            </label>

            <fieldset className="space-y-1.5">
              <legend className="label-text mb-1 text-sm font-semibold">Zone</legend>
              <ZoneToggle
                zones={zoneOptions}
                value={zone}
                onChange={setZone}
                disabled={isAddingToDeck}
              />
            </fieldset>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Finish</span>
              <Select value={finish} disabled={isAddingToDeck} onValueChange={setFinish}>
                <SelectTrigger aria-label="Finish">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {finishOptions.map((finish) => (
                    <SelectItem key={finish} value={finish}>
                      {titleize(finish)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isAddingToDeck} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={isAddingToDeck || !deckId}>
              {isAddingToDeck ? "Adding..." : "Add to deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function printingOptionLabel(printing: CardDeckPrintingOption) {
  return [
    printing.setCode?.toUpperCase(),
    printing.collectorNumber ? `#${printing.collectorNumber}` : null,
    printing.setName,
    printing.rarity ? titleize(printing.rarity) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}
