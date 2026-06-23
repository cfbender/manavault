import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Edit3, Plus } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { request } from "../../lib/graphql"
import { titleize } from "../../lib/utils"
import type { DeckDetail, DeckSummary } from "./deck-types"
import { DECK_FORMATS, DECK_STATUSES } from "./deck-types"
import { CreateDeckDocument, UpdateDeckDocument } from "./queries"

export function EditDeckDialog({
  deck,
  onOpenChange,
  open,
}: {
  deck: DeckSummary | DeckDetail | null
  onOpenChange: (open: boolean) => void
  open?: boolean
}) {
  const queryClient = useQueryClient()
  const isOpen = open ?? Boolean(deck)
  const [name, setName] = useState("")
  const [format, setFormat] = useState<(typeof DECK_FORMATS)[number]>("commander")
  const [status, setStatus] = useState<(typeof DECK_STATUSES)[number]>("brewing")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!deck || !isOpen) return
    setName(deck.name)
    setFormat(deckFormatValue(deck.format))
    setStatus(deckStatusValue(deck.status))
    setError(null)
  }, [deck, isOpen])

  const updateDeck = useMutation({
    mutationFn: () => {
      if (!deck) throw new Error("Deck is required")
      return request(UpdateDeckDocument, {
        id: deck.id,
        input: { name: name.trim(), format, status },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      if (deck) queryClient.invalidateQueries({ queryKey: ["deck", deck.id] })
      setError(null)
      onOpenChange(false)
    },
    onError: (error) => setError(error instanceof Error ? error.message : "Could not update deck"),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Deck name is required")
      return
    }

    updateDeck.mutate()
  }

  function close() {
    if (updateDeck.isPending) return
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl" labelledBy="edit-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="edit-deck-title">Edit deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">Update deck metadata.</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Deck name"
              autoFocus
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Format
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={format}
                onChange={(event) => setFormat(deckFormatValue(event.target.value))}
              >
                {DECK_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {titleize(format)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Status
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={status}
                onChange={(event) => setStatus(deckStatusValue(event.target.value))}
              >
                {DECK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {titleize(status)}
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

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={close} disabled={updateDeck.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateDeck.isPending}>
              <Edit3 className="h-4 w-4" />
              {updateDeck.isPending ? "Saving..." : "Save deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function deckFormatValue(value: string): (typeof DECK_FORMATS)[number] {
  return DECK_FORMATS.find((format) => format === value) || "commander"
}

export function deckStatusValue(value: string): (typeof DECK_STATUSES)[number] {
  return DECK_STATUSES.find((status) => status === value) || "brewing"
}

export function NewDeckDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [format, setFormat] = useState<(typeof DECK_FORMATS)[number]>("commander")
  const [status, setStatus] = useState<(typeof DECK_STATUSES)[number]>("brewing")
  const [error, setError] = useState<string | null>(null)

  const createDeck = useMutation({
    mutationFn: () => request(CreateDeckDocument, { input: { name: name.trim(), format, status } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["decks"] })
      setName("")
      setFormat("commander")
      setStatus("brewing")
      setError(null)
      onOpenChange(false)

      if (data.createDeck?.id) {
        navigate({ to: "/decks/$id", params: { id: data.createDeck.id } })
      }
    },
    onError: (error) => setError(error instanceof Error ? error.message : "Could not create deck"),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Deck name is required")
      return
    }

    createDeck.mutate()
  }

  function close() {
    if (createDeck.isPending) return
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl" labelledBy="new-deck-title">
        <DialogHeader>
          <div>
            <DialogTitle id="new-deck-title">New deck</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Start with a shell, then import or add cards from the catalog.
            </p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Deck name"
              autoFocus
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Format
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={format}
                onChange={(event) => setFormat(event.target.value as (typeof DECK_FORMATS)[number])}
              >
                {DECK_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {titleize(format)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Status
              </span>
              <select
                className="select select-bordered w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as (typeof DECK_STATUSES)[number])
                }
              >
                {DECK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {titleize(status)}
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

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={close} disabled={createDeck.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDeck.isPending}>
              <Plus className="h-4 w-4" />
              {createDeck.isPending ? "Creating..." : "Create deck"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
