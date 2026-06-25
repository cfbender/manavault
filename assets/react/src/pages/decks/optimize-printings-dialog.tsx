import { CheckCircle2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { cn, titleize } from "../../lib/utils"
import { cardImageUrl } from "./deck-card-model"
import type { DeckCardEntry } from "./deck-types"

export function OptimizePrintingsDialog({
  deckCards,
  error,
  isPending,
  onOpenChange,
  onSubmit,
  open,
}: {
  deckCards: DeckCardEntry[]
  error: string | null
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (deckCardIds: string[]) => void
  open: boolean
}) {
  const selectableDeckCards = useMemo(
    () => deckCards.filter((deckCard) => Boolean(deckCard.card)),
    [deckCards],
  )
  const unallocatedDeckCards = useMemo(
    () => selectableDeckCards.filter((deckCard) => deckCard.allocationStatus.allocated <= 0),
    [selectableDeckCards],
  )
  const [includeAllocatedCards, setIncludeAllocatedCards] = useState(false)
  const visibleDeckCards = includeAllocatedCards ? selectableDeckCards : unallocatedDeckCards
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setIncludeAllocatedCards(false)
    setSelectedIds(new Set(unallocatedDeckCards.map((deckCard) => deckCard.id)))
  }, [open, unallocatedDeckCards])

  const selectedCount = selectedIds.size
  const allSelected = selectedCount === visibleDeckCards.length

  function toggleDeckCard(deckCardId: string) {
    if (isPending) return

    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(deckCardId)) next.delete(deckCardId)
      else next.add(deckCardId)
      return next
    })
  }

  function toggleIncludeAllocatedCards(include: boolean) {
    if (isPending) return

    setIncludeAllocatedCards(include)
    setSelectedIds(
      new Set(
        (include ? selectableDeckCards : unallocatedDeckCards).map((deckCard) => deckCard.id),
      ),
    )
  }

  function selectAll() {
    if (isPending) return
    setSelectedIds(new Set(visibleDeckCards.map((deckCard) => deckCard.id)))
  }

  function clearSelection() {
    if (isPending) return
    setSelectedIds(new Set())
  }

  function submit() {
    if (selectedIds.size === 0 || isPending) return
    onSubmit(Array.from(selectedIds))
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-5xl" labelledBy="optimize-printings-title">
        <DialogHeader>
          <div>
            <DialogTitle id="optimize-printings-title">Optimize printings</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Selected cards will switch to their cheapest priced printing for their current finish.
            </p>
          </div>
          <DialogClose onClose={() => !isPending && onOpenChange(false)} />
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-base-content/70">
              {selectedCount} of {visibleDeckCards.length} cards selected
              {!includeAllocatedCards && selectableDeckCards.length !== visibleDeckCards.length
                ? ` · ${selectableDeckCards.length - visibleDeckCards.length} allocated hidden`
                : null}
            </p>
            <label className="flex items-center gap-2 text-sm text-base-content/70">
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={includeAllocatedCards}
                disabled={isPending || selectableDeckCards.length === unallocatedDeckCards.length}
                onChange={(event) => toggleIncludeAllocatedCards(event.currentTarget.checked)}
              />
              Include allocated cards
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAll}
                disabled={isPending || allSelected}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={isPending || selectedCount === 0}
              >
                Clear
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </div>
          ) : null}

          <div className="grid max-h-[52dvh] min-h-0 auto-rows-max grid-cols-2 items-start gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visibleDeckCards.map((deckCard) => {
              const selected = selectedIds.has(deckCard.id)
              const name = deckCard.card?.name || "Unknown card"
              const printing = deckCard.preferredPrinting || deckCard.card?.printings?.[0]
              const imageUrl = cardImageUrl(deckCard, "imageUrl")

              return (
                <button
                  key={deckCard.id}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "group relative self-start overflow-hidden rounded-box border bg-base-200 text-left shadow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    selected
                      ? "border-primary ring-2 ring-primary/35"
                      : "border-base-300 opacity-55 hover:opacity-85",
                  )}
                  disabled={isPending}
                  onClick={() => toggleDeckCard(deckCard.id)}
                >
                  <div className="aspect-[63/88] bg-base-300">
                    {imageUrl ? (
                      <img
                        className="h-full w-full object-contain"
                        src={imageUrl}
                        alt={name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-sm font-bold text-base-content/55">
                        {name}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-2">
                    <div className="line-clamp-2 text-sm font-bold leading-tight">{name}</div>
                    <div className="truncate text-xs text-base-content/60">
                      {[
                        printing?.setCode?.toUpperCase(),
                        printing?.collectorNumber,
                        titleize(deckCard.finish || ""),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Any printing"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border shadow",
                      selected
                        ? "border-primary bg-primary text-primary-content"
                        : "border-base-300 bg-base-100/85 text-transparent",
                    )}
                    aria-hidden="true"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={isPending || selectedCount === 0}>
              {isPending ? "Optimizing..." : "Optimize selected"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
