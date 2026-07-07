import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { useEffect, useState, type FormEvent } from "react"
import { CardNameSearchField } from "../../components/card-name-search-field"
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
import { refetchActiveQueries } from "../../lib/apollo"
import { pluralize, present, titleize } from "../../lib/utils"
import { CardsDocument } from "../cards/data"
import type { DeckDetail, DeckZone } from "./deck-types"
import { ADD_CARD_ZONES, NON_COMMANDER_ADD_CARD_ZONES } from "./deck-types"
import { selectedDeckCardNameForMutation } from "./add-card-dialog-model"
import { AddDeckCardDocument } from "./queries"

const ADD_CARD_SEARCH_DEBOUNCE_MS = 250

export function AddDeckCardDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckDetail | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [name, setName] = useState("")
  const [debouncedName, setDebouncedName] = useState(name)
  const [quantity, setQuantity] = useState(1)
  const [zone, setZone] = useState<DeckZone>("mainboard")
  const [finish, setFinish] = useState("nonfoil")
  const [selectedPrintingId, setSelectedPrintingId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const zoneOptions = deck?.format === "commander" ? ADD_CARD_ZONES : NON_COMMANDER_ADD_CARD_ZONES
  const cardSearchDraftTerm = name.trim()
  const cardSearchTerm = debouncedName.trim()
  const isCardSearchSettled = cardSearchTerm === cardSearchDraftTerm
  const cardSearchQuery = useQuery(CardsDocument, {
    variables: { q: cardSearchTerm, limit: 5 },
    skip: !open || cardSearchTerm.length < 2,
  })
  const cardOptions =
    isCardSearchSettled && !cardSearchQuery.loading
      ? cardSearchQuery.data?.cards?.edges?.map((edge) => edge?.node).filter(present) || []
      : []
  const selectedCard =
    cardOptions.find((card) => card.name.toLowerCase() === cardSearchTerm.toLowerCase()) ||
    cardOptions[0]
  const selectedCardName = selectedDeckCardNameForMutation(name, selectedCard)
  const isCardSearchPending =
    open && cardSearchDraftTerm.length >= 2 && (!isCardSearchSettled || cardSearchQuery.loading)
  const selectedCardMatchesInput = Boolean(
    selectedCard && selectedCardName.toLowerCase() === cardSearchDraftTerm.toLowerCase(),
  )
  const printingOptions =
    selectedCard?.printings?.edges?.map((edge) => edge?.node).filter(present) || []
  const selectedPrinting =
    printingOptions.find((printing) => printing.id === selectedPrintingId) || printingOptions[0]
  const selectedFinishes = selectedPrinting?.finishes?.filter(present) || []
  const finishOptions =
    selectedFinishes.length &&
    selectedFinishes.some((value) => ["nonfoil", "foil", "etched"].includes(value))
      ? selectedFinishes.filter((value) => ["nonfoil", "foil", "etched"].includes(value))
      : ["nonfoil", "foil", "etched"]
  const [addDeckCardMutation, addDeckCardResult] = useMutation(AddDeckCardDocument)
  const addDeckCard = {
    ...addDeckCardResult,
    isPending: addDeckCardResult.loading,
    mutate: () =>
      void addDeckCardMutation({
        variables: {
          deckId: deck?.id || "",
          input: {
            name: selectedCardName,
            quantity,
            zone,
            finish,
            preferredPrintingId: selectedPrinting?.id || null,
          },
        },
        onCompleted: () => {
          void refetchActiveQueries(client)
          showToast(`${pluralize(quantity, "card")} added to deck`)
          setName("")
          setQuantity(1)
          setZone("mainboard")
          setFinish("nonfoil")
          setSelectedPrintingId("")
          setError(null)
          onOpenChange(false)
        },
        onError: (error) =>
          setError(error instanceof Error ? error.message : "Could not add card to deck"),
      }),
  }
  const canSubmit = Boolean(deck && selectedCard && !isCardSearchPending && !addDeckCard.isPending)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedName(name), ADD_CARD_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [name])

  useEffect(() => {
    if (!open) {
      setName("")
      setDebouncedName("")
      setQuantity(1)
      setZone("mainboard")
      setFinish("nonfoil")
      setSelectedPrintingId("")
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!zoneOptions.includes(zone)) setZone("mainboard")
  }, [zone, zoneOptions])

  useEffect(() => {
    if (!selectedPrinting?.id) {
      setSelectedPrintingId("")
      return
    }

    setSelectedPrintingId(selectedPrinting.id)
  }, [selectedPrinting?.id])

  useEffect(() => {
    if (!finishOptions.includes(finish)) setFinish(finishOptions[0] || "nonfoil")
  }, [finish, finishOptions])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cardSearchDraftTerm) {
      setError("Choose a card.")
      return
    }

    if (isCardSearchPending) {
      setError("Wait for the card search to finish.")
      return
    }

    if (!selectedCard) {
      setError("Choose a matching card.")
      return
    }

    addDeckCard.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" labelledBy="add-deck-card-title">
        <DialogHeader>
          <div>
            <DialogTitle id="add-deck-card-title">Add card</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deck?.name}</p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="form-control">
            <label htmlFor="add-deck-card-search" className="label-text mb-1 text-sm font-semibold">
              Card
            </label>
            <CardNameSearchField
              id="add-deck-card-search"
              value={name}
              onValueChange={setName}
              onSuggestionSelect={setName}
              placeholder="Search card name"
              selectFirstSuggestionOnEnter
              disabled={addDeckCard.isPending}
            />
            <p className="mt-1 text-xs text-base-content/60">
              {isCardSearchPending
                ? "Searching for the matching card..."
                : selectedCard
                  ? selectedCardMatchesInput
                    ? "Exact match selected."
                    : `Selected match: ${selectedCard.name}`
                  : !cardSearchDraftTerm
                    ? "Type a card name; the selected match below is what will be added."
                    : cardSearchDraftTerm.length < 2
                      ? "Enter at least 2 characters."
                      : "No matching card found."}
            </p>
          </div>

          {selectedPrinting ? (
            <div className="rounded-box border border-base-300 bg-base-200/35 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Selected card
                </p>
                {!selectedCardMatchesInput ? (
                  <p className="rounded-full border border-primary/30 px-2 py-0.5 text-xs font-semibold text-primary">
                    Matched from search
                  </p>
                ) : null}
              </div>
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
                    <p className="font-semibold">{selectedCard?.name || name}</p>
                    <p className="text-sm text-base-content/65">
                      {deckAddPrintingLabel(selectedPrinting)}
                    </p>
                    <p className="mt-1 text-xs text-base-content/60">
                      {selectedPrinting.ownedCount
                        ? `${selectedPrinting.ownedCount} owned in collection`
                        : "Not in collection"}
                      {selectedPrinting.priceText ? ` · ${selectedPrinting.priceText}` : ""}
                    </p>
                  </div>
                  {printingOptions.length ? (
                    <label className="form-control">
                      <span className="label-text mb-1 text-sm font-semibold">Printing</span>
                      <select
                        className="select select-bordered w-full"
                        value={selectedPrintingId}
                        disabled={addDeckCard.isPending}
                        onChange={(event) => setSelectedPrintingId(event.target.value)}
                      >
                        {printingOptions.map((printing) => (
                          <option key={printing.id} value={printing.id}>
                            {deckAddPrintingLabel(printing)}
                            {printing.ownedCount ? ` · ${printing.ownedCount} owned` : ""}
                          </option>
                        ))}
                      </select>
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
                disabled={addDeckCard.isPending}
                onChange={(event) =>
                  setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))
                }
              />
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Zone</span>
              <select
                className="select select-bordered w-full"
                value={zone}
                disabled={addDeckCard.isPending}
                onChange={(event) => setZone(event.target.value as DeckZone)}
              >
                {zoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {titleize(zone)}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Finish</span>
              <select
                className="select select-bordered w-full"
                value={finish}
                disabled={addDeckCard.isPending}
                onChange={(event) => setFinish(event.target.value)}
              >
                {finishOptions.map((finish) => (
                  <option key={finish} value={finish}>
                    {titleize(finish)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={addDeckCard.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {addDeckCard.isPending
                ? "Adding..."
                : selectedCard
                  ? `Add ${selectedCard.name}`
                  : "Add card"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function deckAddPrintingLabel(printing: {
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
