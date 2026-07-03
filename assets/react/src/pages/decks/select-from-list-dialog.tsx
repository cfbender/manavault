import { CheckSquare } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { useToast } from "../../components/ui/toast"
import { pluralize } from "../../lib/utils"
import { matchDeckCardsToNames, parseSelectListNames } from "./deck-select-list"
import type { DeckCardEntry } from "./deck-types"

export function SelectFromListDialog({
  deckCards,
  onOpenChange,
  onSelect,
  open,
}: {
  deckCards: DeckCardEntry[]
  onOpenChange: (open: boolean) => void
  onSelect: (deckCardIds: string[]) => void
  open: boolean
}) {
  const { showToast } = useToast()
  const [text, setText] = useState("")
  const [unmatched, setUnmatched] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setText("")
      setUnmatched(null)
      setError(null)
    }
  }, [open])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setUnmatched(null)

    const names = parseSelectListNames(text)
    if (!names.length) {
      setError("Paste a card list to select")
      return
    }

    const match = matchDeckCardsToNames(deckCards, names)
    onSelect(match.matchedIds)
    showToast(`${pluralize(match.matchedIds.length, "card")} selected`)

    if (match.unmatched.length) setUnmatched(match.unmatched)
    else onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" labelledBy="select-from-list-title">
        <DialogHeader>
          <div>
            <DialogTitle id="select-from-list-title">Select cards from list</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Paste a card list to add matching deck cards to the selection.
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              Card list
            </span>
            <textarea
              className="textarea textarea-bordered min-h-60 w-full bg-base-100 font-mono text-sm"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"1 Sol Ring\nArcane Signet\n2x Negate"}
              autoFocus
            />
          </label>

          {unmatched ? (
            <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
              <div className="text-warning">Not in this deck: {unmatched.join(", ")}</div>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit">
              <CheckSquare className="h-4 w-4" />
              Select cards
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
