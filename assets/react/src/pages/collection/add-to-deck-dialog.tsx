import { useMutation, useQuery } from "@apollo/client/react"
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
import { useToast } from "../../components/ui/toast"
import { pluralize, present, titleize } from "../../lib/utils"
import {
  BulkAddCollectionItemsToDeckDocument,
  CollectionItemDeckOptionsDocument,
} from "./documents"
import {
  collectionTargetCount,
  collectionTargetLabel,
  collectionTargetSelector,
  type CollectionItemTarget,
} from "./item-target"

export function AddCollectionItemToDeckDialog({
  item,
  onDone,
  onOpenChange,
}: {
  item: CollectionItemTarget
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const { showToast } = useToast()
  const [deckId, setDeckId] = useState("")
  const [zone, setZone] = useState("mainboard")
  const [error, setError] = useState<string | null>(null)
  const targetCount = collectionTargetCount(item)
  const open = targetCount > 0
  const decksQuery = useQuery(CollectionItemDeckOptionsDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const decks = useMemo(
    () => decksQuery.data?.decks?.edges?.map((edge) => edge?.node).filter(present) || [],
    [decksQuery.data],
  )
  const [addToDeckMutation, addToDeck] = useMutation(BulkAddCollectionItemsToDeckDocument)

  useEffect(() => {
    if (!open) {
      setDeckId("")
      setZone("mainboard")
      setError(null)
    }
  }, [open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!targetCount) {
      setError("Choose at least one item")
      return
    }

    if (!deckId) {
      setError("Choose a deck")
      return
    }

    void addToDeckMutation({
      variables: {
        selector: collectionTargetSelector(item),
        deckId,
        zone,
      },
      onCompleted: () => {
        showToast(`${pluralize(targetCount, "card")} added to deck`)
        onDone()
        onOpenChange(false)
      },
      onError: (error) =>
        setError(error instanceof Error ? error.message : "Could not add cards to deck"),
    })
  }

  function close() {
    if (addToDeck.loading) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-lg" labelledBy="add-collection-item-to-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="add-collection-item-to-deck-title">
              {targetCount > 1 ? "Add items to deck" : "Add to deck"}
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{collectionTargetLabel(item)}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Deck</span>
            <select
              className="select select-bordered w-full bg-base-100"
              value={deckId}
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
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Zone</span>
            <select
              className="select select-bordered w-full bg-base-100"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
            >
              <option value="mainboard">Mainboard</option>
              <option value="sideboard">Sideboard</option>
              <option value="maybeboard">Maybeboard</option>
            </select>
          </label>
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={addToDeck.loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={addToDeck.loading || !deckId}>
              {addToDeck.loading
                ? "Adding..."
                : targetCount > 1
                  ? `Add ${targetCount} to deck`
                  : "Add to deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
