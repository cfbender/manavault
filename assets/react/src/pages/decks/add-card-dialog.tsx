import { useApolloClient, useMutation } from "@apollo/client/react"
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
import { pluralize, titleize } from "../../lib/utils"
import type { DeckDetail, DeckZone } from "./deck-types"
import { ADD_CARD_ZONES, NON_COMMANDER_ADD_CARD_ZONES } from "./deck-types"
import { AddDeckCardDocument } from "./queries"

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
  const [quantity, setQuantity] = useState(1)
  const [zone, setZone] = useState<DeckZone>("mainboard")
  const [finish, setFinish] = useState("nonfoil")
  const [error, setError] = useState<string | null>(null)
  const zoneOptions = deck?.format === "commander" ? ADD_CARD_ZONES : NON_COMMANDER_ADD_CARD_ZONES
  const [addDeckCardMutation, addDeckCardResult] = useMutation(AddDeckCardDocument)
  const addDeckCard = {
    ...addDeckCardResult,
    isPending: addDeckCardResult.loading,
    mutate: () =>
      void addDeckCardMutation({
        variables: {
          deckId: deck?.id || "",
          input: {
            name: name.trim(),
            quantity,
            zone,
            finish,
          },
        },
        onCompleted: () => {
          void refetchActiveQueries(client)
          showToast(`${pluralize(quantity, "card")} added to deck`)
          setName("")
          setQuantity(1)
          setZone("mainboard")
          setFinish("nonfoil")
          setError(null)
          onOpenChange(false)
        },
        onError: (error) =>
          setError(error instanceof Error ? error.message : "Could not add card to deck"),
      }),
  }

  useEffect(() => {
    if (!open) {
      setName("")
      setQuantity(1)
      setZone("mainboard")
      setFinish("nonfoil")
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!zoneOptions.includes(zone)) setZone("mainboard")
  }, [zone, zoneOptions])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setError("Choose a card.")
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
          <label className="form-control">
            <span className="label-text mb-1 text-sm font-semibold">Card</span>
            <CardNameSearchField
              value={name}
              onValueChange={setName}
              onSuggestionSelect={setName}
              placeholder="Search card name"
              disabled={addDeckCard.isPending}
            />
          </label>

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
                <option value="nonfoil">Nonfoil</option>
                <option value="foil">Foil</option>
                <option value="etched">Etched</option>
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
            <Button type="submit" disabled={addDeckCard.isPending || !name.trim()}>
              {addDeckCard.isPending ? "Adding..." : "Add card"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
