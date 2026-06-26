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
import { useToast } from "../../components/ui/toast"
import { pluralize, present, titleize } from "../../lib/utils"
import { AddCardToDeckDocument, CardDeckOptionsDocument } from "./data"

export type CardDeckTarget = {
  cardName: string
  collectorNumber?: string | null
  finish?: string | null
  finishes?: string[] | null
  preferredPrintingId?: string | null
  setCode?: string | null
}

type CardDeckZone = "mainboard" | "sideboard" | "commander" | "maybeboard"

const CARD_DECK_ZONES: CardDeckZone[] = ["mainboard", "sideboard", "commander", "maybeboard"]
const NON_COMMANDER_CARD_DECK_ZONES: CardDeckZone[] = ["mainboard", "sideboard", "maybeboard"]
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
  const [zone, setZone] = useState<CardDeckZone>("mainboard")
  const [finish, setFinish] = useState("nonfoil")
  const [error, setError] = useState<string | null>(null)
  const open = Boolean(target)
  const decksQuery = useQuery(CardDeckOptionsDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const decks = decksQuery.data?.decks?.edges?.map((edge) => edge?.node).filter(present) || []
  const selectedDeck = decks.find((deck) => deck.id === deckId)
  const zoneOptions =
    selectedDeck?.format === "commander" ? CARD_DECK_ZONES : NON_COMMANDER_CARD_DECK_ZONES
  const finishOptions =
    target?.finishes?.length && target.finishes.some((value) => CARD_DECK_FINISHES.includes(value))
      ? target.finishes.filter((value) => CARD_DECK_FINISHES.includes(value))
      : CARD_DECK_FINISHES
  const [addCardToDeck, { loading: isAddingToDeck }] = useMutation(AddCardToDeckDocument)

  useEffect(() => {
    if (open) {
      setFinish(target?.finish || "nonfoil")
      return
    }

    setDeckId("")
    setQuantity(1)
    setZone("mainboard")
    setFinish("nonfoil")
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
          preferredPrintingId: target.preferredPrintingId || null,
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
              {target?.setCode ? (
                <>
                  {" "}
                  ({target.setCode.toUpperCase()}
                  {target.collectorNumber ? ` #${target.collectorNumber}` : ""})
                </>
              ) : null}
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="form-control">
            <span className="label-text mb-1 text-sm font-semibold">Deck</span>
            <select
              className="select select-bordered w-full"
              value={deckId}
              disabled={isAddingToDeck}
              onChange={(event) => setDeckId(event.target.value)}
              autoFocus
            >
              <option value="">Choose a deck</option>
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name} ({titleize(deck.format)})
                </option>
              ))}
            </select>
          </label>

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

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Zone</span>
              <select
                className="select select-bordered w-full"
                value={zone}
                disabled={isAddingToDeck}
                onChange={(event) => setZone(event.target.value as CardDeckZone)}
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
                disabled={isAddingToDeck}
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
